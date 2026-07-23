# Companion assets

## Architecture

The shared household Companion is rendered from production PNG sheets:

1. `/companions/companion-fur.png`
2. `/companions/companion-patch-primary.png`
3. `/companions/companion-patch-secondary.png`
4. `/companions/companion-expressions.png` as the top outline/expression layer

Every frame is 64×64 pixels. Expressions are one 384×64 row with frames: neutral, on track, completed, calm, behind, needs help. Palette sheets are 64×512 with eight rows.

The Fur order is orange, grey, charcoal, cream, brown, blue-grey, white, ginger. Both Patch sheets actually use cream, orange, charcoal, grey, brown, blue-grey, white, ginger; this differs from Fur and is represented explicitly in `shared/companion.ts`.

## Swatch method

Run `npm run assets:companion`. The deterministic Sharp-based inspection reads RGBA pixels, verifies exact dimensions and transparency, divides palette sheets into 64px rows, ignores fully transparent pixels, and selects the most frequent remaining colour in each row. The resulting swatches are checked against the canonical metadata in automated tests. Original PNG files are never mutated.

## Persistence

One active Companion configuration belongs to one household. D1 stores stable palette keys and an expression key, never sprite row numbers or arbitrary colours. The renderer and server resolve rows from the same canonical definitions.

The Companion is not a member, role, Pet, or identity. It has no credentials or session. Reaction logic, moods, rewards, animation, household status, task state, pet care, and Today’s Mission integration are deferred.
