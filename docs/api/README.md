# API Foundation

Pages Functions return typed JSON envelopes.

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
