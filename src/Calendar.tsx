import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EVENT_RECURRENCES, EVENT_REMINDERS, HOUSEHOLD_EVENT_TYPES, eventTypeLabel,
  recurrenceLabel, weeklyReviewDefaults, type EventRecurrence, type HouseholdEventType
} from "../shared/coordination";
import { api, failureMessage, jsonInit } from "./api";
import { Navigation, type AuthenticatedView, type DashboardData, type DashboardMember } from "./Dashboard";
import { MemberSelector } from "./MemberSelector";
import { CradleIcon } from "./components/ui/CradleIcon";

type CalendarMember = Pick<DashboardMember, "id" | "displayName" | "role" | "ageGroup" | "lifecycleState">;
type CalendarEvent = {
  id: string; title: string; eventType: HouseholdEventType; description: string | null; location: string | null;
  startsAt: string; endsAt: string | null; recurrence: EventRecurrence; customRecurrence: string | null;
  reminderMinutes: number | null; visibility: "household" | "leadership"; status: "active" | "cancelled";
  createdByMemberId: string; createdByName: string;
  members: Array<{ memberId: string; displayName: string; role: string; ageGroup: string | null }>;
};
type CalendarData = { events: CalendarEvent[]; canCreate: boolean; canCreateLeadership: boolean };

const pad = (value: number) => String(value).padStart(2, "0");
function nextWeeklyReview() {
  const next = new Date(); const days = (weeklyReviewDefaults.weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + days); next.setHours(weeklyReviewDefaults.hour, weeklyReviewDefaults.minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 7);
  return { date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`, time: "19:00" };
}
const tomorrow = () => {
  const date = new Date(); date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const eventDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
}).format(new Date(value));

export function HouseholdCalendar({ dashboard, navigate, signOut, onDashboardChanged }: {
  dashboard: DashboardData; navigate: (view: AuthenticatedView) => void; signOut: () => void;
  onDashboardChanged: (dashboard: DashboardData) => void;
}) {
  const [data, setData] = useState<CalendarData | null>(null); const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [eventType, setEventType] = useState<HouseholdEventType>("family_meeting");
  const [title, setTitle] = useState("Family Meeting"); const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("19:00"); const [endTime, setEndTime] = useState("");
  const [recurrence, setRecurrence] = useState<EventRecurrence>("one_off");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [savedEvent, setSavedEvent] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null); const returnFocusRef = useRef<HTMLElement | null>(null);
  const eligibleMembers = useMemo(() => dashboard.members.filter(({ lifecycleState = "active" }) =>
    ["active", "managed", "unclaimed", "invited", "join_requested"].includes(lifecycleState)), [dashboard.members]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api<CalendarData>("/api/household/events")); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!creating) return;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    ) || [])];
    requestAnimationFrame(() => focusable()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); setCreating(false); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [creating, busy]);
  function openCreate() {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedMemberIds(eventType === "family_meeting" || eventType === "weekly_review" || eventType === "trip"
      ? eligibleMembers.map(({ id }) => id)
      : eventType === "leadership_meeting"
        ? eligibleMembers.filter(({ role }) => role === "owner" || role === "parent_admin").map(({ id }) => id)
        : []);
    setSavedEvent(null); setError(""); setCreating(true);
  }
  function chooseType(next: HouseholdEventType) {
    setEventType(next);
    setSelectedMemberIds(next === "family_meeting" || next === "weekly_review" || next === "trip"
      ? eligibleMembers.map(({ id }) => id)
      : next === "leadership_meeting"
        ? eligibleMembers.filter(({ role }) => role === "owner" || role === "parent_admin").map(({ id }) => id)
        : []);
    if (next === "weekly_review") {
      const weekly = nextWeeklyReview(); setTitle(weeklyReviewDefaults.title);
      setDate(weekly.date); setTime(weekly.time); setRecurrence(weeklyReviewDefaults.recurrence);
    } else {
      setTitle(eventTypeLabel(next)); setRecurrence(next === "birthday" ? "yearly" : "one_off");
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savedEvent) return; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ event: CalendarEvent }>("/api/household/events", jsonInit("POST", {
        title, eventType, startsAt: new Date(`${date}T${time}`).toISOString(),
        endsAt: endTime ? new Date(`${date}T${endTime}`).toISOString() : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        recurrence, customRecurrence: form.get("customRecurrence"),
        reminderMinutes: Number(form.get("reminderMinutes")),
        location: form.get("location"), description: form.get("description"),
        memberIds: selectedMemberIds, clientKey
      }));
      setSavedEvent(result.event.id); setNotice(`${result.event.title} was added to the household schedule.`);
      await load();
      try { onDashboardChanged(await api<DashboardData>("/api/dashboard")); }
      catch (reason) { setError(`Event saved, but the Dashboard could not refresh. ${failureMessage(reason)}`); return; }
      setCreating(false); setClientKey(crypto.randomUUID());
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function cancel(event: CalendarEvent) {
    setBusy(true); setError("");
    try {
      await api(`/api/household/events/${event.id}`, jsonInit("DELETE"));
      setNotice(`${event.title} was removed from the active schedule.`); await load();
      onDashboardChanged(await api<DashboardData>("/api/dashboard"));
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  const visibleTypes = HOUSEHOLD_EVENT_TYPES.filter(({ value }) =>
    data?.canCreateLeadership || (value !== "leadership_meeting" && value !== "weekly_review"));
  return <div className="dashboard-shell"><Navigation active="calendar" navigate={navigate} signOut={signOut} />
    <section className="calendar-hero"><div><p className="eyebrow"><CradleIcon name="calendar" size="sm" decorative /> Dashboard → Schedule</p><h1>Household Schedule</h1>
      <p>Keep meetings, appointments, trips, reminders and shared plans in one calm place.</p></div>
      <div className="row-actions">{data?.canCreate && <button className="primary" onClick={openCreate}><CradleIcon name="add" size="sm" decorative /> Create event</button>}
        <button onClick={() => navigate("dashboard")}>Back to Dashboard</button></div></section>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <section className="dashboard-card local-error"><p className="error" role="alert">{error}</p>
      <button onClick={() => void load()}>Retry</button><button onClick={() => setCreating(false)}>Cancel</button>
      <button onClick={() => navigate("dashboard")}>Back to Dashboard</button></section>}
    <section className="dashboard-card calendar-list">
      <div className="card-heading"><div><p className="eyebrow"><CradleIcon name="upcoming" size="sm" decorative /> Coming up</p><h2>Your Household Schedule</h2></div>
        <span>{data?.events.length || 0} planned</span></div>
      {loading && <p role="status">Loading the household schedule…</p>}
      {!loading && data && !data.events.length && <div className="empty-action"><h3>No meetings planned.</h3>
        <p>Create your first family meeting, leadership meeting or event so everyone knows what is coming up.</p>
        {data.canCreate ? <button className="primary" onClick={openCreate}>Create Meeting</button>
          : <button onClick={() => navigate("dashboard")}>Back to Dashboard</button>}</div>}
      {data?.events.map((event) => <article className="calendar-event-card" key={event.id}>
        <div><p className="eyebrow">{eventTypeLabel(event.eventType)}</p><h3>{event.title}</h3>
          <p><strong>{eventDate(event.startsAt)}</strong>{event.location ? ` · ${event.location}` : ""}</p>
          <small>{recurrenceLabel(event.recurrence)}
            {event.members.length ? ` · ${event.members.map(({ displayName }) => displayName).join(", ")}` : " · Household-wide"}
            {event.visibility === "leadership" ? " · Leadership only" : ""}</small></div>
        {(dashboard.currentUser.role === "owner" || dashboard.currentUser.role === "parent_admin" ||
          event.createdByMemberId === dashboard.currentUser.id) &&
          <button disabled={busy} onClick={() => void cancel(event)}>Cancel event</button>}
      </article>)}
    </section>
    {creating && <section ref={dialogRef} className="personal-sheet calendar-sheet" role="dialog" aria-modal="true" aria-labelledby="calendar-create-title">
      <div><div><p className="eyebrow">Household Schedule</p><h2 id="calendar-create-title">Create an event</h2></div>
        <button onClick={() => setCreating(false)} disabled={busy} aria-label="Close"><CradleIcon name="close" decorative /></button></div>
      <form onSubmit={create}>
        <label><span>Event type</span><select value={eventType} onChange={(event) => chooseType(event.target.value as HouseholdEventType)}>
          {visibleTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>
        <p className="soft-notice">{HOUSEHOLD_EVENT_TYPES.find(({ value }) => value === eventType)?.description}</p>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <div className="calendar-time-grid"><label><span>Date</span><input type="date" value={date}
          onChange={(event) => setDate(event.target.value)} required /></label>
          <label><span>Starts</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
          <label><span>Optional end</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
        <label><span>Repeats</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value as EventRecurrence)}>
          {EVENT_RECURRENCES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        {recurrence === "custom" && <label><span>Custom recurrence</span><input name="customRecurrence"
          placeholder="For example, every third Thursday" required /></label>}
        <label><span>Reminder</span><select name="reminderMinutes" defaultValue="30">
          {EVENT_REMINDERS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label><span>Optional location</span><input name="location" /></label>
        <label><span>Optional notes</span><textarea name="description" /></label>
        <MemberSelector members={eligibleMembers.filter((member: CalendarMember) => eventType !== "leadership_meeting" ||
          member.role === "owner" || member.role === "parent_admin")} multiple values={selectedMemberIds}
          label={eventType === "appointment" || eventType === "child_meeting" ? "Who is this for?" : "Who’s coming?"}
          name="memberIds" onValuesChange={setSelectedMemberIds} />
        {eventType === "weekly_review" && <p>Weekly Review is a household event—not a task. Use it to celebrate wins, review routines and suggestions, discuss events and plan next week.</p>}
        <div className="row-actions"><button className="primary" disabled={busy || Boolean(savedEvent)}>
          {busy ? "Saving…" : savedEvent ? "Event saved" : "Add to household schedule"}</button>
          <button type="button" disabled={busy} onClick={() => setCreating(false)}><CradleIcon name="close" size="sm" decorative /> Cancel</button></div>
      </form>
    </section>}
  </div>;
}
