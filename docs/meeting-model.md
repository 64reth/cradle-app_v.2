# Meeting model

Meetings are specialised Household Schedule events:

- **Family Meeting**: household-visible and intended for all active/managed Members.
- **Leadership Meeting**: leadership-visible; participants must be Owner or Parent/Admin.
- **Child Meeting**: household-visible, linked to at least one Child or Young child Family member.
- **Weekly Review**: household-visible recurring planning event, managed by leadership.

Weekly Review defaults to the next Sunday at 7:00 PM and weekly recurrence. The household can change title, date, time, recurrence, reminder, location, notes and participants during creation. Its purpose is to review routines, celebrate wins, review suggestions, discuss upcoming events, adjust routines and plan the next week.

Appointments use the same event aggregate and require at least one subject Member. Family/leadership meeting links are attendees; appointment/child meeting links are subjects.

Meetings never become ordinary tasks and do not generate task instances. Visibility is enforced in queries as well as UI controls.
