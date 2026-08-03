import type { InvitationState } from "./model";
import type { MemberLifecycleState } from "../members";

const memberTransitions: Record<MemberLifecycleState, readonly MemberLifecycleState[]> = {
  managed: ["unclaimed", "invited", "join_requested", "active", "left"],
  unclaimed: ["managed", "invited", "join_requested", "active", "left"],
  invited: ["unclaimed", "join_requested", "active", "left"],
  join_requested: ["unclaimed", "invited", "active", "left"],
  active: ["suspended", "left"],
  suspended: ["active", "left"],
  left: []
};

export const canTransitionMember = (from: MemberLifecycleState, to: MemberLifecycleState): boolean =>
  from === to || memberTransitions[from].includes(to);

export const invitationState = (invite: {
  id?: string | null; revokedAt?: string | null; acceptedAt?: string | null; expiresAt?: string | null;
}, now = new Date()): InvitationState => {
  if (!invite.id) return "none";
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt && invite.expiresAt <= now.toISOString()) return "expired";
  return "pending";
};

