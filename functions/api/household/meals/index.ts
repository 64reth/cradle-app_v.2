import { authenticate, identityAccessLevel } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { mealConstraints, mealDuplicateCandidates, mealFavourites, mealSuggestions, requireMealManagement } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const meals = await db.prepare(`SELECT id, name, description, dietary_tags AS dietaryTags, allergens,
        source_kind AS sourceKind, is_active AS isActive FROM meals
      WHERE household_id = ? AND is_active = 1 ORDER BY name`).bind(identity.householdId).all();
    return success({ meals: meals.results, favourites: await mealFavourites(db, identity.householdId),
      constraints: await mealConstraints(db, identity.householdId),
      suggestions: await mealSuggestions(db, identity.householdId), duplicates: await mealDuplicateCandidates(db, identity.householdId),
      canManage: identityAccessLevel(identity) === "household_admin" }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireMealManagement(identity);
    const body = await parseJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 160) throw validationError("Give the meal a name.", { name: "Must be 1-160 characters" });
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO meals
      (id, household_id, name, description, dietary_tags, allergens, source_kind, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(id, identity.householdId, name, typeof body.description === "string" ? body.description.trim() || null : null,
        typeof body.dietaryTags === "string" ? body.dietaryTags.trim() || null : null,
        typeof body.allergens === "string" ? body.allergens.trim() || null : null,
        body.sourceKind === "recipe" ? "recipe" : "custom", now, now).run();
    return success({ id, name }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
