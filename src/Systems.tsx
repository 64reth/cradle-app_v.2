import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ROUTINE_FREQUENCIES, frequencyLabel, type RoutineFrequency } from "../shared/routines";
import { api, failureMessage, jsonInit } from "./api";
import { Navigation, type AuthenticatedView, type DashboardMember, type RoutineSummary } from "./Dashboard";
import {
  ROUTINE_ASSIGNMENT_MODES, type RoutineAssignmentMode
} from "../shared/assignments";
import { MemberSelector } from "./MemberSelector";
import { CradleIcon } from "./components/ui/CradleIcon";
import { getRoomIconName } from "./iconMappings";
import { MotionPage } from "./motion";

type LibraryData = { routines: RoutineSummary[]; members: DashboardMember[]; canManage: boolean };
type RoutineDetail = {
  id: string; name: string; purpose: string; status: "active" | "paused" | "archived"; frequency: RoutineFrequency;
  customFrequencyNote: string | null;
  roomName: string | null; petName: string | null; ownerMemberId: string; ownerName: string;
  note: string | null; definitionOfDone: string; estimatedMinutes: number;
  sourceKind: "template" | "custom"; sourceTemplateKey: string | null; templateCustomised: boolean;
  rotationEnabled: boolean; assignmentMode: RoutineAssignmentMode; assignedMemberId: string | null;
  steps: Array<{ id: string; label: string; displayOrder: number }>;
  rotationMembers: Array<{ memberId: string; displayName: string }>;
};

function RoutineEditor({ routine, members, canManage, close, saved, removed }: {
  routine: RoutineDetail; members: DashboardMember[]; canManage: boolean; close: () => void;
  saved: (routine: RoutineDetail) => Promise<boolean>; removed: () => Promise<boolean>;
}) {
  const readOnly = !canManage || routine.status === "archived";
  const [form, setForm] = useState({
    name: routine.name, frequency: routine.frequency,
    assignedMemberId: routine.assignedMemberId || routine.ownerMemberId,
    status: routine.status === "paused" ? "paused" : "active", note: routine.note || "",
    customFrequencyNote: routine.customFrequencyNote || "",
    assignmentMode: routine.assignmentMode,
    participantMemberIds: routine.rotationMembers.map(({ memberId }) => memberId)
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
    <button className="text-button" onClick={close}><CradleIcon name="back" decorative /> Routines</button>
    <div className="routine-editor-heading"><div><p className="eyebrow">{readOnly ? "Household routine" : "Edit routine"}</p><h1>{routine.name}</h1>
      <p>{[routine.roomName, routine.petName].filter(Boolean).join(" · ") || "Whole household"}</p></div>
      <span className={`routine-status ${routine.status}`}>{routine.status}</span></div>
    {readOnly && <p className="soft-notice">{routine.status === "archived" ? "This archived routine is kept as household history."
      : "You can view active routines. Household leaders can make changes."}</p>}
    <form onSubmit={submit}><fieldset className="friendly-edit-fields" disabled={readOnly || busy}>
      <label><span>Routine name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <div className="routine-edit-grid"><label><span>How often?</span><select value={form.frequency}
        onChange={(event) => setForm({ ...form, frequency: event.target.value as RoutineFrequency })}>
        {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label>
        {form.frequency === "custom" && <label><span>Custom timing</span><input value={form.customFrequencyNote}
          onChange={(event) => setForm({ ...form, customFrequencyNote: event.target.value })} /></label>}
        <label><span>How is this shared?</span><select value={form.assignmentMode}
          onChange={(event) => setForm({ ...form, assignmentMode: event.target.value as RoutineAssignmentMode,
            participantMemberIds: ["rotation", "shared_team"].includes(event.target.value)
              ? form.participantMemberIds : [] })}>
          {ROUTINE_ASSIGNMENT_MODES.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}</select></label>
        {form.assignmentMode === "one_person" && <MemberSelector members={members} label="Who usually handles it?"
          value={form.assignedMemberId} onChange={(assignedMemberId) => setForm({ ...form, assignedMemberId })} />}
        <label><span>Routine is</span><select value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "paused" })}>
          <option value="active">Active</option><option value="paused">Paused</option></select></label></div>
      {(form.assignmentMode === "rotation" || form.assignmentMode === "shared_team") &&
        <MemberSelector members={members} multiple values={form.participantMemberIds}
          label={form.assignmentMode === "rotation" ? "Rotation participants" : "Shared team"}
          helperText={form.assignmentMode === "rotation"
            ? "One person takes each occurrence. Your saved order advances in turn."
            : "Everyone selected contributes to the same household mission."}
          onValuesChange={(participantMemberIds) => setForm({ ...form, participantMemberIds })} />}
      {form.assignmentMode === "decide_later" &&
        <p className="soft-notice">This Routine stays unassigned until your family chooses someone.</p>}
      <label><span>Optional short note</span><textarea value={form.note}
        onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
    </fieldset>
      <details className="checklist-disclosure"><summary>See what’s included</summary>
        <ol>{routine.steps.map((step) => <li key={step.id}>{step.label}</li>)}</ol>
        {routine.assignmentMode === "rotation" && <p>Planned to rotate between {
          routine.rotationMembers.map(({ displayName }) => displayName).join(", ")}.</p>}
        {routine.assignmentMode === "shared_team" && <p>Shared by {
          routine.rotationMembers.map(({ displayName }) => displayName).join(", ")}.</p>}
      </details>
      <details className="advanced-disclosure"><summary>More about this routine</summary>
        <dl><div><dt>Purpose</dt><dd>{routine.purpose}</dd></div><div><dt>Finished means</dt><dd>{routine.definitionOfDone}</dd></div>
          <div><dt>Estimated time</dt><dd>{routine.estimatedMinutes} minutes</dd></div>
          <div><dt>How it started</dt><dd>{routine.sourceKind === "template" ? "Cradle suggestion" : "Made by your household"}</dd></div></dl>
        <p>Today’s dated household missions are generated from this Routine.</p>
      </details>
      {savedState && <p role="status" className="success-message">Routine saved.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!readOnly && <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button className="danger-button" type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try {
            await api(`/api/household/systems/${routine.id}`, jsonInit("DELETE"));
            if (!await removed()) setError("Routine removed, but the library could not refresh. Removing it again is not required.");
          } catch (reason) { setError(failureMessage(reason)); }
          finally { setBusy(false); }
        }}>Remove routine</button></div>}
    </form>
  </section>;
}

export function SystemsLibrary({ navigate, signOut, addRoutine }: {
  navigate: (view: AuthenticatedView) => void; signOut: () => void; addRoutine: () => void;
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
    <MotionPage motionKey={`routine-${editing.id}`} className="motion-page"><RoutineEditor routine={editing} members={data.members} canManage={data.canManage}
      close={() => setEditing(null)} saved={async (routine) => { setEditing(routine); return load(filter); }}
      removed={async () => { setEditing(null); return load(filter); }} /></MotionPage></div>;
  const grouped = new Map<string, RoutineSummary[]>();
  for (const routine of data?.routines || []) {
    const label = routine.roomName || routine.petName || "Whole household";
    grouped.set(label, [...(grouped.get(label) || []), routine]);
  }
  return <div className="dashboard-shell"><Navigation active="systems" navigate={navigate} signOut={signOut} />
    <MotionPage motionKey="systems" className="motion-page">
    <section className="routine-library-hero"><div><p className="eyebrow">The way your home runs</p><h1>Routines</h1>
      <p>Cradle has made a sensible first draft from your Rooms and Pets. Review it, adjust it, or add something unique to your family.</p></div>
      {data?.canManage && <button className="primary" onClick={addRoutine}><CradleIcon name="add" size="sm" decorative /> Add a custom routine</button>}</section>
    <section className="routine-library dashboard-card">
      <div className="friendly-filters" aria-label="Routine filters">{(["active", "paused", "archived", "all"] as const).map((status) =>
        <button className={filter === status ? "primary" : ""} key={status} onClick={() => void chooseFilter(status)}>
          {status === "all" ? "All routines" : status[0].toUpperCase() + status.slice(1)}</button>)}</div>
      {loading && <p role="status">Loading household routines…</p>}
      {error && <div><p className="error" role="alert">{error}</p><button onClick={() => void load(filter)}>Retry</button></div>}
      {!loading && data && !data.routines.length && <div className="routine-empty"><span aria-hidden="true"><CradleIcon name="routine" size="lg" decorative /></span>
        <h2>No {filter === "all" ? "" : filter} routines yet.</h2><p>Cradle can suggest a comfortable starting point from your Rooms and Pets.</p>
        {data.canManage && <button className="primary" onClick={addRoutine}>Add a custom routine</button>}</div>}
      {[...grouped].map(([context, routines]) => <section className="routine-context-group" key={context}><h2><CradleIcon name={getRoomIconName(context)} size="md" decorative /> {context}</h2>
        <div>{routines.map((routine) => <article className="routine-library-card" key={routine.id}>
          <div><span className={`routine-status ${routine.status}`}>{routine.status}</span><h3>{routine.name}</h3>
            <p>{frequencyLabel(routine.frequency)} · {ROUTINE_ASSIGNMENT_MODES.find(({ value }) =>
              value === routine.assignmentMode)?.label}</p>
            <small>{routine.stepCount} things included</small></div>
          <button onClick={() => void edit(routine.id)}>{data?.canManage && routine.status !== "archived" ? "Edit" : "View"}</button>
        </article>)}</div></section>)}
    </section>
    </MotionPage></div>;
}
