import { identityAccessLevel, type Identity } from "./auth";
import { authorizationError, conflictError, notFoundError, validationError } from "./http";
import {
  INTEREST_CATEGORIES, INTEREST_LEVELS, INTEREST_PARTICIPATION, INTEREST_SETTINGS,
  type InterestCategory, type InterestLevel, type InterestParticipation, type InterestSetting, type MemberInterest
} from "../../shared/interests";

function parseStored(value: unknown): MemberInterest[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (typeof item === "string" && item.trim()) return [{ id: `legacy-${index}`, name: item.trim(), category: null, level: null, setting: null, participation: null, note: null, active: true }];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.name !== "string" || !record.name.trim()) return [];
      return [{ id: typeof record.id === "string" && record.id ? record.id : `legacy-${index}`, name: record.name.trim(),
        category: INTEREST_CATEGORIES.includes(record.category as InterestCategory) ? record.category as InterestCategory : null,
        level: INTEREST_LEVELS.includes(record.level as InterestLevel) ? record.level as InterestLevel : null,
        setting: INTEREST_SETTINGS.includes(record.setting as InterestSetting) ? record.setting as InterestSetting : null,
        participation: INTEREST_PARTICIPATION.includes(record.participation as InterestParticipation) ? record.participation as InterestParticipation : null,
        note: typeof record.note === "string" ? record.note : null, active: record.active !== false }];
    });
  } catch { return []; }
}

async function rawInterests(db: D1Database, householdId: string, memberId: string): Promise<MemberInterest[]> {
  const row = await db.prepare("SELECT interests_json AS interests FROM together_member_preferences WHERE household_id = ? AND member_id = ?")
    .bind(householdId, memberId).first<{ interests: string | null }>();
  return parseStored(row?.interests);
}

async function persist(db: D1Database, householdId: string, memberId: string, interests: MemberInterest[]) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO together_member_preferences
      (household_id, member_id, interests_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(household_id, member_id) DO UPDATE SET interests_json = excluded.interests_json, updated_at = excluded.updated_at`)
    .bind(householdId, memberId, JSON.stringify(interests), now).run();
}

export async function interestMember(db: D1Database, identity: Identity, requestedMemberId?: string | null): Promise<string> {
  const memberId = requestedMemberId?.trim() || identity.memberId;
  if (memberId !== identity.memberId && identityAccessLevel(identity) !== "household_admin") throw authorizationError("Only household leaders can manage another member’s interests.");
  const member = await db.prepare(`SELECT id, access_level AS accessLevel FROM members
    WHERE household_id = ? AND id = ? AND is_active = 1 AND lifecycle_state NOT IN ('left','suspended')`)
    .bind(identity.householdId, memberId).first<{ id: string; accessLevel: string }>();
  if (!member) throw notFoundError("That Family member is not available.");
  if (memberId !== identity.memberId && member.accessLevel !== "managed_member") throw authorizationError("Household leaders can manage interests for Managed members.");
  return memberId;
}

export async function listMemberInterests(db: D1Database, householdId: string, memberId: string, includeArchived = false): Promise<MemberInterest[]> {
  const interests = await rawInterests(db, householdId, memberId);
  return includeArchived ? interests : interests.filter((interest) => interest.active);
}

export function parseInterestInput(body: Record<string, unknown>, current?: MemberInterest): MemberInterest {
  const name = typeof body.name === "string" ? body.name.trim() : current?.name || "";
  if (!name || name.length > 120) throw validationError("Give this interest a name.", { name: "Must be 1-120 characters" });
  const optional = (key: string, previous: string | null | undefined) => Object.prototype.hasOwnProperty.call(body, key)
    ? body[key] === null || body[key] === "" ? null : body[key] : previous || null;
  const category = optional("category", current?.category);
  const level = optional("level", current?.level);
  const setting = optional("setting", current?.setting);
  const participation = optional("participation", current?.participation);
  if (category !== null && !INTEREST_CATEGORIES.includes(category as InterestCategory)) throw validationError("Choose a suggested category or leave it blank.");
  if (level !== null && !INTEREST_LEVELS.includes(level as InterestLevel)) throw validationError("Choose a valid interest level.");
  if (setting !== null && !INTEREST_SETTINGS.includes(setting as InterestSetting)) throw validationError("Choose a valid setting.");
  if (participation !== null && !INTEREST_PARTICIPATION.includes(participation as InterestParticipation)) throw validationError("Choose a valid participation preference.");
  const note = Object.prototype.hasOwnProperty.call(body, "note") ? body.note === null || body.note === "" ? null : typeof body.note === "string" ? body.note.trim() : null : current?.note || null;
  if (note && note.length > 500) throw validationError("Keep the note under 500 characters.");
  return { id: current?.id || crypto.randomUUID(), name, category: category as InterestCategory | null, level: level as InterestLevel | null,
    setting: setting as InterestSetting | null, participation: participation as InterestParticipation | null, note, active: body.active === undefined ? current?.active ?? true : Boolean(body.active) };
}

export async function addMemberInterest(db: D1Database, householdId: string, memberId: string, body: Record<string, unknown>) {
  const interests = await rawInterests(db, householdId, memberId); const next = parseInterestInput(body);
  if (interests.some((interest) => interest.active && interest.name.toLowerCase() === next.name.toLowerCase())) throw conflictError("That interest is already saved.");
  interests.push(next); await persist(db, householdId, memberId, interests); return next;
}

export async function updateMemberInterest(db: D1Database, householdId: string, memberId: string, interestId: string, body: Record<string, unknown>) {
  const interests = await rawInterests(db, householdId, memberId); const index = interests.findIndex((interest) => interest.id === interestId);
  if (index < 0) throw notFoundError("That interest is not available.");
  const next = parseInterestInput(body, interests[index]);
  if (next.active && interests.some((interest, itemIndex) => itemIndex !== index && interest.active && interest.name.toLowerCase() === next.name.toLowerCase())) throw conflictError("That interest is already saved.");
  interests[index] = next; await persist(db, householdId, memberId, interests); return next;
}

export async function deleteMemberInterest(db: D1Database, householdId: string, memberId: string, interestId: string) {
  const interests = await rawInterests(db, householdId, memberId); const remaining = interests.filter((interest) => interest.id !== interestId);
  if (remaining.length === interests.length) throw notFoundError("That interest is not available.");
  await persist(db, householdId, memberId, remaining);
}
