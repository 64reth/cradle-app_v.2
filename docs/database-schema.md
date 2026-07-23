# Database schema

Cradle uses additive D1 migrations with foreign keys enabled.

## Household setup

Migration `0003_household_setup_rooms_and_pets.sql` adds server-authoritative setup fields to `households`:

- `setup_status`: `incomplete` or `complete`
- `setup_step`: `leadership`, `members`, `rooms`, `pets`, `companion`, `review`, or `complete`
- confirmation timestamps for leadership, membership review, and completion

Existing households receive the safe defaults `incomplete` and `leadership`; no authentication records are rewritten.

## Rooms

Rooms belong to exactly one household. Active names are case-insensitively unique within that household, display order is explicit, and removal sets `is_active = 0`. Rooms establish operating areas for later Household Systems; they do not contain tasks or schedules.

## Pets

Pets are optional household records with an ID, tenant ID, name, type, optional breed and notes, active state, and timestamps. Names need not be unique. Removal deactivates the record.

Stable pet types come from `shared/pets.ts`: dog, cat, fish, bird, rabbit, hamster, guinea pig, reptile, tortoise, horse, chicken, and other. Pets are not members: they have no PIN, role, invitation, or session relationship.

All Room and Pet reads and writes include the authenticated household ID. Foreign keys prevent orphan records.

## Companion

One active Companion configuration belongs to each configured household. It stores a validated name, stable Fur/Patch palette keys, a stable expression key, active state and timestamps. It has no foreign-key relationship to members, Pets, roles, invitations, or sessions. See `docs/companion-assets.md`.
