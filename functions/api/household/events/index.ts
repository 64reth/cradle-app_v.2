import { authenticate, identityAccessLevel, textField } from "../../auth";
import {
  canCreateHouseholdEvent, eventMembers, eventSelect, parseEventInput,
  requireEventCreation, validateEventMembers, type HouseholdEventRow
} from "../../coordination";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const leadership = identityAccessLevel(identity) === "household_admin";
    const rows = await db.prepare(`${eventSelect}
      WHERE e.household_id = ? AND e.status = 'active' ${leadership ? "" : "AND e.visibility = 'household'"}
      ORDER BY e.starts_at, e.created_at`).bind(identity.householdId).all<HouseholdEventRow>();
    const members = await eventMembers(db, identity.householdId, rows.results.map(({ id }) => id));
    return success({
      events: rows.results.map((event) => ({
        ...event, members: members.filter(({ eventId }) => eventId === event.id)
      })),
      canCreate: canCreateHouseholdEvent(identity), canCreateLeadership: leadership
    }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const body = await parseJsonBody(request); const input = parseEventInput(body);
    requireEventCreation(identity, input.eventType);
    const clientKey = textField(body, "clientKey", 8, 100);
    const existing = await db.prepare(`${eventSelect}
      WHERE e.household_id = ? AND e.created_by_member_id = ? AND e.client_key = ?`)
      .bind(identity.householdId, identity.memberId, clientKey).first<HouseholdEventRow>();
    if (existing) {
      return success({ event: { ...existing, members: await eventMembers(db, identity.householdId, [existing.id]) },
        created: false, destination: "/calendar" }, requestId);
    }
    const availableMembers = await validateEventMembers(db, identity, input.eventType, input.memberIds);
    const selectedIds = input.memberIds.length ? input.memberIds :
      input.eventType === "leadership_meeting"
        ? availableMembers.filter(({ accessLevel }) => accessLevel === "household_admin").map(({ id }) => id)
        : ["family_meeting", "trip", "weekly_review"].includes(input.eventType)
          ? availableMembers.map(({ id }) => id) : [];
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await db.batch([
      db.prepare(`INSERT INTO household_events
        (id, household_id, created_by_member_id, title, event_type, description, location,
          starts_at, ends_at, timezone, recurrence_key, custom_recurrence, reminder_minutes,
          visibility, status, client_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
        .bind(id, identity.householdId, identity.memberId, input.title, input.eventType,
          input.description, input.location, input.startsAt, input.endsAt, input.timezone,
          input.recurrence, input.customRecurrence, input.reminderMinutes,
          input.eventType === "leadership_meeting" ? "leadership" : "household",
          clientKey, now, now),
      ...selectedIds.map((memberId) => db.prepare(`INSERT INTO household_event_members
        (household_id, event_id, member_id, participation_role, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(identity.householdId, id, memberId,
          input.eventType === "appointment" || input.eventType === "child_meeting" ? "subject" : "attendee", now))
    ]);
    return success({ event: {
      id, ...input, visibility: input.eventType === "leadership_meeting" ? "leadership" : "household",
      status: "active", createdByMemberId: identity.memberId,
      createdByName: identity.displayName,
      members: availableMembers.filter(({ id: memberId }) => selectedIds.includes(memberId)).map(({ id: memberId, ...member }) => ({
        ...member, eventId: id, memberId,
        participationRole: input.eventType === "appointment" || input.eventType === "child_meeting" ? "subject" : "attendee"
      }))
    }, created: true, destination: "/calendar" }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
