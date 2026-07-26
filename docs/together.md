# Together

Together is Cradle’s optional family-connection module. It creates one warm **Today’s Moment** and, when appropriate, one secondary **Optional Moment**. Moments invite families to connect, learn, play, talk, create or build memories; they are not chores, tasks, duties or streaks.

## Daily generation

`GET /api/together/today` is idempotent for a household-local date. The first read selects one primary Moment from system and household templates, stores a title/description snapshot and participant snapshot, then returns the same record on refresh. Weekends may receive one optional secondary Moment. Partial profile information is valid; the general seed library remains available.

Selection is deterministic for the household/date. It filters inactive members, excluded categories and unsafe child-only pairings, then ranks whole-family inclusion, shared interests and skills, energy/screen preferences, recent template use and participation balance. One-to-one pairs avoid two child members without an adult or teen. Spotlight selection favours members with less recent participation.

`POST /api/together/:momentId/swap` marks the original as `swapped` and creates one replacement without creating duplicate primary records. Skipping leaves the day open and is never treated as failure. Lifecycle transitions are validated server-side.

## My Cradle and safeguarding

Together reads `together_member_preferences` when available for interests, skills to share/learn, energy, screen preference and excluded categories. My Cradle stores structured Hobbies and Interests in the existing `interests_json` field, including custom names, optional category, level, setting, participation preference, notes, and active/archive state. Active interests from every active Family member raise compatible Moment suggestions; shared interests are rewarded, individual interests can create spotlight or one-to-one ideas, and the generated reason stays warm (for example, “Based on Gareth and Taryn’s interests”). Missing preferences never block generation. Household isolation and active-member checks are enforced by the service, not the UI. Children may participate, but the generator does not pair two child members for a one-to-one Moment or imply that a child supervises another child.

## Traditions and memories

Household admins can create and update Traditions. Completing a Moment offers an optional memory note and “would you do it again?” response. Memories do not score emotional quality, create pressure or automatically create Schedule entries. Photo storage is intentionally not included in this phase.

## API surface

- `GET /api/together` — Today’s Moment, optional Moment and Traditions.
- `GET/POST /api/me/interests` and `PATCH/DELETE /api/me/interests/:interestId` — private Hobbies and Interests for the signed-in member (Household admins may manage a Managed member).
- `GET /api/together/today` / `POST /api/together/generate` — idempotent daily projection.
- `GET/POST /api/together/moments` — daily view and authorised household-authored templates.
- `POST /api/together/:id/accept|start|complete|skip|save|swap` — lifecycle actions.
- `POST /api/together/:id/memory` — optional memory capture.
- `GET/POST /api/together/traditions`, `PATCH /api/together/traditions/:id` — Tradition management.

All responses use the existing typed envelope, request ID and development runtime ID. Public sharing, leaderboards, competitive scoring, live location, external weather and broad notifications remain out of scope.

The mission is simple: help families create more moments they will remember, not simply more activities to complete.
