# Household Systems

Household Systems are Cradle’s internal operational model. Ordinary household users interact with Rooms, Pets, routines, plain frequencies, and responsibility—not a database-shaped System authoring form.

Each generated System stores a household-scoped name, Room or Pet context, active/paused/archived lifecycle, frequency intent, estimated duration, definition of done, notes, deterministic order, ordered steps, and source provenance. Its canonical assignment separately records Rotation, One person, Shared team, or Decide later.

## Generation and source ownership

`shared/routines.ts` is the versioned product catalog used by server recommendation/generation, frontend labels, tests, and documentation. A generated System records its stable template key and version. A custom routine records a stable client key and no template key.

The server resolves template purpose, checklist, duration, and definition of done. It does not trust browser-supplied template internals. Household edits are marked as customised and are not silently overwritten when templates evolve.

A live `(household, template key, Room, Pet)` tuple is unique. Reapplying the same setup updates the existing System. Custom client keys provide the same retry safety for custom routines.

## Aggregate and tenancy

D1 is authoritative. Composite foreign keys prevent cross-household Room, Pet, owner, participant, and child references. The request session supplies `household_id`; client tenant values have no authority.

Routine setup validates all references first and commits root Systems, canonical steps, assignment mode, and the selected real Family-member pool in one D1 batch. Pets are context only and can never be owners, participants, roles, credentials, or sessions.

## Progressive disclosure

Dashboard setup asks only whether a recommendation fits, how often it happens, and who usually handles it. The routine library exposes name, frequency, responsibility, active/paused state, note, and checklist disclosure. Purpose, definition of done, source, and duration are secondary advanced details.

Active due Routines create one dated household mission. Rotation advances only when a new occurrence is created; Shared-team completion is participant-level. Supplies/inventory, executable dependencies, skip-rule engines, and broad recurrence expansion remain outside this correction.
