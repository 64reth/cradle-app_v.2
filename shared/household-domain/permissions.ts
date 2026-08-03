import type { MemberAccessLevel } from "../members";
import type { HouseholdActor } from "./model";

export type HouseholdCapability = "view_member" | "manage_member" | "invite_member" | "pause_access" |
  "restore_access" | "review_join_requests" | "manage_household_settings" | "manage_household_content";

export const actorAccessLevel = (actor: Pick<HouseholdActor, "accessLevel" | "role">): MemberAccessLevel =>
  actor.accessLevel || (actor.role === "owner" || actor.role === "parent_admin"
    ? "household_admin" : actor.role === "adult" ? "household_member" : "managed_member");

export const hasCapability = (actor: HouseholdActor, capability: HouseholdCapability): boolean => {
  if (capability === "view_member") return true;
  if (capability === "manage_household_content") return actorAccessLevel(actor) !== "managed_member";
  return actorAccessLevel(actor) === "household_admin";
};

type Target = { id: string; householdId?: string; role: string };
const sameHousehold = (actor: HouseholdActor, target: Target) => !target.householdId || actor.householdId === target.householdId;

export const canManageMember = (actor: HouseholdActor, target: Target): boolean =>
  sameHousehold(actor, target) && (actor.memberId === target.id ||
    (hasCapability(actor, "manage_member") && target.role !== "owner"));
export const canInviteMember = (actor: HouseholdActor, target: Target): boolean =>
  sameHousehold(actor, target) && hasCapability(actor, "invite_member") && target.role !== "owner";
export const canPauseAccess = canInviteMember;
export const canReviewJoinRequests = (actor: HouseholdActor): boolean => hasCapability(actor, "review_join_requests");
export const canManageHouseholdSettings = (actor: HouseholdActor): boolean => hasCapability(actor, "manage_household_settings");

