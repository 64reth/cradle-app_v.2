# User flows

## New household

Create household and Owner → Leadership → Family → create the Owner’s cat → Rooms → optional Pets → Review → Complete → Dashboard.

Setup progress is stored in D1. Returning Owners resume the persisted step. A non-Owner in an incomplete household sees a clear waiting state. The cat step saves the real Owner’s member avatar and never creates a fictional participant.

## Existing household

A person opens a private invitation link/code or signs in with household reference, profile reference, and PIN. A profile invitation claims only its named family member. A general invitation creates a leadership-reviewed join request. Accepted family members customise their own cat once, then continue to Dashboard without replaying Owner household setup.

## Dashboard, Family Status, and My Cradle

Dashboard → Family Status → select one real family member. The signed-in person may continue to My Cradle and customise their cat appearance. A Household admin may manage a Managed member through Family. Cats use the family member’s name and never appear as separate people.

Dashboard → Manage family → add a family member → invite now, add another, invite later, or finish. Creation is retry-safe and does not manufacture an account.

Dashboard → My Cradle → edit permitted names, customise cat appearance, view the honest task state, or send a suggestion → return to My Cradle or Dashboard.

## Routines and Schedule

Finish Rooms → Cradle creates a sensible routine first draft → Dashboard → Review routines → keep, pause, edit, remove, or add a custom routine. The server owns canonical templates and retry-safe persistence.

Dashboard → Household Schedule → add a Meeting, appointment, trip, or reminder → choose time, recurrence, reminder, and relevant family members → save → Schedule or Dashboard.

Every flow follows the app-wide no-dead-end policy: browser Back is never the only route.
