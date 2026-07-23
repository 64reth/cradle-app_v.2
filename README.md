# Cradle

Cradle is a Household Operating System. This repository is being rebuilt in small validated slices.

## Phase 1

This phase establishes the frontend foundation only:

- Vite
- React
- TypeScript
- Vitest
- ESLint
- Cloudflare Pages-compatible structure
- Responsive application shell
- Central design-token stylesheet
- Error boundary
- Baseline render test

Authentication, database work, rooms, routines, tasks, and other product functionality begin in later validated phases.

## Run Locally

```bash
npm install
npm run dev
```

## Validate

Run the full slice gate before adding the next implementation slice:

```bash
npm run typecheck
npm run lint
npm test
npm run build
git status --short
```

## Cloudflare Pages

The app builds to `dist` and includes a `functions/` directory for future Pages Functions.
