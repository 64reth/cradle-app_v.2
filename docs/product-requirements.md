# Product requirements

Cradle is a household operating system that helps leadership make responsibilities visible, document and improve repeatable Systems, schedule work, delegate responsibility, complete today’s work, and review pressure points.

## Phase 3 foundation

Phase 3 provides secure household/profile authentication and resumable household setup:

`Leadership → Members → Rooms → Pets → Companion → Review → Complete`

Members are authenticated people with one of four roles. Rooms are operating areas. Pets are optional care-planning participants, not people, roles, or users. The Companion is the household’s shared cat avatar, separate from Pets and members. Household setup may complete with one Owner, no invitations, any positive number of Rooms, no Pets, and one valid Companion configuration.

## Phase 4 dashboard and household routines

After onboarding, Cradle opens `/dashboard`. It uses the household’s typed Rooms, Members, Pets, leadership, and Companion to present an honest household overview and recommend useful domestic routines. The household chooses only whether a routine fits, how often it happens, and who usually handles it. Custom routines ask for a name, frequency, responsibility, and optional short note.

Cradle resolves canonical, versioned templates server-side and quietly generates the underlying Household Systems aggregate, reusable checklist, owner, optional rotation participants, Room/Pet context, source tracking, and definition of done. Systems are an internal operational model rather than the ordinary setup vocabulary.

Owners and Parent/Admins configure routines; Adults view active routines; Children have no Phase 4 management access. Pets are always care context and never responsible people.

The Dashboard never fabricates schedules, work completion, progress, messages, meals, or performance. Schedule generation, task/execution instances, actual rotation, calendars, notifications, scoring, Companion reactions, actionable Today’s Mission, and Weekly Review remain future work.
