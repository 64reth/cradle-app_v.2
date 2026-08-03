# Family access permissions matrix

This is a product-facing reference. Executable capability decisions are owned by the [Household Domain permission policy](./household-domain.md).

| Capability | Owner | Parent/Admin | Adult | Child |
| --- | --- | --- | --- | --- |
| Complete incomplete initial setup | Yes | No | No | No |
| Confirm leadership/member review | Yes | No | No | No |
| Manage Rooms during setup | Yes | No | No | No |
| Manage optional Pets during setup | Yes | No | No | No |
| View safe household family representation | Yes | Yes | Yes | Yes |
| Add unclaimed/managed Member profiles | Yes | Yes, after setup | No | No |
| Create member invitations | Yes | Yes | No | No |
| Revoke/regenerate invitations | Yes | Yes | No | No |
| Approve/decline ordinary join requests | Yes | Yes | No | No |
| Suspend ordinary Member access | Yes | Yes, within policy | No | No |
| Edit own permitted display/preferred name | Yes | Yes | Yes | Limited |
| Customise own cat avatar | Yes | Yes | Yes | Yes |
| Manage Managed member cat avatar | Yes | Yes | No | No |
| Create household task suggestion | Yes | Yes | Yes | Yes |
| Review task suggestions | Yes | Yes | No | No |
| Manage Rooms after setup | Yes | Yes | No | No |
| Manage Pets after setup | Yes | Yes | No | No |
| Open Dashboard household summary | Yes | Yes | Yes | Yes |
| Review/apply routine recommendations | Yes | Yes | No | No |
| View active household routines | Yes | Yes | Yes | No |
| View paused/archived routine definitions | Yes | Yes | No | No |
| Edit/pause/archive routines | Yes | Yes | No | No |
| Choose Routine responsibility and participant pools | Yes | Yes | No | No |
| Appear as routine responsibility/rotation choice | Yes | Yes | Yes | Yes |
| View household-visible Calendar events | Yes | Yes | Yes | Yes |
| Create ordinary household Calendar events | Yes | Yes | Yes | No |
| Create Leadership Meeting / Weekly Review | Yes | Yes | No | No |
| View leadership-only Calendar events | Yes | Yes | No | No |
| Cancel any active household Calendar event | Yes | Yes | No | No |
| Cancel own ordinary Calendar event | Yes | Yes | Yes | No |
| View own session / sign out | Yes | Yes | Yes | Yes |
| View and complete own dated work | Yes | Yes | Yes | Via Household admin |
| Request a helper for assigned work | Yes | Yes | Yes | Via Household admin |
| View Managed member My Cradle tasks | Yes | Yes | No | No |
| Override Shared-team completion | Yes | Yes | No | No |

Pets and cat avatars never receive permissions, credentials, roles, or sessions. An avatar is appearance owned by a real family member and is never an authorization principal. Server authorization derives the role and household from the session. A Parent/Admin retains invitation permissions while waiting for the Owner to finish setup.

The historical role headings above describe compatibility identities. Current UI and authorization use `access_level`: Owner and Parent/Admin map to Household admin, Adult maps to Household member, and Child/managed profiles map to Managed member by default. `age_band` is independent and never grants admin access.

Member/invitation policy is centralised in the server family-access module. Household admins cannot alter Owner identity or ownership outside canonical policy. Household members and Managed members cannot manage access, invitations or join requests.

Routine management begins only after setup is complete. Every active real person in Family Status is available to assignment selectors. A Household admin chooses the persisted Rotation or Shared-team subset. Choosing responsibility does not grant management permission. Age band informs safe defaults only.

Calendar access is server-enforced. Leadership events use leadership-only visibility and return no data to ordinary Members. Adults can manage only ordinary events they created. Children have household-visible read access only.

## Platform Operator

Platform Operator is a separate operations identity, not a household role and never a substitute for Owner or Household admin. It is granted only through the protected `platform_operators` table. Operators can inspect safe account/provider/membership metadata, revoke sessions, suspend or restore accounts, and review safe authentication/diagnostics summaries. They cannot read household task, meal, schedule, profile-detail or feedback content. Every platform action is recorded in the immutable platform audit log.
