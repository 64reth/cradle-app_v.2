export const TOGETHER_STATUSES = [
  "suggested", "viewed", "accepted", "started", "completed", "skipped", "swapped", "saved_for_later", "cancelled"
] as const;
export type TogetherStatus = typeof TOGETHER_STATUSES[number];

export const TOGETHER_CATEGORIES = [
  "games", "conversation", "creative", "active", "learning", "food", "music", "film", "sports", "outdoors", "low_energy"
] as const;
export type TogetherCategory = typeof TOGETHER_CATEGORIES[number];

export type TogetherParticipant = {
  memberId: string; displayName: string; role: string; accessLevel: string; ageBand: string;
  participantRole: "participant" | "spotlight" | "guide" | "helper" | "supervisor";
  participationStatus: "invited" | "accepted" | "declined" | "completed";
};

export type TogetherMoment = {
  id: string; localDate: string; title: string; description: string; momentType: string;
  status: TogetherStatus; isPrimary: boolean; generatedReason: string; durationMinutes: number;
  indoorOutdoor: string; screenMode: string; category: string; equipment: string[];
  participants: TogetherParticipant[]; whySuggested?: string | null;
};

export type TogetherTemplate = {
  id: string; householdId: string | null; title: string; description: string; category: TogetherCategory;
  momentType: string; minParticipants: number; maxParticipants: number; durationMinutes: number;
  indoorOutdoor: string; screenMode: string; energyLevel: string; equipment: string[];
  source: "system" | "household";
};

export const localDateForTimezone = (timezone = "UTC", now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export function deterministicIndex(seed: string, length: number): number {
  if (!length) return 0;
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return Math.abs(value) % length;
}

export function transitionAllowed(from: TogetherStatus, to: TogetherStatus): boolean {
  const transitions: Record<TogetherStatus, TogetherStatus[]> = {
    suggested: ["viewed", "accepted", "started", "completed", "skipped", "swapped", "saved_for_later", "cancelled"],
    viewed: ["accepted", "started", "completed", "skipped", "swapped", "saved_for_later", "cancelled"],
    accepted: ["started", "completed", "cancelled"],
    started: ["completed", "cancelled"],
    completed: [], skipped: [], swapped: [], saved_for_later: ["accepted", "cancelled"], cancelled: []
  };
  return transitions[from].includes(to);
}

export function participantContext(participants: TogetherParticipant[]): string {
  if (!participants.length) return "Family Moment";
  if (participants.length === 1) return participants[0].displayName;
  if (participants.length > 3) return "Everyone";
  const names = participants.map(({ displayName }) => displayName);
  return names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
