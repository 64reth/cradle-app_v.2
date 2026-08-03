import { useEffect, useState } from "react";
import { api, failureMessage, jsonInit } from "./api";
import type { AuthenticatedView } from "./Dashboard";

type Account = { id: string; accountReference: string; displayName: string; status: string; providers: string[]; membershipCount: number };
type Details = { account: { id: string; displayName: string; accountReference: string; status: string; mfaEnabled: number };
  providers: Array<{ provider: string; email: string | null }>; memberships: Array<{ householdName: string; role: string; accessLevel: string; lifecycleState: string }>;
  sessions: Array<{ id: string; authMethod: string; deviceLabel: string | null; lastSeenAt: string | null }>;
  authenticationEvents: Array<{ name: string; provider: string | null; result: string; safeCode: string | null; createdAt: string }>;
  diagnosticsSummary: { eventCount: number; feedbackCount: number } | null };
type HealthSignal = { status: "healthy" | "degraded" | "unavailable" | "unknown"; explanation: string;
  lastCheckedAt: string; durationMs?: number; code?: string };
type Health = { overall: HealthSignal["status"]; checkedAt: string; requestDurationMs: number;
  signals: Record<string, HealthSignal>; build: { version: string; commit: string | null; builtAt: string | null;
    validatedTestCount: number | null; testCountLabel: string } };

const healthLabels: Record<string, string> = { authentication: "Authentication", sessions: "Sessions", members: "Members",
  invitations: "Invitations", joinRequests: "Join requests", meals: "Meals", schedule: "Schedule", routines: "Routines",
  worker: "Worker", database: "Database", apiLatency: "API latency", outstandingErrors: "Outstanding errors" };

export function AlphaHealth({ back }: { back: () => void }) {
  const [health, setHealth] = useState<Health | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function refresh() { setBusy(true); setError(""); try { setHealth(await api<Health>("/api/ops/health")); }
    catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  useEffect(() => { void refresh(); }, []);
  return <section className="operations-health" aria-labelledby="alpha-health-title">
    <div className="row-actions"><button onClick={back}>Back to account support</button><button className="primary" onClick={() => void refresh()} disabled={busy}>{busy ? "Checking…" : "Refresh"}</button></div>
    <p className="eyebrow">Internal operations</p><h2 id="alpha-health-title">Cradle Alpha Health</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {health && <><p role="status"><strong>Overall: {health.overall}</strong> · Checked {new Date(health.checkedAt).toLocaleString()} · This request {health.requestDurationMs} ms</p>
      <div className="health-grid">{Object.entries(health.signals).map(([name, signal]) => <article className={`card health-${signal.status}`} key={name}>
        <h3>{healthLabels[name] || name}</h3><p className="health-status">{signal.status}</p><p>{signal.explanation}</p>
        {signal.durationMs !== undefined && <small>Check duration: {signal.durationMs} ms</small>}{signal.code && <small>Safe code: {signal.code}</small>}
      </article>)}</div>
      <section className="card"><h3>Build</h3><p>{health.build.version}{health.build.commit ? ` · ${health.build.commit}` : " · Local or unrecorded commit"}</p>
        <p>{health.build.validatedTestCount === null ? health.build.testCountLabel : `${health.build.validatedTestCount} validated tests · ${health.build.testCountLabel}`}</p>
        {health.build.builtAt && <small>Built {new Date(health.build.builtAt).toLocaleString()}</small>}</section></>}
  </section>;
}

export function Operations({ navigate, signOut }: { navigate: (view: AuthenticatedView) => void; signOut: () => void }) {
  const [query, setQuery] = useState(""); const [accounts, setAccounts] = useState<Account[]>([]); const [selected, setSelected] = useState<Details | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [showHealth, setShowHealth] = useState(() => window.location.pathname === "/operations/health");
  async function search() { setBusy(true); setError(""); try { setAccounts((await api<{ accounts: Account[] }>(`/api/ops/accounts?query=${encodeURIComponent(query)}`)).accounts); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function open(id: string) { setBusy(true); setError(""); try { setSelected(await api<Details>(`/api/ops/accounts/${id}`)); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function action(actionName: string) { if (!selected) return; setBusy(true); setError(""); setNotice(""); try { const result = await api<{ account: Details }>(`/api/ops/accounts/${selected.account.id}`, jsonInit("POST", { action: actionName, reason: "Household alpha operations" })); setSelected(result.account); setNotice("That operations action was recorded."); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  if (showHealth) return <main className="app-shell operations-page"><AlphaHealth back={() => { window.history.pushState({}, "", "/operations"); setShowHealth(false); }} /></main>;
  return <main className="app-shell operations-page"><div className="setup-safe-nav"><div><p className="eyebrow">Cradle operations</p><h1>Account support</h1></div><div className="row-actions"><button onClick={() => { window.history.pushState({}, "", "/operations/health"); setShowHealth(true); }}>Alpha Health</button><button onClick={() => navigate("dashboard")}>Back to Dashboard</button><button onClick={() => void signOut()}>Sign out</button></div></div>
    <p>Search account identity and access safely. Household content stays private.</p>
    <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void search(); }}><label><span>Search account</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or account reference" /></label><button className="primary" disabled={busy}>Search</button></form>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="operations-results">{accounts.map((account) => <button key={account.id} onClick={() => void open(account.id)}><strong>{account.displayName}</strong><span>{account.accountReference} · {account.status} · {account.providers.join(", ") || "No linked provider"}</span></button>)}</div>
    {selected && <section className="card operations-detail"><p className="eyebrow">Account</p><h2>{selected.account.displayName}</h2><p>{selected.account.accountReference} · {selected.account.status}</p><div className="row-actions"><button onClick={() => void action("revoke_sessions")} disabled={busy}>Revoke sessions</button><button onClick={() => void action(selected.account.status === "suspended" ? "restore" : "suspend")} disabled={busy}>{selected.account.status === "suspended" ? "Restore account" : "Suspend account"}</button></div><h3>Linked providers</h3><ul>{selected.providers.map((provider) => <li key={provider.provider}>{provider.provider}{provider.email ? ` · ${provider.email}` : ""}</li>)}</ul><h3>Household memberships</h3><ul>{selected.memberships.map((membership, index) => <li key={`${membership.householdName}-${index}`}>{membership.householdName} · {membership.role} · {membership.accessLevel}</li>)}</ul><h3>Safe diagnostics summary</h3><p>{selected.diagnosticsSummary?.eventCount || 0} events · feedback count withheld from operators in this view</p><h3>Authentication history</h3><ul>{selected.authenticationEvents.map((event) => <li key={`${event.createdAt}-${event.name}`}>{event.name} · {event.result} · {event.provider || "provider unavailable"}</li>)}</ul></section>}
  </main>;
}
