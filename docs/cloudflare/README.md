# Cloudflare Foundation

Cradle runs on Cloudflare Pages with Pages Functions for API endpoints and D1 for relational storage.

## Wrangler Configuration

`wrangler.toml` defines:

- `name = "cradle"`
- `pages_build_output_dir = "dist"`
- `compatibility_date = "2026-07-23"`
- D1 binding `DB`
- local database name `cradle-db`
- placeholder production `database_id`
- non-secret vars `APP_ENV` and `API_VERSION`

The checked-in `database_id` is a placeholder. Later, after creating the production D1 database in Cloudflare, replace it with the real ID in deployment configuration or the production Wrangler environment. Do not commit secrets.

## Local Preview

Build first, then start Pages Functions locally:

```bash
npm run build
npm run preview:cloudflare
```

For active development of the frontend only:

```bash
npm run dev
```

For Pages Functions with D1 locally:

```bash
npm run dev:pages
```
