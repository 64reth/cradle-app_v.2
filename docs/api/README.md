# API Foundation

The Worker API returns typed JSON envelopes.

Success:

```json
{
  "ok": true,
  "data": {},
  "requestId": "..."
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  },
  "requestId": "..."
}
```

Every response includes a request correlation ID. If Cloudflare supplies `CF-Ray`, Cradle uses it. Otherwise the API generates a UUID.

Server utilities live in `functions/api/http.ts` and `functions/api/types.ts`. They provide JSON responses, body parsing, validation/not-found/conflict/authorization/server errors, D1 binding checks, and safe handling for unexpected failures.

Unexpected errors are logged server-side with the request ID. Clients receive a generic `SERVER_ERROR`; stack traces and database internals are never exposed.

Meal planning endpoints are household-scoped behind the session cookie:

- `GET/POST /api/household/meals` for Recipe Bank meals, favourites and ranked suggestions;
- `GET /api/household/meals/duplicates` for non-destructive similar-name candidates;
- `GET /api/household/meals/suggestions?scope=special_occasion&date=YYYY-MM-DD` for occasion-aware favourite ranking;
- `/api/together` for Today’s Moment, lifecycle actions, memories and Traditions;
- `GET/PATCH /api/household/meals/preferences` for dietary needs, allergies and dislikes;
- `GET /api/household/meals/suggestions` for builder scopes such as a meal or week;
- `GET/POST /api/household/meal-rotations` and `GET/PATCH /api/household/meal-rotations/:rotationId` for the reusable 7×4 rhythm;
- `GET/POST /api/household/meal-plans` and `GET/PATCH /api/household/meal-plans/:planId` for dated weekly plans and explicit overrides.

Weekly changes use `editScope: "this_week"`, `"special_occasion"` or `"repeating_rotation"`; the last option is the only one that changes the reusable source slot.

Authentication and operations routes:

- `POST /api/auth/supabase/exchange` verifies a Supabase access token server-side, creates/links a Profile identity and starts an opaque identity session; it never creates a household automatically;
- `GET /api/auth/sessions`, `POST /api/auth/session/refresh` and `POST /api/auth/sessions/revoke-all` expose safe session management;
- `GET /api/ops/accounts` and `GET/POST /api/ops/accounts/:accountId` are restricted to Platform Operators and return only safe account/provider/membership metadata;
- `GET /api/alpha/diagnostics` remains restricted to Household admins and never returns private feedback content.
