export const HOUSEHOLD_SETUP_STEPS = ["leadership", "members", "companion", "rooms", "pets", "review", "complete"] as const;
export type HouseholdSetupStep = typeof HOUSEHOLD_SETUP_STEPS[number];
export type HouseholdLifecycle = "creating" | "onboarding" | "active" | "restricted" | "archived";

export const nextSetupStep = (step: HouseholdSetupStep): HouseholdSetupStep => {
  const index = HOUSEHOLD_SETUP_STEPS.indexOf(step);
  return HOUSEHOLD_SETUP_STEPS[Math.min(index + 1, HOUSEHOLD_SETUP_STEPS.length - 1)];
};
export const canAdvanceSetup = (from: HouseholdSetupStep, to: HouseholdSetupStep): boolean =>
  from !== "complete" && nextSetupStep(from) === to;

