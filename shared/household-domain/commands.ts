import { HouseholdDomainError } from "./errors";
import { invitationEligibility, type InvitationTarget } from "./invitations";
import type { HouseholdActor } from "./model";
import { canTransitionMember } from "./states";
import type { MemberLifecycleState } from "../members";

export function requireInvitationEligibility(actor: HouseholdActor, target: InvitationTarget): void {
  if (!invitationEligibility(actor, target).allowed) {
    throw new HouseholdDomainError("MEMBER_NOT_INVITEABLE", "The member is not eligible for an invitation.");
  }
}

export function requireMemberTransition(from: MemberLifecycleState, to: MemberLifecycleState): void {
  if (!canTransitionMember(from, to)) throw new HouseholdDomainError("INVALID_TRANSITION", `Cannot transition from ${from} to ${to}.`);
}
