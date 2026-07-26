# Database schema

Cradle uses additive D1 migrations with foreign keys enabled.

## Household setup

Migration `0003_household_setup_rooms_and_pets.sql` adds server-authoritative setup fields to `households`:

- `setup_status`: `incomplete` or `complete`
- `setup_step`: `leadership`, `members`, `companion`, `rooms`, `pets`, `review`, or `complete`. The immutable `companion` value now drives the real Owner member-avatar step and does not represent a guide.
- confirmation timestamps for leadership, membership review, and completion

Existing households receive the safe defaults `incomplete` and `leadership`; no authentication records are rewritten.

## Rooms

Rooms belong to exactly one household. Active names are case-insensitively unique within that household, display order is explicit, and removal sets `is_active = 0`. Migration `0004` adds a canonical `room_type` used by the recommendation catalog. Legacy Rooms safely default to `other`; new onboarding captures the type explicitly. Migration `0008` adds `room_occupants`, an optional tenant-scoped link to real active Family members used by intelligent bedroom defaults.

## Pets

Pets are optional household records with an ID, tenant ID, name, type, optional breed and notes, active state, and timestamps. Names need not be unique. Removal deactivates the record.

Stable pet types come from `shared/pets.ts`: dog, cat, fish, bird, rabbit, hamster, guinea pig, reptile, tortoise, horse, chicken, and other. Pets are not members: they have no PIN, role, invitation, or session relationship.

All Room and Pet reads and writes include the authenticated household ID. Foreign keys prevent orphan records.

## Legacy synthetic household rows

The historical `companions` table remains because migrations are immutable. Additive migration `0007_remove_household_guide.sql` deactivates its synthetic rows. Application queries and writes no longer use the table; the similarly named internal setup value is repurposed only for the real Owner’s member-avatar step.

## Household Systems

Additive migration `0004_household_systems.sql` introduces:

- `household_systems`: the internal aggregate root, including lifecycle, Room/Pet context, compatibility steward, simple frequency, source provenance, ordering, and audit timestamps;
- `household_system_steps`: canonical or custom ordered reusable instructions;
- `household_system_participants`: historical compatibility participants (never Pets); migration `0008` adds the canonical ordered assignment participant table.

Every primary and foreign key includes `household_id` where needed, so a System cannot reference another household’s Room, Pet, Member, or child record. The canonical owner is only `owner_member_id`.

Generated routines store `source_template_key`, template version, source kind, and whether household-facing fields were customised. A live template/context tuple is unique, allowing the same template for two distinct Rooms while making repeated setup idempotent. Custom routines use a stable household-scoped client key.

Frequency values are plain product choices: daily, weekdays, weekends, twice/three times weekly, weekly, fortnightly, monthly, as needed, or custom. Active due Routines now create dated task instances; supplies, dependency engines, and skip-rule engines remain out of scope.

Routine setup resolves templates on the server and uses one D1 batch. Archive preserves definitions and children for history. See `docs/household-systems.md`.

## Accounts, family invitations and personal areas

Additive migration `0005_members_invitations_and_personal_areas.sql` adds:

- `user_accounts`, with authentication credentials separate from household Members;
- Member account link, lifecycle, age group, preferred name, relationship and idempotency fields;
- `household_invites`, storing hashed private tokens/codes, target, purpose, expiry, use, revocation and acceptance state;
- `household_join_requests`, preserving ambiguous general-invite claims for leadership review;
- `member_companions`, one active canonical cat appearance per Member;
- `task_suggestions`, tenant-scoped Member ideas with Room/Pet context and review lifecycle.

The legacy `member_companions.name` column is filled from the owning Member’s display name for schema compatibility and is not an independent product identity. Account and Member uniqueness prevents duplicate claims. Composite household foreign keys protect target Members, reviewers, Rooms, Pets and suggestion authors.

## Family access, assignments and daily work

Additive migration `0008_family_assignments_and_daily_tasks.sql` adds:

- canonical `members.access_level`: `household_admin`, `household_member`, or `managed_member`;
- canonical `members.age_band`: `adult`, `teen`, `child`, or `young_child`;
- matching invitation intent fields;
- `room_occupants`;
- `routine_assignments` and ordered `routine_assignment_participants`;
- `household_task_instances` and participant-level completion rows;
- immutable `routine_assignment_history`;
- `task_help_requests`.

The migration backfills Owner and Parent/Admin as Household admin, ordinary Adult as Household member, and existing Child/Teen/managed profiles as Managed member. Existing age information maps to the four canonical bands. Historical `role`, `age_group`, `relationship_label`, `owner_member_id`, `rotation_enabled`, and participant tables remain for migration compatibility only; new forms and derivation use the canonical model.

All new primary/foreign keys carry `household_id`. A task, participant, Room occupant, assignment, history row, or help request cannot cross a household boundary.

## Household coordination

Additive migration `0006_household_coordination.sql` introduces:

- `household_events`: tenant-scoped event identity, creator, canonical type, title/details, start/end/timezone, recurrence intent, reminder lead time, household/leadership visibility, lifecycle, retry-safe client key and audit timestamps;
- `household_event_members`: tenant-scoped attendee/subject links between an event and active household Members.

Composite foreign keys prevent cross-household creators, events and Member links. `(household_id, created_by_member_id, client_key)` makes a retried creation resolve to the existing event. Cancellation preserves integrity with `status = cancelled` and a timestamp.

Canonical event/recurrence/reminder values live in `shared/coordination.ts`. Recurrence is stored as intent; the MVP does not expand occurrences or deliver reminders. Weekly Review is an event type and never a task. Migration `0006` is additive and creates no task or execution tables.

## Meals, rotations and weekly plans

Additive migration `0009_meal_rotation_and_weekly_plans.sql` adds the meal foundation:

- `meals` and `meal_ingredients` are the household Recipe Bank;
- `meal_favourites` records each active Family member’s linked or custom favourite and priority;
- `meal_rotations` stores the reusable cycle (default four weeks);
- `meal_rotation_slots` stores up to seven dinner positions per rotation week, with meal-night kind and cook assignment;
- `weekly_meal_plans` and `weekly_meal_plan_slots` store the dated operational week and its source/override relationship;
- `meal_shopping_lists` and items are derived from the actual weekly plan.

All records are household-scoped with composite foreign keys. A weekly override is explicit (`this_week` or `special_occasion`) and cannot silently mutate the source rotation. Rotation slots support `meal`, `leftovers`, `eating_out`, `takeaway`, `flexible` and `special_theme`; future meal types remain valid in the schema.

Meal suggestions read favourites for every active member and retain the member relationship for context and popularity ranking. Similar names are reported as non-destructive candidates; the original Recipe Bank and favourite rows are never merged automatically.

## Together

Additive migrations `0010_together.sql` and `0011_together_swap_indexes.sql` add system/household Moment templates, household-local daily Moment projections, participant snapshots and lifecycle history, optional member preferences, Traditions, Tradition participants and memories. Partial profile data is allowed. Active-slot unique indexes enforce one primary and at most one secondary Moment per household/date while allowing swapped history to remain preserved; all participant, Tradition and memory references are tenant-scoped.

Hobbies and Interests extend the existing `together_member_preferences.interests_json` field rather than adding a duplicate preference table. The field stores a household-member-owned JSON array with stable entry ID, name, optional category, level, setting, participation preference, note and active state. The `/api/me/interests` handlers validate and tenant-scope every read/write. Archiving or deleting an entry changes future suggestion input only; completed Moment snapshots and history remain intact.

## Authentication and operations

Additive migration `0013_authentication_operations.sql` adds the provider and support foundation without replacing existing membership records:

- `profiles` and `profile_preferences` represent a provider-authenticated Cradle identity and safe defaults;
- `auth_identities` links one identity to Google, Apple or email provider subjects (Apple relay email is not used as the stable key);
- `identity_sessions` stores opaque pre-household sessions;
- `account_security` stores account status and future MFA enablement without changing the historical `user_accounts` shape;
- `session_metadata` stores safe auth method/device timing beside legacy sessions;
- `platform_operators` is a separate, controlled operations role;
- `auth_events` stores allowlisted authentication outcomes without secrets;
- `platform_audit_log` is append-only and protected by immutable database triggers.

Provider identity never grants household access. Active membership and access level continue to be resolved from canonical `members` rows and server-authenticated sessions. All operations queries are account-scoped and do not return private household content.
