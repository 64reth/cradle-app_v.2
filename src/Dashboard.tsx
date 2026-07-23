import { useEffect, useMemo, useState } from "react";
import { ROUTINE_FREQUENCIES, frequencyLabel, type RoomType, type RoutineFrequency } from "../shared/routines";
import type { PetType } from "../shared/pets";
import { Companion, type CompanionConfig } from "./Companion";
import { api, failureMessage, jsonInit } from "./api";

export type DashboardMember = { id: string; displayName: string; role: string };
export type RoutineSummary = {
  id: string; name: string; status: "draft" | "active" | "paused" | "archived"; frequency: RoutineFrequency;
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  ownerMemberId: string; ownerName: string; note: string | null; stepCount: number;
  sourceKind: "template" | "custom"; sourceTemplateKey: string | null; rotationEnabled: boolean;
  rotationMemberIds: string[];
};
export type RoutineRecommendation = {
  selectionKey: string; templateKey: string; templateVersion: number; contextType: "room" | "pet";
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  name: string; frequency: RoutineFrequency; estimatedMinutes: number; defaultEnabled: boolean;
  steps: readonly string[]; configuredRoutine: RoutineSummary | null;
};
export type DashboardData = {
  household: { name: string; reference: string };
  currentUser: { id: string; displayName: string; role: string };
  members: DashboardMember[];
  rooms: Array<{ id: string; name: string; roomType: RoomType }>;
  pets: Array<{ id: string; name: string; petType: PetType }>;
  companion: (CompanionConfig & { id: string }) | null;
  setup: { canManage: boolean; routinesChosen: boolean; readyForPlanning: boolean;
    steps: Array<{ key: string; label: string; complete: boolean }> };
  recommendations: RoutineRecommendation[];
  routines: RoutineSummary[];
  activeRoutineCount: number;
  todayMission: { state: "setup" | "ready" | "waiting"; message: string };
  currentDate: string;
  deferredModules: string[];
};

type Choice = {
  enabled: boolean; frequency: RoutineFrequency; ownerMemberId: string; responsibility: "leaders" | "person" | "rotate" | "later";
  rotationMemberIds: string[]; customisedName: string; note: string; customFrequencyNote: string;
};
type CustomChoice = {
  clientKey: string; contextType: "room" | "pet" | "household"; roomId: string | null; petId: string | null;
  name: string; frequency: RoutineFrequency; ownerMemberId: string; note: string; customFrequencyNote: string;
};
type ApplySelection = {
  templateKey: string | null; clientKey: string | null; enabled: boolean;
  roomId: string | null; petId: string | null; frequency: RoutineFrequency; ownerMemberId: string;
  rotationEnabled: boolean; rotationMemberIds: string[]; customisedName: string; note: string;
  customFrequencyNote: string;
};

const key = () => crypto.randomUUID();
const roleLabel = (role: string) => role === "parent_admin" ? "Parent / Admin" : role[0].toUpperCase() + role.slice(1);
const groupKey = (recommendation: RoutineRecommendation) =>
  `${recommendation.contextType}:${recommendation.roomId || recommendation.petId}`;

function Navigation({ active, navigate, signOut }: {
  active: "dashboard" | "systems"; navigate: (view: "dashboard" | "systems") => void; signOut: () => void;
}) {
  return <header className="dashboard-nav">
    <button className="brand-button" onClick={() => navigate("dashboard")} aria-label="Cradle Dashboard">Cradle</button>
    <nav aria-label="Primary navigation">
      <button aria-current={active === "dashboard" ? "page" : undefined} onClick={() => navigate("dashboard")}>Dashboard</button>
      <button disabled title="Coming next">Plan <small>Next</small></button>
      <button aria-current={active === "systems" ? "page" : undefined} onClick={() => navigate("systems")}>Systems</button>
      <button disabled title="Coming next">Calendar <small>Next</small></button>
      <button disabled title="Coming next">Messages <small>Next</small></button>
    </nav>
    <button className="nav-signout" onClick={signOut}>Sign out</button>
  </header>;
}

function RoutineSetup({ dashboard, onClose, onApplied }: {
  dashboard: DashboardData; onClose: () => void; onApplied: (data: DashboardData) => void;
}) {
  const eligibleMembers = dashboard.members.filter(({ role }) => role !== "child");
  const defaultOwner = eligibleMembers.find(({ role }) => role === "owner")?.id ||
    eligibleMembers[0]?.id || dashboard.currentUser.id;
  const groups = useMemo(() => {
    const grouped = new Map<string, RoutineRecommendation[]>();
    for (const recommendation of dashboard.recommendations) {
      const id = groupKey(recommendation);
      grouped.set(id, [...(grouped.get(id) || []), recommendation]);
    }
    return [...grouped.values()];
  }, [dashboard.recommendations]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(
    dashboard.recommendations.map((recommendation) => {
      const configured = recommendation.configuredRoutine;
      return [recommendation.selectionKey, {
        enabled: configured ? configured.status === "active" : recommendation.defaultEnabled,
        frequency: configured?.frequency || recommendation.frequency,
        ownerMemberId: configured?.ownerMemberId || defaultOwner,
        responsibility: configured?.rotationEnabled ? "rotate" : configured ? "person" : "leaders",
        rotationMemberIds: configured?.rotationMemberIds || [],
        customisedName: configured?.name !== recommendation.name ? configured?.name || "" : "",
        note: configured?.note || "", customFrequencyNote: ""
      }];
    })
  ));
  const [custom, setCustom] = useState<CustomChoice[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newCustomFrequency, setNewCustomFrequency] = useState<RoutineFrequency>("weekly");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const group = groups[groupIndex]; const finalIndex = Math.max(0, groups.length - 1);
  const context = group?.[0];
  const contextLabel = context?.roomName || context?.petName || "Your household";
  const update = (selectionKey: string, patch: Partial<Choice>) =>
    setChoices((current) => ({ ...current, [selectionKey]: { ...current[selectionKey], ...patch } }));
  function addCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim(); if (!name) return;
    setCustom((items) => [...items, {
      clientKey: key(), contextType: context?.contextType || "household",
      roomId: context?.roomId || null, petId: context?.petId || null, name,
      frequency: form.get("frequency") as RoutineFrequency,
      ownerMemberId: String(form.get("ownerMemberId") || defaultOwner),
      note: String(form.get("note") || "").trim(),
      customFrequencyNote: String(form.get("customFrequencyNote") || "").trim()
    }]);
    setAddingCustom(false);
  }
  async function apply() {
    setBusy(true); setError("");
    const selections: ApplySelection[] = [...dashboard.recommendations.map((recommendation) => {
      const choice = choices[recommendation.selectionKey];
      return {
        templateKey: recommendation.templateKey, clientKey: null, enabled: choice.enabled,
        roomId: recommendation.roomId, petId: recommendation.petId, frequency: choice.frequency,
        ownerMemberId: choice.ownerMemberId, rotationEnabled: choice.responsibility === "rotate",
        rotationMemberIds: choice.responsibility === "rotate" ? choice.rotationMemberIds : [],
        customisedName: choice.customisedName, note: choice.note, customFrequencyNote: choice.customFrequencyNote
      };
    }), ...custom.map((routine) => ({
      templateKey: null, clientKey: routine.clientKey, enabled: true, roomId: routine.roomId, petId: routine.petId,
      frequency: routine.frequency, ownerMemberId: routine.ownerMemberId, rotationEnabled: false,
      rotationMemberIds: [] as string[], customisedName: routine.name, note: routine.note,
      customFrequencyNote: routine.customFrequencyNote
    }))];
    try {
      const result = await api<DashboardData>("/api/household/routine-setup/apply", jsonInit("POST", { selections }));
      onApplied(result);
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  if (!groups.length) return <section className="routine-setup-panel" aria-labelledby="routine-setup-title">
    <button className="text-button" onClick={onClose}>← Dashboard</button><h2 id="routine-setup-title">Your home is ready for custom routines.</h2>
    <p>Add routines later from the Systems library.</p></section>;
  return <section className="routine-setup-panel" aria-labelledby="routine-setup-title">
    <div className="setup-panel-heading"><div><p className="eyebrow">Step {groupIndex + 1} of {groups.length}</p>
      <h2 id="routine-setup-title">Choose what happens in {contextLabel}</h2>
      <p>Cradle suggested these from your {context?.contextType === "pet" ? "Pet" : "Room"}. You can change any of this later.</p></div>
      <button className="text-button" onClick={onClose}>Close</button></div>
    <div className="setup-dots" aria-label={`Setup step ${groupIndex + 1} of ${groups.length}`}>
      {groups.map((_, index) => <span key={index} className={index === groupIndex ? "current" : index < groupIndex ? "done" : ""} />)}
    </div>
    <div className="recommendation-list">{group.map((recommendation) => {
      const choice = choices[recommendation.selectionKey];
      return <article className={`recommendation-card ${choice.enabled ? "selected" : ""}`} key={recommendation.selectionKey}>
        <div className="recommendation-title"><label className="switch-label"><input type="checkbox" checked={choice.enabled}
          onChange={(event) => update(recommendation.selectionKey, { enabled: event.target.checked })} />
          <span>{choice.customisedName || recommendation.name}</span></label><span>{recommendation.estimatedMinutes} min</span></div>
        {choice.enabled && <div className="routine-quick-controls">
          <label><span>How often?</span><select value={choice.frequency}
            onChange={(event) => update(recommendation.selectionKey, { frequency: event.target.value as RoutineFrequency })}>
            {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}
          </select></label>
          {choice.frequency === "custom" && <label><span>Custom timing</span><input value={choice.customFrequencyNote}
            placeholder="For example, on the first Sunday"
            onChange={(event) => update(recommendation.selectionKey, { customFrequencyNote: event.target.value })} /></label>}
          <label><span>Who usually handles this?</span><select value={choice.responsibility === "person" ? choice.ownerMemberId : choice.responsibility}
            onChange={(event) => update(recommendation.selectionKey, event.target.value === "rotate"
              ? { responsibility: "rotate", rotationMemberIds: eligibleMembers.slice(0, 2).map(({ id }) => id) }
              : event.target.value === "leaders" || event.target.value === "later"
                ? { responsibility: event.target.value, ownerMemberId: defaultOwner, rotationMemberIds: [] }
                : { responsibility: "person", ownerMemberId: event.target.value, rotationMemberIds: [] })}>
            <option value="leaders">Household leaders</option>
            {eligibleMembers.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}
            {eligibleMembers.length > 1 && <option value="rotate">Rotate between people</option>}
            <option value="later">Decide later</option>
          </select></label>
          {choice.responsibility === "rotate" && <fieldset className="rotation-people"><legend>Rotate between</legend>
            {eligibleMembers.map((member) => <label className="checkbox-label" key={member.id}><input type="checkbox"
              checked={choice.rotationMemberIds.includes(member.id)}
              onChange={(event) => update(recommendation.selectionKey, { rotationMemberIds: event.target.checked
                ? [...choice.rotationMemberIds, member.id] : choice.rotationMemberIds.filter((id) => id !== member.id) })} />{member.displayName}</label>)}
          </fieldset>}
          <details><summary>See what’s included</summary><ul>{recommendation.steps.map((step) => <li key={step}>{step}</li>)}</ul></details>
          <details><summary>Make it your own</summary>
            <label><span>Edit label</span><input value={choice.customisedName}
              placeholder={recommendation.name} onChange={(event) => update(recommendation.selectionKey, { customisedName: event.target.value })} /></label>
            <label><span>Optional short note</span><textarea value={choice.note}
              onChange={(event) => update(recommendation.selectionKey, { note: event.target.value })} /></label>
          </details>
        </div>}
      </article>;
    })}</div>
    {custom.filter((routine) => routine.roomId === context?.roomId && routine.petId === context?.petId).map((routine) =>
      <article className="custom-routine-summary" key={routine.clientKey}><strong>{routine.name}</strong>
        <span>{frequencyLabel(routine.frequency)}</span><button onClick={() => setCustom((items) => items.filter(({ clientKey }) => clientKey !== routine.clientKey))}>Remove</button></article>)}
    {addingCustom ? <form className="custom-routine-form" onSubmit={addCustom}>
      <h3>Add something for {contextLabel}</h3>
      <label><span>What needs doing?</span><input name="name" required autoFocus /></label>
      <label><span>How often?</span><select name="frequency" value={newCustomFrequency}
        onChange={(event) => setNewCustomFrequency(event.target.value as RoutineFrequency)}>
        {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label>
      {newCustomFrequency === "custom" && <label><span>Custom timing</span><input name="customFrequencyNote"
        placeholder="For example, on the first Sunday" /></label>}
      <label><span>Who usually handles it?</span><select name="ownerMemberId" defaultValue={defaultOwner}>
        <option value={defaultOwner}>Household leaders</option>
        {eligibleMembers.filter(({ id }) => id !== defaultOwner).map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>
      <label><span>Optional short note</span><textarea name="note" /></label>
      <div className="row-actions"><button className="primary">Add routine</button><button type="button" onClick={() => setAddingCustom(false)}>Cancel</button></div>
    </form> : <button className="add-routine-button" onClick={() => setAddingCustom(true)}>+ Add something for {contextLabel}</button>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="setup-panel-actions">
      <button disabled={groupIndex === 0 || busy} onClick={() => setGroupIndex((index) => index - 1)}>Back</button>
      {groupIndex < finalIndex
        ? <button className="primary" disabled={busy} onClick={() => setGroupIndex((index) => index + 1)}>Next room</button>
        : <button className="primary" disabled={busy} onClick={() => void apply()}>{busy ? "Saving your plan…" : "Save household plan"}</button>}
    </div>
  </section>;
}

export function Dashboard({ data, setData, navigate, signOut, startSetup = false, onSetupOpened }: {
  data: DashboardData; setData: (data: DashboardData) => void; navigate: (view: "dashboard" | "systems") => void;
  signOut: () => void; startSetup?: boolean; onSetupOpened?: () => void;
}) {
  const [setupOpen, setSetupOpen] = useState(startSetup);
  useEffect(() => { if (startSetup) { setSetupOpen(true); onSetupOpened?.(); } }, [startSetup, onSetupOpened]);
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${data.currentDate}T12:00:00`));
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  if (setupOpen) return <div className="dashboard-shell"><Navigation active="dashboard" navigate={navigate} signOut={signOut} />
    <RoutineSetup dashboard={data} onClose={() => setSetupOpen(false)} onApplied={(next) => { setData(next); setSetupOpen(false); }} /></div>;
  return <div className="dashboard-shell"><Navigation active="dashboard" navigate={navigate} signOut={signOut} />
    <section className="dashboard-greeting"><div><p className="eyebrow">{data.household.name}</p>
      <h1>{greeting}, {data.currentUser.displayName}!</h1><p>{data.setup.routinesChosen ? "Your household plan is taking shape." : "Let’s get your household running."}</p></div>
      <div className="date-card"><span>Today</span><strong>{date}</strong></div></section>
    <div className="dashboard-grid">
      <section className="dashboard-card family-card"><div className="card-heading"><div><p className="eyebrow">Your people</p><h2>Household</h2></div>
        <span>{data.members.length} {data.members.length === 1 ? "member" : "members"}</span></div>
        <div className="family-list">{data.members.map((member) => <article key={member.id}><span className="member-avatar" aria-hidden="true">{member.displayName[0]}</span>
          <div><strong>{member.displayName}</strong><small>{roleLabel(member.role)}</small></div></article>)}</div>
        <p>{data.rooms.length} Rooms{data.pets.length ? ` · ${data.pets.length} ${data.pets.length === 1 ? "Pet" : "Pets"}` : ""}</p></section>
      <section className="dashboard-card progress-card"><p className="eyebrow">Getting started</p><h2>Set up your home</h2>
        <p>Cradle has suggested routines based on your Rooms and Pets. Choose what fits your household.</p>
        <ol>{data.setup.steps.map((step) => <li className={step.complete ? "complete" : ""} key={step.key}>
          <span aria-hidden="true">{step.complete ? "✓" : "○"}</span>{step.label}</li>)}</ol>
        {data.setup.canManage ? <button className="primary" onClick={() => setSetupOpen(true)}>{data.setup.routinesChosen ? "Review routines" : "Continue setup"}</button>
          : <p className="soft-notice">Household leaders manage routine setup.</p>}</section>
      <section className="dashboard-card mission-card"><p className="eyebrow">Today’s Mission</p><h2>{data.todayMission.state === "setup" ? "Your plan starts here." : "Routines ready."}</h2>
        <p>{data.todayMission.message}</p>{data.todayMission.state !== "waiting" && <button
          onClick={() => data.setup.routinesChosen ? navigate("systems") : setSetupOpen(true)}>
          {data.setup.routinesChosen ? "View routines" : "Set up routines"}</button>}</section>
      <section className="dashboard-card systems-summary"><div className="card-heading"><div><p className="eyebrow">Household routines</p><h2>Systems</h2></div>
        <strong className="routine-count">{data.activeRoutineCount}</strong></div>
        <p>{data.activeRoutineCount ? `${data.activeRoutineCount} active routines are ready for future planning.` : "Choose a few sensible defaults and Cradle will build the structure quietly."}</p>
        <button onClick={() => navigate("systems")}>{data.activeRoutineCount ? "Open routine library" : "See routine library"}</button></section>
      {data.companion && <section className="dashboard-card companion-dashboard-card"><div><p className="eyebrow">Household Companion</p>
        <h2>{data.companion.name}</h2><p>A neutral welcome while Cradle learns your household.</p></div>
        <Companion config={{ ...data.companion, expressionKey: "neutral" }} /></section>}
      <section className="dashboard-card next-card"><p className="eyebrow">Coming next</p><h2>From routines to a daily plan</h2>
        <p>Plan, Calendar and Messages will appear when Cradle can generate real dated household work. Nothing here is pretending to be complete.</p></section>
    </div>
  </div>;
}

export { Navigation };
