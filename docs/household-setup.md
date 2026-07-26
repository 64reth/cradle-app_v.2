# Household setup

## State machine

The server persists:

`leadership → members → companion → rooms → pets → review → complete`

`companion` is the immutable internal state value for the real Owner’s **Your cat** step. It no longer refers to a household guide or synthetic identity.

Only the Owner changes incomplete initial setup. Refresh, sign-in, and browser restart resolve the persisted step. Other family members see a useful waiting state.

## Stages

1. **Leadership** confirms the Owner.
2. **Family** asks separately what the person can manage and their age group. Access is Household admin, Household member, or Managed member. Age is Adult, Teen, Child, or Young child. There is no “place in household” or “Dependent” age option.
3. **Your cat** creates the Owner’s member-owned avatar with direct palette swatches.
4. **Rooms** records at least one named, typed Room, optionally records who uses it, and creates Cradle’s retry-safe balanced routine first draft when the stage is completed.
5. **Pets** optionally records animals for future care planning and extends the first draft.
6. **Review** shows leadership, the Owner’s cat, Family, Rooms, and Pets when present.
7. **Complete** requires confirmed leadership, reviewed Family, an active Owner with a saved avatar, and at least one active Room.

Pets are optional care-planning records, not users or roles. Cat avatars belong to real family members, never create another identity, and are created during each person’s first-run experience. They remain editable in My Cradle. Completing setup materialises today’s due task instances so the Dashboard opens useful rather than empty.

## Compatibility

Migrations `0007` and `0008` are additive. The former deactivates only legacy synthetic guide rows. The latter backfills canonical access, age, and assignment ownership without deleting or replacing a family member, account, invitation, avatar, Pet, Room, Routine, assignment, Schedule entry, or session.

## Local review reliability

No service worker is registered, and API responses use `Cache-Control: no-store`. Keep `npm run dev:pages` attached and verify that its `workerd` child owns port 8788 before review. Do not treat an arbitrary listener as authoritative.

In development only, every API response includes `X-Cradle-Dev-Runtime-ID`. A changed ID stops stale state and shows **Cradle has restarted during development.** with Reload. If a local D1 reset invalidates an authenticated session, Cradle clears local onboarding/session state, explains the reset, and returns to Create Household.

Only transport failures say **Cradle couldn’t connect**. Typed API errors retain their safe message and request ID. Forms preserve input after failure, and successful mutations are not repeated when only refresh fails.
