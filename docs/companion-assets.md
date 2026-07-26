# Family avatar assets

The historical filename is retained so existing references remain stable. These assets render family-member cat avatars, not a separate household identity.

The renderer layers four production PNG sheets:

1. `/companions/companion-fur.png`
2. `/companions/companion-patch-primary.png`
3. `/companions/companion-patch-secondary.png`
4. `/companions/companion-expressions.png`

Each frame is 64×64. Stable palette and expression values live in `shared/companion.ts`; the member-owned default adapter lives in `shared/member-avatar.ts`; and `FamilyAvatar` is the canonical UI wrapper. The internal `Companion` component name is retained only as the low-level sprite renderer.

Run `npm run assets:companion` to verify dimensions, transparency, frame positions, and artwork-derived swatches. Original PNGs are never changed.

D1 stores stable appearance keys in the legacy `member_companions` table. It never stores sprite positions or arbitrary colours. The required legacy `name` column mirrors the real family member’s name for schema compatibility and is not a product identity.
