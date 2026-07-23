# Phase 3 authentication

## Architecture

Authentication decisions happen in Pages Functions. The browser receives an opaque bearer token in an HTTP-only cookie; D1 stores only its SHA-256 hash. Every protected request resolves one active, unexpired, unrevoked session and derives the household ID, member ID, and role from it. Protected queries use that derived household ID and ignore client-supplied identity.

Household creation inserts the household and first `owner` in one D1 batch, then starts a session. Sign-in uses a household lookup reference, household-scoped profile reference, and PIN.

## PIN hashing

PINs are 4–12 digits. They use a 16-byte cryptographically random salt and Web Crypto PBKDF2-HMAC-SHA-256 with 210,000 iterations and a 256-bit output. Only hexadecimal salt and hash values are stored. Numeric PINs have limited entropy; throttling is required and a future staged migration should enrol passkeys before clearing legacy PIN credentials.

## Sessions and cookies

Session tokens contain 32 random bytes and last 30 days. Missing, expired, revoked, and inactive-member sessions fail closed. Sign-out revokes the exact session and clears the cookie.

`cradle_session` uses `HttpOnly`, `SameSite=Lax`, `Path=/`, and explicit `Max-Age`. Production adds `Secure`. Local Pages development uses HTTP, so `Secure` is omitted only outside production; JavaScript still cannot read the cookie.

## Invitations and roles

Owners and Parent/Admins can create 48-hour, single-use invitations for `parent_admin`, `adult`, or `child`; owners cannot be invited. Twelve random bytes form the raw code, which is returned once. Only its SHA-256 hash is stored. Expired, redeemed, or revoked codes fail. Conditional redemption and member insertion run in one D1 batch.

| Capability | Owner | Parent/Admin | Adult | Child |
| --- | --- | --- | --- | --- |
| View membership | Yes | Yes | Yes | Own safe row only |
| Create invitations | Yes | Yes | No | No |
| View session / sign out | Yes | Yes | Yes | Yes |

## Throttling and limitations

Failed sign-ins are keyed by a hash of connecting IP, household reference, and profile reference. Five failures in a 15-minute window block that key for 15 minutes; success clears it. Production should supplement this D1-compatible mechanism with Cloudflare rate limiting and monitoring.

This phase has no recovery, OAuth, email identity, passkeys, session-management UI, or distributed abuse controls.

## Routes and local development

- `POST /api/auth/households`, `/api/auth/sign-in`, `/api/auth/join`, `/api/auth/sign-out`
- `GET /api/auth/session`, `/api/household/members`
- `POST /api/household/invitations`

All return typed no-store envelopes with request IDs. Run `npm run build`, `npm run db:reset:local`, `npm run db:migrate`, then `npm run dev:pages`. Local D1 state is ignored under `.wrangler/`.
