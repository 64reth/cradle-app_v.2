# Dashboard specification

The Dashboard is the household’s shared home. Authentication belongs to the signed-in family member, but the greeting leads with the household:

`Good morning Allen Family`

`Signed in as Gareth`

## Canonical information hierarchy

1. household greeting and household-local date;
2. Family Status;
3. Today’s Mission;
4. Household Schedule;
5. Suggestions;
6. temporary setup guidance or its compact completion strip.

Family Status is the single family overview. Every active or managed real family member appears exactly once. Each card uses that person’s canonical cat avatar, or the canonical default appearance when they have not customised it. Cats have no separate name or identity.

Family Status cards are avatar-led: the coloured artwork area is 68% of the card and the white information footer is 32%. Mobile keeps a 66/34 split and must never fall to 50/50. The top contains only a large centred cat with no inner circle or dashed frame. The fixed footer contains the family member’s name and one concise real status. A progress bar may appear only when real progress data exists.

Selecting a card opens a focused family-member view. The signed-in person can continue to My Cradle; a Household admin can manage a Managed member. The one leadership action is **Manage family**.

Today’s Mission never fabricates tasks or progress. Until dated task generation exists, it explains the current state and provides one **Review routines** action. Household Schedule shows upcoming persisted events or a useful **Add to schedule** empty state. Suggestions provides one route to suggest work.

## Home setup checklist

While foundational setup is incomplete, the full checklist shows progress and one next action. Once complete, it automatically becomes **Home setup complete ✓** with **Review setup**. This server-derived state persists across devices and reopens only when required foundational data is removed. Optional features never reopen it.

## Access and responsive behaviour

Family cards are semantic buttons with visible focus and keyboard activation. Focused sheets trap focus, close with Escape, restore focus, and always provide a way back. On mobile, cards remain large, horizontally scrollable, and preserve the avatar/footer ratio.
