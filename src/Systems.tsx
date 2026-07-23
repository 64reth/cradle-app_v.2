import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ROUTINE_FREQUENCIES, frequencyLabel, type RoutineFrequency } from "../shared/routines";
import { api, failureMessage, jsonInit } from "./api";
import { Navigation, type DashboardMember, type RoutineSummary } from "./Dashboard";

type LibraryData = { routines: RoutineSummary[]; members: DashboardMember[]; canManage: boolean };
type RoutineDetail = {
  id: string; name: string; purpose: string; status: "active" | "paused" | "archived"; frequency: RoutineFrequency;
  customFrequencyNote: string | null;
  roomName: string | null; petName: string | null; ownerMemberId: string; ownerName: string;
  note: string | null; definitionOfDone: string; estimatedMinutes: number;
  sourceKind: "template" | "custom"; sourceTemplateKey: string | null; templateCustomised: boolean;
  rotationEnabled: boolean; steps: Array<{ id: string; label: string; displayOrder: number }>;
  rotationMembers: Array<{ memberId: string; displayName: string }>;
};

function RoutineEditor({ routine, members, canManage, close, saved }: {
  routine: RoutineDetail; members: DashboardMember[]; canManage: boolean; close: () => void;
  saved: (routine: RoutineDetail) => Promise<boolean>;
}) {
  const readOnly = !canManage || routine.status === "archived";
  const [form, setForm] = useState({
    name: routine.name, frequency: routine.frequency, ownerMemberId: routine.ownerMemberId,
    status: routine.status === "paused" ? "paused" : "active", note: routine.note || "",
    customFrequencyNote: routine.customFrequencyNote || ""
  });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [savedState, setSavedState] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSavedState(false);
    try {
      const result = await api<{ routine: RoutineDetail }>(`/api/household/systems/${routine.id}`,
        jsonInit("PATCH", form));
      setSavedState(true);
      if (!await saved(result.routine)) setError("Routine saved, but the library could not refresh. Saving again is not required.");
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="routine-editor dashboard-card">
    <button className="text-button" onClick={close}>← Routine library</button>
    <div className="routine-editor-heading"><div><p className="eyebrow">{readOnly ? "Household routine" : "Edit routine"}</p><h1>{routine.name}</h1>
      <p>{[routine.roomName, routine.petName].filter(Boolean).join(" · ") || "Whole household"}</p></div>
      <span className={`routine-status ${routine.status}`}>{routine.status}</span></div>
    {readOnly && <p className="soft-notice">{routine.status === "archived" ? "This archived routine is kept as household history."
      : "Your household role can view active routines but cannot change their structure."}</p>}
    <form onSubmit={submit}><fieldset className="friendly-edit-fields" disabled={readOnly || busy}>
      <label><span>Routine name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <div className="routine-edit-grid"><label><span>How often?</span><select value={form.frequency}
        onChange={(event) => setForm({ ...form, frequency: event.target.value as RoutineFrequency })}>
        {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label>
        {form.frequency === "custom" && <label><span>Custom timing</span><input value={form.customFrequencyNote}
          onChange={(event) => setForm({ ...form, customFrequencyNote: event.target.value })} /></label>}
        <label><span>Who usually handles it?</span><select value={form.ownerMemberId}
          onChange={(event) => setForm({ ...form, ownerMemberId: event.target.value })}>
          {members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>
        <label><span>Routine is</span><select value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "paused" })}>
          <option value="active">Active</option><option value="paused">Paused</option></select></label></div>
      <label><span>Optional short note</span><textarea value={form.note}
        onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
    </fieldset>
      <details className="checklist-disclosure"><summary>See what’s included</summary>
        <ol>{routine.steps.map((step) => <li key={step.id}>{step.label}</li>)}</ol>
        {routine.rotationEnabled && <p>Planned to rotate between {routine.rotationMembers.map(({ displayName }) => displayName).join(", ")}.</p>}
      </details>
      <details className="advanced-disclosure"><summary>Advanced details</summary>
        <dl><div><dt>Purpose</dt><dd>{routine.purpose}</dd></div><div><dt>Finished means</dt><dd>{routine.definitionOfDone}</dd></div>
          <div><dt>Estimated time</dt><dd>{routine.estimatedMinutes} minutes</dd></div>
          <div><dt>Source</dt><dd>{routine.sourceKind === "template" ? "Cradle recommendation" : "Custom household routine"}</dd></div></dl>
        <p>Technical scheduling and task generation are intentionally not active yet.</p>
      </details>
      {savedState && <p role="status" className="success-message">Routine saved.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!readOnly && <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>}
    </form>
  </section>;
}

export function SystemsLibrary({ navigate, signOut, addRoutine }: {
  navigate: (view: "dashboard" | "systems") => void; signOut: () => void; addRoutine: () => void;
}) {
  const [data, setData] = useState<LibraryData | null>(null); const [filter, setFilter] = useState<"active" | "paused" | "archived" | "all">("active");
  const [editing, setEditing] = useState<RoutineDetail | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async (status: "active" | "paused" | "archived" | "all"): Promise<boolean> => {
    setError(""); setLoading(true);
    try {
      setData(await api<LibraryData>(`/api/household/systems?status=${status}`)); return true;
    } catch (reason) { setError(failureMessage(reason)); return false; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load("active"); }, [load]);
  async function chooseFilter(status: typeof filter) { setFilter(status); await load(status); }
  async function edit(id: string) {
    setError("");
    try { const result = await api<{ routine: RoutineDetail }>(`/api/household/systems/${id}`); setEditing(result.routine); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  if (editing && data) return <div className="dashboard-shell"><Navigation active="systems" navigate={navigate} signOut={signOut} />
    <RoutineEditor routine={editing} members={data.members} canManage={data.canManage}
      close={() => setEditing(null)} saved={async (routine) => { setEditing(routine); return load(filter); }} /></div>;
  const grouped = new Map<string, RoutineSummary[]>();
  for (const routine of data?.routines || []) {
    const label = routine.roomName || routine.petName || "Whole household";
    grouped.set(label, [...(grouped.get(label) || []), routine]);
  }
  return <div className="dashboard-shell"><Navigation active="systems" navigate={navigate} signOut={signOut} />
    <section className="routine-library-hero"><div><p className="eyebrow">The way your home runs</p><h1>Household routines</h1>
      <p>Simple, reusable rhythms for your Rooms, Pets and people.</p></div>{data?.canManage && <button className="primary" onClick={addRoutine}>+ Add routine</button>}</section>
    <section className="routine-library dashboard-card">
      <div className="friendly-filters" aria-label="Routine filters">{(["active", "paused", "archived", "all"] as const).map((status) =>
        <button className={filter === status ? "primary" : ""} key={status} onClick={() => void chooseFilter(status)}>
          {status === "all" ? "All routines" : status[0].toUpperCase() + status.slice(1)}</button>)}</div>
      {loading && <p role="status">Loading household routines…</p>}
      {error && <div><p className="error" role="alert">{error}</p><button onClick={() => void load(filter)}>Retry</button></div>}
      {!loading && data && !data.routines.length && <div className="routine-empty"><span aria-hidden="true">☀</span>
        <h2>No {filter === "all" ? "" : filter} routines yet.</h2><p>Cradle can suggest a comfortable starting point from your Rooms and Pets.</p>
        {data.canManage && <button className="primary" onClick={addRoutine}>Choose routines</button>}</div>}
      {[...grouped].map(([context, routines]) => <section className="routine-context-group" key={context}><h2>{context}</h2>
        <div>{routines.map((routine) => <article className="routine-library-card" key={routine.id}>
          <div><span className={`routine-status ${routine.status}`}>{routine.status}</span><h3>{routine.name}</h3>
            <p>{frequencyLabel(routine.frequency)} · {routine.ownerName}</p>
            <small>{routine.stepCount} things included{routine.rotationEnabled ? " · rotates" : ""}</small></div>
          <button onClick={() => void edit(routine.id)}>{data?.canManage && routine.status !== "archived" ? "Edit" : "View"}</button>
        </article>)}</div></section>)}
    </section>
  </div>;
}
