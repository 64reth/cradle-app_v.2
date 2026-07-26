# Product requirements

Cradle is family software that helps a household make responsibilities visible, improve repeatable routines, coordinate its schedule, share responsibility, complete today’s work, and review pressure points.

## Household product principles

Cradle belongs to the whole household. The Dashboard is home, family language is warm and natural, and every surface answers where the household is, what it can do next, and how to get back. Cradle infers safe defaults from Family, Rooms, Pets and history before asking unnecessary questions. It favours progress over configuration, warmth over administration, inclusive participation over silent exclusion, honest states over fabricated work, and encouragement alongside responsibility.

The product vocabulary is Dashboard, Routines, Family, Schedule, Suggestions, My Cradle, Today’s Mission, Household Schedule, Weekly Review, Meeting, Family Meeting, Leadership Meeting, Appointments and Trips. Engineering terms—including `HouseholdSystem` and database lifecycle values—remain internal.

## Phase 3 foundation

Phase 3 provides secure household/profile authentication and resumable household setup:

`Leadership → Family → Your cat → Rooms → Pets → Review → Complete`

Members are household people with explicit app access and a separate age band, and may exist without an account. Access is Household admin, Household member, or Managed member. Age is Adult, Teen, Child, or Young child. Every signed-in person creates their member-owned cat before first entering the app; it is an avatar, never another person. Rooms are operating areas and may record occupants. Pets are optional care-planning participants, not people, roles, or users.

## Phase 4 dashboard and household routines

After onboarding, Cradle opens `/dashboard`. Completing Rooms causes Cradle to create a retry-safe first draft of useful routines, with Pets extending that draft. The Routines area is review-first: the family can keep, pause, edit, change frequency, assign, remove, or add custom routines without building the household library from scratch.

Cradle resolves canonical, versioned templates server-side and quietly generates the underlying Household Systems aggregate, reusable checklist, owner, optional rotation participants, Room/Pet context, source tracking, and definition of done. Systems are an internal operational model rather than the ordinary setup vocabulary.

Owners and Parent/Admins configure routines; Adults view active routines; Children have no Phase 4 management access. Pets are always care context and never responsible people.

The Dashboard never fabricates work completion, progress, messages, meals, or performance. Today, My Cradle, and Family Status derive from the same dated task and participant records. Notification delivery, streaks, and long-term performance scoring remain future work.

## Phase 4.2 family and personal areas

Household Members and authenticated accounts are separate. Leadership can create managed or unclaimed profiles during setup or from Dashboard, then invite a specific profile or issue a general household invitation. General claims remain pending until leadership resolves identity.

Profile invitations use expiring hashed secrets and codes, fixed target identity, revocation and retry-safe acceptance. Every active linked Member lands on a personalised `/dashboard`, can open `/me`, edit permitted names, customise their member-owned cat appearance, and suggest household work. Suggestions never auto-create tasks or routines.

“No dead ends” is permanent: every reachable state has a completion, continuation, retry, cancellation, parent, Dashboard or sign-in route. Deferred modules do not open fake pages.

## Phase 4.3 household experience and coordination

The Dashboard belongs to the household: it leads with the household name, identifies the signed-in family member secondarily, and puts one canonical Family Status first. Every real active or managed family member appears once with a default or persisted cat appearance. The cat uses the person’s name, has no separate identity, and never participates in authorization, counts, invitations, delegation, rotation, meetings, schedules, messages, or tasks.

Every real active family member shown in Family Status—including managed, unclaimed, invited, accepted, adult and child profiles—is available to assignment selectors. Rotation uses an editable persisted subset; Shared team assigns several people to one occurrence; One person is fixed; Decide later is genuinely unassigned. Age informs safe defaults, not access or importance.

Cradle distributes household work by default. It must never silently place all generated responsibilities on the person who created the household.

Age describes suitability. Access level describes permissions. Neither describes a person’s importance within the Family.

Cradle’s Household Schedule provides a first-party coordination layer for family, leadership and child meetings, appointments, school events, trips, birthdays, reminders, one-off events and recurring events. Weekly Review is a configurable recurring household event defaulting to Sunday at 7:00 PM, not a task. Leadership Meetings are visible only to Owners and Parent/Admins. Schedule entries do not generate tasks.

The Dashboard setup checklist is expanded and actionable only while foundational setup is incomplete. Once complete it collapses to **Home setup complete ✓** and can be reopened by leadership through **Review setup**. Its state is derived from persisted household data across devices; removal of required data reopens it, while optional features never do. Routine review remains in the Routines card.

See `dashboard-specification.md`, `calendar-specification.md`, `meeting-model.md` and `routine-assignment-model.md`.

## Meal Rotation Foundation

The Well-Led Home 7×4 Meal Rotation is Cradle’s reusable dinner decision-reduction system. It is not the same thing as the operational Weekly Meal Plan. The rotation supplies four weeks of Monday–Sunday dinner choices; the weekly plan contains the visible 11-slot week, including weekend breakfast and lunch. Weekly edits are explicit and preserve the reusable source unless the household chooses to change the repeating rotation.

The Rotation Builder suggests a balanced rhythm from Recipe Bank meals and active Family-member favourites while respecting allergy and dietary constraints, cook availability, recency, time and household preferences. It allows repetition, leftovers, takeaway, eating out, flexible nights and optional themes. The resulting shopping list follows the actual weekly plan and its overrides.

## Together

Together is the optional family-connection module. It generates one deterministic Today’s Moment per household-local day and may generate one Optional Moment. Moments are warm invitations to connect, learn, play, create or build memories—not tasks, chores, duties, streaks or competitive scores. Selection uses active Family members, My Cradle interests and skills, participation balance, age and supervision safeguards, household preferences, recent history and Traditions. Completion may create an optional memory or Tradition without creating duplicate Schedule entries.
