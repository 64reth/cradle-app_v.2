import type { HouseholdMemberProjection } from "./model";

export const retainedMembersExactlyOnce = <T extends Pick<HouseholdMemberProjection, "id">>(members: T[]): T[] => {
  const seen = new Set<string>();
  return members.filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)));
};

