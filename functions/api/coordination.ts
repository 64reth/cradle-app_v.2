import type { Identity } from "./auth";
import { identityAccessLevel, textField } from "./auth";
import { ApiError, authorizationError, validationError } from "./http";
import { optionalText } from "./setup";
import type { JsonRecord } from "./types";
import {
  isEventRecurrence, isHouseholdEventType, leadershipEvent,
  type EventRecurrence, type HouseholdEventType
} from "../../shared/coordination";

export type HouseholdEventRow = {
  id: string; title: string; eventType: HouseholdEventType; description: string | null;
  location: string | null; startsAt: string; endsAt: string | null; timezone: string;
  recurrence: EventRecurrence; customRecurrence: string | null; reminderMinutes: number | null;
  visibility: "household" | "leadership"; status: "active" | "cancelled";
  createdByMemberId: string; createdByName: string; createdAt: string;
};
export type HouseholdEventMember = {
  eventId: string; memberId: string; displayName: string; role: string;
  accessLevel: string; ageBand: string; ageGroup: string | null;
  participationRole: "attendee" | "subject";
};
export type EventInput = {
  title: string; eventType: HouseholdEventType; description: string | null; location: string | null;
  startsAt: string; endsAt: string | null; timezone: string; recurrence: EventRecurrence;
  customRecurrence: string | null; reminderMinutes: number | null; memberIds: string[];
};

export const eventSelect = `SELECT e.id, e.title, e.event_type AS eventType, e.description, e.location,
  e.starts_at AS startsAt, e.ends_at AS endsAt, e.timezone, e.recurrence_key AS recurrence,
  e.custom_recurrence AS customRecurrence, e.reminder_minutes AS reminderMinutes,
  e.visibility, e.status, e.created_by_member_id AS createdByMemberId,
  m.display_name AS createdByName, e.created_at AS createdAt
  FROM household_events e
  JOIN members m ON m.household_id = e.household_id AND m.id = e.created_by_member_id`;

export function canCreateHouseholdEvent(identity: Identity): boolean {
  return identityAccessLevel(identity) !== "managed_member";
}

export function requireEventCreation(identity: Identity, eventType: HouseholdEventType): void {
  if (!canCreateHouseholdEvent(identity)) {
    throw authorizationError("Household leaders and adults can add to the Household Schedule.");
  }
  if ((leadershipEvent(eventType) || eventType === "weekly_review") &&
    identityAccessLevel(identity) !== "household_admin") {
    throw authorizationError("Household leadership manages leadership meetings and Weekly Review.");
  }
}

export function canManageEvent(identity: Identity, event: {
  createdByMemberId: string; visibility: string;
}): boolean {
  if (identityAccessLevel(identity) === "household_admin") return true;
  return event.visibility !== "leadership" && event.createdByMemberId === identity.memberId;
}

const iso = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    throw validationError("Please check this Schedule entry.", { [field]: "Choose a valid date and time" });
  }
  return new Date(value).toISOString();
};

export function parseEventInput(body: JsonRecord): EventInput {
  if (!isHouseholdEventType(body.eventType)) {
    throw validationError("Please check this Schedule entry.", { eventType: "Choose an event type" });
  }
  if (!isEventRecurrence(body.recurrence)) {
    throw validationError("Please check this Schedule entry.", { recurrence: "Choose how often this repeats" });
  }
  const title = textField(body, "title", 1, 120);
  const startsAt = iso(body.startsAt, "startsAt");
  const endsAt = body.endsAt === undefined || body.endsAt === null || body.endsAt === ""
    ? null : iso(body.endsAt, "endsAt");
  if (endsAt && endsAt <= startsAt) {
    throw validationError("Please check this Schedule entry.", { endsAt: "End after the start time" });
  }
  const timezone = textField(body, "timezone", 1, 100);
  const customRecurrence = body.recurrence === "custom"
    ? optionalText(body, "customRecurrence", 300) : null;
  if (body.recurrence === "custom" && !customRecurrence) {
    throw validationError("Please check this Schedule entry.", { customRecurrence: "Describe the custom recurrence" });
  }
  let reminderMinutes: number | null = null;
  if (body.reminderMinutes !== undefined && body.reminderMinutes !== null && body.reminderMinutes !== "") {
    reminderMinutes = typeof body.reminderMinutes === "number"
      ? body.reminderMinutes : Number(body.reminderMinutes);
    if (!Number.isInteger(reminderMinutes) || reminderMinutes < 0 || reminderMinutes > 10080) {
      throw validationError("Please check this Schedule entry.", { reminderMinutes: "Choose a reminder up to seven days before" });
    }
  }
  const memberIds = body.memberIds === undefined ? [] : body.memberIds;
  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== "string") ||
    new Set(memberIds).size !== memberIds.length) {
    throw validationError("Please check this Schedule entry.", { memberIds: "Choose each family member once" });
  }
  if ((body.eventType === "appointment" || body.eventType === "child_meeting") && !memberIds.length) {
    throw validationError("Please check this Schedule entry.", { memberIds: "Choose who this is for" });
  }
  return {
    title, eventType: body.eventType, description: optionalText(body, "description", 1000),
    location: optionalText(body, "location", 200), startsAt, endsAt, timezone,
    recurrence: body.recurrence, customRecurrence, reminderMinutes, memberIds
  };
}

export async function validateEventMembers(
  db: D1Database, identity: Identity, eventType: HouseholdEventType, requestedIds: string[]
) {
  const result = await db.prepare(`SELECT id, display_name AS displayName, role,
    access_level AS accessLevel, age_band AS ageBand, age_group AS ageGroup
    FROM members WHERE household_id = ? AND is_active = 1
      AND lifecycle_state NOT IN ('left','suspended') ORDER BY display_name`)
    .bind(identity.householdId).all<{
      id: string; displayName: string; role: string; accessLevel: string; ageBand: string; ageGroup: string | null
    }>();
  const members = new Map(result.results.map((member) => [member.id, member]));
  if (requestedIds.some((id) => !members.has(id))) {
    throw validationError("Please check this Schedule entry.", { memberIds: "Choose active family members from this household" });
  }
  if (leadershipEvent(eventType) && requestedIds.some((id) =>
    members.get(id)?.accessLevel !== "household_admin")) {
    throw validationError("Please check this Schedule entry.", { memberIds: "Leadership Meetings are for household leaders" });
  }
  if (eventType === "child_meeting" && requestedIds.every((id) => {
    const member = members.get(id); return member?.ageBand !== "child" && member?.ageBand !== "young_child";
  })) {
    throw validationError("Please check this Schedule entry.", { memberIds: "Choose a Child or Young child family member" });
  }
  return result.results;
}

export async function householdEvent(
  db: D1Database, householdId: string, eventId: string
): Promise<HouseholdEventRow> {
  const event = await db.prepare(`${eventSelect} WHERE e.household_id = ? AND e.id = ?`)
    .bind(householdId, eventId).first<HouseholdEventRow>();
  if (!event) throw new ApiError(404, "NOT_FOUND", "We couldn’t find that Schedule entry.");
  return event;
}

export async function eventMembers(
  db: D1Database, householdId: string, eventIds?: string[]
): Promise<HouseholdEventMember[]> {
  if (eventIds && !eventIds.length) return [];
  const whereIds = eventIds ? `AND em.event_id IN (${eventIds.map(() => "?").join(",")})` : "";
  const result = await db.prepare(`SELECT em.event_id AS eventId, em.member_id AS memberId,
    m.display_name AS displayName, m.role, m.access_level AS accessLevel,
    m.age_band AS ageBand, m.age_group AS ageGroup,
    em.participation_role AS participationRole
    FROM household_event_members em
    JOIN members m ON m.household_id = em.household_id AND m.id = em.member_id
    WHERE em.household_id = ? ${whereIds} ORDER BY m.display_name`)
    .bind(householdId, ...(eventIds || [])).all<HouseholdEventMember>();
  return result.results;
}
