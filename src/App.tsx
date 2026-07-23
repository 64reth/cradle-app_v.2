import { FormEvent, useCallback, useEffect, useState } from "react";

type Role = "owner" | "parent_admin" | "adult" | "child";
type Session = {
  household: { name: string; reference: string };
  member: { displayName: string; reference: string; role: Role };
  expiresAt: string;
};
type Member = { displayName: string; profileReference: string; role: Role };
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string; details?: Record<string, string> } };
type View = "home" | "create" | "join" | "sign-in";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json() as Envelope<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

function Field({ label, name, type = "text", autoComplete, required = true }: {
  label: string; name: string; type?: string; autoComplete?: string; required?: boolean;
}) {
  return <label><span>{label}</span><input name={name} type={type} autoComplete={autoComplete} required={required} /></label>;
}

function PublicForm({ view, onDone, onBack }: { view: Exclude<View, "home">; onDone: () => void; onBack: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = { create: "Create your household", join: "Join a household", "sign-in": "Welcome back" };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const endpoint = view === "create" ? "/api/auth/households" : view === "join" ? "/api/auth/join" : "/api/auth/sign-in";
    const payload = view === "create"
      ? { householdName: values.householdName, displayName: values.displayName, pin: values.pin, pinConfirmation: values.pinConfirmation }
      : view === "join"
        ? { invitationCode: values.invitationCode, displayName: values.displayName, pin: values.pin, pinConfirmation: values.pinConfirmation }
        : { householdReference: values.householdReference, profileReference: values.profileReference, pin: values.pin };
    try {
      await api(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cradle could not connect. Please try again.");
    } finally { setBusy(false); }
  }
  return <section className="card form-card">
    <button className="text-button" onClick={onBack}>← Back</button>
    <p className="eyebrow">Cradle membership</p>
    <h1>{labels[view]}</h1>
    <form onSubmit={submit}>
      {view === "create" && <Field label="Household name" name="householdName" autoComplete="organization" />}
      {view === "join" && <Field label="Invitation code" name="invitationCode" autoComplete="off" />}
      {view === "sign-in" && <>
        <Field label="Household reference" name="householdReference" autoComplete="organization" />
        <Field label="Profile reference" name="profileReference" autoComplete="username" />
      </>}
      {view !== "sign-in" && <Field label={view === "create" ? "Owner display name" : "Display name"} name="displayName" autoComplete="name" />}
      <Field label="PIN (4–12 digits)" name="pin" type="password" autoComplete={view === "sign-in" ? "current-password" : "new-password"} />
      {view !== "sign-in" && <Field label="Confirm PIN" name="pinConfirmation" type="password" autoComplete="new-password" />}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Working…" : labels[view]}</button>
    </form>
  </section>;
}

function Landing({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState("");
  const canInvite = session.member.role === "owner" || session.member.role === "parent_admin";
  useEffect(() => {
    api<{ members: Member[] }>("/api/household/members").then((data) => setMembers(data.members))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load members."));
  }, []);
  async function signOut() {
    try { await api("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    finally { onExpired(); }
  }
  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setInvite("");
    const role = new FormData(event.currentTarget).get("role");
    try {
      const data = await api<{ code: string }>("/api/household/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role })
      });
      setInvite(data.code);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create invitation."); }
  }
  return <div className="landing">
    <header className="card household-header">
      <div><p className="eyebrow">Your household</p><h1>{session.household.name}</h1>
        <p>Signed in as <strong>{session.member.displayName}</strong> · {session.member.role.replace("_", " ")}</p>
        <p className="reference">Household: {session.household.reference} · Profile: {session.member.reference}</p></div>
      <button onClick={signOut}>Sign out</button>
    </header>
    {error && <p className="error card" role="alert">{error} <button onClick={() => location.reload()}>Retry</button></p>}
    <section className="card"><h2>Household members</h2>
      <ul className="member-list">{members.map((member) => <li key={member.profileReference}>
        <span>{member.displayName}</span><small>{member.role.replace("_", " ")}</small>
      </li>)}</ul>
    </section>
    {canInvite && <section className="card invite-card"><h2>Invite someone</h2>
      <form onSubmit={createInvitation}><label><span>Role</span><select name="role">
        <option value="parent_admin">Parent / Admin</option><option value="adult">Adult</option><option value="child">Child</option>
      </select></label><button className="primary">Create one-use code</button></form>
      {invite && <p className="code" role="status">Share this once: <strong>{invite}</strong></p>}
    </section>}
    <aside className="card placeholder"><h2>The household foundation is ready.</h2>
      <p>Rooms, routines, tasks, maintenance and household missions arrive in later phases.</p></aside>
  </div>;
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [state, setState] = useState<"loading" | "public" | "authenticated" | "network">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/auth/session");
      if (response.status === 401) { setSession(null); setState("public"); return; }
      const body = await response.json() as Envelope<Session>;
      if (!body.ok) throw new Error(body.error.message);
      setSession(body.data); setState("authenticated");
    } catch { setState("network"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (state === "loading") return <main className="app-shell"><p className="loading" role="status">Opening Cradle…</p></main>;
  if (state === "network") return <main className="app-shell"><section className="card"><h1>Cradle couldn’t connect.</h1><p>Check your connection, then try again.</p><button className="primary" onClick={load}>Retry</button></section></main>;
  if (state === "authenticated" && session) return <main className="app-shell"><Landing session={session} onExpired={() => { setSession(null); setState("public"); setView("home"); }} /></main>;
  if (view !== "home") return <main className="app-shell"><PublicForm view={view} onDone={load} onBack={() => setView("home")} /></main>;
  return <main className="app-shell"><section className="hero-panel"><p className="eyebrow">Cradle</p>
    <h1>A shared home starts here.</h1><p>Create a household, join your people, or return to your profile.</p>
    <div className="entry-actions"><button className="primary" onClick={() => setView("create")}>Create Household</button>
      <button onClick={() => setView("join")}>Join Household</button><button onClick={() => setView("sign-in")}>Sign In</button></div>
  </section></main>;
}
