# User flows

## New household

Public entry → create household and Owner → automatic session → Leadership → Members → typed Rooms → optional Pets → Companion → Review → Complete → `/dashboard`.

Setup progress is stored in D1. Returning Owners resume the persisted step. A non-Owner in an incomplete household sees a waiting state.

## Existing household

A person redeems a one-use invitation or signs in with household reference, profile reference, and PIN. Completed households open at home. Incomplete households route according to persisted setup status and authorization.

## Dashboard routine setup

Dashboard welcome → **Continue setup** → one Room or Pet at a time → accept/skip suggested routines → choose plain frequency → choose a person, household leaders, future rotation, or decide later → optionally add a short custom routine → review the next context → save household plan → return to Dashboard.

The server hydrates canonical steps and defaults; the household does not author a technical workflow. Reopening setup resumes from server-derived configured routines. Applying the same plan is safe and does not create duplicates.

Systems navigation opens a friendly routine library grouped by Room, Pet, or whole household. Ordinary editing contains name, frequency, responsibility, active/paused state, note, and checklist disclosure. Purpose, source, definition of done, and duration remain secondary advanced details.

Typed or transport failures remain inside the setup/editor card with local choices intact. A successful apply returns the refreshed Dashboard aggregate in the same response, avoiding a fragile follow-up refresh.
