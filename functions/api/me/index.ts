import { authenticate, textField } from "../auth";
import {
  ApiError, authorizationError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1,
  success, validationError
} from "../http";
import { memberAvatarSelect } from "../member-avatars";
import type { CradleEnv } from "../types";
import { identityAccessLevel, type Identity } from "../auth";
import { dateInTimezone, generateTodayTasks, personalTasks, refreshDailyTaskStates } from "../tasks";
import { mealFavourites } from "../meal-planning";
import { listMemberInterests } from "../interests";

type Context = { request: Request; env: CradleEnv };

export async function meData(db: D1Database, identity: Identity, memberId = identity.memberId) {
  const date = dateInTimezone(identity.householdTimezone || "UTC");
  const [member, avatar, suggestions, tasks, helpers, favourites, mealPreferences, interests] = await Promise.all([
    db.prepare(`SELECT m.id, m.display_name AS displayName, m.preferred_name AS preferredName,
      m.profile_reference AS profileReference, m.role,
      m.lifecycle_state AS lifecycleState, m.access_level AS accessLevel, m.age_band AS ageBand,
      h.name AS householdName
      FROM members m JOIN households h ON h.id = m.household_id
      WHERE m.household_id = ? AND m.id = ?`).bind(identity.householdId, memberId).first(),
    db.prepare(memberAvatarSelect).bind(identity.householdId, memberId).first(),
    db.prepare(`SELECT id, title, status, suggestion_type AS suggestionType, created_at AS createdAt
      FROM task_suggestions WHERE household_id = ? AND suggested_by_member_id = ?
      ORDER BY created_at DESC LIMIT 20`).bind(identity.householdId, memberId).all(),
    personalTasks(db, identity.householdId, memberId, date),
    db.prepare(`SELECT id, display_name AS displayName FROM members WHERE household_id = ?
      AND id != ? AND is_active = 1 AND lifecycle_state NOT IN ('left','suspended')
      ORDER BY display_name`).bind(identity.householdId, memberId).all(),
    mealFavourites(db, identity.householdId),
    db.prepare(`SELECT dietary_requirements AS dietaryRequirements, allergies, dislikes
      FROM member_meal_preferences WHERE household_id = ? AND member_id = ?`).bind(identity.householdId, memberId).first(),
    listMemberInterests(db, identity.householdId, memberId, true)
  ]);
  if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found.");
  return { member, avatar, favourites: favourites.filter(({ memberId: favouriteMemberId }) => favouriteMemberId === memberId), mealPreferences, interests,
    suggestions: suggestions.results,
    personalTasks: { state: tasks.length ? "ready" : "empty",
      message: tasks.length ? `${tasks.length} household ${tasks.length === 1 ? "mission" : "missions"} today.` :
        "Nothing is assigned here today.", tasks },
    helpRequested: tasks.filter(({ participantKind }) => participantKind === "helper"),
    helpers: helpers.results, viewedMemberId: memberId,
    deferred: ["Messages", "Preferences", "Account"] };
}

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await refreshDailyTaskStates(db, identity.householdId, identity.householdTimezone || "UTC");
    await generateTodayTasks(db, identity.householdId, identity.householdTimezone || "UTC");
    const requested = new URL(request.url).searchParams.get("memberId") || identity.memberId;
    if (requested !== identity.memberId) {
      if (identityAccessLevel(identity) !== "household_admin") throw authorizationError();
      const target = await db.prepare(`SELECT access_level AS accessLevel FROM members
        WHERE household_id = ? AND id = ? AND is_active = 1`)
        .bind(identity.householdId, requested).first<{ accessLevel: string }>();
      if (!target || target.accessLevel !== "managed_member") {
        throw authorizationError("Household admins can open My Cradle for Managed members.");
      }
    }
    return success(await meData(db, identity, requested), requestId);
  });
}

export async function onRequestPatch({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    if ("role" in body || "householdId" in body || "ageGroup" in body || "lifecycleState" in body) {
      throw validationError("Household roles and access are managed by household leaders.");
    }
    const displayName = textField(body, "displayName", 1, 80);
    const preferredName = typeof body.preferredName === "string" && body.preferredName.trim()
      ? textField(body, "preferredName", 1, 80) : null;
    await db.prepare(`UPDATE members SET display_name = ?, preferred_name = ?, updated_at = ?
      WHERE household_id = ? AND id = ?`)
      .bind(displayName, preferredName, new Date().toISOString(), identity.householdId, identity.memberId).run();
    return success(await meData(db, identity), requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PATCH"); });
}
