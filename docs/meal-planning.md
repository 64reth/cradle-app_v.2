# Meal planning

Cradle keeps two meal-planning layers separate:

- The **7×4 Meal Rotation** is a reusable four-week dinner rhythm with seven dinner positions per rotation week.
- The **Weekly Meal Plan** is the operational calendar for one week: Monday–Friday dinner plus Saturday/Sunday breakfast, lunch and dinner slots.

Opening a week projects the applicable rotation week into that week’s dinner slots and creates the four weekend breakfast/lunch slots. Each projected slot retains `source_rotation_slot_id`. The household first sees **Review This Week**, where each meal can be kept, swapped, removed, moved, marked **Eating away**, or replaced with a favourite or another suggestion. Away meals remain visible with their note and original source, but do not contribute ingredients or count as missing meals. Editing a weekly slot offers **This week only**, which records an override, or **Change the repeating rotation**, which updates the source slot deliberately. Special occasions are weekly overrides and never rewrite the base rotation.

Weeks begin as drafts so the household can review the full generated week before confirming it. Confirmation is not a lock: the week remains editable, and shopping is refreshed from the latest meals being eaten at home. Regeneration preserves meals the household has deliberately kept, added manually, pinned, or marked for a special occasion.
The review also offers a safe refresh of unconfirmed meals; individual swaps remain explicit, so a refresh never silently replaces a kept or manually changed meal.

The ownership chain is Recipe Bank → 7×4 Rotation → Weekly Meal Plan → Shopping List. Shopping ingredients are derived from the actual weekly plan after overrides, not from the reusable rotation alone.

The Rotation Builder starts with active Family-member favourites when available, preserves who favours each meal, ranks broader household support first, and filters conflicts with recorded allergy or dietary constraints. Favourite names may be linked to a Meal/Recipe or remain custom names. Missing favourites are normal: households can enter manual meals and still use the builder. Similar names are not destructively merged.

The suggestions endpoint also accepts a planning date. Birthday events and anniversary-titled Schedule entries on that date boost favourites belonging to the relevant Family members without bypassing allergy, dietary or dislike filters. `GET /api/household/meals/duplicates` reports possible same-or-similar meal names for a later, explicit household consolidation flow; it never merges or overwrites records.

Rotation suggestions may use optional day themes such as quick meal, family favourite, healthy choice, curry/one-pot, fun Friday, something different, or family dinner. Themes are planning aids, not fixed rules. Intentional repetition is supported; maintainable variety matters more than novelty.
