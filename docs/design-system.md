# Design system

Cradle uses mobile-first cute-brutalist tokens: cream paper, brighter sunflower, mint, sky, coral and violet surfaces; strong charcoal borders; rounded cards; chunky shadows; and visible keyboard focus. Colour has stable ownership: yellow means attention/current selection, green means success, blue means Today/Schedule information, purple means My Cradle/avatar identity, and coral means support.

## Product language

Every screen reads as though it was written for a family around a kitchen table. The UI uses **Dashboard**, **Routines**, **Family**, **Schedule**, **Together**, **Suggestions**, **My Cradle**, **Today’s Mission**, **Today’s Moment**, **Household Schedule**, **Weekly Review**, **Meeting**, **Family Meeting**, **Leadership Meeting**, **Appointments**, and **Trips** consistently.

`HouseholdSystem`, Member lifecycle values, records and other engineering concepts remain valid internal architecture, but those terms do not appear in household-facing copy. The UI says “routine” rather than “system”, “family member” rather than “member profile”, and “create” or “add” rather than “configure” or “provision”. Permission labels may use Member where accuracy requires it. Warmth, belonging and a clear next step take priority over administrative language.

Family-avatar palette controls pair an artwork-derived swatch with a readable label and selected mark. Selection never relies on colour alone. The sprite renderer uses `image-rendering: pixelated`, one registered 64×64 rendering box, and four exactly overlaid layers.

The authenticated product uses a centred Dashboard shell with a compact top navigation on wider screens and touch-friendly bottom navigation on mobile. The information hierarchy is household greeting → Family Status → Today’s Mission → Household Schedule → Suggestions → temporary setup guidance. Cards use restrained sun, mint, sky, coral, and lilac blocks with strong black outlines and chunky shadows.

The household name is the primary greeting; “Signed in as…” is secondary identity context. Family Status is the emotional centre: every real family member is represented once by their named card and member-owned cat. An uncustomised person receives the canonical default appearance. Cards use a 68% coloured avatar area and 32% white footer; mobile uses 66/34 and never 50/50. There is no inner circle, dashed frame, separate cat name, or fictional participant.

Guided routine setup shows one Room or Pet context at a time. Recommendation cards use a large enabled checkbox, plain frequency and responsibility controls, and optional checklist/customisation disclosure. The ordinary interface never exposes database-shaped trigger, participant-role, dependency, supply, or definition-of-done fields.

The Routines home groups Cradle’s first draft by Room/Pet. Responsibility controls exactly match Family Status, including managed, unclaimed and invited profiles of every age. Rotation begins with a sensible eligible pool, remains fully editable, and never silently re-adds someone the family removed. One person, Shared team, and Decide later are explicit distinct choices. Advanced definition details use a native disclosure. Status is always text as well as colour. All controls retain visible focus, 40–48px touch targets, semantic labels, keyboard operation, sufficient contrast, and reduced-motion behavior. The UI derives progress only from dated participant assignments and never invents work or performance.

Member-avatar colour controls are direct labelled swatches, never colour dropdowns. Selection updates the preview cat immediately.

Family uses warm family-member cards, canonical member-owned cats, concise statuses, and focused sheets instead of administration tables. Invitation results keep link/code actions and a scannable QR within the viewport. The reusable person selector uses a semantic `<select>` for single choices and labelled checkbox cards for multi-person participation.

Schedule creation uses a bottom-anchored, one-handed sheet on mobile, a compact date/time grid, large family-member checkboxes and plain recurrence/reminder labels. Schedule and avatar dialogs trap focus, close with Escape, restore focus to their trigger, and use Close/Cancel as the sheet exits while the page header provides Dashboard navigation.

Every Family-member selector derives from the same canonical active Household Member collection as Family Status. It includes real admins, members, managed profiles and valid unclaimed/invited profiles in stable Family Status order, and excludes archived/inactive or synthetic rows. The shared selector supports single and multi-select, Select all/Clear all, keyboard operation and explicit selected state.

Joy is a celebration state, not a permanent performance state. The standard 76–100% cat uses closed happy eyes with no tongue; tongue-out Joy appears only for a finite task-completion celebration and then returns to the threshold state. Members at 0–25% rest in an unhappy supportive state and may briefly scowl on an intermittent, gentle interval. Reduced motion removes movement while preserving text, expression and progress feedback. Cradle should feel playful through colour, character and reaction—not through unnecessary interface.

Every modal/sheet has a title, Close and data-entry Cancel. Mobile sheets anchor to the bottom and remain vertically scrollable. Save failure cannot disable escape. Empty cards explain the area, its benefit and a meaningful action plus parent/Dashboard route. Unimplemented destinations are absent rather than exposed as disabled primary navigation.

## Cradle icon hierarchy

All interface icons use the typed `CradleIcon` component in `src/components/ui/CradleIcon.tsx`; feature code should not import `lucide-react` directly. The semantic registry is the single source of truth for navigation, household, room, task, status and utility concepts. It uses Lucide icons with `currentColor`, a default two-pixel stroke, and the shared `sm` (16px), `md` (20px), and `lg` (24px) presets. Add a new concept to the registry before using it in a screen, and add room or task aliases in `src/iconMappings.ts` when a domain value needs an icon.

Icons are supporting language, never the only communication of state. Decorative icons must pass `decorative` so they receive `aria-hidden`; icon-only controls must keep an accessible label. Pixel cats remain Cradle's only expressive artwork. Emoji, functional Unicode symbols and deleted `/public/icons` assets are not part of the interface icon system.
