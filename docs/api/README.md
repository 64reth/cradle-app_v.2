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
