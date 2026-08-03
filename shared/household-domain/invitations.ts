import { memberCanBeInvited, type MemberInviteEligibility } from "../members";
import type { HouseholdActor } from "./model";
import { canInviteMember } from "./permissions";

export type InvitationTarget = MemberInviteEligibility & { id: string; householdId?: string };
export const invitationEligibility = (actor: HouseholdActor, target: InvitationTarget) => ({
  allowed: canInviteMember(actor, target) && memberCanBeInvited(target),
  reason: !canInviteMember(actor, target) ? "permission" : !memberCanBeInvited(target) ? "member_state" : null
} as const);

