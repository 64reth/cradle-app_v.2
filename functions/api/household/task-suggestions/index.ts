import { authenticate, textField } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { familyAccess } from "../../member-policy";
import { optionalText } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const manager = familyAccess(identity) === "manage";
    const result = await db.prepare(`SELECT s.id, s.title, s.suggestion_type AS suggestionType, s.note, s.status,
      s.suggested_by_member_id AS suggestedByMemberId, m.display_name AS suggestedByName,
      s.room_id AS roomId, r.name AS roomName, s.pet_id AS petId, p.name AS petName,
      s.created_at AS createdAt
      FROM task_suggestions s
      JOIN members m ON m.household_id = s.household_id AND m.id = s.suggested_by_member_id
      LEFT JOIN rooms r ON r.household_id = s.household_id AND r.id = s.room_id
      LEFT JOIN pets p ON p.household_id = s.household_id AND p.id = s.pet_id
      WHERE s.household_id = ? ${manager ? "" : "AND s.suggested_by_member_id = ?"}
      ORDER BY CASE s.status WHEN 'open' THEN 0 ELSE 1 END, s.created_at DESC`)
      .bind(identity.householdId, ...(manager ? [] : [identity.memberId])).all();
    return success({ suggestions: result.results, canReview: manager }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const title = textField(body, "title", 1, 120); const clientKey = textField(body, "clientKey", 8, 100);
    if (body.suggestionType !== "one_off" && body.suggestionType !== "recurring") {
      throw validationError("Please check your suggestion.", { suggestionType: "Choose one-off or recurring" });
    }
    const roomId = typeof body.roomId === "string" && body.roomId ? body.roomId : null;
    const petId = typeof body.petId === "string" && body.petId ? body.petId : null;
    if (roomId && petId) throw validationError("Please check your suggestion.", { context: "Choose a Room or Pet, not both" });
    if (roomId && !await db.prepare("SELECT id FROM rooms WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(identity.householdId, roomId).first()) {
      throw validationError("Please check your suggestion.", { roomId: "Choose an active Room in this household" });
    }
    if (petId && !await db.prepare("SELECT id FROM pets WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(identity.householdId, petId).first()) {
      throw validationError("Please check your suggestion.", { petId: "Choose an active Pet in this household" });
    }
    const existing = await db.prepare(`SELECT id, title, status FROM task_suggestions
      WHERE household_id = ? AND suggested_by_member_id = ? AND client_key = ?`)
      .bind(identity.householdId, identity.memberId, clientKey).first();
    if (existing) return success({ suggestion: existing, created: false, destination: "/me" }, requestId);
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await db.prepare(`INSERT INTO task_suggestions
      (id, household_id, suggested_by_member_id, room_id, pet_id, title, suggestion_type,
        note, status, client_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
      .bind(id, identity.householdId, identity.memberId, roomId, petId, title, body.suggestionType,
        optionalText(body, "note", 1000), clientKey, now, now).run();
    return success({ suggestion: { id, title, status: "open", roomId, petId }, created: true,
      destination: "/me" }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
