# App simplification and feature ownership

| Product concept | Canonical home | Secondary access | Removed duplicate or dead-end treatment |
| --- | --- | --- | --- |
| Family overview | Dashboard → Family Status | Family management sheet | Separate Family summary and avatar gallery |
| Family member cat | The person’s Family Status card | My Cradle; managed child Family editor | Separate name, profile, household identity, guide card |
| Today’s work | Dashboard → Today’s Mission | Future dated task view | “Today’s Household” placeholder |
| Routines | `/routines` | Today’s Mission review action | `/systems` is a safe compatibility alias; no Routine Library duplicate |
| Schedule | `/schedule` | Dashboard Household Schedule | `/calendar` is a safe compatibility alias |
| Suggestions | My Cradle and Dashboard suggestion action | Leadership review in Family | No automatic routine or task creation |
| Setup | Expanded only while incomplete | Compact Review setup strip | Permanent large checklist |

Permanent rule:

> If a feature has more than one visible home, Cradle must choose one canonical home and make every other appearance a route, summary or shortcut into it.

The Family model contains only real household people. A rendered cat is appearance attached to a family member. It is never counted, invited, authenticated, delegated to, rotated into work, selected for meetings, scheduled, messaged, or shown as a synthetic participant.
