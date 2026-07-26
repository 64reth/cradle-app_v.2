export const ALPHA_EVENT_NAMES = [
  "screen_viewed", "action_succeeded", "action_failed", "api_error", "transport_error",
  "api_timing", "runtime_changed", "reconnect_attempt", "realtime_stale", "feedback_submitted"
] as const;
export type AlphaEventName = typeof ALPHA_EVENT_NAMES[number];

export const ALPHA_FEEDBACK_CATEGORIES = ["confusion", "bug", "idea", "delight", "other"] as const;
export type AlphaFeedbackCategory = typeof ALPHA_FEEDBACK_CATEGORIES[number];

export const ALPHA_SCREENS = ["onboarding", "dashboard", "routines", "schedule", "meals", "together", "my_cradle", "unknown"] as const;
export type AlphaScreen = typeof ALPHA_SCREENS[number];

export type AlphaDiagnosticEvent = {
  name: AlphaEventName;
  screen?: AlphaScreen;
  action?: string;
  statusCode?: number;
  errorCode?: string;
  requestId?: string;
  durationMs?: number;
  deviceClass?: "phone" | "tablet" | "desktop";
  runtimeId?: string;
  appVersion?: string;
};

export type AlphaFeedback = {
  category: AlphaFeedbackCategory;
  screen?: AlphaScreen;
  rating?: number;
  message?: string;
};

const bounded = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const safeToken = (value: unknown, max: number, pattern: RegExp): string | undefined => {
  const result = bounded(value, max);
  return result && pattern.test(result) ? result : undefined;
};

export function isAlphaEventName(value: unknown): value is AlphaEventName {
  return typeof value === "string" && (ALPHA_EVENT_NAMES as readonly string[]).includes(value);
}

export function isAlphaScreen(value: unknown): value is AlphaScreen {
  return typeof value === "string" && (ALPHA_SCREENS as readonly string[]).includes(value);
}

export function parseAlphaDiagnosticEvent(value: unknown): AlphaDiagnosticEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isAlphaEventName(input.name)) return null;
  const event: AlphaDiagnosticEvent = { name: input.name };
  if (isAlphaScreen(input.screen)) event.screen = input.screen;
  const action = safeToken(input.action, 80, /^[A-Za-z0-9_:/?=-]+$/); if (action) event.action = action;
  const errorCode = safeToken(input.errorCode, 80, /^[A-Za-z0-9_.-]+$/); if (errorCode) event.errorCode = errorCode;
  const requestId = safeToken(input.requestId, 120, /^[A-Za-z0-9_.:-]+$/); if (requestId) event.requestId = requestId;
  const runtimeId = safeToken(input.runtimeId, 120, /^[A-Za-z0-9_.:-]+$/); if (runtimeId) event.runtimeId = runtimeId;
  const appVersion = safeToken(input.appVersion, 40, /^[A-Za-z0-9_.-]+$/); if (appVersion) event.appVersion = appVersion;
  if (typeof input.statusCode === "number" && Number.isInteger(input.statusCode) && input.statusCode >= 100 && input.statusCode <= 599) event.statusCode = input.statusCode;
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs) && input.durationMs >= 0 && input.durationMs <= 600_000) event.durationMs = Math.round(input.durationMs);
  if (input.deviceClass === "phone" || input.deviceClass === "tablet" || input.deviceClass === "desktop") event.deviceClass = input.deviceClass;
  return event;
}

export function parseAlphaFeedback(value: unknown): AlphaFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.category !== "string" || !(ALPHA_FEEDBACK_CATEGORIES as readonly string[]).includes(input.category)) return null;
  const feedback: AlphaFeedback = { category: input.category as AlphaFeedbackCategory };
  if (isAlphaScreen(input.screen)) feedback.screen = input.screen;
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5)) return null;
  if (input.rating !== undefined) feedback.rating = Number(input.rating);
  if (input.message !== undefined) {
    if (typeof input.message !== "string" || input.message.trim().length > 2000) return null;
    if (input.message.trim()) feedback.message = input.message.trim();
  }
  return feedback;
}
