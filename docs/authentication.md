# Authentication and household invitations

## Account, Member and session separation

Authentication decisions happen in the Cloudflare Worker handlers. A `user_account` is the credential-bearing identity; a household `Member` is the durable person-in-the-home profile. Managed and unclaimed Members intentionally have no account or session. A Member with access links to at most one account, and an account can claim at most one Member in a household.

The browser receives an opaque bearer token in an HTTP-only cookie. D1 stores only its SHA-256 hash. Every protected request resolves one active, unexpired, unrevoked session and derives the account, household, Member and role from it. Protected queries use that derived household ID and ignore client-supplied identity.

Household creation inserts the household, Owner Member and Owner account in a D1 batch, then starts an account-linked session. Phase 3 Members with credentials stored on the Member row remain sign-in compatible during the additive migration.

## PIN hashing

PINs are 4–12 digits. They use a 16-byte cryptographically random salt and Web Crypto PBKDF2-HMAC-SHA-256 with 210,000 iterations and a 256-bit output. Only hexadecimal salt and hash values are stored. Numeric PINs have limited entropy; throttling is required and a future staged migration should enrol passkeys before clearing legacy PIN credentials.

## Sessions and cookies

Session tokens contain 32 random bytes and last 30 days. Missing, expired, revoked, suspended-Member and left-Member sessions fail closed. Sign-out revokes the exact session and clears the cookie. Suspending a Member revokes that Member’s open sessions.

`cradle_session` uses `HttpOnly`, `SameSite=Lax`, `Path=/`, and explicit `Max-Age`. Every deployed runtime, including Alpha (`APP_ENV=alpha`), adds `Secure`. Only local Worker development (`APP_ENV=development`) omits it for HTTP; JavaScript still cannot read the cookie.

## Invitations

Owner and Parent/Admin can create single-purpose profile invitations or general household invitations with 24-hour, 7-day or 30-day expiry. Raw links and short codes are returned only at creation or regeneration; D1 stores SHA-256 hashes.

- A profile invitation has a fixed target Member. Acceptance conditionally creates an account, links only that Member, consumes the invitation and starts a session.
- A general invitation creates an account and a pending join request. It never creates an active Member or session before leadership approval.
- Repeated profile acceptance by the same account verifies the PIN and starts a fresh session without creating duplicate records.
- Revoked, expired, exhausted and unknown invitations return distinct typed errors.
- Regeneration revokes the previous secret and inserts its replacement in one D1 batch.

The legacy `POST /api/auth/join` auto-join behavior is retired and returns `INVITATION_FLOW_UPDATED`. Pets and family-member cat avatars are not identities: they never receive credentials, roles, or sessions.

## Roles

| Capability | Owner | Parent/Admin | Adult | Child |
| --- | --- | --- | --- | --- |
| View household family context | Yes | Yes | Yes | Limited safe context |
| Create/revoke invitations | Yes | Yes | No | No |
| Review join requests | Yes | Yes | No | No |
| Edit ordinary Member profiles | Yes | Child/dependant within policy | No | Own names only |
| View session / sign out | Yes | Yes | Yes | Yes |

Server authorization is centralized in the family-access policy. Parent/Admin cannot alter ownership or another Parent/Admin. Adults and Children cannot change household roles.

## Throttling and limitations

Failed sign-ins are keyed by a hash of connecting IP, household reference and profile reference. Five failures in a 15-minute window block that key for 15 minutes; success clears it. Production should supplement this D1-compatible mechanism with Cloudflare rate limiting and monitoring.

The legacy PIN route remains for migration compatibility only. Provider sign-in, identity sessions, safe session listing/revocation, alpha authentication events and the Platform Operator foundation are described in [Authentication and operations](./authentication-operations.md). Passwords, password reset, passkeys and required MFA remain out of scope.

## Routes and local development

- Auth: `POST /api/auth/households`, `/api/auth/sign-in`, `/api/auth/sign-out`; `GET /api/auth/session`
- Public invitation: `GET /api/invites/:reference`; `POST /api/invites/:reference/accept`
- Family: `GET|POST /api/household/members`; `PATCH /api/household/members/:memberId`
- Access: `POST /api/household/members/:memberId/suspend`
- Invitations: `GET|POST /api/household/invites`; revoke and regenerate actions under `/:inviteId`
- Join requests: `GET /api/household/join-requests`; approve and decline actions under `/:requestId`

All responses use typed no-store envelopes with request IDs. Development responses also expose the runtime/build identifier used to detect a restarted local runtime. Run `npm run build`, `npm run db:reset:local`, `npm run db:migrate`, then `npm run dev:worker`. Local D1 state is ignored under `.wrangler/`.
