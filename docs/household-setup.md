# Household setup

## State machine

The server persists and validates this sequence:

`leadership → members → rooms → pets → companion → review → complete`

A newly created or existing pre-migration household starts at leadership. Refresh, reauthentication, and browser restart resolve the persisted step through the authenticated session and setup API. Only the active Owner may change incomplete initial setup. Other members see a waiting state.

## Stages

1. **Leadership** confirms the initial Owner as household lead. One leader is sufficient.
2. **Members** reuses one-use invitations and may be acknowledged without creating or redeeming one.
3. **Rooms** creates the operating areas for later Systems. At least one active Room is required.
4. **Pets** optionally records animals who may need future care. A household may continue with none.
5. **Companion** creates the shared cat avatar from the production layered sprite sheets. Defaults are valid and editable.
6. **Review** shows the household, lead, members, ordered Rooms, Pets when present, and Companion.
7. **Complete** is an Owner-only server action requiring leadership confirmation, membership acknowledgement, an active Owner, at least one active Room, and a valid active Companion.

Pets are household participants for care planning but never authenticated users or roles. Future Systems may reference feeding, fresh water, walking, litter or enclosure cleaning, medication, grooming, vet appointments, and supply checks.

## Relationship to the operating loop

Rooms provide operating areas. Future Household Systems will document repeatable processes with purpose, participants, triggers, prerequisites, ordered steps, and a definition of done. Scheduling will create upcoming work; delegation will distribute it; Today’s Mission will surface attention; Weekly Review will support planning and improvement.

Systems, schedules, delegation, tasks, pet-care work, Companion reactions, Today’s Mission, and Weekly Review are explicitly deferred.

## Local review reliability

The application does not register a service worker or PWA cache, so local API mutations cannot be served by stale browser caches. API responses use `Cache-Control: no-store`. During review, keep `npm run dev:pages` attached and confirm its terminal reports `Ready on http://localhost:8788`; if the terminal exits, restart it rather than relying on an orphaned `workerd` process.

After a local D1 reset, an already-open document detects the invalid development session, clears it, and returns to Create Household with an explanation. When the runtime itself changed, the page instead shows the explicit development-restart screen and Reload action. An already-open JavaScript document cannot update its own code from files rebuilt on disk.

Before diagnosing a local connection failure, preserve the database and establish runtime ownership: use `lsof -nP -iTCP:8788 -sTCP:LISTEN` to identify the listener, inspect its parent process, and confirm that it belongs to the attached project-specific Wrangler command. The attached terminal must receive the browser request, and its PID must remain stable. If the request is absent and the browser reports `ERR_CONNECTION_REFUSED`, there is no API request ID and handler debugging must wait until browser and runtime ownership agree. Stop only stale Cradle Wrangler/workerd processes; never treat an arbitrary listener on port 8788 as authoritative.

In development only, every `/api/` response has an `X-Cradle-Dev-Runtime-ID` header. An open browser document stores the first value it sees; if a later response has a different value, Cradle stops the stale onboarding flow and shows **“Cradle has restarted during development.”** with a Reload action. A development-only 401 from `/api/auth/session` after an authenticated session is treated as a recreated local D1 database: the invalid session cookie and local onboarding state are cleared, and the user is sent to Create Household with an explanatory notice. Neither behavior is enabled in production.

Transport failures alone use “Cradle couldn’t connect.” Typed API failures retain their safe server message and request ID. Room forms retain values after a failed mutation. Once creation succeeds, a subsequent refresh failure is reported as “Room saved” and the form is cleared so retry cannot create a duplicate.

Companion names and palette selections remain mounted after a failed save. Retrying issues a fresh PUT after the runtime recovers.
