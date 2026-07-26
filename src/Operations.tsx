import { useState } from "react";
import { api, failureMessage, jsonInit } from "./api";
import type { AuthenticatedView } from "./Dashboard";

type Account = { id: string; accountReference: string; displayName: string; status: string; providers: string[]; membershipCount: number };
type Details = { account: { id: string; displayName: string; accountReference: string; status: string; mfaEnabled: number };
  providers: Array<{ provider: string; email: string | null }>; memberships: Array<{ householdName: string; role: string; accessLevel: string; lifecycleState: string }>;
  sessions: Array<{ id: string; authMethod: string; deviceLabel: string | null; lastSeenAt: string | null }>;
  authenticationEvents: Array<{ name: string; provider: string | null; result: string; safeCode: string | null; createdAt: string }>;
  diagnosticsSummary: { eventCount: number; feedbackCount: number } | null };

export function Operations({ navigate, signOut }: { navigate: (view: AuthenticatedView) => void; signOut: () => void }) {
  const [query, setQuery] = useState(""); const [accounts, setAccounts] = useState<Account[]>([]); const [selected, setSelected] = useState<Details | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function search() { setBusy(true); setError(""); try { setAccounts((await api<{ accounts: Account[] }>(`/api/ops/accounts?query=${encodeURIComponent(query)}`)).accounts); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function open(id: string) { setBusy(true); setError(""); try { setSelected(await api<Details>(`/api/ops/accounts/${id}`)); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  async function action(actionName: string) { if (!selected) return; setBusy(true); setError(""); setNotice(""); try { const result = await api<{ account: Details }>(`/api/ops/accounts/${selected.account.id}`, jsonInit("POST", { action: actionName, reason: "Household alpha operations" })); setSelected(result.account); setNotice("That operations action was recorded."); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  return <main className="app-shell operations-page"><div className="setup-safe-nav"><div><p className="eyebrow">Cradle operations</p><h1>Account support</h1></div><div className="row-actions"><button onClick={() => navigate("dashboard")}>Back to Dashboard</button><button onClick={() => void signOut()}>Sign out</button></div></div>
    <p>Search account identity and access safely. Household content stays private.</p>
    <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void search(); }}><label><span>Search account</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or account reference" /></label><button className="primary" disabled={busy}>Search</button></form>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="operations-results">{accounts.map((account) => <button key={account.id} onClick={() => void open(account.id)}><strong>{account.displayName}</strong><span>{account.accountReference} · {account.status} · {account.providers.join(", ") || "No linked provider"}</span></button>)}</div>
    {selected && <section className="card operations-detail"><p className="eyebrow">Account</p><h2>{selected.account.displayName}</h2><p>{selected.account.accountReference} · {selected.account.status}</p><div className="row-actions"><button onClick={() => void action("revoke_sessions")} disabled={busy}>Revoke sessions</button><button onClick={() => void action(selected.account.status === "suspended" ? "restore" : "suspend")} disabled={busy}>{selected.account.status === "suspended" ? "Restore account" : "Suspend account"}</button></div><h3>Linked providers</h3><ul>{selected.providers.map((provider) => <li key={provider.provider}>{provider.provider}{provider.email ? ` · ${provider.email}` : ""}</li>)}</ul><h3>Household memberships</h3><ul>{selected.memberships.map((membership, index) => <li key={`${membership.householdName}-${index}`}>{membership.householdName} · {membership.role} · {membership.accessLevel}</li>)}</ul><h3>Safe diagnostics summary</h3><p>{selected.diagnosticsSummary?.eventCount || 0} events · feedback count withheld from operators in this view</p><h3>Authentication history</h3><ul>{selected.authenticationEvents.map((event) => <li key={`${event.createdAt}-${event.name}`}>{event.name} · {event.result} · {event.provider || "provider unavailable"}</li>)}</ul></section>}
  </main>;
}
