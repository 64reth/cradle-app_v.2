export const ROUTINE_ASSIGNMENT_MODES = [
  { value: "rotation", label: "Rotation", description: "One person takes each turn, moving through your chosen Family members." },
  { value: "one_person", label: "One person", description: "The same person takes every occurrence." },
  { value: "shared_team", label: "Shared team", description: "Everyone selected contributes to the same mission." },
  { value: "decide_later", label: "Decide later", description: "Keep this Routine unassigned until your family reviews it." }
] as const;

export type RoutineAssignmentMode = typeof ROUTINE_ASSIGNMENT_MODES[number]["value"];
export const isRoutineAssignmentMode = (value: unknown): value is RoutineAssignmentMode =>
  typeof value === "string" && ROUTINE_ASSIGNMENT_MODES.some((mode) => mode.value === value);

export const TASK_STATES = ["todo", "in_progress", "waiting_for_team", "complete", "missed"] as const;
export type TaskState = typeof TASK_STATES[number];

export const taskStateLabel = (state: TaskState): string => ({
  todo: "To do",
  in_progress: "In progress",
  waiting_for_team: "Waiting for team",
  complete: "Completed",
  missed: "Missed"
})[state];
