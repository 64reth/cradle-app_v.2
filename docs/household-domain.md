# Household Domain architecture

## Source of truth

The Household Domain owns permanent people (`members`), optional account links, invitations, join requests, household roles and capabilities, privacy-safe presence, and setup lifecycle. A provider identity, email, JWT claim, session, account, member, and household role are distinct identifiers. None may be substituted for another.

The canonical member query is `functions/domain/household/queries.ts`. It begins with tenant-scoped `members` and left-joins optional account, security, latest invitation, and companion state. Every retained member is returned exactly once; presence and invitation state never determine visibility.

Shared state machines and policies live under `shared/household-domain`. Server routes are authoritative. UI code consumes returned projections and uses the same shared eligibility policy where immediate presentation decisions are needed.

## State machines

- Member: managed/unclaimed → invited or join requested → active; active ↔ suspended; leaving is terminal under current policy. Suspension, deactivation, leaving, and deletion are distinct. Permanent deletion has no public command.
- Invitation: pending → accepted, expired, revoked, or replaced. Replacement preserves the member and invalidates the old secret.
- Join request: pending → approved or declined. The current schema does not yet persist expired/cancelled states; those are deferred rather than fabricated.
- Household: creating → onboarding → active. Restricted and archived are modeled future states only.
- Setup: leadership → members → companion → rooms → pets → review → complete. Complete setup cannot be reopened by normal progression.

## Permissions and commands

Capabilities are derived from the authenticated household actor in `permissions.ts`. Tenant equality is a precondition. Platform Operator is separate and is sourced only from `platform_operators`. Compatibility helpers in `functions/api/member-policy.ts` and `functions/api/setup.ts` delegate to the domain while existing routes migrate.

Commands must authenticate, tenant-scope reads and writes, check capability and current state, use D1 batch semantics for multi-row changes, verify affected rows, preserve request IDs, and use stable idempotency keys where retries can occur. Existing invitation create/regenerate/revoke and access restore commands follow this boundary. Join approval remains a documented compatibility adapter pending extraction into a repository command; its writes are batched and account/member uniqueness is database-enforced.

## Presence privacy

Presence is optional and non-authoritative. Existing activity timestamps cannot reliably distinguish online, recent, and offline without false certainty, so Alpha returns `unknown`. Presence never changes visibility, permissions, assignments, or access. No location, device history, content monitoring, or realtime infrastructure is introduced.

## Integration ownership map

| Area | Previous owner | Domain owner | Status |
|---|---|---|---|
| Manage Family / Dashboard members | route-local SQL and UI derivation | canonical member projection | migrated |
| Invitation eligibility | shared member helper plus route/UI checks | Household Domain invitation policy | compatibility helper retained |
| Roles and member management | auth/member-policy string checks | capability policy | migrated through adapter |
| Setup and routine access | setup-local access checks | capability and lifecycle modules | migrated through adapter |
| Invitation commands | individual handlers | domain invariants plus existing handlers | compatibility handlers retained |
| Join requests | individual handlers | domain model/policy | temporary compatibility adapter |
| Schedule, Meals, Routines, Together | feature-specific participant queries | canonical member identity; feature eligibility remains local | temporary adapters documented |
| Provider/account/session sync | auth-provider/auth modules | distinct domain identities | compatibility adapters retained |

Feature-specific queries may intentionally exclude people from an assignment candidate set, but may not define the canonical household collection.

## Alpha Health

`GET /api/ops/health` is a no-store, read-only aggregate protected by database-backed Platform Operator authorization. Each lightweight subsystem check is isolated and returns healthy, degraded, unavailable, or unknown without raw errors or household content. Public `/health` remains minimal. API latency is labelled unknown until adequate privacy-safe history exists. Error counts use allowlisted diagnostic error events from the past 24 hours and become unknown if unavailable. Build version, commit, time, and test count come only from deployment environment metadata; missing values are explicitly unrecorded.

## Non-goals and migration

This pass does not add realtime presence, permanent member deletion, household archival UI, automatic invite delivery, or new join-request database states. No database migration is required. Remaining compatibility adapters are listed above and must be removed only after their callers have parity tests against extracted domain commands.
