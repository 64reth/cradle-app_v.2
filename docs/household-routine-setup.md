# Dashboard-first household routine setup

## Product architecture

Completed onboarding routes to `/dashboard`. One `GET /api/dashboard` response supplies the household, current user, active Members, typed active Rooms, active Pets, neutral Companion, server-derived setup progress, routine recommendations, routine summaries, honest Today’s Mission state, and current date context.

The Dashboard is the primary application shell. Plan, Calendar, and Messages are visibly marked as coming next and do not render fake feature data.

## Inference from Rooms and Pets

`shared/routines.ts` contains the single versioned catalog. Room types cover Kitchen, Bathroom, Toilet/WC, Living room, Bedroom, Child bedroom, Hallway/entrance, Laundry/utility, Dining room, Home office, Garden/outdoor, and Other. Pet templates cover Cat, Dog, Fish, Bird, small animals, reptiles/tortoises, and neutral other-animal care.

High-use Kitchens, Bathrooms, and Toilets receive daily reset defaults. Bedrooms and living spaces receive weekly defaults. Unknown Rooms get one conservative opt-in weekly reset. Pet names are hydrated into care labels; medical dosing advice is never generated.

Inactive Rooms and Pets are excluded. Two Rooms of the same type receive distinct recommendation instances through their context IDs.

## Household choices

The setup panel shows one Room or Pet at a time. A recommendation supports:

- include or skip;
- Every day, Weekdays, Weekends, Twice/Three times a week, Once a week, Every two weeks, Once a month, When needed, or Custom;
- household leaders, one eligible Member, future rotation between selected eligible Members, or decide later;
- optional label and short note;
- a “See what’s included” checklist disclosure.

Custom routines ask only what needs doing, frequency, usual responsibility, and an optional note. Custom timing appears only when Custom frequency is selected.

Children are not offered until Cradle has an explicit age/appropriateness policy. Pets are never responsibility choices.

## Applying setup

`POST /api/household/routine-setup/apply` accepts household-facing selections. It authenticates centrally, derives the household from the session, validates active context/Member IDs, resolves canonical templates server-side, and writes the aggregate transactionally.

Template/context and custom client-key uniqueness make retries idempotent. Reapplying preserves customised names and canonical checklist edits instead of silently replacing them. The mutation returns the refreshed Dashboard aggregate directly, so a successful write is not followed by a duplicate-prone refresh mutation.

Typed, malformed-response, and transport failures remain local to the setup card. Selections remain mounted and request IDs appear for typed API errors.

## Setup progress and Today’s Mission

Progress is derived from persisted household data: household, Rooms, Members, optional Pets, routines chosen, and ready for future planning. Before routine setup, Today’s Mission invites the household to choose routines. Afterwards it states that routines are ready and daily missions arrive next phase.

No dated work, recurrence generation, completion tracking, rotation execution, scoring, streaks, notifications, calendars, shopping, meals, messages, weekly percentages, or Companion reactions are implemented.
