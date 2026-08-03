# Room allocation schema decision

Migration `0014_room_allocations_and_routine_audit.sql` was removed. The Alpha capability is represented by existing schema:

| Proposed field | Intended use | Existing representation or derivation | Alpha necessity |
|---|---|---|---|
| `rooms.space_type` | Friendly utility/outdoor/shared-space wording | Existing `room_type`; UI aliases map utility → laundry, outdoor → garden, shared space → other | Not required |
| `household_systems.routine_category` | Display/edit category | Derived deterministically from template key, routine name, and room type | Not independently required |
| `created_by_member_id` | Creator attribution | No trustworthy historical source exists; `owner_member_id` is assignment, not authorship | Deferred rather than fabricated |
| `updated_by_member_id` | Last-editor attribution | Existing `updated_at` records time, but no trustworthy actor event covers every write path | Deferred until an auditable command/event model exists |

Existing fields already provide room identity/name/type/archive state/timestamps, occupants through `room_occupants`, routine-room relationships through `household_systems.room_id`, participant responsibility through `routine_assignments`, frequency, template/manual source, and routine timestamps. Archive protection queries active/paused routine references before changing `rooms.is_active`; it requires no schema change.

