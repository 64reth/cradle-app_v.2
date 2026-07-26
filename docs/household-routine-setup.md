# Dashboard-first household routine setup

## Product architecture

Completed onboarding routes to `/dashboard`. One `GET /api/dashboard` response supplies the household, current user, active family members and their avatar appearances, typed active Rooms, active Pets, server-derived setup progress, routine recommendations, routine summaries, honest Today’s Mission state, and household-local date context.

The Dashboard is the primary application shell. Schedule is live. Unimplemented Plan and Messages destinations are not exposed in primary navigation.

## Inference from Rooms and Pets

`shared/routines.ts` contains the single versioned catalog. Room types cover Kitchen, Bathroom, Toilet/WC, Living room, Bedroom, Child bedroom, Hallway/entrance, Laundry/utility, Dining room, Home office, Garden/outdoor, and Other. Pet templates cover Cat, Dog, Fish, Bird, small animals, reptiles/tortoises, and neutral other-animal care.

High-use Kitchens, Bathrooms, and Toilets receive daily reset defaults. Bedrooms and living spaces receive weekly defaults. Unknown Rooms get one conservative opt-in weekly reset. Pet names are hydrated into care labels; medical dosing advice is never generated.

Inactive Rooms and Pets are excluded. Two Rooms of the same type receive distinct recommendation instances through their context IDs.

## Automatic first draft

Completing Rooms immediately writes every matching versioned template as a reviewable routine. Strong everyday defaults start active; deliberately opt-in suggestions start paused for approval. Completing Pets adds matching care routines. Completed households also perform the same idempotent check when the Dashboard loads or a new Room or Pet is added.

The generator keys each suggestion by household, template, Room and Pet. It considers archived rows too, so removing a Cradle suggestion is a durable family choice and a later refresh never silently recreates it. Retries and concurrent Dashboard loads do not create duplicates.

After the balanced first draft is persisted, due Routines materialise current-day task instances. Today’s Mission therefore opens populated whenever due work exists, without requiring a visit to Routines.

## Household review

The setup panel shows one Room or Pet at a time. A recommendation supports:

- include or skip;
- Every day, Weekdays, Weekends, Twice/Three times a week, Once a week, Every two weeks, Once a month, When needed, or Custom;
- Rotation with an editable subset, One person, Shared team, or Decide later;
- optional label and short note;
- a “See what’s included” checklist disclosure.

Custom routines ask only what needs doing, frequency, usual responsibility, and an optional note. Custom timing appears only when Custom frequency is selected.

Every real person shown in Family Status is offered, including managed children, unclaimed profiles, invited profiles, teenagers and adults. Only archived, inactive, suspended or left profiles are excluded. Pets are never responsibility choices.

Most shared recurring routines default to a balanced Rotation. Room occupants constrain bedroom defaults; suitable shared bedrooms may use Shared team. Saved participant subsets and next positions are durable and are never resynchronised behind the family’s back.

## Applying setup

`POST /api/household/routine-setup/apply` accepts household-facing selections. It authenticates centrally, derives the household from the session, validates active context/Member IDs, resolves canonical templates server-side, and writes the aggregate transactionally.

Template/context and custom client-key uniqueness make retries idempotent. Reapplying preserves customised names and canonical checklist edits instead of silently replacing them. The mutation returns the refreshed Dashboard aggregate directly, so a successful write is not followed by a duplicate-prone refresh mutation.

Typed, malformed-response, and transport failures remain local to the setup card. Selections remain mounted and request IDs appear for typed API errors.

## Setup progress and Today’s Mission

Progress is derived from persisted household data: household, Rooms, Members, optional Pets, generated or custom Routines, assignments, and current-day task instances. Today’s Mission reports incomplete current-day missions only.

The full “Set up your home” checklist appears only while a foundational step is incomplete or while household leadership has explicitly reopened it. Once leadership, Family, Rooms and at least one routine are ready, it collapses to **Home setup complete ✓** with **Review setup**. Removing required foundational data reopens it; optional Pets and later optional features never make a completed home appear incomplete.

Current-day generation, participant completion, Rotation execution, Shared-team completion, help requests, and daily status are implemented. Streaks, notification delivery, shopping, meals, messages, and weekly performance scores are not. Schedule recurrence remains coordination intent and does not generate tasks.

Routine responsibility uses the shared Family Status population. Invitation and lifecycle states never turn a Pet into a responsible participant. Family/profile management remains in Dashboard and `/me`; Systems stays the internal routine engine.
