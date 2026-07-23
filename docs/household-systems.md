# Household Systems

Household Systems are Cradle’s internal operational model. Ordinary household users interact with Rooms, Pets, routines, plain frequencies, and responsibility—not a database-shaped System authoring form.

Each generated System stores a household-scoped name, Room or Pet context, canonical responsible Member, active/paused/archived lifecycle, frequency intent, future-rotation intent, estimated duration, definition of done, notes, deterministic order, ordered steps, and source provenance.

## Generation and source ownership

`shared/routines.ts` is the versioned product catalog used by server recommendation/generation, frontend labels, tests, and documentation. A generated System records its stable template key and version. A custom routine records a stable client key and no template key.

The server resolves template purpose, checklist, duration, and definition of done. It does not trust browser-supplied template internals. Household edits are marked as customised and are not silently overwritten when templates evolve.

A live `(household, template key, Room, Pet)` tuple is unique. Reapplying the same setup updates the existing System. Custom client keys provide the same retry safety for custom routines.

## Aggregate and tenancy

D1 is authoritative. Composite foreign keys prevent cross-household Room, Pet, owner, participant, and child references. The request session supplies `household_id`; client tenant values have no authority.

Routine setup validates all references first and commits root Systems, canonical steps, and selected future-rotation Members in one D1 batch. Pets are context only and can never be owners, participants, roles, credentials, or sessions.

## Progressive disclosure

Dashboard setup asks only whether a recommendation fits, how often it happens, and who usually handles it. The routine library exposes name, frequency, responsibility, active/paused state, note, and checklist disclosure. Purpose, definition of done, source, and duration are secondary advanced details.

There are no scheduled occurrences, completion fields, task instances, supplies/inventory, executable dependencies, skip-rule engines, or recurrence expansion in Phase 4.
