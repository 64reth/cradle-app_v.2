import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, notFoundError, parseJsonBody, requireD1, success, validationError } from "../../http";
import { mealFavourites, mealSuggestions } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const mealId = typeof body.mealId === "string" && body.mealId.trim() ? body.mealId.trim() : null;
    const customMealName = typeof body.customMealName === "string" && body.customMealName.trim() ? body.customMealName.trim() : null;
    if (!mealId && !customMealName) throw validationError("Choose a meal or enter a favourite meal name.");
    if (customMealName && customMealName.length > 160) throw validationError("The favourite meal name is too long.");
    if (mealId && !(await db.prepare("SELECT id FROM meals WHERE household_id = ? AND id = ? AND is_active = 1").bind(identity.householdId, mealId).first())) {
      throw notFoundError("That meal is not in this household’s Recipe Bank.");
    }
    const priority = Math.max(0, Math.min(5, Number(body.priority || 0))); const now = new Date().toISOString();
    await db.prepare(`INSERT INTO meal_favourites
      (id, household_id, member_id, meal_id, custom_meal_name, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, identity.memberId, mealId, customMealName, priority, now, now).run();
    return success({ favourites: await mealFavourites(db, identity.householdId), suggestions: await mealSuggestions(db, identity.householdId) }, requestId, { status: 201 });
  });
}

export async function onRequestDelete({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const id = new URL(request.url).searchParams.get("id"); if (!id) throw validationError("Choose a favourite to remove.");
    await db.prepare("DELETE FROM meal_favourites WHERE household_id = ? AND id = ? AND member_id = ?")
      .bind(identity.householdId, id, identity.memberId).run();
    return success({ favourites: await mealFavourites(db, identity.householdId) }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST or DELETE"); });
}
