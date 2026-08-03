import { FormEvent, useCallback, useEffect, useState } from "react";
import { PET_TYPES, type PetType } from "../shared/pets";
import { ROOM_TYPES, type RoomType } from "../shared/routines";
import {
  api, ApiResponseError, developmentAuthenticatedStorageKey, developmentRuntimeHeader, envelope,
  failureMessage, jsonInit, RuntimeChangedError, TransportError
} from "./api";
import { SystemsLibrary } from "./Systems";
import { Dashboard, type AuthenticatedView, type DashboardData } from "./Dashboard";
import { PersonalArea } from "./PersonalArea";
import { InvitationPage } from "./Invitation";
import {
  MEMBER_ACCESS_LEVELS, MEMBER_AGE_BANDS, accessLevelLabel, ageBandLabel,
  lifecycleLabel, type MemberLifecycleState
} from "../shared/members";
import { HouseholdCalendar } from "./Calendar";
import { Meals } from "./Meals";
import { Together } from "./Together";
import { AvatarCreator } from "./AvatarCreator";
import { FamilyAvatar } from "./FamilyAvatar";
import { memberAvatar, type MemberAvatar } from "../shared/member-avatar";
import { MemberSelector } from "./MemberSelector";
import { CradleIcon } from "./components/ui/CradleIcon";
import { AlphaFeedback } from "./AlphaFeedback";
import { trackAlphaEvent } from "./alphaDiagnostics";
import { SupabaseAuthActions } from "./SupabaseAuthActions";
import { completeSupabaseOAuth, hasSupabaseOAuthCallback, takeSupabaseInvite } from "./supabaseAuth";
import { Operations } from "./Operations";

type Role = "owner" | "parent_admin" | "adult" | "child";
type Step = "leadership" | "members" | "companion" | "rooms" | "pets" | "review" | "complete";
type Session = { household: { name: string; reference: string }; member: { displayName: string; reference: string; role: Role };
  expiresAt: string; setup: { status: "incomplete" | "complete"; step: Step } };
type Member = { id: string; displayName: string; profileReference: string; role: Role;
  lifecycleState?: string; accessLevel?: string; ageBand?: string; hasAccount?: number;
  avatarId?: string | null; avatarFurPaletteKey?: MemberAvatar["furPaletteKey"] | null;
  avatarPatchPrimaryPaletteKey?: MemberAvatar["patchPrimaryPaletteKey"] | null;
  avatarPatchSecondaryPaletteKey?: MemberAvatar["patchSecondaryPaletteKey"] | null;
  avatarExpressionKey?: MemberAvatar["expressionKey"] | null };
type Room = { id: string; name: string; roomType: RoomType; description: string | null; displayOrder: number;
  occupantMemberIds: string[] };
type Pet = { id: string; name: string; petType: PetType; breed: string | null; notes: string | null };
type Setup = { state: { status: "incomplete" | "complete"; step: Step }; canConfigure: boolean;
  household: { name: string; reference: string }; lead: { displayName: string; role: Role };
  members: Member[]; rooms: Room[]; pets: Pet[] };
type View = "home" | "create" | "join" | "sign-in";
const viewFromPath = (path: string): AuthenticatedView =>
  path === "/routines" || path === "/systems" ? "systems" :
      path === "/schedule" || path === "/calendar" ? "calendar" :
      path === "/meals" ? "meals" :
      path === "/together" ? "together" :
      (path === "/operations" || path === "/operations/health") ? "operations" :
      path === "/me" ? "me" : "dashboard";
const pathForView = (view: AuthenticatedView) =>
  view === "systems" ? "/routines" : view === "calendar" ? "/schedule" : `/${view}`;
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
    if (view === "join") {
      const reference = String(values.invitationCode || "").trim();
      if (!reference) { setError("Enter the private invitation link or joining code."); setBusy(false); return; }
      const value = reference.includes("/invite/") ? reference.split("/invite/").pop() || "" : reference;
      window.history.pushState({}, "", `/invite/${encodeURIComponent(value)}`);
      onDone(); setBusy(false); return;
    }
    const endpoint = view === "create" ? "/api/auth/households" : "/api/auth/sign-in";
    const body = view === "create" ? { householdName: values.householdName, displayName: values.displayName }
      : { householdReference: values.householdReference, profileReference: values.profileReference, pin: values.pin };
    try { await api(endpoint, jsonInit("POST", body)); onDone(); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><button className="text-button" onClick={onBack}><CradleIcon name="back" decorative /> Back</button>
    <p className="eyebrow">Welcome to Cradle</p><h1>{labels[view]}</h1><form onSubmit={submit}>
      {notice && <p role="status">{notice}</p>}{view === "create" && <Field label="Household name" name="householdName" />}
      {view === "join" && <Field label="Private invite link or joining code" name="invitationCode" />}
      {view === "sign-in" && <><Field label="Household reference" name="householdReference" /><Field label="Family member reference" name="profileReference" /></>}
      {view === "create" && <Field label="Owner display name" name="displayName" />}
      {view === "sign-in" && <Field label="PIN (4–12 digits)" name="pin" type="password" />}
      <ErrorMessage value={error} /><button className="primary" disabled={busy}>{busy ? "Working…" : labels[view]}</button>
    </form>{(view === "create" || view === "sign-in") && <SupabaseAuthActions onComplete={onDone} />}</section>;
}

function Progress({ step }: { step: Step }) {
  const stages = ["Leadership", "Family", "Your cat", "Rooms", "Pets", "Review"];
  const active = Math.max(0, ["leadership", "members", "companion", "rooms", "pets", "review"].indexOf(step));
  return <ol className="progress" aria-label="Household setup progress">{stages.map((label, index) =>
    <li key={label} aria-current={index === active ? "step" : undefined} className={index <= active ? "reached" : ""}>{label}</li>)}</ol>;
}

function Leadership({ setup, advance }: { setup: Setup; advance: () => Promise<void> }) {
  return <section className="card stage"><p className="eyebrow">Household leadership</p><h1>Guide the household, not every task.</h1>
    <p><strong>{setup.lead.displayName}</strong> is the first Owner and household lead.</p>
    <ul><li>Make responsibilities and expectations visible.</li><li>Create and improve helpful household routines.</li>
      <li>Share age-appropriate responsibility.</li><li>Notice pressure points and help family life run more smoothly.</li></ul>
    <p>You can continue with one leader. A Parent/Admin can join now or later.</p>
    <button className="primary" onClick={advance}>Confirm household leadership</button></section>;
}

function MembersStage({ setup, refresh, advance }: { setup: Setup; refresh: () => Promise<void>; advance: () => Promise<void> }) {
  const [invite, setInvite] = useState<{ inviteUrl: string; code: string } | null>(null);
  const [added, setAdded] = useState<Member | null>(null); const [memberKey, setMemberKey] = useState(() => crypto.randomUUID());
  const [accessLevel, setAccessLevel] = useState("household_member");
  const [error, setError] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    try {
      const data = await api<{ member: Member }>("/api/household/members", jsonInit("POST", {
        displayName: form.get("displayName"), accessLevel: form.get("accessLevel"),
        ageBand: form.get("ageBand"), clientKey: memberKey
      }));
      setAdded(data.member); await refresh();
    }
    catch (reason) { setError(failureMessage(reason)); }
  }
  async function inviteAdded() {
    if (!added) return; setError("");
    try {
      const result = await api<{ invite: { inviteUrl: string; code: string } }>("/api/household/invites",
        jsonInit("POST", { targetMemberId: added.id, expiry: "7_days" }));
      setInvite(result.invite); await refresh();
    } catch (reason) { setError(failureMessage(reason)); }
  }
  return <section className="card stage"><p className="eyebrow">Family</p><h1>Bring in your people.</h1>
    <p>Add family members now. You can invite them straight away or whenever the time feels right.</p>
    <ul className="record-list">{setup.members.map((member) => <li key={member.id}><strong>{member.displayName}</strong>
      <span>{accessLevelLabel(member.accessLevel || "household_member")}{member.lifecycleState
        ? ` · ${lifecycleLabel(member.lifecycleState as MemberLifecycleState)}` : ""}</span></li>)}</ul>
    {!added && <form className="member-onboarding-form" onSubmit={add}><Field label="Name" name="displayName" />
      <fieldset className="access-level-fieldset" aria-describedby="onboarding-access-level-help"><legend>What can this person manage?</legend>
        <small className="fieldset-helper" id="onboarding-access-level-help">This controls what they can change in Cradle.</small>
        {MEMBER_ACCESS_LEVELS.map((choice) => <label className={`choice-description ${accessLevel === choice.value ? "selected" : ""}`} key={choice.value}>
          <input type="radio" name="accessLevel" value={choice.value} checked={accessLevel === choice.value}
            onChange={() => setAccessLevel(choice.value)} />
          <span><strong>{choice.label}</strong><small>{choice.description}</small></span></label>)}</fieldset>
      <label><span>What age group are they in?</span><select name="ageBand">{MEMBER_AGE_BANDS.map((group) =>
        <option value={group.value} key={group.value}>{group.label}</option>)}</select>
        <small>Age group helps Cradle suggest suitable household work and display age-appropriate controls.</small></label>
      <div className="row-actions"><button>Add family member</button><button type="button" className="primary" onClick={advance}>Skip and create your cat</button></div></form>}
    {added && !invite && <div className="success-card" role="status"><h2>{added.displayName} has been added.</h2>
      <div className="row-actions">{added.accessLevel !== "managed_member" && <button onClick={() => void inviteAdded()}>Invite now</button>}
        <button onClick={() => { setAdded(null); setMemberKey(crypto.randomUUID()); }}>Add another</button>
        <button onClick={advance}>Invite later and create your cat</button></div></div>}
    {invite && <div className="success-card" role="status"><h2>Invitation ready.</h2><p className="break-value">{invite.inviteUrl}</p>
      <p className="code">Joining code: <strong>{invite.code}</strong></p><div className="row-actions">
        <button onClick={() => void navigator.clipboard.writeText(invite.inviteUrl)}>Copy link</button>
        <button onClick={() => void navigator.clipboard.writeText(invite.code)}>Copy code</button>
        <button onClick={() => { setAdded(null); setInvite(null); setMemberKey(crypto.randomUUID()); }}>Add another</button>
        <button className="primary" onClick={advance}>Done — create your cat</button></div></div>}
    <ErrorMessage value={error} /></section>;
}

function AvatarStage({ setup, onSave }: { setup: Setup; onSave: (avatar: MemberAvatar) => Promise<void> }) {
  const owner = setup.members.find(({ role }) => role === "owner") || setup.members[0];
  const initialAvatar = owner ? memberAvatar({
    furPaletteKey: owner.avatarFurPaletteKey || undefined,
    patchPrimaryPaletteKey: owner.avatarPatchPrimaryPaletteKey || undefined,
    patchSecondaryPaletteKey: owner.avatarPatchSecondaryPaletteKey || undefined,
    expressionKey: owner.avatarExpressionKey || undefined
  }) : undefined;
  return <section className="card stage avatar-onboarding-stage">
    <AvatarCreator name={owner?.displayName || setup.lead.displayName} initialAvatar={initialAvatar}
      title="Create your cat." submitLabel="Save my cat and continue" onSave={onSave} />
  </section>;
}

function RoomsStage({ setup, refresh, advance }: { setup: Setup; refresh: () => Promise<void>; advance: () => Promise<void> }) {
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault(); setError(""); const form = event.currentTarget; const values = new FormData(form);
    const data = { name: values.get("name"), roomType: values.get("roomType"),
      description: values.get("description"), occupantMemberIds: values.getAll("occupantMemberIds") };
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
  const roomType = (value?: RoomType) => <label><span>Room type</span><select name="roomType" defaultValue={value || "kitchen"}>
    {ROOM_TYPES.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label>;
  const roomOccupants = (selected: string[] = []) => <MemberSelector members={setup.members}
    label="Who uses this room? (Optional)" multiple name="occupantMemberIds" defaultValues={selected} />;
  return <section className="card stage"><p className="eyebrow"><CradleIcon name="room" size="sm" decorative /> Rooms</p><h1>Map where household life happens.</h1>
    <p>Room types help Cradle suggest a sensible starting routine. Add at least one.</p>
    <form className="inline-form" onSubmit={(event) => save(event)}><Field label="Room name" name="name" />{roomType()}<Field label="Optional description" name="description" />
      {roomOccupants()}
      <button>Add Room</button></form><p className="suggestions">Suggestions: Kitchen · Living Room · Bathroom · Bedroom · Hallway · Garden</p>
    <div className="editable-list">{setup.rooms.map((room, index) => <form key={room.id} onSubmit={(event) => save(event, room.id)}>
      <Field label="Room name" name="name" defaultValue={room.name} />{roomType(room.roomType)}
      <Field label="Optional description" name="description" defaultValue={room.description || ""} />
      {roomOccupants(room.occupantMemberIds)}
      <div className="row-actions"><button>Save</button><button type="button" onClick={() => move(index, -1)} aria-label={`Move ${room.name} up`}><CradleIcon name="back" decorative /></button>
        <button type="button" onClick={() => move(index, 1)} aria-label={`Move ${room.name} down`}><CradleIcon name="forward" decorative /></button>
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
  return <section className="card stage"><p className="eyebrow"><CradleIcon name="pet" size="sm" decorative /> Pets · Optional</p><h1>Who else needs care?</h1>
    <p>Add pets so future routines can include their care. Pets do not sign in to Cradle.</p>
    <form className="pet-form" onSubmit={(event) => save(event)}>{fields()}<button>Add Pet</button></form>
    <div className="editable-list">{setup.pets.map((pet) => <form key={pet.id} onSubmit={(event) => save(event, pet.id)}>{fields(pet)}
      <div className="row-actions"><button>Save</button><button type="button" onClick={() => remove(pet.id)}>Remove</button></div></form>)}</div>
    <ErrorMessage value={error} /><button className="primary" onClick={advance}>{setup.pets.length ? "Review setup" : "Continue with no pets"}</button></section>;
}

function Review({ setup, complete }: { setup: Setup; complete: () => Promise<void> }) {
  const owner = setup.members.find(({ role }) => role === "owner");
  return <section className="card stage"><p className="eyebrow">Review setup</p><h1>Your household foundation.</h1>
    <div className="review-grid"><div><h2>Household</h2><p>{setup.household.name}</p></div><div><h2>Lead</h2><p>{setup.lead.displayName}</p></div>
      {owner?.avatarId && <div><h2>Your cat</h2><FamilyAvatar name={owner.displayName} avatar={memberAvatar({
        furPaletteKey: owner.avatarFurPaletteKey || undefined,
        patchPrimaryPaletteKey: owner.avatarPatchPrimaryPaletteKey || undefined,
        patchSecondaryPaletteKey: owner.avatarPatchSecondaryPaletteKey || undefined,
        expressionKey: owner.avatarExpressionKey || undefined
      })} /></div>}
      <div><h2>Family</h2><ul>{setup.members.map((member) => <li key={member.id}>{member.displayName} · {
        accessLevelLabel(member.accessLevel || "household_member")} · {ageBandLabel(member.ageBand || "adult")}</li>)}</ul></div>
      <div><h2>Rooms</h2><ol>{setup.rooms.map(({ id, name }) => <li key={id}>{name}</li>)}</ol></div>
      {setup.pets.length > 0 && <div><h2>Pets</h2><ul>{setup.pets.map((pet) => <li key={pet.id}>{pet.name} · {PET_TYPES.find(({ value }) => value === pet.petType)?.label}</li>)}</ul></div>}</div>
    <p>Rooms, Pets and Family help Cradle suggest routines that fit your home. Today’s Mission will stay honest until daily planning is ready.</p>
    <button className="primary" onClick={complete}>Complete household setup</button></section>;
}

export function App() {
  const invitationReference = window.location.pathname.startsWith("/invite/")
    ? decodeURIComponent(window.location.pathname.slice("/invite/".length)) : "";
  const [view, setView] = useState<View>("home"); const [state, setState] = useState<"loading" | "public" | "ready" | "network" | "problem" | "restarted">("loading");
  const [session, setSession] = useState<Session | null>(null); const [setup, setSetup] = useState<Setup | null>(null); const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [householdView, setHouseholdView] = useState<AuthenticatedView>(() => viewFromPath(window.location.pathname));
  const [dashboardSetupRequested, setDashboardSetupRequested] = useState(false);
  const [dashboardFamilyRequested, setDashboardFamilyRequested] = useState(false);
  const [suggestionRequested, setSuggestionRequested] = useState(false);
  const [personalMemberId, setPersonalMemberId] = useState<string | undefined>();
  const [developmentResetNotice, setDevelopmentResetNotice] = useState("");
  const clearDevelopmentSession = useCallback(() => {
    window.sessionStorage.removeItem(developmentAuthenticatedStorageKey);
    setSession(null); setSetup(null); setDashboard(null);
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
        const hadSession = window.sessionStorage.getItem(developmentAuthenticatedStorageKey) === "true";
        const developmentReset = response.headers.has(developmentRuntimeHeader) && hadSession;
        clearDevelopmentSession();
        if (developmentReset) {
          setDevelopmentResetNotice("The local development database has been reset. Create a new household to continue.");
          setView("create");
        } else if (hadSession) {
          setDevelopmentResetNotice("Your session has expired. Sign in again to continue safely.");
          setView("sign-in");
        }
        setState("public"); return;
      }
      if (!body.ok) throw new ApiResponseError(body.error.message, body.requestId, body.error.code, response.status);
      window.sessionStorage.setItem(developmentAuthenticatedStorageKey, "true"); setSession(body.data);
      if (body.data.setup.status === "complete") {
        const dashboardData = await api<DashboardData>("/api/dashboard");
        setDashboard(dashboardData); setSetup(null);
        const route = viewFromPath(window.location.pathname);
        setHouseholdView(route);
        if (window.location.pathname !== pathForView(route)) window.history.replaceState({}, "", pathForView(route));
      } else {
        const setupData = await api<Setup>("/api/household/setup"); setSetup(setupData); setDashboard(null);
      }
      setDevelopmentResetNotice(""); setState("ready");
    } catch (reason) {
      if (reason instanceof RuntimeChangedError) { clearDevelopmentSession(); setState("restarted"); return; }
      setError(failureMessage(reason));
      setState(reason instanceof TransportError ? "network" : "problem");
    }
  }, [clearDevelopmentSession]);
  useEffect(() => {
    const isOAuthCallback = hasSupabaseOAuthCallback();
    let cancelled = false;
    if (isOAuthCallback) {
      // Do not race the provider exchange with /api/auth/session. A fresh
      // provider identity has no household session until it creates or joins
      // a household, so the early 401 is expected but misleading.
      setState("loading");
      void completeSupabaseOAuth().then((result) => {
        if (cancelled || !result) return;
        const pendingInvite = takeSupabaseInvite();
        if (pendingInvite) {
          window.history.replaceState({}, "", `/invite/${encodeURIComponent(pendingInvite)}`);
          setState("public");
          return;
        }
        window.history.replaceState({}, "", "/");
        if (result.householdCount === 0) {
          setDevelopmentResetNotice("Your account is ready. Create your household to continue.");
          setView("create"); setState("public");
        } else {
          void load();
        }
      }).catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "That sign-in could not be completed.");
        setState(reason instanceof TransportError ? "network" : "problem");
      });
    } else {
      void load();
    }
    return () => { cancelled = true; };
  }, [load]);
  useEffect(() => {
    const pop = () => setHouseholdView(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (state === "ready") {
      const view = viewFromPath(window.location.pathname);
      const screen = !dashboard ? "onboarding" : view === "systems" ? "routines" : view === "calendar" ? "schedule" : view === "me" ? "my_cradle" : view === "operations" ? "unknown" : view;
      trackAlphaEvent({ name: "screen_viewed", screen });
    }
  }, [dashboard, householdView, state]);
  const refreshSetup = useCallback(async () => { setSetup(await api<Setup>("/api/household/setup")); }, []);
  const navigateHousehold = useCallback((next: AuthenticatedView) => {
    if (next !== "me") setPersonalMemberId(undefined);
    setHouseholdView(next); window.history.pushState({}, "", pathForView(next));
  }, []);
  async function transition(path: string) { setError(""); try { await api(path, jsonInit(path.endsWith("leadership") ? "PATCH" : "POST")); await load(); } catch (reason) { setError(failureMessage(reason)); } }
  async function saveSetupAvatar(avatar: MemberAvatar) {
    await api("/api/me/avatar", jsonInit("PUT", avatar));
    await api("/api/household/setup/avatar-complete", jsonInit("POST"));
    await load();
  }
  async function signOut() { try { await api("/api/auth/sign-out", jsonInit("POST")); } finally {
    clearDevelopmentSession(); setState("public"); setView("home"); setHouseholdView("dashboard");
    window.history.replaceState({}, "", "/");
  } }
  if (invitationReference) return <InvitationPage reference={invitationReference}
    accepted={async () => { window.history.replaceState({}, "", "/dashboard"); await load(); }}
    goHome={() => { window.history.replaceState({}, "", "/"); setView("home"); void load(); }} />;
  if (state === "loading") return <main className="app-shell"><p className="loading" role="status">Opening Cradle…</p>
    <button onClick={() => { setState("public"); setView("home"); }}>Return home</button></main>;
  if (state === "restarted") return <main className="app-shell"><section className="card stage"><h1>Cradle has restarted during development.</h1><p>Reload to connect this page to the current local runtime.</p><button className="primary" onClick={() => window.location.reload()}>Reload</button></section></main>;
  if (state === "network") return <main className="app-shell"><section className="card"><h1>Cradle couldn’t connect.</h1><p>Your work on the current form is still here.</p>
    <div className="row-actions"><button className="primary" onClick={load}>Retry</button><button onClick={() => { clearDevelopmentSession(); setState("public"); setView("sign-in"); }}>Return to sign in</button></div></section></main>;
  if (state === "problem") return <main className="app-shell"><section className="card stage"><h1>Cradle couldn’t load this household.</h1><ErrorMessage value={error} />
    <div className="row-actions"><button className="primary" onClick={load}>Retry with a fresh request</button>
      <button onClick={() => { clearDevelopmentSession(); setState("public"); setView("sign-in"); }}>Return to sign in</button></div></section></main>;
  if (state === "ready" && session && dashboard) {
    const currentMember = dashboard.members.find(({ id }) => id === dashboard.currentUser.id);
    if (!currentMember?.avatarId) return <main className="app-shell"><AlphaFeedback screen="onboarding" /><section className="card stage avatar-onboarding-stage">
      <AvatarCreator name={currentMember?.preferredName || currentMember?.displayName || dashboard.currentUser.displayName}
        title={`Welcome, ${currentMember?.preferredName || currentMember?.displayName || dashboard.currentUser.displayName}.`}
        description="Before you continue, make a cat that feels like you. You can change it later in My Cradle."
        submitLabel="Save my cat and continue" onSave={async (avatar) => {
          await api("/api/me/avatar", jsonInit("PUT", avatar));
          setDashboard(await api<DashboardData>("/api/dashboard"));
        }} />
      <button onClick={() => void signOut()}>Save for later and sign out</button>
    </section></main>;
    const feedbackScreen = householdView === "systems" ? "routines" : householdView === "calendar" ? "schedule" : householdView === "meals" ? "meals" : householdView === "together" ? "together" : householdView === "me" ? "my_cradle" : "dashboard";
    return <main className="dashboard-app"><AlphaFeedback screen={feedbackScreen} />{householdView === "systems"
      ? <SystemsLibrary navigate={navigateHousehold} signOut={() => void signOut()}
        addRoutine={() => { setDashboardSetupRequested(true); navigateHousehold("dashboard"); }} />
      : householdView === "calendar" ? <HouseholdCalendar dashboard={dashboard} navigate={navigateHousehold}
        signOut={() => void signOut()} onDashboardChanged={setDashboard} />
      : householdView === "meals" ? <Meals navigate={navigateHousehold} signOut={() => void signOut()} />
      : householdView === "together" ? <Together navigate={navigateHousehold} signOut={() => void signOut()} />
      : householdView === "operations" ? <Operations navigate={navigateHousehold} signOut={() => void signOut()} />
      : householdView === "me" ? <PersonalArea dashboard={dashboard} navigate={navigateHousehold} signOut={() => void signOut()}
        startSuggestion={suggestionRequested} onSuggestionOpened={() => setSuggestionRequested(false)}
        onDashboardChanged={setDashboard} memberId={personalMemberId} />
      : <Dashboard data={dashboard} setData={setDashboard} navigate={navigateHousehold} signOut={() => void signOut()}
        startSetup={dashboardSetupRequested} onSetupOpened={() => setDashboardSetupRequested(false)}
        startFamily={dashboardFamilyRequested} onFamilyOpened={() => setDashboardFamilyRequested(false)}
        suggest={() => { setSuggestionRequested(true); navigateHousehold("me"); }}
        openPersonalMember={(memberId) => { setPersonalMemberId(memberId); navigateHousehold("me"); }} />}</main>;
  }
  if (state === "ready" && session && setup) {
    if (!setup.canConfigure) return <main className="app-shell"><AlphaFeedback screen="onboarding" /><section className="card stage"><p className="eyebrow">Setup in progress</p><h1>Your household lead is setting things up.</h1>
      <p>You can return when the Owner has completed the household foundation.</p><button onClick={signOut}>Sign out</button></section></main>;
    return <main className="app-shell"><AlphaFeedback screen="onboarding" /><div className="setup-safe-nav"><Progress step={setup.state.step} />
      <button onClick={() => void signOut()}>Save and sign out</button></div><ErrorMessage value={error} />
      {setup.state.step === "leadership" && <Leadership setup={setup} advance={() => transition("/api/household/setup/leadership")} />}
      {setup.state.step === "members" && <MembersStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/members-complete")} />}
      {setup.state.step === "companion" && <AvatarStage setup={setup} onSave={saveSetupAvatar} />}
      {setup.state.step === "rooms" && <RoomsStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/rooms-complete")} />}
      {setup.state.step === "pets" && <PetsStage setup={setup} refresh={refreshSetup} advance={() => transition("/api/household/setup/pets-complete")} />}
      {setup.state.step === "review" && <Review setup={setup} complete={() => transition("/api/household/setup/complete")} />}</main>;
  }
  if (view !== "home") return <main className="app-shell"><PublicForm view={view} onDone={load} onBack={() => setView("home")} notice={developmentResetNotice} /></main>;
  return <main className="app-shell"><section className="hero-panel"><p className="eyebrow">Cradle</p><h1>A shared home starts here.</h1>
    <p>Create a household, join your people, or return to your place in the family.</p><div className="entry-actions">
      <button className="primary" onClick={() => setView("create")}>Create Household</button><button onClick={() => setView("join")}>Join Household</button>
      <button onClick={() => setView("sign-in")}>Sign In</button></div></section></main>;
}
