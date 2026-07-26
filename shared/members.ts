export const HOUSEHOLD_ROLES = ["owner", "parent_admin", "adult", "child"] as const;
export type HouseholdRole = typeof HOUSEHOLD_ROLES[number];

export const MEMBER_ACCESS_LEVELS = [
  {
    value: "household_admin",
    label: "Household admin",
    description: "Can manage family members, invitations, routines, assignments, Schedule and household settings."
  },
  {
    value: "household_member",
    label: "Household member",
    description: "Uses their own account, completes assigned work and manages their own cat and preferences."
  },
  {
    value: "managed_member",
    label: "Managed member",
    description: "Does not need a login yet. A Household admin manages their profile, tasks and future invitation."
  }
] as const;
export type MemberAccessLevel = typeof MEMBER_ACCESS_LEVELS[number]["value"];

export const MEMBER_AGE_BANDS = [
  { value: "adult", label: "Adult — 18+" },
  { value: "teen", label: "Teen — 13–17" },
  { value: "child", label: "Child — 5–12" },
  { value: "young_child", label: "Young child — under 5" }
] as const;
export type MemberAgeBand = typeof MEMBER_AGE_BANDS[number]["value"];

export const MEMBER_LIFECYCLE_STATES = [
  "managed", "unclaimed", "invited", "join_requested", "active", "suspended", "left"
] as const;
export type MemberLifecycleState = typeof MEMBER_LIFECYCLE_STATES[number];

export const isMemberAccessLevel = (value: unknown): value is MemberAccessLevel =>
  typeof value === "string" && MEMBER_ACCESS_LEVELS.some((choice) => choice.value === value);
export const isMemberAgeBand = (value: unknown): value is MemberAgeBand =>
  typeof value === "string" && MEMBER_AGE_BANDS.some((choice) => choice.value === value);

export const legacyRoleForAccess = (
  accessLevel: MemberAccessLevel, currentRole?: HouseholdRole
): HouseholdRole => currentRole === "owner" ? "owner" :
  accessLevel === "household_admin" ? "parent_admin" :
    accessLevel === "managed_member" ? "child" : "adult";

export const legacyAgeGroupForBand = (ageBand: MemberAgeBand): "adult" | "teen" | "child" | "dependent" =>
  ageBand === "young_child" ? "dependent" : ageBand;

export const roleLabel = (role: string): string =>
  role === "owner" ? "Owner" : role === "parent_admin" ? "Parent / Admin" :
    role === "adult" ? "Adult household member" : "Child";

export const accessLevelLabel = (value: string): string =>
  MEMBER_ACCESS_LEVELS.find((choice) => choice.value === value)?.label || "Household member";
export const ageBandLabel = (value: string): string =>
  MEMBER_AGE_BANDS.find((choice) => choice.value === value)?.label || "Adult — 18+";

export const lifecycleLabel = (state: MemberLifecycleState): string => ({
  managed: "Cared for by household leaders", unclaimed: "Ready to invite", invited: "Invitation sent",
  join_requested: "Waiting for a welcome", active: "Joined Cradle", suspended: "Taking a break",
  left: "No longer in the household"
})[state];
