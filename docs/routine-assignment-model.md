# Routine assignment model

Routine assignment is canonical household intent and dated task instances are its daily execution.

## Family eligibility

Every active real Family member shown in Family Status is available to assignment controls, including managed, unclaimed and invited profiles. Archived, suspended, inactive, left, and retired synthetic guide records are excluded. Pets and cat avatars are never responsible participants.

Age describes suitability. Access level describes permissions. Neither describes a person’s importance within the Family.

## Assignment modes

- **Rotation** assigns one person to each occurrence and advances through an editable, ordered participant pool. At least one participant is required. Unchecking someone is a durable family choice: reloads, retries, and new-member creation do not silently add them back.
- **One person** assigns exactly one selected Family member to every occurrence.
- **Shared team** creates one occurrence with at least two required participants. Each contribution is recorded independently and the mission completes when all required contributions are complete. A Household admin may override when needed.
- **Decide later** keeps the Routine unassigned. It never falls back to the Owner.

`routine_assignments` stores the mode, fixed assignee, persisted next Rotation index and previous assignee. `routine_assignment_participants` stores the ordered Rotation or Shared-team pool. `routine_assignment_history` links every generated occurrence to the assignment decision that produced it.

## Balanced generation

Generated Routines use Room occupants where supplied. Bedroom work is constrained to the people who use that room; suitable shared children’s-room work may default to Shared team. Common Rooms use an age-suitable active Family pool.

Consecutive generated Rotations use successive starting positions through that pool. The starting position is persisted and advances only after a new occurrence is inserted. Retrying generation cannot duplicate Routines, reset a pool, reset a Rotation position, or return all responsibility to the creator.

Cradle distributes household work by default. It must never silently place all generated responsibilities on the person who created the household.

Age bands influence safe defaults only. Young children receive simple safe suggestions, children receive suitable bedroom/shared work, teenagers receive broader ordinary work, and adults may receive all ordinary or safety-sensitive work. These defaults contain no gender, parental, ownership, or status assumptions and remain editable by Household admins.
