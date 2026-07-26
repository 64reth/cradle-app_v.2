# Household Schedule specification

## MVP

Cradle’s Household Schedule coordinates family life without external integrations. It supports Family Meeting, Leadership Meeting, Child Meeting, Appointment, School Event, Trip, Birthday, Household Reminder, One-off Event and Weekly Review.

Creation captures title, date/start, optional end, timezone, optional notes/location, relevant Members, recurrence and reminder lead time. Supported recurrence values are one-off, daily, weekly, fortnightly, monthly, yearly and custom. Reminder lead time is stored; delivery is deferred.

Participant choices use the shared canonical member selector. Family Meetings, Trips and Weekly Review start with every eligible active Family member selected; Leadership Meetings start with Household admins; appointments and child meetings require the relevant attendee(s). Managed and unclaimed real Family members remain selectable where participation is valid, and the exact saved set is retained for recurring events.

## Visibility and permissions

Household-visible events can be read by every authenticated active Member. Leadership Meetings are stored with leadership visibility and are returned only to Owners and Parent/Admins. Owners and Parent/Admins create/manage all event types. Adults create ordinary household events and cancel their own. Children cannot create or cancel.

Every query derives `household_id` from the authenticated session. Client household IDs have no authority. Member links are validated against active/managed Members in the same household.

## Experience

Dashboard Household Schedule and primary Schedule navigation open canonical `/schedule`. Historical `/calendar` links are accepted and immediately canonicalised. Empty state explains the benefit and offers **Create Meeting** or Dashboard return. The creation sheet is keyboard-safe and one-handed on mobile. Typed failures retain the form and request ID; transport failures remain local. Stable client keys prevent duplicate creation after retry.

The event list is a coordination view, not a task list. The creation sheet is titled “Who’s coming?” (or “Who is this for?” for an appointment/child meeting), has Select all/Clear all controls, and does not contain a redundant Back to Dashboard action. Cancellation preserves event integrity. Recurrence-instance expansion, notification delivery, editing existing events and external calendar sync are later work.
