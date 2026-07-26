# Personal areas

`/dashboard` is the shared household home. `/me` is My Cradle: the signed-in family member’s details, cat appearance, current-day assigned missions, help requests, and suggestions. Household admins may open the same task view for a Managed member.

Every real family member has a cat avatar. The cat is visual representation, not another household participant:

- it uses the family member’s display or preferred name;
- it has no independent name, profile, role, credentials, session, schedule, messages, tasks, or invitation;
- an uncustomised avatar renders with the canonical default appearance;
- one persisted appearance can be saved per family member.

The Owner creates their appearance during household onboarding. An invited or newly linked person creates theirs after account claim and before Dashboard. The signed-in person later edits it at `PUT /api/me/avatar`; a Household admin may edit a Managed member at `PUT /api/household/members/:memberId/avatar`. All colour choices use direct swatches with an immediate preview. The legacy `member_companions` table remains the additive persistence layer, but its required `name` column is compatibility data populated from the family member’s name and is never exposed as separate identity.

Appearance failures stay local, preserve selections, expose typed request details, and keep Cancel available. Successful saves refresh My Cradle and the Dashboard. A successful save followed by a failed refresh is reported as saved and never invites a duplicate submission.

My Tasks is derived from dated participant records, never directly from every Routine template. It includes One person, the current Rotation turn, Shared team, and explicit manual work with To do, In progress, Waiting for team, Complete, or Missed state. A hand action requests an active helper, whose Help requested card then shows the same mission.

Hobbies and Interests are private, member-owned preferences stored in the existing `together_member_preferences.interests_json` field. Each entry may include a suggested or custom name, category, interest level, preferred setting, participation preference, note, and active state. Missing optional details are valid. Members can edit, archive, or remove their entries from My Cradle; archiving stops an interest influencing future Together suggestions without changing historical Moments.

Family members may edit permitted personal names, but cannot change household access, ownership, age band, household, or another person. Managed profiles have no direct sign-in or My Cradle session; an authorised Household admin views their tasks in context.
