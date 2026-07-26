# Household alpha diagnostics

Cradle's private household alpha has a small, opt-in diagnostics foundation for finding confusing journeys, permission problems, stale runtime state and transport failures. It is not an analytics or surveillance system.

## Privacy boundary

Diagnostics are sent only when the build enables `VITE_ALPHA_DIAGNOSTICS=true`. The client sends an allowlisted event name and, when useful, a screen, action, status/error code, request ID, duration and coarse device class. It never sends keystrokes, message contents, meal contents, task descriptions, profile details or arbitrary URLs. Events are scoped on the server to the authenticated household and member.

The in-app **Share feedback** control is available to signed-in household members. Feedback is explicit, optional and limited to a category, optional 1–5 rating and a short note. Members should not include private family details. Feedback is stored only for the authenticated household.

## Ownership and access

All event and feedback writes require a valid `cradle_session` and use the session's `household_id` and `member_id`; client-supplied ownership fields are ignored. `GET /api/alpha/diagnostics` is restricted to Household admins (Owner and Parent/Admin) and is always household-scoped. Full members and managed members can submit feedback but cannot inspect alpha diagnostics.

## Runtime and version context

Development responses expose the existing `X-Cradle-Dev-Runtime-ID`, allowing an open page to detect a replaced local runtime. The app version is supplied by `APP_VERSION` (currently `0.1.0`) and is recorded with feedback/events. Production does not expose the development runtime identifier.

## Event vocabulary

The typed shared allowlist lives in `shared/alpha-diagnostics.ts` and is used by the browser and Worker handlers. New events must remain coarse, intentional and free of household content. Add a specific screen/action pair rather than logging arbitrary component state.

## Local alpha setup

Set `VITE_ALPHA_DIAGNOSTICS=true` in the local build when event diagnostics are wanted. The feedback endpoint remains available for explicit feedback regardless of background event collection. Apply the additive `0012_alpha_diagnostics.sql` migration to the same D1 instance used by the Worker runtime.

The service deliberately has no realtime subscription or third-party analytics dependency. It is designed to accept those integrations later without changing the privacy boundary.
