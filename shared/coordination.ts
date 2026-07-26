export const HOUSEHOLD_EVENT_TYPES = [
  { value: "family_meeting", label: "Family Meeting", description: "A shared conversation for everyone in the household." },
  { value: "leadership_meeting", label: "Leadership Meeting", description: "A private meeting for Owners and Parent/Admins." },
  { value: "child_meeting", label: "Child Meeting", description: "Time focused on a child or dependant." },
  { value: "appointment", label: "Appointment", description: "An appointment linked to the relevant household Members." },
  { value: "school_event", label: "School Event", description: "A school date, performance, deadline or activity." },
  { value: "trip", label: "Trip", description: "Travel or time away for some or all of the household." },
  { value: "birthday", label: "Birthday", description: "A birthday or annual celebration." },
  { value: "household_reminder", label: "Household Reminder", description: "A shared reminder that belongs on the household calendar." },
  { value: "event", label: "One-off Event", description: "Another useful date for the household." },
  { value: "weekly_review", label: "Weekly Review", description: "Review routines, celebrate wins and plan the coming week." }
] as const;
export type HouseholdEventType = typeof HOUSEHOLD_EVENT_TYPES[number]["value"];

export const EVENT_RECURRENCES = [
  { value: "one_off", label: "One-off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom recurrence" }
] as const;
export type EventRecurrence = typeof EVENT_RECURRENCES[number]["value"];

export const EVENT_REMINDERS = [
  { value: 0, label: "At start time" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" }
] as const;

export const isHouseholdEventType = (value: unknown): value is HouseholdEventType =>
  typeof value === "string" && HOUSEHOLD_EVENT_TYPES.some((type) => type.value === value);
export const isEventRecurrence = (value: unknown): value is EventRecurrence =>
  typeof value === "string" && EVENT_RECURRENCES.some((recurrence) => recurrence.value === value);
export const eventTypeLabel = (value: HouseholdEventType): string =>
  HOUSEHOLD_EVENT_TYPES.find((type) => type.value === value)?.label || value;
export const recurrenceLabel = (value: EventRecurrence): string =>
  EVENT_RECURRENCES.find((recurrence) => recurrence.value === value)?.label || value;

export const leadershipEvent = (value: HouseholdEventType): boolean => value === "leadership_meeting";
export const weeklyReviewDefaults = {
  title: "Weekly Review",
  recurrence: "weekly" as const,
  weekday: 0,
  hour: 19,
  minute: 0
};
