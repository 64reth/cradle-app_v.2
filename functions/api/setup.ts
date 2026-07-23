import type { Identity } from "./auth";
import { authorizationError, validationError } from "./http";
import type { JsonRecord } from "./types";

export type SetupStep = "leadership" | "members" | "rooms" | "pets" | "companion" | "review" | "complete";

export function requireSetupOwner(identity: Identity): void {
  if (identity.role !== "owner") throw authorizationError("Only the household Owner can change initial setup.");
}

export function requireHouseholdManager(identity: Identity): void {
  if (identity.role !== "owner" && identity.role !== "parent_admin") throw authorizationError();
}

export function optionalText(body: JsonRecord, field: string, max: number): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) {
    throw validationError("Please check the submitted fields.", { [field]: `Must be at most ${max} characters` });
  }
  return value.trim() || null;
}

export async function setupState(db: D1Database, householdId: string) {
  return db.prepare(`SELECT setup_status AS status, setup_step AS step,
    leadership_confirmed_at AS leadershipConfirmedAt, membership_reviewed_at AS membershipReviewedAt,
    setup_completed_at AS completedAt FROM households WHERE id = ?`)
    .bind(householdId).first<{ status: "incomplete" | "complete"; step: SetupStep;
      leadershipConfirmedAt: string | null; membershipReviewedAt: string | null; completedAt: string | null }>();
}

export async function requireStep(db: D1Database, identity: Identity, expected: SetupStep): Promise<void> {
  requireSetupOwner(identity);
  const state = await setupState(db, identity.householdId);
  if (!state || state.status === "complete" || state.step !== expected) {
    throw validationError("This setup stage is not currently available.");
  }
}
