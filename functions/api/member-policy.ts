import { identityAccessLevel, type Identity } from "./auth";
import { authorizationError } from "./http";

export type FamilyAccess = "manage" | "participate" | "limited";

export function familyAccess(identity: Identity): FamilyAccess {
  if (identityAccessLevel(identity) === "household_admin") return "manage";
  if (identityAccessLevel(identity) === "household_member") return "participate";
  return "limited";
}

export function requireFamilyManager(identity: Identity): void {
  if (familyAccess(identity) !== "manage") throw authorizationError("Household leaders manage family and invitations.");
}

export function canManageMember(identity: Identity, member: { id: string; role: string; accessLevel?: string | null }): boolean {
  if (identity.memberId === member.id) return true;
  if (familyAccess(identity) !== "manage") return false;
  if (member.role === "owner") return false;
  return true;
}

export function requireOwnMember(identity: Identity, memberId: string): void {
  if (identity.memberId !== memberId) throw authorizationError("You can only change your own personal details.");
}
