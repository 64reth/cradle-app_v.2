# Database schema

Cradle uses additive D1 migrations with foreign keys enabled.

## Household setup

Migration `0003_household_setup_rooms_and_pets.sql` adds server-authoritative setup fields to `households`:

- `setup_status`: `incomplete` or `complete`
- `setup_step`: `leadership`, `members`, `rooms`, `pets`, `companion`, `review`, or `complete`
- confirmation timestamps for leadership, membership review, and completion

Existing households receive the safe defaults `incomplete` and `leadership`; no authentication records are rewritten.

## Rooms

Rooms belong to exactly one household. Active names are case-insensitively unique within that household, display order is explicit, and removal sets `is_active = 0`. Migration `0004` adds a canonical `room_type` used by the recommendation catalog. Legacy Rooms safely default to `other`; new onboarding captures the type explicitly.

## Pets

Pets are optional household records with an ID, tenant ID, name, type, optional breed and notes, active state, and timestamps. Names need not be unique. Removal deactivates the record.

Stable pet types come from `shared/pets.ts`: dog, cat, fish, bird, rabbit, hamster, guinea pig, reptile, tortoise, horse, chicken, and other. Pets are not members: they have no PIN, role, invitation, or session relationship.

All Room and Pet reads and writes include the authenticated household ID. Foreign keys prevent orphan records.

## Companion

One active Companion configuration belongs to each configured household. It stores a validated name, stable Fur/Patch palette keys, a stable expression key, active state and timestamps. It has no foreign-key relationship to members, Pets, roles, invitations, or sessions. See `docs/companion-assets.md`.

## Household Systems

Additive migration `0004_household_systems.sql` introduces:

- `household_systems`: the internal aggregate root, including lifecycle, Room/Pet context, canonical owner, simple frequency, optional future-rotation intent, source provenance, ordering, and audit timestamps;
- `household_system_steps`: canonical or custom ordered reusable instructions;
- `household_system_participants`: eligible Members selected for future rotation (never Pets).

Every primary and foreign key includes `household_id` where needed, so a System cannot reference another household’s Room, Pet, Member, or child record. The canonical owner is only `owner_member_id`.

Generated routines store `source_template_key`, template version, source kind, and whether household-facing fields were customised. A live template/context tuple is unique, allowing the same template for two distinct Rooms while making repeated setup idempotent. Custom routines use a stable household-scoped client key.

Frequency values are plain product choices: daily, weekdays, weekends, twice/three times weekly, weekly, fortnightly, monthly, as needed, or custom. They are intent only—there are no dates, recurrence expansions, completion flags, task instances, supplies, dependency engines, or skip-rule engines.

Routine setup resolves templates on the server and uses one D1 batch. Archive preserves definitions and children for history. See `docs/household-systems.md`.
