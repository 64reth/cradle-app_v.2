import { type CSSProperties, FormEvent, useCallback, useEffect, useState } from "react";
import { PET_TYPES, type PetType } from "../shared/pets";
import { FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE, type CompanionPaletteKey } from "../shared/companion";
import { Companion, type CompanionConfig } from "./Companion";

type Role = "owner" | "parent_admin" | "adult" | "child";
type Step = "leadership" | "members" | "rooms" | "pets" | "companion" | "review" | "complete";
type Session = { household: { name: string; reference: string }; member: { displayName: string; reference: string; role: Role };
  expiresAt: string; setup: { status: "incomplete" | "complete"; step: Step } };
type Member = { displayName: string; profileReference: string; role: Role };
type Room = { id: string; name: string; description: string | null; displayOrder: number };
type Pet = { id: string; name: string; petType: PetType; breed: string | null; notes: string | null };
type Setup = { state: { status: "incomplete" | "complete"; step: Step }; canConfigure: boolean;
  household: { name: string; reference: string }; lead: { displayName: string; role: Role };
  members: Member[]; rooms: Room[]; pets: Pet[]; companion: (CompanionConfig & { id: string }) | null };
type Envelope<T> = { ok: true; data: T; requestId?: string } | { ok: false; error: { code?: string; message: string }; requestId?: string };
type View = "home" | "create" | "join" | "sign-in";
const developmentRuntimeHeader = "X-Cradle-Dev-Runtime-ID";
const developmentRuntimeStorageKey = "cradle-development-runtime-id";
const developmentAuthenticatedStorageKey = "cradle-development-authenticated";

class TransportError extends Error {}
class RuntimeChangedError extends Error {}
class ApiResponseError extends Error {
  constructor(message: string, public requestId?: string, public code?: string, public status?: number) { super(message); }
}
async function envelope<T>(path: string, init?: RequestInit): Promise<{ response: Response; body: Envelope<T> }> {
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin", ...init }); }
  catch { throw new TransportError("Cradle couldn’t connect"); }
  const runtimeId = response.headers.get(developmentRuntimeHeader);
  if (runtimeId && typeof window !== "undefined") {
    const previous = window.sessionStorage.getItem(developmentRuntimeStorageKey);
    window.sessionStorage.setItem(developmentRuntimeStorageKey, runtimeId);
    if (previous && previous !== runtimeId) {
      window.dispatchEvent(new Event("cradle-development-runtime-changed"));
      throw new RuntimeChangedError("Cradle has restarted during development.");
    }
  }
  try { return { response, body: await response.json() as Envelope<T> }; }
  catch { throw new ApiResponseError("Cradle received an invalid server response.", response.headers.get("X-Request-ID") || undefined, "INVALID_RESPONSE", response.status); }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { response, body } = await envelope<T>(path, init);
  if (!body.ok) throw new ApiResponseError(body.error.message, body.requestId, body.error.code, response.status);
  return body.data;
}
function failureMessage(reason: unknown): string {
  if (reason instanceof TransportError) return reason.message;
  if (reason instanceof ApiResponseError) return `${reason.message}${reason.requestId ? ` Request ID: ${reason.requestId}` : ""}`;
  return "Cradle could not complete the request.";
}
const jsonInit = (method: string, body: object = {}): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
function Field({ label, name, type = "text", defaultValue }: { label: string; name: string; type?: string; defaultValue?: string }) {
  return <label><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={!label.startsWith("Optional")} /></label>;
}
function ErrorMessage({ value }: { value: string }) { return value ? <p className="error" role="alert">{value}</p> : null; }

function PublicForm({ view, onDone, onBack, notice }: { view: Exclude<View, "home">; onDone: () => void; onBack: () => void; notice?: string }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const labels = { create: "Create your household", join: "Join a household", "sign-in": "Welcome back" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const endpoint = view === "create" ? "/api/auth/households" : view === "join" ? "/api/auth/join" : "/api/auth/sign-in";
    const body = view === "create" ? { householdName: values.householdName, displayName: values.displayName, pin: values.pin, pinConfirmation: values.pinConfirmation }
      : view === "join" ? { invitationCode: values.invitationCode, displayName: values.displayName, pin: values.pin, pinConfirmation: values.pinConfirmation }
        : { householdReference: values.householdReference, profileReference: values.profileReference, pin: values.pin };
    try { await api(endpoint, jsonInit("POST", body)); onDone(); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><button className="text-button" onClick={onBack}>← Back</button>
    <p className="eyebrow">Cradle membership</p><h1>{labels[view]}</h1><form onSubmit={submit}>
      {notice && <p role="status">{notice}</p>}{view === "create" && <Field label="Household name" name="householdName" />}
      {view === "join" && <Field label="Invitation code" name="invitationCode" />}
      {view === "sign-in" && <><Field label="Household reference" name="householdReference" /><Field label="Profile reference" name="profileReference" /></>}
      {view !== "sign-in" && <Field label={view === "create" ? "Owner display name" : "Display name"} name="displayName" />}
      <Field label="PIN (4–12 digits)" name="pin" type="password" />
      {view !== "sign-in" && <Field label="Confirm PIN" name="pinConfirmation" type="password" />}
      <ErrorMessage value={error} /><button className="primary" disabled={busy}>{busy ? "Working…" : labels[view]}</button>
    </form></section>;
}

function Progress({ step }: { step: Step }) {
  const stages = ["Leadership", "Members", "Rooms", "Pets", "Companion", "Review"];
  const active = Math.max(0, ["leadership", "members", "rooms", "pets", "companion", "review"].indexOf(step));
  return <ol className="progress" aria-label="Household setup progress">{stages.map((label, index) =>
    <li key={label} aria-current={index === active ? "step" : undefined} className={index <= active ? "reached" : ""}>{label}</li>)}</ol>;
}

function Leadership({ setup, advance }: { setup: Setup; advance: () => Promise<void> }) {
  return <section className="card stage"><p className="eyebrow">Household leadership</p><h1>Lead the system, not every task.</h1>
    <p><strong>{setup.lead.displayName}</strong> is the first Owner and household lead.</p>
    <ul><li>Make responsibilities and expectations visible.</li><li>Create and improve repeatable household Systems.</li>
      <li>Coordinate and distribute age-appropriate responsibility.</li><li>Review pressure points and guide continuous improvement.</li></ul>
    <p>You can continue with one leader. A Parent/Admin can join now or later.</p>
    <button className="primary" onClick={advance}>Confirm household leadership</button></section>;
}

function MembersStage({ setup, refresh, advance }: { setup: Setup; refresh: () => Promise<void>; advance: () => Promise<void> }) {
  const [code, setCode] = useState(""); const [error, setError] = useState("");
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setCode("");
    try { const role = new FormData(event.currentTarget).get("role"); const data = await api<{ code: string }>("/api/household/invitations", jsonInit("POST", { role })); setCode(data.code); await refresh(); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  return <section className="card stage"><p className="eyebrow">Household members</p><h1>Bring in your people.</h1>
    <p>Members may join with an invitation now or later. You do not need to wait for redemption.</p>
    <ul className="record-list">{setup.members.map((member) => <li key={member.profileReference}><strong>{member.displayName}</strong><span>{member.role.replace("_", " ")}</span></li>)}</ul>
    <form className="inline-form" onSubmit={invite}><label><span>Invitation role</span><select name="role">
      <option value="parent_admin">Parent / Admin</option><option value="adult">Adult</option><option value="child">Child</option>
    </select></label><button>Create invitation</button></form>
    {code && <p className="code" role="status">Record this one-use code: <strong>{code}</strong></p>}<ErrorMessage value={error} />
    <button className="primary" onClick={advance}>Continue to Rooms</button></section>;
}

function RoomsStage({ setup, refresh, advance }: { setup: Setup; refresh: () => Promise<void>; advance: () => Promise<void> }) {
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault(); setError(""); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try {
      await api(id ? `/api/household/rooms/${id}` : "/api/household/rooms", jsonInit(id ? "PATCH" : "POST", data));
      if (!id) form.reset();
    } catch (reason) { setError(failureMessage(reason)); return; }
    try { await refresh(); }
    catch (reason) { setError(`Room saved, but the view could not refresh. ${failureMessage(reason)}`); }
  }
  async function remove(id: string) { try { await api(`/api/household/rooms/${id}`, jsonInit("DELETE")); await refresh(); } catch (reason) { setError(failureMessage(reason)); } }
  async function move(index: number, delta: number) {
    const rooms = [...setup.rooms]; const next = index + delta; if (next < 0 || next >= rooms.length) return;
    [rooms[index], rooms[next]] = [rooms[next], rooms[index]];
    try { await api("/api/household/rooms/reorder", jsonInit("POST", { roomIds: rooms.map(({ id }) => id) })); await refresh(); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  return <section className="card stage"><p className="eyebrow">Rooms</p><h1>Map where household life happens.</h1>
    <p>Rooms become the operating areas for future household Systems. Add at least one.</p>
    <form className="inline-form" onSubmit={(event) => save(event)}><Field label="Room name" name="name" /><Field label="Optional description" name="description" />
      <button>Add Room</button></form><p className="suggestions">Suggestions: Kitchen · Living Room · Bathroom · Bedroom · Hallway · Garden</p>
    <div className="editable-list">{setup.rooms.map((room, index) => <form key={room.id} onSubmit={(event) => save(event, room.id)}>
      <Field label="Room name" name="name" defaultValue={room.name} /><Field label="Optional description" name="description" defaultValue={room.description || ""} />
      <div className="row-actions"><button>Save</button><button type="button" onClick={() => move(index, -1)} aria-label={`Move ${room.name} up`}>↑</button>
        <button type="button" onClick={() => move(index, 1)} aria-label={`Move ${room.name} down`}>↓</button>
        <button type="button" onClick={() => remove(room.id)}>Remove</button></div></form>)}</div>
    <ErrorMessage value={error} /><button className="primary" onClick={advance}>Continue to optional Pets</button></section>;
}

function PetsStage({ setup, refresh, advance }: { setup: Setup; refresh: () => Promise<void>; advance: () => Promise<void> }) {
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault(); setError(""); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try { await api(id ? `/api/household/pets/${id}` : "/api/household/pets", jsonInit(id ? "PATCH" : "POST", data)); form.reset(); await refresh(); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  async function remove(id: string) { try { await api(`/api/household/pets/${id}`, jsonInit("DELETE")); await refresh(); } catch (reason) { setError(failureMessage(reason)); } }
  const fields = (pet?: Pet) => <><Field label="Pet name" name="name" defaultValue={pet?.name} /><label><span>Pet type</span>
    <select name="petType" defaultValue={pet?.petType || "dog"}>{PET_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
    <Field label="Optional breed" name="breed" defaultValue={pet?.breed || ""} /><Field label="Optional notes" name="notes" defaultValue={pet?.notes || ""} /></>;
  return <section className="card stage"><p className="eyebrow">Pets · Optional</p><h1>Who else needs care?</h1>
    <p>Pets are household participants for care planning, not users. They never receive roles or login credentials.</p>
    <form className="pet-form" onSubmit={(event) => save(event)}>{fields()}<button>Add Pet</button></form>
    <div className="editable-list">{setup.pets.map((pet) => <form key={pet.id} onSubmit={(event) => save(event, pet.id)}>{fields(pet)}
      <div className="row-actions"><button>Save</button><button type="button" onClick={() => remove(pet.id)}>Remove</button></div></form>)}</div>
    <ErrorMessage value={error} /><button className="primary" onClick={advance}>{setup.pets.length ? "Review setup" : "Continue with no pets"}</button></section>;
}

function PaletteControl({ title, name, options, selected, onChange }: { title: string; name: string;
  options: readonly { key: CompanionPaletteKey; label: string; swatch: string }[]; selected: CompanionPaletteKey;
  onChange: (value: CompanionPaletteKey) => void }) {
  return <fieldset className="palette-group"><legend>{title}</legend><div className="palette-options">{options.map((option) =>
    <label className="palette-option" key={option.key}><input type="radio" name={name} value={option.key}
      checked={selected === option.key} onChange={() => onChange(option.key)} /><span>
        <i className="swatch" style={{ "--swatch": option.swatch } as CSSProperties} />{option.label}{selected === option.key ? " ✓" : ""}
      </span></label>)}</div></fieldset>;
}

function CompanionStage({ setup, refresh }: { setup: Setup; refresh: () => Promise<void> }) {
  const existing = setup.companion;
  const [config, setConfig] = useState<CompanionConfig>(existing || {
    name: "Cradle Cat", furPaletteKey: "orange", patchPrimaryPaletteKey: "cream",
    patchSecondaryPaletteKey: "white", expressionKey: "neutral"
  });
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<"editing" | "saved" | "completed">("editing");
  const [busy, setBusy] = useState(false);
  function edit(next: CompanionConfig) {
    setConfig(next);
    if (progress === "saved") setProgress("editing");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    let current = progress;
    try {
      if (current === "editing") {
        await api("/api/household/companion", jsonInit("PUT", config));
        current = "saved"; setProgress(current);
      }
      if (current === "saved") {
        await api("/api/household/setup/companion-complete", jsonInit("POST"));
        current = "completed"; setProgress(current);
      }
      await refresh();
    } catch (reason) {
      if (current === "completed") setError(`Companion saved and Review prepared, but the view could not refresh. ${failureMessage(reason)}`);
      else if (current === "saved") setError(`Companion saved, but Review could not open. ${failureMessage(reason)}`);
      else setError(failureMessage(reason));
    } finally { setBusy(false); }
  }
  return <section className="card stage"><p className="eyebrow">Household Companion</p><h1>Meet your shared Cradle Cat.</h1>
    <p>The Companion will later reflect household progress and status. Those reactions are not active yet.</p>
    <div className="companion-builder"><Companion config={config} /><form onSubmit={save}>
      <fieldset disabled={progress === "completed" || busy}>
        <label><span>Companion name</span><input name="name" value={config.name} required
          onChange={(event) => edit({ ...config, name: event.target.value })} /></label>
        <PaletteControl title="Fur colour" name="fur" options={FUR_PALETTE} selected={config.furPaletteKey}
          onChange={(furPaletteKey) => edit({ ...config, furPaletteKey })} />
        <PaletteControl title="Patch 1 colour" name="patchPrimary" options={PATCH_PRIMARY_PALETTE} selected={config.patchPrimaryPaletteKey}
          onChange={(patchPrimaryPaletteKey) => edit({ ...config, patchPrimaryPaletteKey })} />
        <PaletteControl title="Patch 2 colour" name="patchSecondary" options={PATCH_SECONDARY_PALETTE} selected={config.patchSecondaryPaletteKey}
          onChange={(patchSecondaryPaletteKey) => edit({ ...config, patchSecondaryPaletteKey })} />
      </fieldset>
      <ErrorMessage value={error} /><button className="primary" disabled={busy}>
        {busy ? "Working…" : progress === "completed" ? "Retry opening Review" : progress === "saved" ? "Continue to Review" : "Save Companion and review setup"}
      </button>
    </form></div></section>;
}

function Review({ setup, complete }: { setup: Setup; complete: () => Promise<void> }) {
  return <section className="card stage"><p className="eyebrow">Review setup</p><h1>Your household foundation.</h1>
    <div className="review-grid"><div><h2>Household</h2><p>{setup.household.name}</p></div><div><h2>Lead</h2><p>{setup.lead.displayName}</p></div>
      <div><h2>Members</h2><p>{setup.members.map(({ displayName }) => displayName).join(", ")}</p></div>
      <div><h2>Rooms</h2><ol>{setup.rooms.map(({ id, name }) => <li key={id}>{name}</li>)}</ol></div>
      {setup.pets.length > 0 && <div><h2>Pets</h2><ul>{setup.pets.map((pet) => <li key={pet.id}>{pet.name} · {PET_TYPES.find(({ value }) => value === pet.petType)?.label}</li>)}</ul></div>}</div>
    {setup.companion && <div><h2>Companion</h2><Companion config={setup.companion} /><p>{setup.companion.name} · Fur: {FUR_PALETTE.find(({ key }) => key === setup.companion?.furPaletteKey)?.label}
      {" · "}Patch 1: {PATCH_PRIMARY_PALETTE.find(({ key }) => key === setup.companion?.patchPrimaryPaletteKey)?.label}
      {" · "}Patch 2: {PATCH_SECONDARY_PALETTE.find(({ key }) => key === setup.companion?.patchSecondaryPaletteKey)?.label}</p></div>}
    <p>Rooms provide operating areas. Later, Household Systems will document repeatable processes; scheduling and delegation will turn them into shared work. Today’s Mission and Weekly Review will support attention and improvement.</p>
    <button className="primary" onClick={complete}>Complete household setup</button></section>;
}

function HouseholdHome({ session, setup, signOut }: { session: Session; setup: Setup; signOut: () => Promise<void> }) {
  return <div className="landing"><header className="card household-header"><div><p className="eyebrow">Household home</p><h1>{session.household.name}</h1>
    <p>Signed in as <strong>{session.member.displayName}</strong> · {session.member.role.replace("_", " ")}</p></div><button onClick={signOut}>Sign out</button></header>
    <section className="card"><h2>Rooms</h2><ul className="record-list">{setup.rooms.map((room) => <li key={room.id}>{room.name}</li>)}</ul></section>
    {setup.pets.length > 0 && <section className="card"><h2>Pets</h2><ul className="record-list">{setup.pets.map((pet) => <li key={pet.id}>{pet.name}</li>)}</ul></section>}
    {setup.companion && <section className="card"><h2>{setup.companion.name}</h2><Companion config={{ ...setup.companion, expressionKey: "neutral" }} />
      <p>Your neutral household Companion. Progress reactions arrive later.</p></section>}
    <aside className="card placeholder"><h2>The household foundation is ready.</h2><p>Systems, schedules, pet-care responsibilities, tasks, Today’s Mission and Weekly Review arrive later.</p></aside></div>;
}

export function App() {
  const [view, setView] = useState<View>("home"); const [state, setState] = useState<"loading" | "public" | "ready" | "network" | "problem" | "restarted">("loading");
  const [session, setSession] = useState<Session | null>(null); const [setup, setSetup] = useState<Setup | null>(null); const [error, setError] = useState("");
  const [developmentResetNotice, setDevelopmentResetNotice] = useState("");
  const clearDevelopmentSession = useCallback(() => {
    window.sessionStorage.removeItem(developmentAuthenticatedStorageKey);
    setSession(null); setSetup(null);
  }, []);
  useEffect(() => {
    const handleRuntimeChange = () => { clearDevelopmentSession(); setState("restarted"); };
    window.addEventListener("cradle-development-runtime-changed", handleRuntimeChange);
    return () => window.removeEventListener("cradle-development-runtime-changed", handleRuntimeChange);
  }, [clearDevelopmentSession]);
  const load = useCallback(async () => {
    setState("loading"); setError("");
    try {
      const { response, body } = await envelope<Session>("/api/auth/session");
      if (response.status === 401) {
        const wasAuthenticated = response.headers.has(developmentRuntimeHeader) && window.sessionStorage.getItem(developmentAuthenticatedStorageKey) === "true";
        clearDevelopmentSession();
        if (wasAuthenticated) {
          setDevelopmentResetNotice("The local development database has been reset. Create a new household to continue.");
          setView("create");
        }
        setState("public"); return;
      }
      if (!body.ok) throw new ApiResponseError(body.error.message, body.requestId, body.error.code, response.status);
      window.sessionStorage.setItem(developmentAuthenticatedStorageKey, "true");
      const setupData = await api<Setup>("/api/household/setup"); setSession(body.data); setSetup(setupData); setDevelopmentResetNotice(""); setState("ready");
    } catch (reason) {
      if (reason instanceof RuntimeChangedError) { clearDevelopmentSession(); setState("restarted"); return; }
      setError(failureMessage(reason));
      setState(reason instanceof TransportError ? "network" : "problem");
    }
  }, [clearDevelopmentSession]);
  useEffect(() => { void load(); }, [load]);
  const refreshSetup = useCallback(async () => { setSetup(await api<Setup>("/api/household/setup")); }, []);
  async function transition(path: string) { setError(""); try { await api(path, jsonInit(path.endsWith("leadership") ? "PATCH" : "POST")); await load(); } catch (reason) { setError(failureMessage(reason)); } }
  async function signOut() { try { await api("/api/auth/sign-out", jsonInit("POST")); } finally { clearDevelopmentSession(); setState("public"); setView("home"); } }
  if (state === "loading") return <main className="app-shell"><p className="loading" role="status">Opening Cradle…</p></main>;
  if (state === "restarted") return <main className="app-shell"><section className="card stage"><h1>Cradle has restarted during development.</h1><p>Reload to connect this page to the current local runtime.</p><button className="primary" onClick={() => window.location.reload()}>Reload</button></section></main>;
  if (state === "network") return <main className="app-shell"><section className="card"><h1>Cradle couldn’t connect.</h1><button className="primary" onClick={load}>Retry</button></section></main>;
  if (state === "problem") return <main className="app-shell"><section className="card stage"><h1>Cradle couldn’t load this household.</h1><ErrorMessage value={error} />
    <button className="primary" onClick={load}>Retry with a fresh request</button></section></main>;
  if (state === "ready" && session && setup) {
    if (setup.state.status === "complete") return <main className="app-shell"><HouseholdHome session={session} setup={setup} signOut={signOut} /></main>;
    if (!setup.canConfigure) return <main className="app-shell"><section className="card stage"><p className="eyebrow">Setup in progress</p><h1>Your household lead is setting things up.</h1>
      <p>You can return when the Owner has completed the household foundation.</p><button onClick={signOut}>Sign out</button></section></main>;
    return <main className="app-shell"><Progress step={setup.state.step} /><ErrorMessage value={error} />
      {setup.state.step === "leadership" && <Leadership setup={setup} advance={() => transition("/api/household/setup/leadership")} />}
      {setup.state.step === "members" && <MembersStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/members-complete")} />}
      {setup.state.step === "rooms" && <RoomsStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/rooms-complete")} />}
      {setup.state.step === "pets" && <PetsStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/pets-complete")} />}
      {setup.state.step === "companion" && <CompanionStage setup={setup} refresh={refreshSetup} />}
      {setup.state.step === "review" && <Review setup={setup} complete={() => transition("/api/household/setup/complete")} />}</main>;
  }
  if (view !== "home") return <main className="app-shell"><PublicForm view={view} onDone={load} onBack={() => setView("home")} notice={developmentResetNotice} /></main>;
  return <main className="app-shell"><section className="hero-panel"><p className="eyebrow">Cradle</p><h1>A shared home starts here.</h1>
    <p>Create a household, join your people, or return to your profile.</p><div className="entry-actions">
      <button className="primary" onClick={() => setView("create")}>Create Household</button><button onClick={() => setView("join")}>Join Household</button>
      <button onClick={() => setView("sign-in")}>Sign In</button></div></section></main>;
}
