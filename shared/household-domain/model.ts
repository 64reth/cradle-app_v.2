import type { HouseholdRole, MemberAccessLevel, MemberAgeBand, MemberLifecycleState } from "../members";

export type HouseholdId = string;
export type MemberId = string;
export type AccountId = string;
export type InvitationId = string;
export type JoinRequestId = string;

export type InvitationState = "pending" | "accepted" | "expired" | "revoked" | "replaced" | "none";
export type AccountState = "active" | "suspended" | "closed" | "unlinked" | "unknown";
export type PresenceState = "online" | "recent" | "offline" | "unknown";

export type HouseholdActor = {
  householdId: HouseholdId;
  memberId: MemberId;
  role: HouseholdRole;
  accessLevel?: MemberAccessLevel | null;
};

export type HouseholdMemberProjection = {
  id: MemberId;
  householdId?: HouseholdId;
  displayName: string;
  preferredName?: string | null;
  profileReference: string;
  role: HouseholdRole;
  accessLevel: MemberAccessLevel;
  ageBand: MemberAgeBand;
  lifecycleState: MemberLifecycleState;
  isActive: number | boolean;
  accountId?: AccountId | null;
  hasAccount: number | boolean;
  accountAccessStatus?: AccountState | null;
  invitationStatus?: InvitationState | null;
  inviteId?: InvitationId | null;
  inviteExpiresAt?: string | null;
  presence: PresenceState;
  canManage: number | boolean;
  canPause: number | boolean;
  canRestore: number | boolean;
  canInvite: number | boolean;
};

