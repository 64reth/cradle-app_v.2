# Viewport QA

Viewport QA is a required Alpha release gate. Run:

```bash
npm run test:viewport
```

The command launches an installed Chrome/Chromium through `puppeteer-core`, uses deterministic local fixtures and no external network or authentication, exits non-zero on regression, and closes the browser in a `finally` block. Set `CHROME_PATH` in CI when Chrome is not installed at a common location.

## Target matrix

Every fixture runs at actual browser viewport widths `320`, `360`, `375`, `390`, `412`, `430`, `768`, `820`, `1024`, `1280`, and `1440`. The suite checks `window.innerWidth` and fails if Chrome silently substitutes another width.

Covered states are Landing, Sign In, Create Household, invitation acceptance, setup, Dashboard, Manage Family, Rooms & spaces, Routines, Schedule, Meals, Together, My Cradle, Operations, Alpha Health, dialog/sheet, error, empty, and loading.

## Layers

1. Vitest static CSS tests protect breakpoints, zero-minimum grid/flex children, equal navigation slots, safe areas, reduced motion, and removal of deliberate primary-surface horizontal scrolling.
2. Existing React Testing Library suites render real components and verify actions, states, dialogs, provider panels, household flows, and accessible semantics.
3. `test:viewport` runs browser geometry checks for page overflow, element bounds, dialog/nav containment, touch heights, nested controls, keyboard reachability, reduced motion, and resize stability.
4. Dashboard screenshots are generated at 320, 390, 430, 768, 1024, and 1440 under `artifacts/viewport/`. Screenshots are review evidence, not pass/fail truth.

The browser fixtures deliberately reuse production CSS but are not a substitute for a deployed end-to-end session. Before Alpha release, manually inspect the real authenticated screens on iOS Safari and Android Chrome, including software-keyboard behavior, safe-area insets, landscape orientation, long localized text, focus rings produced by real keyboard input, and scroll position after opening/closing sheets.

## Acceptance and extension

A release passes when every requested width exactly matches, no page or visible element crosses the viewport, mobile controls remain approximately 44px high, navigation is contained, final content remains reachable, dialogs stay inside the viewport, and the process exits cleanly. Add a fixture name and representative markup to `scripts/viewport-qa.mjs` whenever a new major screen or layout primitive ships; add real component behavior to the nearest Vitest UI suite.

