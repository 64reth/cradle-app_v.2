export type HouseholdDomainErrorCode = "CROSS_HOUSEHOLD_ACCESS" | "INVALID_TRANSITION" |
  "MEMBER_NOT_INVITEABLE" | "DUPLICATE_JOIN_REQUEST" | "PERMISSION_DENIED";

export class HouseholdDomainError extends Error {
  constructor(public code: HouseholdDomainErrorCode, message: string) { super(message); }
}

