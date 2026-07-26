import { identityAccessLevel, type Identity } from "./auth";
import { ApiError, authorizationError, conflictError, notFoundError, validationError } from "./http";
import {
  deterministicIndex, localDateForTimezone, TOGETHER_CATEGORIES, TOGETHER_STATUSES,
  transitionAllowed, type TogetherMoment, type TogetherParticipant, type TogetherStatus, type TogetherTemplate
} from "../../shared/together";
import { INTEREST_CATEGORIES, INTEREST_LEVELS, INTEREST_PARTICIPATION, INTEREST_SETTINGS, interestCategoryMatches, type MemberInterest } from "../../shared/interests";

type MemberRow = { id: string; displayName: string; role: string; accessLevel: string; ageBand: string };
type TemplateRow = Record<string, unknown> & { id: string; householdId: string | null; title: string; description: string; category: string; momentType: string };

const jsonArray = (value: unknown): string[] => {
  if (typeof value !== "string" || !value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
};
const text = (value: unknown, max: number, required = false): string | null => {
  if (typeof value !== "string") { if (required) throw validationError("Please check the submitted fields."); return null; }
  const result = value.trim();
  if (required && !result || result.length > max) throw validationError("Please check the submitted fields.");
  return result || null;
};
const MOMENT_TYPES = ["whole_family", "one_to_one", "spotlight", "skill_sharing", "conversation", "creative", "active", "learning", "food", "music", "games", "outdoors", "low_energy"] as const;

export function requireTogetherManage(identity: Identity): void {
  if (identityAccessLevel(identity) !== "household_admin") throw authorizationError("Household leaders manage Together settings.");
}

export function requireTogetherParticipation(identity: Identity): void {
  if (identityAccessLevel(identity) === "managed_member" && identity.role === "child") return;
}

async function activeMembers(db: D1Database, householdId: string): Promise<MemberRow[]> {
  const result = await db.prepare(`SELECT id, display_name AS displayName, role, access_level AS accessLevel, age_band AS ageBand
    FROM members WHERE household_id = ? AND is_active = 1 AND lifecycle_state NOT IN ('left','suspended') ORDER BY created_at, id`)
    .bind(householdId).all<MemberRow>();
  return result.results;
}

async function templates(db: D1Database, householdId: string): Promise<TogetherTemplate[]> {
  const result = await db.prepare(`SELECT id, household_id AS householdId, title, description, category, moment_type AS momentType,
      min_participants AS minParticipants, max_participants AS maxParticipants, duration_minutes AS durationMinutes,
      indoor_outdoor AS indoorOutdoor, screen_mode AS screenMode, energy_level AS energyLevel, equipment_json AS equipmentJson,
      source, minimum_age_band AS minimumAgeBand
    FROM together_moment_templates WHERE is_active = 1 AND (household_id IS NULL OR household_id = ?)
    ORDER BY CASE WHEN household_id = ? THEN 0 ELSE 1 END, id`).bind(householdId, householdId).all<TemplateRow>();
  return result.results.map((row) => ({
    id: row.id, householdId: row.householdId, title: row.title, description: row.description, category: row.category as TogetherTemplate["category"],
    momentType: row.momentType, minParticipants: Number(row.minParticipants), maxParticipants: Number(row.maxParticipants),
    durationMinutes: Number(row.durationMinutes), indoorOutdoor: String(row.indoorOutdoor), screenMode: String(row.screenMode),
    energyLevel: String(row.energyLevel), equipment: jsonArray(row.equipmentJson), source: row.source as TogetherTemplate["source"]
  }));
}

async function memberPreferences(db: D1Database, householdId: string) {
  const result = await db.prepare(`SELECT p.member_id AS memberId, m.display_name AS displayName, p.interests_json AS interests, p.skills_to_share_json AS skillsToShare,
      skills_to_learn_json AS skillsToLearn, preferred_energy AS preferredEnergy, screen_preference AS screenPreference,
      excluded_categories_json AS excludedCategories
    FROM together_member_preferences p JOIN members m ON m.household_id = p.household_id AND m.id = p.member_id
    WHERE p.household_id = ? AND m.is_active = 1 AND m.lifecycle_state NOT IN ('left','suspended')`).bind(householdId).all<{
      memberId: string; displayName: string; interests: string | null; skillsToShare: string | null; skillsToLearn: string | null;
      preferredEnergy: string | null; screenPreference: string | null; excludedCategories: string | null;
    }>();
  return result.results.map((row) => ({ ...row, interests: parseInterestRecords(row.interests) }));
}

function parseInterestRecords(value: string | null): MemberInterest[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (typeof item === "string" && item.trim()) return [{ id: `legacy-${index}`, name: item.trim(), category: null, level: null, setting: null, participation: null, note: null, active: true }];
      if (!item || typeof item !== "object" || typeof (item as Record<string, unknown>).name !== "string") return [];
      const record = item as Record<string, unknown>;
      const category = typeof record.category === "string" && INTEREST_CATEGORIES.includes(record.category as typeof INTEREST_CATEGORIES[number]) ? record.category as MemberInterest["category"] : null;
      const level = typeof record.level === "string" && INTEREST_LEVELS.includes(record.level as typeof INTEREST_LEVELS[number]) ? record.level as MemberInterest["level"] : null;
      const setting = typeof record.setting === "string" && INTEREST_SETTINGS.includes(record.setting as typeof INTEREST_SETTINGS[number]) ? record.setting as MemberInterest["setting"] : null;
      const participation = typeof record.participation === "string" && INTEREST_PARTICIPATION.includes(record.participation as typeof INTEREST_PARTICIPATION[number]) ? record.participation as MemberInterest["participation"] : null;
      return [{ id: String(record.id || `legacy-${index}`), name: String(record.name).trim(), category,
        level, setting, participation,
        note: typeof record.note === "string" ? record.note : null, active: record.active !== false }];
    }).filter((interest) => interest.active);
  } catch { return []; }
}

export function preferenceScore(template: TogetherTemplate, preferences: Array<{ interests: MemberInterest[]; skillsToShare: string | null; skillsToLearn: string | null; preferredEnergy: string | null; screenPreference: string | null; excludedCategories: string | null }>): number {
  let score = template.momentType === "whole_family" ? 4 : 1;
  for (const preference of preferences) {
    if (jsonArray(preference.excludedCategories).includes(template.category)) score -= 20;
    if (preference.preferredEnergy && preference.preferredEnergy !== "any" && preference.preferredEnergy === template.energyLevel) score += 2;
    if (preference.screenPreference === "prefer_off_screen" && template.screenMode === "off_screen") score += 2;
    const interests = preference.interests;
    for (const interest of interests) {
      const nameMatches = template.title.toLowerCase().includes(interest.name.toLowerCase()) || template.description.toLowerCase().includes(interest.name.toLowerCase());
      if (nameMatches || interestCategoryMatches(interest.category, template.category, template.title)) score += interest.level === "love" ? 7 : interest.level === "try" ? 3 : 5;
      if ((interest.setting === "home" && template.indoorOutdoor === "indoor") || (interest.setting === "outdoors" && template.indoorOutdoor === "outdoor")) score += 2;
      if ((interest.participation === "whole_family" && template.momentType === "whole_family") || (interest.participation === "one_to_one" && template.momentType === "one_to_one")) score += 2;
    }
    const skills = [...jsonArray(preference.skillsToShare), ...jsonArray(preference.skillsToLearn)].map((item) => item.toLowerCase());
    if (skills.some((skill) => template.category.includes(skill) || template.title.toLowerCase().includes(skill))) score += 5;
  }
  return score;
}

function matchingInterestNames(template: TogetherTemplate, preferences: Awaited<ReturnType<typeof memberPreferences>>): string[] {
  return preferences.filter((preference) => preference.interests.some((interest) =>
    template.title.toLowerCase().includes(interest.name.toLowerCase()) || template.description.toLowerCase().includes(interest.name.toLowerCase()) ||
    interestCategoryMatches(interest.category, template.category, template.title))).map((preference) => preference.displayName).filter(Boolean);
}

async function recentTemplateIds(db: D1Database, householdId: string, localDate: string): Promise<Set<string>> {
  const result = await db.prepare(`SELECT template_id AS templateId FROM together_daily_moments
    WHERE household_id = ? AND local_date >= date(?, '-14 day') AND template_id IS NOT NULL AND status NOT IN ('swapped','cancelled')`)
    .bind(householdId, localDate).all<{ templateId: string }>();
  return new Set(result.results.map(({ templateId }) => templateId));
}

async function participantHistory(db: D1Database, householdId: string): Promise<Map<string, number>> {
  const result = await db.prepare(`SELECT member_id AS memberId, COUNT(*) AS count FROM together_moment_participants p
    JOIN together_daily_moments m ON m.household_id = p.household_id AND m.id = p.moment_id
    WHERE p.household_id = ? AND m.status IN ('completed','started','accepted') GROUP BY member_id`).bind(householdId).all<{ memberId: string; count: number }>();
  return new Map(result.results.map(({ memberId, count }) => [memberId, Number(count)]));
}

function chooseParticipants(template: TogetherTemplate, members: MemberRow[], history: Map<string, number>, seed: string): Array<{ member: MemberRow; role: TogetherParticipant["participantRole"] }> {
  const ranked = [...members].sort((a, b) => (history.get(a.id) || 0) - (history.get(b.id) || 0) || a.id.localeCompare(b.id));
  if (template.momentType === "spotlight") {
    const spotlight = ranked[deterministicIndex(seed, ranked.length)];
    return members.map((member) => ({ member, role: member.id === spotlight.id ? "spotlight" as const : "participant" as const })).slice(0, template.maxParticipants);
  }
  if (template.momentType === "whole_family" || template.maxParticipants >= members.length && template.momentType !== "one_to_one") {
    return members.slice(0, template.maxParticipants).map((member) => ({ member, role: "participant" as const }));
  }
  const pairs: Array<[MemberRow, MemberRow]> = [];
  for (const left of ranked) for (const right of ranked) {
    if (left.id >= right.id) continue;
    if ((left.ageBand === "child" || left.ageBand === "young_child") && (right.ageBand === "child" || right.ageBand === "young_child")) continue;
    pairs.push([left, right]);
  }
  const pair = pairs[deterministicIndex(seed, pairs.length)] || [ranked[0], ranked[1]].filter(Boolean) as [MemberRow, MemberRow];
  return pair.map((member, index) => ({ member, role: index === 0 && template.momentType === "spotlight" ? "spotlight" as const : "participant" as const }));
}

async function candidateTemplate(db: D1Database, householdId: string, localDate: string, excludedTemplateId?: string): Promise<{ template: TogetherTemplate; participants: Array<{ member: MemberRow; role: TogetherParticipant["participantRole"] }>; reason: string } | null> {
  const members = await activeMembers(db, householdId); if (!members.length) return null;
  const preferences = await memberPreferences(db, householdId); const history = await participantHistory(db, householdId);
  const recent = await recentTemplateIds(db, householdId, localDate);
  const options = (await templates(db, householdId)).filter((template) => template.id !== excludedTemplateId)
    .filter((template) => template.minParticipants <= members.length && template.maxParticipants >= Math.min(members.length, template.minParticipants))
    .filter((template) => !preferences.some((preference) => jsonArray(preference.excludedCategories).includes(template.category)))
    .map((template) => {
      const participants = chooseParticipants(template, members, history, `${householdId}|${localDate}|${template.id}`);
      const matchingNames = matchingInterestNames(template, preferences);
      const score = preferenceScore(template, preferences) - (recent.has(template.id) ? 9 : 0) + (participants.length === members.length ? 3 : 0);
      return { template, participants, score, matchingNames };
    }).filter(({ participants, template }) => participants.length >= template.minParticipants);
  if (!options.length) return null;
  options.sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id));
  const highest = options.filter(({ score }) => score === options[0].score);
  const selected = highest[deterministicIndex(`${householdId}|${localDate}|${excludedTemplateId || "primary"}`, highest.length)];
  const names = selected.matchingNames;
  const reason = names.length > 1 ? `Based on ${names.slice(0, 2).join(" and ")}’s interests` : names.length === 1 ? `${names[0]} might enjoy this` : recent.has(selected.template.id) ? "A fresh idea for your household" : "A gentle idea for everyone";
  return { template: selected.template, participants: selected.participants, reason };
}

async function insertMoment(db: D1Database, identity: Identity, localDate: string, candidate: Awaited<ReturnType<typeof candidateTemplate>>, isPrimary: boolean, swappedFromId?: string | null): Promise<string> {
  if (!candidate) throw new ApiError(409, "NO_MOMENT_AVAILABLE", "There is no suitable Moment available for this household today.");
  const id = crypto.randomUUID(); const now = new Date().toISOString(); const { template, participants, reason } = candidate;
  await db.prepare(`INSERT INTO together_daily_moments
    (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, status, is_primary,
      generated_reason, duration_minutes, indoor_outdoor, screen_mode, category, equipment_json, created_by_member_id,
      generated_at, swapped_from_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id, identity.householdId, localDate, template.id, template.title, template.description, template.momentType, isPrimary ? 1 : 0,
    reason, template.durationMinutes, template.indoorOutdoor, template.screenMode, template.category, template.equipment.length ? JSON.stringify(template.equipment) : null,
    identity.memberId, now, swappedFromId || null, now, now).run();
  await db.batch(participants.map(({ member, role }) => db.prepare(`INSERT INTO together_moment_participants
    (household_id, moment_id, member_id, participant_role, participation_status, created_at) VALUES (?, ?, ?, ?, 'invited', ?)`)
    .bind(identity.householdId, id, member.id, role, now)));
  await db.prepare(`INSERT INTO together_moment_history (id, household_id, moment_id, member_id, event_type, created_at)
    VALUES (?, ?, ?, ?, 'suggested', ?)`).bind(crypto.randomUUID(), identity.householdId, id, identity.memberId, now).run();
  return id;
}

export async function getMoment(db: D1Database, householdId: string, id: string): Promise<TogetherMoment> {
  const row = await db.prepare(`SELECT id, local_date AS localDate, title_snapshot AS title, description_snapshot AS description,
      moment_type AS momentType, status, is_primary AS isPrimary, generated_reason AS generatedReason, duration_minutes AS durationMinutes,
      indoor_outdoor AS indoorOutdoor, screen_mode AS screenMode, category, equipment_json AS equipmentJson
    FROM together_daily_moments WHERE household_id = ? AND id = ?`).bind(householdId, id).first<Record<string, unknown>>();
  if (!row) throw notFoundError("That Moment is no longer available.");
  const participants = await db.prepare(`SELECT p.member_id AS memberId, m.display_name AS displayName, m.role,
      m.access_level AS accessLevel, m.age_band AS ageBand, p.participant_role AS participantRole, p.participation_status AS participationStatus
    FROM together_moment_participants p JOIN members m ON m.household_id = p.household_id AND m.id = p.member_id
    WHERE p.household_id = ? AND p.moment_id = ? ORDER BY p.participant_role, m.created_at`).bind(householdId, id).all<TogetherParticipant>();
  return { id: String(row.id), localDate: String(row.localDate), title: String(row.title), description: String(row.description), momentType: String(row.momentType),
    status: row.status as TogetherStatus, isPrimary: Boolean(row.isPrimary), generatedReason: String(row.generatedReason), durationMinutes: Number(row.durationMinutes),
    indoorOutdoor: String(row.indoorOutdoor), screenMode: String(row.screenMode), category: String(row.category), equipment: jsonArray(row.equipmentJson),
    participants: participants.results, whySuggested: String(row.generatedReason) };
}

export async function getOrCreateDailyMoments(db: D1Database, identity: Identity, requestedDate?: string) {
  const localDate = requestedDate || localDateForTimezone(identity.householdTimezone || "UTC");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw validationError("Choose a valid household date.");
  let moments = await db.prepare("SELECT id FROM together_daily_moments WHERE household_id = ? AND local_date = ? AND status NOT IN ('swapped','cancelled') ORDER BY is_primary DESC")
    .bind(identity.householdId, localDate).all<{ id: string }>();
  if (!moments.results.length) {
    const primary = await candidateTemplate(db, identity.householdId, localDate);
    await insertMoment(db, identity, localDate, primary, true);
    const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      const secondary = await candidateTemplate(db, identity.householdId, localDate, primary?.template.id);
      if (secondary) await insertMoment(db, identity, localDate, secondary, false);
    }
    moments = await db.prepare("SELECT id FROM together_daily_moments WHERE household_id = ? AND local_date = ? AND status NOT IN ('swapped','cancelled') ORDER BY is_primary DESC")
      .bind(identity.householdId, localDate).all<{ id: string }>();
  }
  return { localDate, moments: await Promise.all(moments.results.map(({ id }) => getMoment(db, identity.householdId, id))) };
}

export async function changeMomentStatus(db: D1Database, identity: Identity, id: string, next: TogetherStatus) {
  const current = await db.prepare("SELECT status FROM together_daily_moments WHERE household_id = ? AND id = ?")
    .bind(identity.householdId, id).first<{ status: TogetherStatus }>();
  if (!current) throw notFoundError("That Moment is no longer available.");
  if (!TOGETHER_STATUSES.includes(next) || !transitionAllowed(current.status, next)) throw conflictError("That Moment cannot move to this stage.");
  const participant = await db.prepare("SELECT member_id AS memberId FROM together_moment_participants WHERE household_id = ? AND moment_id = ? AND member_id = ?")
    .bind(identity.householdId, id, identity.memberId).first();
  if (!participant && identityAccessLevel(identity) !== "household_admin") throw authorizationError("Join this Moment before changing its status.");
  const now = new Date().toISOString();
  await db.prepare(`UPDATE together_daily_moments SET status = ?, viewed_at = CASE WHEN ? = 'viewed' THEN ? ELSE viewed_at END,
      accepted_at = CASE WHEN ? = 'accepted' THEN ? ELSE accepted_at END,
      started_at = CASE WHEN ? = 'started' THEN ? ELSE started_at END,
      completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
      skipped_at = CASE WHEN ? = 'skipped' THEN ? ELSE skipped_at END, updated_at = ?
    WHERE household_id = ? AND id = ?`).bind(next, next, now, next, now, next, now, next, now, next, now, now, identity.householdId, id).run();
  await db.prepare("UPDATE together_moment_participants SET participation_status = ? WHERE household_id = ? AND moment_id = ? AND member_id = ?")
    .bind(next === "completed" ? "completed" : next === "accepted" ? "accepted" : "invited", identity.householdId, id, identity.memberId).run();
  await db.prepare("INSERT INTO together_moment_history (id, household_id, moment_id, member_id, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), identity.householdId, id, identity.memberId, next, now).run();
  return getMoment(db, identity.householdId, id);
}

export async function swapMoment(db: D1Database, identity: Identity, id: string) {
  const current = await db.prepare("SELECT local_date AS localDate, template_id AS templateId, is_primary AS isPrimary, status FROM together_daily_moments WHERE household_id = ? AND id = ?")
    .bind(identity.householdId, id).first<{ localDate: string; templateId: string | null; isPrimary: number; status: TogetherStatus }>();
  if (!current) throw notFoundError("That Moment is no longer available.");
  if (current.status === "completed" || current.status === "cancelled") throw conflictError("That Moment is already closed.");
  const candidate = await candidateTemplate(db, identity.householdId, current.localDate, current.templateId || undefined);
  if (!candidate) throw new ApiError(409, "NO_MOMENT_AVAILABLE", "There is no suitable replacement right now.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE together_daily_moments SET status = 'swapped', is_primary = 0, swapped_from_id = NULL, updated_at = ? WHERE household_id = ? AND id = ?")
    .bind(now, identity.householdId, id).run();
  const replacement = await insertMoment(db, identity, current.localDate, candidate, Boolean(current.isPrimary), id);
  return getMoment(db, identity.householdId, replacement);
}

export async function createCustomMoment(db: D1Database, identity: Identity, body: Record<string, unknown>) {
  if (identityAccessLevel(identity) === "managed_member") throw authorizationError("Ask a household leader to publish this Moment.");
  const title = text(body.title, 160, true) as string; const description = text(body.description, 1000, true) as string;
  const category = text(body.category, 40, true) as string; if (!TOGETHER_CATEGORIES.includes(category as typeof TOGETHER_CATEGORIES[number])) throw validationError("Choose a valid Moment category.");
  const momentType = text(body.momentType, 40) || "whole_family";
  if (!MOMENT_TYPES.includes(momentType as typeof MOMENT_TYPES[number])) throw validationError("Choose a valid Moment type.");
  const duration = Number(body.durationMinutes || 30); if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw validationError("Choose a duration from 5 to 480 minutes.");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO together_moment_templates
    (id, household_id, title, description, category, moment_type, min_participants, max_participants, duration_minutes,
      indoor_outdoor, screen_mode, energy_level, source, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'household', 1, ?, ?)`).bind(id, identity.householdId, title, description, category,
    momentType, Number(body.minParticipants || 1), Number(body.maxParticipants || 99), duration,
    body.indoorOutdoor || "either", body.screenMode || "off_screen", body.energyLevel || "medium", now, now).run();
  return id;
}

export async function listTraditions(db: D1Database, householdId: string) {
  const rows = await db.prepare(`SELECT id, title, description, recurrence, preferred_day AS preferredDay, duration_minutes AS durationMinutes,
      category, indoor_outdoor AS indoorOutdoor, screen_mode AS screenMode, is_active AS isActive
    FROM together_traditions WHERE household_id = ? ORDER BY is_active DESC, title`).bind(householdId).all();
  return rows.results;
}

export async function createTradition(db: D1Database, identity: Identity, body: Record<string, unknown>) {
  requireTogetherManage(identity);
  const title = text(body.title, 160, true) as string; const description = text(body.description, 1000, true) as string;
  const category = text(body.category, 40, true) as string; const id = crypto.randomUUID(); const now = new Date().toISOString();
  const requestedMembers = Array.isArray(body.memberIds)
    ? Array.from(new Set(body.memberIds.filter((value): value is string => typeof value === "string")))
    : [];
  if (requestedMembers.length) {
    const allowed = new Set((await activeMembers(db, identity.householdId)).map((member) => member.id));
    if (requestedMembers.some((memberId) => !allowed.has(memberId))) throw validationError("Choose Family members from this household.");
  }
  await db.prepare(`INSERT INTO together_traditions
    (id, household_id, title, description, recurrence, preferred_day, duration_minutes, category, indoor_outdoor, screen_mode, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, identity.householdId, title, description, text(body.recurrence, 40) || "occasional",
    body.preferredDay === undefined ? null : Number(body.preferredDay), Number(body.durationMinutes || 30), category,
    text(body.indoorOutdoor, 20) || "either", text(body.screenMode, 20) || "off_screen", identity.memberId, now, now).run();
  if (requestedMembers.length) {
    await db.batch(requestedMembers.map((memberId) => db.prepare(`INSERT INTO together_tradition_participants
      (household_id, tradition_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
      .bind(identity.householdId, id, memberId, now)));
  }
  return id;
}

export async function createMemory(db: D1Database, identity: Identity, momentId: string, body: Record<string, unknown>) {
  const moment = await db.prepare("SELECT status FROM together_daily_moments WHERE household_id = ? AND id = ?").bind(identity.householdId, momentId).first<{ status: TogetherStatus }>();
  if (!moment) throw notFoundError("That Moment is no longer available.");
  if (identityAccessLevel(identity) !== "household_admin" && !(await db.prepare("SELECT 1 FROM together_moment_participants WHERE household_id = ? AND moment_id = ? AND member_id = ?").bind(identity.householdId, momentId, identity.memberId).first())) throw authorizationError();
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const wouldRepeat = body.wouldRepeat === undefined || body.wouldRepeat === ""
    ? null
    : body.wouldRepeat === true || body.wouldRepeat === "true" ? 1 : 0;
  await db.prepare(`INSERT INTO together_memories (id, household_id, moment_id, note, actual_duration_minutes, would_repeat, created_by_member_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, identity.householdId, momentId, text(body.note, 1000), body.actualDurationMinutes ? Number(body.actualDurationMinutes) : null,
    wouldRepeat, identity.memberId, now, now).run();
  return id;
}
