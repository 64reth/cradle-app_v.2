import type { PresenceState } from "./model";

/** Current activity data is not a reliable presence signal. Unknown is intentionally honest and privacy-safe. */
export const householdPresence = (): PresenceState => "unknown";

