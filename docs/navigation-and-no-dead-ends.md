# Navigation and No Dead Ends

“No dead ends” is a permanent Cradle product and engineering standard.

## Safe homes and precedence

`/dashboard` is the safe home for an authenticated active Member. The public entry/sign-in surface is the safe home without a valid session.

Routing precedence is:

1. a valid invitation URL stays on invitation welcome, even when a session also exists;
2. invalid/expired/revoked invitation shows explanation, Retry and Return to sign in;
3. invalid or expired session returns to sign-in without looping;
4. development D1 reset clears stale local state and returns to Create Household;
5. an authenticated Owner with incomplete setup resumes the persisted step;
6. a non-Owner never enters Owner onboarding;
7. a linked family member without a saved avatar creates their cat before first entering Dashboard;
8. an active linked family member enters Dashboard, Schedule, Routines or My Cradle only when that route is permitted;
9. unknown authenticated feature state returns to Dashboard.

## Required exits

Every screen, card, sheet and error state provides at least one completion, continuation, retry, cancellation, parent return, Dashboard return or sign-in route. Browser Back is never the only exit.

Data-entry sheets include title, Close and Cancel. Failures preserve controlled/unsubmitted values and keep escape actions enabled. Successful mutations state their destination:

- Add Member → Invite now, Add another, Invite later or Done;
- Create invite → Copy link/code, QR, Share or Done;
- accept profile invite → Dashboard;
- general invite request → explanation and Done;
- cat appearance save → `/me`;
- Schedule event save/cancel → Schedule, with Dashboard schedule refresh;
- suggestion submit → confirmation, personal list and Dashboard;
- revoke/review → Family panel or Dashboard.

Unimplemented Plan and Messages destinations are absent from primary navigation. Schedule is live and has its own Dashboard return.

## Empty, unavailable and denied states

An empty state names the area, explains why it is empty and provides an action. Invitations, join requests, suggestions, routines and personal tasks all offer a useful CTA and Dashboard/parent exit.

Typed not-found, archived and permission errors do not reveal another tenant’s data. In-shell failures stay local and retain navigation. Session-level failures provide sign-in. Runtime/transport failures provide fresh Retry and safe exit.

## Route/state audit

| Surface/state | Arrival | Primary action | Safe exit | Error recovery | Destination |
| --- | --- | --- | --- | --- | --- |
| Public home | no session | Create / Join / Sign in | remains public | retry form | setup, invite or Dashboard |
| Session expired | guarded request 401 | Sign in again | public home | fresh auth request | intended household |
| Owner setup | create/sign in incomplete | complete current stage | Save and sign out | local retry | next stage / Dashboard |
| Members setup | setup sequence | Add family or skip | Save and sign out | form retained | Your cat |
| Your cat | setup sequence / first linked sign-in | Save member avatar | Sign out | palette retained / retry | Rooms or Dashboard |
| Rooms | setup sequence | add / continue | Save and sign out | local retry | Pets |
| Pets | setup sequence | add / no pets | Save and sign out | local retry | Review |
| Review | setup sequence | Complete | Save and sign out | fresh retry | Dashboard |
| Dashboard | linked active Member | relevant household/personal CTA, Today’s Moment | Sign out | aggregate retry | Dashboard child surface |
| Together | Dashboard/nav | View or start Today’s Moment | Dashboard nav | local retry | Together/Dashboard |
| Home setup incomplete | Dashboard | next incomplete step | Dashboard remains usable | local retry | checklist / Dashboard |
| Home setup complete | Dashboard | Review setup | compact strip / Dashboard | re-derived on refresh | expanded checklist |
| Routine setup | Dashboard | Save plan | Close | retained selection / retry | Dashboard |
| Routine library | navigation | View/Edit/Add | Dashboard nav | local retry | library/Dashboard |
| Schedule | navigation/Schedule card | create/view event | Dashboard nav | local retry | Schedule/Dashboard |
| Schedule empty state | Schedule | Create Meeting | Dashboard | fresh list retry | event sheet/Dashboard |
| Schedule event sheet | Schedule | Save | Close/Cancel/Dashboard | retained form / retry | Schedule |
| Family panel | Dashboard | Add/Invite/Review | Close/Done/Dashboard | retained form / retry | Dashboard |
| Invitation welcome | private URL/code | Join/request | Cancel/Return home | retained form / retry | Dashboard or request confirmation |
| Join request review | Family panel | Approve/Decline | Dashboard | local retry | pending list |
| My Cradle (`/me`) | Dashboard/nav | edit/cat appearance/suggest | Back to Dashboard | local retry/cancel | My Cradle/Dashboard |
| Cat appearance | `/me` | Save appearance | Close/Cancel | retained palette | `/me` |
| Suggestions | Dashboard or `/me` | Submit/withdraw/review | Cancel/Dashboard | retained form / retry | `/me`/Dashboard |
| Permission denied | guarded child surface | permitted parent action | Dashboard/sign-in | fresh permitted request | safe home |
| Missing resource | direct/stale link | relevant list | Dashboard | retry list | list/Dashboard |

## Engineering checklist

Tests cover onboarding exits, completion to Dashboard, the expanded and compact home-setup states, family completion choices, invitation result actions, invitation error exits, acceptance destination, My Cradle return, avatar and suggestion outcomes, Schedule empty/create/permission paths, empty-state CTAs, session recovery, dismissible sheets, canonical navigation and invitation/onboarding precedence. The Worker smoke exercises the authoritative routes and persists each completed state.
