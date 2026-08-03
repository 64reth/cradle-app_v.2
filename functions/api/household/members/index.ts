import { authenticate, slug, textField } from "../../auth";
import { conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { requireFamilyManager } from "../../member-policy";
import { requireSetupOwner } from "../../setup";
import type { CradleEnv } from "../../types";
import {
  isMemberAccessLevel, isMemberAgeBand, legacyAgeGroupForBand, legacyRoleForAccess
} from "../../../../shared/members";
import { CANONICAL_MEMBERS_SQL, canonicalHouseholdMembers } from "../../../domain/household";

type Context = { request: Request; env: CradleEnv };

export const FAMILY_MEMBERS_SQL = CANONICAL_MEMBERS_SQL;

export async function familyMembers(db: D1Database, householdId: string) {
  return canonicalHouseholdMembers(db, householdId);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const result = await familyMembers(db, identity.householdId);
    return success({ members: result.results }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus === "complete") requireFamilyManager(identity); else requireSetupOwner(identity);
    const body = await parseJsonBody(request);
    const displayName = textField(body, "displayName", 1, 80);
    if (!isMemberAccessLevel(body.accessLevel)) {
      throw validationError("Please check this family member.", { accessLevel: "Choose what this person can manage" });
    }
    if (!isMemberAgeBand(body.ageBand)) {
      throw validationError("Please check this family member.", { ageBand: "Choose an age group" });
    }
    const clientKey = textField(body, "clientKey", 8, 100);
    const role = legacyRoleForAccess(body.accessLevel);
    const ageGroup = legacyAgeGroupForBand(body.ageBand);
    const lifecycle = body.accessLevel === "managed_member" ? "managed" : "unclaimed";
    const existing = await db.prepare(`SELECT id, display_name AS displayName, role,
      access_level AS accessLevel, age_band AS ageBand,
      lifecycle_state AS lifecycleState FROM members WHERE household_id = ? AND client_key = ?`)
      .bind(identity.householdId, clientKey).first();
    if (existing) return success({ member: existing, created: false }, requestId);
    const duplicate = await db.prepare(`SELECT id, display_name AS displayName
      FROM members WHERE household_id = ? AND lower(trim(display_name)) = lower(trim(?)) LIMIT 1`)
      .bind(identity.householdId, displayName).first<{ id: string; displayName: string }>();
    if (duplicate) {
      throw conflictError(`${duplicate.displayName} is already a family member. Manage their existing profile instead.`, {
        existingMemberId: duplicate.id, existingMemberName: duplicate.displayName
      });
    }
    const baseReference = slug(displayName);
    if (!baseReference) throw validationError("Please check this family member.", { displayName: "Use letters or numbers" });
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    try {
      await db.prepare(`INSERT INTO members
        (id, household_id, display_name, role, is_active, created_at, updated_at, profile_reference,
          lifecycle_state, age_group, relationship_label, client_key, access_level, age_band)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
        .bind(id, identity.householdId, displayName, role, now, now,
          `${baseReference}-${id.slice(0, 4)}`, lifecycle, ageGroup, clientKey,
          body.accessLevel, body.ageBand).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) {
        const racedDuplicate = await db.prepare(`SELECT id, display_name AS displayName
          FROM members WHERE household_id = ? AND lower(trim(display_name)) = lower(trim(?)) LIMIT 1`)
          .bind(identity.householdId, displayName).first<{ id: string; displayName: string }>();
        throw conflictError(
          racedDuplicate
            ? `${racedDuplicate.displayName} is already a family member. Manage their existing profile instead.`
            : "That family member already exists.",
          racedDuplicate ? {
            existingMemberId: racedDuplicate.id, existingMemberName: racedDuplicate.displayName
          } : undefined
        );
      }
      throw error;
    }
    return success({ member: { id, displayName, profileReference: `${baseReference}-${id.slice(0, 4)}`,
      role, accessLevel: body.accessLevel, ageBand: body.ageBand,
      lifecycleState: lifecycle }, created: true }, requestId, { status: 201 });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
