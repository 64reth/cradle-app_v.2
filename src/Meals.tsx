import { useCallback, useEffect, useMemo, useState } from "react";
import { dayLabel, favouriteContext, MEAL_DAYS, type MealDay, type MealSuggestion } from "../shared/meals";
import { api, failureMessage, jsonInit } from "./api";
import { CradleIcon } from "./components/ui/CradleIcon";
import { Navigation, type AuthenticatedView } from "./Dashboard";

type RotationSlot = {
  id?: string; rotationWeekNumber: number; dayOfWeek: MealDay; mealType: string;
  mealId: string | null; mealName?: string | null; customMealName: string | null; slotKind: string;
  dayTheme?: string | null; overrideKind?: string; specialOccasionTitle?: string | null; sourceRotationSlotId?: string | null;
  sourceMealId?: string | null; sourceMealName?: string | null; sourceCustomMealName?: string | null; sourceSlotKind?: string | null;
  notes?: string | null;
};
type Rotation = { id: string; title: string; description: string | null; cycleLengthWeeks: number; active: number; startsOn: string | null; slots: RotationSlot[] };
type WeeklyPlan = { id: string; weekStart: string; rotationWeekNumber: number | null; rotationTitle: string | null; status?: "draft" | "active" | "archived"; slots: RotationSlot[] };
type MealData = { rotations: Rotation[]; active: (Rotation & { suggestions: MealSuggestion[] }) | null; suggestions: MealSuggestion[];
  duplicates?: Array<{ entries: Array<{ id: string; name: string; source: string; memberName?: string | null }>; reason: string }>;
  constraints?: { dietaryTags: string[]; allergens: string[]; dislikes: string[] }; canManage: boolean };
type ShoppingItem = { id?: string; ingredientName: string; quantity: string | null; isChecked?: number };

const weekdayDefaults: MealDay[] = [1, 2, 3, 4, 5, 6, 7];

export function Meals({ navigate, signOut }: { navigate: (view: AuthenticatedView) => void; signOut: () => void }) {
  const [data, setData] = useState<MealData | null>(null); const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [title, setTitle] = useState("Our family meals"); const [setupDays, setSetupDays] = useState<MealDay[]>(weekdayDefaults);
  const [setupMealTypes, setSetupMealTypes] = useState<string[]>(["dinner"]);
  const [weekStart, setWeekStart] = useState(() => { const date = new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date.toISOString().slice(0, 10); });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [showRhythm, setShowRhythm] = useState(false); const [editingSlot, setEditingSlot] = useState<RotationSlot | null>(null);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]); const [shoppingBusy, setShoppingBusy] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<"all" | "favourites">("all");
  const [occasionDate, setOccasionDate] = useState(weekStart); const [occasionSuggestions, setOccasionSuggestions] = useState<MealSuggestion[]>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await api<MealData>("/api/household/meal-rotations"); setData(next);
      if (next.active) setPlan(await api<WeeklyPlan>(`/api/household/meal-plans?weekStart=${encodeURIComponent(weekStart)}`));
      else setPlan(null);
    } catch (reason) { setError(failureMessage(reason)); }
  }, [weekStart]);
  useEffect(() => { void load(); }, [load]);

  const suggestions = useMemo(() => (occasionSuggestions.length ? occasionSuggestions : data?.suggestions || [])
    .filter((suggestion) => suggestionFilter === "all" || suggestion.favouriteOf.some(Boolean)), [data?.suggestions, occasionSuggestions, suggestionFilter]);
  const atHomeCount = plan?.slots.filter((slot) => slot.slotKind === "meal").length || 0;
  const awayCount = plan?.slots.filter((slot) => slot.slotKind === "eating_out").length || 0;
  const flexibleCount = plan?.slots.filter((slot) => !["meal", "eating_out"].includes(slot.slotKind)).length || 0;

  async function buildFirstWeek() {
    if (!setupDays.length || !setupMealTypes.length) return;
    setBusy(true); setError("");
    try {
      const slots = Array.from({ length: 4 }, (_, week) => setupDays.flatMap((day) => setupMealTypes.map((mealType, position) => {
        const suggestion = suggestions[(week * setupDays.length + setupDays.indexOf(day) + position) % Math.max(suggestions.length, 1)];
        return { rotationWeekNumber: week + 1, dayOfWeek: day, mealType, mealId: suggestion?.mealId || null,
          customMealName: suggestion?.mealId ? null : suggestion?.name || null, slotKind: suggestion ? "meal" : "flexible" };
      }))).flat();
      const result = await api<{ id: string }>("/api/household/meal-rotations", jsonInit("POST", { title: title.trim() || "Our family meals", cycleLengthWeeks: 4, slots }));
      await api("/api/household/meal-rotations", jsonInit("PATCH", { active: true, rotationId: result.id }));
      setNotice("Your first week is ready to review."); await load();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }

  async function saveWeekly(slot: RotationSlot, value: string, editScope: "this_week" | "repeating_rotation" | "special_occasion" = "this_week", mealId: string | null = null, specialOccasionTitle = "", notes = "", mealType = slot.mealType) {
    if (!plan) return; setBusy(true); setError("");
    try {
      await api(`/api/household/meal-plans/${plan.id}`, jsonInit("PATCH", { slotId: slot.id, mealId, customMealName: mealId ? null : value, slotKind: "meal", mealType, editScope, specialOccasionTitle, notes }));
      setNotice(editScope === "this_week" ? "This week’s meal was changed." : editScope === "special_occasion" ? "Special occasion saved for this week." : "The repeating meal was updated.");
      await refreshShoppingFor(plan.id); setPlan(await api<WeeklyPlan>(`/api/household/meal-plans?weekStart=${encodeURIComponent(weekStart)}`)); setEditingSlot(null);
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function quickAction(slot: RotationSlot, action: "remove" | "eating_away" | "restore" | "keep" | "move", notes = "", targetDay?: number) {
    if (!plan) return; setBusy(true); setError("");
    try { await api(`/api/household/meal-plans/${plan.id}`, jsonInit("PATCH", { slotId: slot.id, action, notes, targetDay }));
      setNotice(action === "eating_away" ? "Marked as eating away." : action === "restore" ? "Original meal restored." : action === "remove" ? "Meal removed from this week." : action === "move" ? "Meal moved to another day." : "Meal kept for this week.");
      await refreshShoppingFor(plan.id); setPlan(await api<WeeklyPlan>(`/api/household/meal-plans?weekStart=${encodeURIComponent(weekStart)}`)); setEditingSlot(null);
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function refreshShoppingFor(planId: string) {
    const result = await api<{ items: ShoppingItem[] }>(`/api/household/meal-plans/${planId}`, jsonInit("PATCH", { refreshShoppingList: true })); setShoppingItems(result.items);
  }
  async function refreshShopping() { if (!plan) return; setShoppingBusy(true); setError(""); try { await refreshShoppingFor(plan.id); setNotice(shoppingItems.length ? "Shopping list ready." : "Shopping list updated."); } catch (reason) { setError(failureMessage(reason)); } finally { setShoppingBusy(false); } }
  async function confirmWeek() { if (!plan) return; setBusy(true); setError(""); try { const next = await api<WeeklyPlan>(`/api/household/meal-plans/${plan.id}`, jsonInit("PATCH", { confirmWeek: true })); setPlan(next); setNotice("This week is confirmed. You can still make changes anytime."); await refreshShoppingFor(plan.id); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function refreshUnconfirmed() { setBusy(true); setError(""); try { const next = await api<WeeklyPlan>("/api/household/meal-plans", jsonInit("POST", { weekStart, regenerate: true })); setPlan(next); await refreshShoppingFor(next.id); setNotice("Unconfirmed meals have been refreshed; your kept choices stayed put."); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function copyShoppingList() { const text = shoppingItems.map(({ ingredientName, quantity }) => `${quantity ? `${quantity} ` : ""}${ingredientName}`).join("\n"); if (!text) return; try { await navigator.clipboard.writeText(text); setNotice("Shopping list copied to share."); } catch { setError("Cradle couldn’t copy the shopping list. You can still use Print to save it as a PDF."); } }
  async function loadOccasionSuggestions() { try { const result = await api<{ suggestions: MealSuggestion[] }>(`/api/household/meals/suggestions?scope=special_occasion&date=${encodeURIComponent(occasionDate)}`); setOccasionSuggestions(result.suggestions); setNotice(result.suggestions.length ? "Celebration favourites are ready to review." : "No celebration favourites matched that date."); } catch (reason) { setError(failureMessage(reason)); } }

  return <div className="dashboard-shell"><Navigation active="meals" navigate={navigate} signOut={signOut} />
    <section className="calendar-hero"><div><p className="eyebrow"><CradleIcon name="cooking" size="sm" decorative /> Dashboard → Meals</p><h1>Meal planning</h1><p>Cradle makes a sensible first draft, then your family can shape the week around real life.</p></div></section>
    {error && <section className="dashboard-card local-error"><p className="error" role="alert">{error}</p><button className="primary" onClick={() => void load()}>Retry</button></section>}
    {notice && <p className="inline-success-chip" role="status">{notice}</p>}
    {!!data?.duplicates?.length && <section className="dashboard-card meal-duplicates"><p className="eyebrow"><CradleIcon name="search" size="sm" decorative /> Similar meal names</p><p>Cradle has kept every original favourite and recipe. These may be the same meal under different names; you can review them together later.</p><ul>{data.duplicates.slice(0, 8).map((candidate) => <li key={candidate.entries.map((entry) => entry.id).join("-")}>{candidate.entries.map((entry) => entry.name).join(" · ")}</li>)}</ul></section>}
    {!data?.active && <section className="dashboard-card meal-builder" aria-labelledby="meal-builder-title"><p className="eyebrow"><CradleIcon name="suggestion" size="sm" decorative /> Plan My Week</p><h2 id="meal-builder-title">Let’s make your first week feel like home.</h2><p>Choose the days and meals you usually plan. Cradle will suggest familiar favourites where it can, and leave the rest flexible.</p>
      {(data?.constraints?.dietaryTags.length || data?.constraints?.allergens.length || data?.constraints?.dislikes.length) ? <p className="soft-notice">Suggestions will respect your household’s saved dietary needs, allergies and dislikes.</p> : <p className="soft-notice">Favourite meals from each person’s My Cradle will appear in your suggestions.</p>}
      <label><span>Show me</span><select aria-label="Meal suggestions filter" value={suggestionFilter} onChange={(event) => setSuggestionFilter(event.target.value as "all" | "favourites")}><option value="all">Family favourites and Recipe Bank meals</option><option value="favourites">Family favourites only</option></select></label>
      {suggestions.length > 0 && <ul className="meal-setup-suggestions" aria-label="Suggested meals">{suggestions.slice(0, 6).map((suggestion) => <li key={suggestion.mealId || suggestion.name}><strong>{suggestion.name}</strong><small>{favouriteContext(suggestion)}</small></li>)}</ul>}
      <label><span>What should we call this plan?</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <fieldset><legend>Which days do you usually plan?</legend><div className="meal-choice-grid">{MEAL_DAYS.map(({ value, label }) => <label key={value}><input type="checkbox" checked={setupDays.includes(value)} onChange={() => setSetupDays((days) => days.includes(value) ? days.filter((day) => day !== value) : [...days, value].sort())} /> {label}</label>)}</div></fieldset>
      <fieldset><legend>Which meals should we include?</legend><div className="meal-choice-grid"><label><input type="checkbox" checked={setupMealTypes.includes("dinner")} onChange={() => setSetupMealTypes((types) => types.includes("dinner") ? types.filter((type) => type !== "dinner") : [...types, "dinner"])} /> Dinner</label><label><input type="checkbox" checked={setupMealTypes.includes("breakfast")} onChange={() => setSetupMealTypes((types) => types.includes("breakfast") ? types.filter((type) => type !== "breakfast") : [...types, "breakfast"])} /> Breakfast</label><label><input type="checkbox" checked={setupMealTypes.includes("lunch")} onChange={() => setSetupMealTypes((types) => types.includes("lunch") ? types.filter((type) => type !== "lunch") : [...types, "lunch"])} /> Lunch</label></div></fieldset>
      <button className="primary" disabled={busy || !setupDays.length || !setupMealTypes.length} onClick={() => void buildFirstWeek()}><CradleIcon name="complete" size="sm" decorative /> {busy ? "Building…" : "Build my first week"}</button>
    </section>}
    {data?.active && <div className="meal-active-content">{plan && <section className="dashboard-card meal-week-plan"><div className="card-heading"><div><p className="eyebrow"><CradleIcon name="calendar" size="sm" decorative /> Review This Week</p><h2>What are we eating?</h2><p>Keep, swap or change any meal around real life. Your choices stay editable.</p></div><label><span>Week starting</span><input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></label></div><p className="meal-week-summary">{atHomeCount} meals at home · {awayCount} meals away · {flexibleCount} flexible meal{flexibleCount === 1 ? "" : "s"}</p>{plan.status === "draft" && <p className="soft-notice">Review the full week, then confirm it when it feels right.</p>}<div className="meal-plan-list">{plan.slots.map((slot) => <MealPlanSlot key={slot.id} slot={slot} busy={busy} onEdit={setEditingSlot} />)}</div>{plan.status === "draft" && <button className="primary" disabled={busy} onClick={() => void confirmWeek()}>Confirm this week</button>}{plan.status === "active" && <p className="inline-success-chip">This week is confirmed, and you can still edit it.</p>}</section>}
      {plan && <section className="dashboard-card meal-shopping"><div className="card-heading"><div><p className="eyebrow"><CradleIcon name="shopping" size="sm" decorative /> Shopping</p><h2>Weekly shopping</h2></div><span>{shoppingItems.length ? `${shoppingItems.length} items` : "Ready when you are"}</span></div>{shoppingItems.length ? <ul className="shopping-summary-list">{shoppingItems.map((item) => <li key={`${item.ingredientName}-${item.quantity}`}><span>{item.ingredientName}</span><small>{item.quantity || ""}</small></li>)}</ul> : <p>Only meals being eaten at home add ingredients here.</p>}<div className="row-actions"><button className="primary" disabled={shoppingBusy} onClick={() => void refreshShopping()}>{shoppingBusy ? "Gathering…" : "Update shopping list"}</button>{shoppingItems.length > 0 && <><button onClick={() => void copyShoppingList()}>Copy to share</button><button onClick={() => window.print()}>Print / save PDF</button></>}</div></section>}
      {plan?.status === "draft" && <button className="meal-rhythm-toggle" disabled={busy} onClick={() => void refreshUnconfirmed()}><CradleIcon name="recurring" size="sm" decorative /> Refresh unconfirmed meals</button>}
      <button className="meal-rhythm-toggle" onClick={() => setShowRhythm((value) => !value)}><CradleIcon name="recurring" size="sm" decorative /> {showRhythm ? "Hide repeating meals" : "Review repeating meals"}</button>
      {showRhythm && <section className="dashboard-card meal-review"><p className="eyebrow"><CradleIcon name="recurring" size="sm" decorative /> Repeating meals</p><h2>{data.active.title}</h2><p>These are the reusable ideas behind your weeks. Change one calendar meal without changing this list.</p><div className="meal-four-weeks">{[1, 2, 3, 4].map((week) => <div key={week}><h3>Week {week}</h3><ol>{MEAL_DAYS.map(({ value, label }) => { const slot = data.active?.slots.find((candidate) => candidate.rotationWeekNumber === week && candidate.dayOfWeek === value && candidate.mealType === "dinner"); return <li key={value}><span>{label}</span><strong>{slot?.mealName || slot?.customMealName || (slot?.slotKind === "flexible" ? "Flexible" : "Not chosen")}</strong></li>; })}</ol></div>)}</div></section>}
    </div>}
    {editingSlot && <MealEditor slot={editingSlot} suggestions={suggestions} occasionDate={occasionDate} onOccasionDateChange={setOccasionDate} occasionSuggestions={occasionSuggestions} busy={busy} onClose={() => setEditingSlot(null)} onSave={saveWeekly} onQuickAction={quickAction} onLoadOccasionSuggestions={loadOccasionSuggestions} />}
  </div>;
}

function MealPlanSlot({ slot, busy, onEdit }: { slot: RotationSlot; busy: boolean; onEdit: (slot: RotationSlot) => void }) {
  const away = slot.slotKind === "eating_out"; const mealName = away ? "Eating away" : slot.mealName || slot.customMealName || (slot.slotKind === "flexible" ? "Flexible" : "Choose a meal");
  const detail = away ? (slot.notes ? `Eating away — ${slot.notes}` : "We are away") : slot.overrideKind === "this_week" ? "Changed this week" : slot.overrideKind === "special_occasion" ? slot.specialOccasionTitle : "Tap to change";
  return <button type="button" className="meal-plan-slot" disabled={busy} onClick={() => onEdit(slot)}><span><strong>{dayLabel(slot.dayOfWeek)}</strong><small>{slot.mealType}</small></span><span className="meal-plan-choice"><strong>{mealName}</strong><small>{detail}</small></span><CradleIcon name="edit" size="sm" decorative /></button>;
}

function MealEditor({ slot, suggestions, occasionDate, onOccasionDateChange, occasionSuggestions, busy, onClose, onSave, onQuickAction, onLoadOccasionSuggestions }: {
  slot: RotationSlot; suggestions: MealSuggestion[]; occasionDate: string; onOccasionDateChange: (value: string) => void; occasionSuggestions: MealSuggestion[]; busy: boolean;
  onClose: () => void; onSave: (slot: RotationSlot, value: string, scope?: "this_week" | "repeating_rotation" | "special_occasion", mealId?: string | null, specialOccasionTitle?: string, notes?: string, mealType?: string) => Promise<void>;
  onQuickAction: (slot: RotationSlot, action: "remove" | "eating_away" | "restore" | "keep" | "move", notes?: string, targetDay?: number) => Promise<void>; onLoadOccasionSuggestions: () => Promise<void>;
}) {
  const [value, setValue] = useState(slot.mealName || slot.customMealName || ""); const [mealId, setMealId] = useState(slot.mealId || ""); const [notes, setNotes] = useState(slot.notes || "");
  const [moveDay, setMoveDay] = useState<MealDay>(slot.dayOfWeek); const [mealType, setMealType] = useState(slot.mealType);
  const [scope, setScope] = useState<"this_week" | "repeating_rotation" | "special_occasion">("this_week"); const [specialOccasionTitle, setSpecialOccasionTitle] = useState(""); const available = occasionSuggestions.length ? occasionSuggestions : suggestions; const chosen = Boolean(value.trim() || mealId);
  const canRestore = Boolean(slot.sourceRotationSlotId && (slot.sourceMealId || slot.sourceMealName || slot.sourceCustomMealName));
  return <section className="meal-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title"><div className="meal-editor-head"><div><p className="eyebrow">Review meal</p><h2 id="meal-editor-title">{dayLabel(slot.dayOfWeek)} {slot.mealType}</h2></div><button onClick={onClose}>Close</button></div><p>Choose a favourite, add your own meal, or make space for real life.</p>
    <div className="meal-suggestion-wheel" aria-label="Suggested meals">{available.slice(0, 8).map((suggestion) => { const key = suggestion.mealId || suggestion.name; return <button type="button" className={key === (mealId || value) ? "selected" : ""} key={key} onClick={() => { setMealId(suggestion.mealId || ""); setValue(suggestion.name); }}><strong>{suggestion.name}</strong><small>{favouriteContext(suggestion)}</small></button>; })}</div>
    <div className="meal-occasion-tools"><label><span>Celebration date (optional)</span><input type="date" value={occasionDate} onChange={(event) => onOccasionDateChange(event.target.value)} /></label><button type="button" className="text-button" onClick={() => void onLoadOccasionSuggestions()}>More celebration suggestions</button></div>
    <label><span>Custom meal</span><input autoFocus value={value} onChange={(event) => { setValue(event.target.value); setMealId(""); }} placeholder="For example, Friday pizza" /></label><label><span>Meal type</span><select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
    <label><span>Note (optional)</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="School event, family trip…" /></label>
    {chosen && <fieldset className="meal-save-scope"><legend>Apply to</legend><label><input type="radio" checked={scope === "this_week"} onChange={() => setScope("this_week")} /> This week only</label>{slot.sourceRotationSlotId && <label><input type="radio" checked={scope === "repeating_rotation"} onChange={() => setScope("repeating_rotation")} /> Repeating meals</label>}<label><input type="radio" checked={scope === "special_occasion"} onChange={() => setScope("special_occasion")} /> Special occasion</label></fieldset>}
    {scope === "special_occasion" && <label><span>What are you celebrating?</span><input value={specialOccasionTitle} onChange={(event) => setSpecialOccasionTitle(event.target.value)} placeholder="Birthday, anniversary or another lovely day" /></label>}
    <div className="row-actions"><button className="primary" disabled={busy || !chosen} onClick={() => void onSave(slot, value.trim(), scope, mealId || null, specialOccasionTitle.trim(), notes.trim(), mealType)}>Save meal</button><label><span>Move to</span><select value={moveDay} onChange={(event) => setMoveDay(Number(event.target.value) as MealDay)}>{MEAL_DAYS.map(({ value: day, label }) => <option key={day} value={day}>{label}</option>)}</select></label><button type="button" disabled={busy || moveDay === slot.dayOfWeek} onClick={() => void onQuickAction(slot, "move", notes.trim(), moveDay)}>Move meal</button><button type="button" disabled={busy} onClick={() => void onQuickAction(slot, "eating_away", notes.trim())}>We are eating away</button><button type="button" disabled={busy} onClick={() => void onQuickAction(slot, "remove")}>Remove this meal</button>{canRestore && <button type="button" disabled={busy} onClick={() => void onQuickAction(slot, "restore")}>Restore original meal</button>}<button type="button" onClick={onClose}>Keep as is</button></div>
  </section>;
}
