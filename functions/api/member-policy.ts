import type { Identity } from "./auth";
import { authorizationError } from "./http";
import { actorAccessLevel, canManageMember as domainCanManageMember, hasCapability } from "../../shared/household-domain";

export type FamilyAccess = "manage" | "participate" | "limited";

export function familyAccess(identity: Identity): FamilyAccess {
  if (actorAccessLevel(identity) === "household_admin") return "manage";
  if (actorAccessLevel(identity) === "household_member") return "participate";
  return "limited";
}

export function requireFamilyManager(identity: Identity): void {
  if (!hasCapability(identity, "manage_member")) throw authorizationError("Household leaders manage family and invitations.");
}

export function canManageMember(identity: Identity, member: { id: string; role: string; accessLevel?: string | null }): boolean {
  return domainCanManageMember(identity, member);
}

export function requireOwnMember(identity: Identity, memberId: string): void {
  if (identity.memberId !== memberId) throw authorizationError("You can only change your own personal details.");
}
