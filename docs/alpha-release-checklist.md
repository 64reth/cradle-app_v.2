# Alpha release checklist

Required before each Alpha release:

1. Run typecheck, lint, full Vitest, production build, and `git diff --check`.
2. Run `npm run test:viewport`; review the six generated Dashboard screenshots and perform the manual device checks in [Viewport QA](./viewport-qa.md).
3. Verify provider flags for the target build: Google enabled, Apple disabled, Email enabled only after OTP acceptance.
4. Run owner → member-specific invite → provider join → pause/restore → revoke/reinvite acceptance.
5. Verify routines, rooms, meals, Schedule, Together, refresh/session persistence, and sign-out/sign-in.
6. Verify protected Alpha Health and truthful build metadata.
7. Confirm no unreviewed migration, secret, household content, or production mutation is included.

## Priority order

1. Complete remaining mobile viewport issues found by permanent QA.
2. Complete Bulk Household Invitations.
3. Continue migrating duplicated household rules into Household Domain.
4. Complete Alpha Health build metadata and live diagnostics.
5. Run the complete end-to-end acceptance flow above.
6. Freeze Alpha feature scope.
7. Move to bug fixing, accessibility, performance, visual polish, and real-household testing.

