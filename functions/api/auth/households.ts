import { cookie, createSession, slug, textField } from "../auth";
import { authenticateIdentity } from "../auth-provider";
import { ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const body = await parseJsonBody(request);
    const householdName = textField(body, "householdName", 1, 120);
    const displayName = textField(body, "displayName", 1, 80);
    let accountId: string;
    try {
      accountId = (await authenticateIdentity(request, db)).accountId;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = String(error).toLowerCase();
      if (message.includes("no such table") || message.includes("no such column") || message.includes("doesn't exist")) {
        throw new ApiError(503, "AUTH_SCHEMA_UNAVAILABLE", "Household creation needs the latest Cradle database migration before it can continue.");
      }
      throw error;
    }
    const base = slug(householdName);
    if (!base) throw validationError("Please check the submitted fields.", { householdName: "Use letters or numbers" });
    const reference = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const profileReference = slug(displayName);
    const householdId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [
      db.prepare("INSERT INTO households (id, name, timezone, created_at, updated_at, lookup_reference) VALUES (?, ?, 'UTC', ?, ?, ?)")
        .bind(householdId, householdName, now, now, reference),
      db.prepare(`INSERT INTO members
        (id, household_id, display_name, role, is_active, created_at, updated_at,
          profile_reference, account_id, lifecycle_state, age_group, access_level, age_band)
        VALUES (?, ?, ?, 'owner', 1, ?, ?, ?, ?, 'active', 'adult', 'household_admin', 'adult')`)
        .bind(memberId, householdId, displayName, now, now, profileReference, accountId)
    ];
    try {
      await db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) {
        throw conflictError("That household or family member reference is unavailable.");
      }
      throw error;
    }
    const session = await createSession(db, householdId, memberId, accountId);
    return success({ householdReference: reference, profileReference, expiresAt: session.expiresAt }, requestId, {
      status: 201, headers: { "Set-Cookie": cookie(session.token, env) }
    });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
