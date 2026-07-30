# Authentication and operations foundation

## Provider architecture

Cradle keeps authentication and household membership separate:

`Supabase Auth identity → authenticated profile → household membership → access level → permission`

Google, Apple and email one-time-code flows use Supabase's hosted provider endpoints with PKCE. The browser never receives a service-role key. Provider setup is optional until deployment configuration is present; the existing PIN route remains only as a migration-compatibility path while households move to provider sign-in. Password authentication and password recovery are not part of Cradle.

Required client variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_REDIRECT_URL` (must be an allowlisted HTTPS URL in production)

Required Cloudflare deployment variables/secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_REDIRECT_URL`
- `APP_VERSION`

Only the public Supabase anonymous key is used in the browser and provider verification request. Never add a Supabase service-role key to Vite variables or Wrangler source.

## Identity and membership

The `profiles` and `profile_preferences` records represent the Cradle identity created after a provider login. `auth_identities` links Google, Apple or email provider subjects to that identity without assuming that an Apple relay address is stable. A provider subject is never used as a household role. Membership and permissions continue to come from the canonical `members` table and the authenticated household session.

Provider exchange does not create a household. It creates an identity session and, when exactly one active membership exists, a normal household session. A new person can then create a household or authenticate before accepting an invitation. Invitation acceptance remains a separate operation: authenticate → accept invitation → join the fixed member → receive access.

The provider exchange is the D1 synchronisation boundary. After Supabase verifies a provider token, it idempotently creates (or loads) the matching `user_accounts` and `auth_identities` rows, and ensures the related `account_security`, `profiles`, `profile_preferences` and `identity_sessions` records exist. Provider subject and provider are the lookup keys; an email address is never used to merge two accounts. A simultaneous callback for the same provider subject is recovered through the unique identity index rather than creating a second account.

`GET /api/auth/session` intentionally reports a 401 until the identity has a household membership and a household session. That endpoint reads household membership; it does not provision accounts. The OAuth callback waits for the provider exchange before calling it and sends a new identity with zero memberships to Create Household. If the exchange reports `AUTH_SCHEMA_UNAVAILABLE`, apply the complete additive migration set (including `0013_authentication_operations.sql`) to the D1 database used by the Worker; no account rows can be created against a database that has not created those tables.

## Sessions and recovery

Household sessions remain opaque, HTTP-only cookies. Provider exchange also creates an opaque identity session. Session listings expose only safe device and timing metadata; tokens and provider credentials are never returned. `POST /api/auth/sessions/revoke-all` revokes every active household session for the current member. Platform operators can revoke sessions for a support account. Resend verification and invitation delivery remain provider/household-context operations and are never represented as a successful send when no delivery service is configured.

MFA is represented by the account foundation (`mfa_enabled`) but is not required for alpha users. Owners and administrators can be made eligible for a future MFA enrolment flow without changing household roles.

## Platform operations

Platform Operators are separate from Household Owners and are granted only by a trusted database/deployment operation in `platform_operators`. They are not selected from client state or JWT metadata. `/api/ops/accounts` and `/api/ops/accounts/:accountId` require that operator check and expose only identity, provider, membership, session metadata, safe authentication events and aggregate diagnostics. Household task, meal, schedule, profile-detail and feedback text are not returned.

Supported audited actions include session revocation, suspension and restoration. Every permitted platform action writes an immutable `platform_audit_log` record containing operator, target, action, result, reason, request ID and timestamp. Database triggers reject updates and deletes. Unsupported delivery actions fail safely and are audited as failures.

## Auth events and privacy

`auth_events` stores an allowlisted event, provider, result, safe error code and correlation ID. It does not store tokens, OTPs, passwords, provider response bodies or household content. Alpha diagnostics continues to use its separate allowlisted event service and household scope.

## Deployment checklist

1. Configure Google and Apple providers and the email OTP template in Supabase.
2. Add exact HTTPS redirect URLs for each production origin.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_REDIRECT_URL`, `APP_VERSION` and `VITE_*` build values as Cloudflare deployment variables/secrets (or `.dev.vars` for local Worker development).
4. Apply migrations through `0013_authentication_operations.sql` to the intended D1 database.
5. Create Platform Operator rows through a controlled deployment operation; never expose an operator toggle in the household UI.
6. Verify provider login, invitation acceptance, session refresh/revocation, household isolation and operator audit records before public release.

RLS is not available in the current D1 runtime. Tenant isolation therefore remains enforced by composite foreign keys and server-derived household IDs. A future Supabase/Postgres deployment must enable and test RLS before any table is moved; this phase does not weaken or pretend to provide RLS.
