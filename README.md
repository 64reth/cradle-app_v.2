# Cradle

Cradle is a Household Operating System. This repository is being rebuilt in small validated slices.

## Current Phase

Phase 4.3 refines the dashboard-first household experience:

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

Generated tasks or executions, actionable Today’s Mission work, and automatic assignment remain for later phases.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the Vite frontend:

```bash
npm run dev
```

Build and preview through Cloudflare Pages Functions:

```bash
npm run build
npm run preview:cloudflare
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

`wrangler.toml` contains a placeholder D1 `database_id`. Replace it later with the real Cloudflare D1 database ID through production deployment configuration. Do not commit secrets or live credentials.
