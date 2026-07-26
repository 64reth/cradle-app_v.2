# Cloudflare Worker deployment

Cradle is deployed as a Cloudflare **Worker with static assets**. The Worker
entry point (`functions/worker.ts`) adapts the existing authenticated API
handlers and D1 access, while Vite produces the browser application in
`dist`. This is not a Pages deployment and no `wrangler pages deploy` command
should be used.

## Repository configuration

`wrangler.toml` defines:

- `main = "functions/worker.ts"` for the API/D1 Worker adapter;
- `[assets] directory = "./dist"` for the Vite output;
- `[assets] not_found_handling = "single-page-application"` so direct loads of
  `/dashboard`, `/meals`, `/together`, `/schedule`, `/routines`, auth callback
  and other React routes return the SPA entry point;
- `[assets] run_worker_first = ["/api/*", "/health"]` so API and health
  requests always reach the Worker before static asset handling;
- D1 binding `DB`, with migrations in `migrations`;
- the explicit `alpha` environment named `cradle-alpha`.

The development and production D1 names are `cradle-db`; Alpha is intentionally
isolated as `cradle-alpha-db`. Their checked-in UUIDs are distinct placeholders,
not real database IDs. Replace the IDs in their respective Cloudflare
deployment configuration before use. Never point both environments at the same
database.

Supabase values are intentionally absent from `wrangler.toml`; empty defaults
must not mask missing authentication configuration. Set them as Cloudflare
deployment variables/secrets for deployed environments. For local Worker
development, create an uncommitted `.dev.vars` file (ignored by Git):

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_REDIRECT_URL=http://localhost:8787/
```

The local non-secret `APP_ENV`, `API_VERSION` and `APP_VERSION` defaults remain
in Wrangler. `.dev.vars` overrides them when needed.

## Commands

Build the production assets:

```bash
npm run build
```

Deploy the Worker alpha environment (builds first):

```bash
npm run deploy:alpha
```

The equivalent Wrangler command is:

```bash
npx wrangler deploy --env alpha
```

For local Worker development with the development bindings and HTTP-safe
cookies:

```bash
npm run dev:worker
```

Apply or inspect Alpha migrations only after the real Alpha D1 ID is configured
and the Cloudflare account is authenticated:

```bash
npm run db:migrate:alpha
npm run db:migrations:list:alpha
```

These commands use Wrangler's supported `--env alpha --remote` flags. They are
not part of the local reset workflow.

Use `npm run dev` when only the Vite frontend is needed. There is no Pages
preview or Pages deployment script.

## Cloudflare dashboard setup

The Cloudflare project must be a **Workers & Pages → Worker** named
`cradle-alpha`, not a Pages project. If the existing connected project was
created as Pages, recreate or replace that project as a Worker; do not work
around the mismatch with a Pages command. Attach the intended D1 database as
`DB`, configure the alpha route/domain, and set the required non-secret
variables (`APP_ENV`, `API_VERSION`, `APP_VERSION`). Configure
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_REDIRECT_URL` as Cloudflare
deployment variables/secrets appropriate to the environment.

## Verifying SPA routes

After a deployment, open each route directly in a new tab (rather than only
navigating from `/`):

```text
/dashboard  /meals  /together  /schedule  /routines
```

Each should return the Cradle application and load without a Cloudflare 404.
API paths such as `/api/auth/session` must remain JSON responses from the
Worker, not the SPA fallback.

## Route maintenance

Every new `functions/api/**` handler must be imported and registered in
`functions/worker.ts`. `tests/worker-routes.test.ts` discovers handler files and
fails when a route is missing from the registry, preventing silent production
route gaps.

## Compatibility date

`compatibility_date = "2026-07-23"` is intentionally unchanged. Advance it
only as a separately validated infrastructure change after reviewing Cloudflare
runtime compatibility.

## Rollback

List the deployed Worker versions, identify the last known-good version, and
roll back using the Cloudflare dashboard or the Wrangler version rollback
command for `cradle-alpha`. Verify the nested routes and `/health` endpoint
after rollback. A rollback must not delete D1 data or migrations.
