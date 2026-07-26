# Cradle

Cradle is a Household Operating System. This repository is being rebuilt in small validated slices.

## Current state

Cradle is preparing for the private Household Alpha, building on the completed
Phase 4.3 dashboard-first household experience. The current deployment model is
a Cloudflare Worker with Vite static assets, D1 persistence and Supabase
authentication. Alpha is isolated from production through its own Worker
environment and D1 database.

Phase 4.3 foundation:

- secure PIN-based household and profile sign-in
- server-managed, revocable sessions
- one-use household invitations and role policy
- tenant-scoped membership views
- resumable Leadership, Family, member-avatar, Rooms, optional Pets, and Review setup
- a real `/dashboard` shell with canonical Family Status, Schedule, Suggestions, setup, Routines, and honest Today’s Mission states
- an automatic Room- and Pet-aware routine first draft with friendly review, frequency and responsibility choices
- lightweight custom routines and a simple routine library
- an internal tenant-safe Household Systems model with stable template tracking and retry-safe aggregate generation
- unclaimed and managed family profiles distinct from authenticated accounts
- profile-specific/general invitations, join review, secure QR/code/link sharing, revocation and retry-safe claiming
- personalised Dashboard, `/me`, member-owned cat avatars, and collaborative household suggestions
- an app-wide no-dead-end navigation and recovery standard

Historical phase notes remain in the product and architecture documentation;
the current implementation phase is Household Alpha readiness.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Vite frontend:

```bash
npm run dev
```

Build and run the Cloudflare Worker locally:

```bash
npm run build
npm run dev:worker
```

## Database

Apply local D1 migrations:

```bash
npm run db:migrate
```

List local migrations:

```bash
npm run db:migrations:list
```

Reset local D1 state safely for this project:

```bash
npm run db:reset:local
```

## Validate

Run the full slice gate before adding the next implementation slice:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:migrate
npm run validate
git status --short
```

## Documentation

- Cloudflare setup: `docs/cloudflare/README.md`
- Database workflow: `docs/database/README.md`
- API conventions: `docs/api/README.md`
- Authentication architecture: `docs/authentication.md`
- Household Systems: `docs/household-systems.md`
- Dashboard routine setup: `docs/household-routine-setup.md`
- Family Members and invitations: `docs/family-members-and-invitations.md`
- Personal areas: `docs/personal-areas.md`
- App simplification and feature ownership: `docs/app-simplification-and-feature-ownership.md`
- Task collaboration model: `docs/task-collaboration-model.md`
- Navigation and no dead ends: `docs/navigation-and-no-dead-ends.md`

## Production D1

`wrangler.toml` contains distinct placeholder D1 IDs for Production and Alpha.
Replace each with its real Cloudflare D1 ID in the corresponding Cloudflare
deployment configuration before use. Do not commit secrets or live credentials.
