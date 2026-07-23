# Cradle

Cradle is a Household Operating System. This repository is being rebuilt in small validated slices.

## Current Phase

Phase 3 adds the authentication and household-membership foundation:

- secure PIN-based household and profile sign-in
- server-managed, revocable sessions
- one-use household invitations and role policy
- tenant-scoped membership views
- a minimal public and authenticated interface

Rooms, routines, tasks, maintenance, companions, and dashboard functionality remain for later phases.

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

## Production D1

`wrangler.toml` contains a placeholder D1 `database_id`. Replace it later with the real Cloudflare D1 database ID through production deployment configuration. Do not commit secrets or live credentials.
