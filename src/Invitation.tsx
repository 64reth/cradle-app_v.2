import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, failureMessage, jsonInit } from "./api";
import { CradleIcon } from "./components/ui/CradleIcon";

type InvitationData = {
  householdName: string; inviteType: "profile" | "household"; targetMemberId: string | null;
  targetName: string | null; role: string; expiresAt: string; alreadyAccepted: boolean;
  availableProfiles: Array<{ id: string; displayName: string }>;
};

export function InvitationPage({ reference, accepted, goHome }: {
  reference: string; accepted: () => Promise<void>; goHome: () => void;
}) {
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "requested" | "error">("loading");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [clientKey] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    setState("loading"); setError("");
    try {
      const result = await api<{ invitation: InvitationData }>(`/api/invites/${encodeURIComponent(reference)}`);
      setInvitation(result.invitation); setState("ready");
    } catch (reason) { setError(failureMessage(reason)); setState("error"); }
  }, [reference]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ accepted?: boolean; joinRequested?: boolean }>(
        `/api/invites/${encodeURIComponent(reference)}/accept`, jsonInit("POST", {
          displayName: form.get("displayName"), pin: form.get("pin"), pinConfirmation: form.get("pinConfirmation"),
          requestedMemberId: form.get("requestedMemberId") || null, clientKey
        }));
      if (result.accepted) await accepted(); else setState("requested");
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  if (state === "loading") return <main className="app-shell"><section className="card"><p role="status">Opening your invitation…</p>
    <button onClick={goHome}>Cancel and return home</button></section></main>;
  if (state === "error") return <main className="app-shell"><section className="card stage"><p className="eyebrow">Household invitation</p>
    <h1>This invitation is unavailable.</h1><p>{error}</p><div className="row-actions"><button className="primary" onClick={() => void load()}>Try again</button>
      <button onClick={goHome}>Return to sign in</button></div></section></main>;
  if (state === "requested") return <main className="app-shell"><section className="card stage"><p className="eyebrow">Request sent</p>
    <h1>Your household leaders will review your request.</h1><p>You can sign in after they welcome you into the right place in the family.</p>
    <button className="primary" onClick={goHome}>Done</button></section></main>;
  return <main className="app-shell"><section className="card stage invite-welcome"><button className="text-button" onClick={goHome}><CradleIcon name="back" decorative /> Return home</button>
    <p className="eyebrow">You’re invited</p><h1>Join {invitation?.householdName}</h1>
    {invitation?.inviteType === "profile"
      ? <p>This invitation is for <strong>{invitation.targetName}</strong>.</p>
      : <p>Choose your name below, or ask household leaders to add you to the family.</p>}
    <form onSubmit={submit}>
      {invitation?.inviteType === "household" && <label><span>Who are you joining as?</span>
        <select name="requestedMemberId" defaultValue="">
          {invitation.availableProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} — ready to join</option>)}
          <option value="">I’m not listed</option>
        </select></label>}
      <label><span>Your display name</span><input name="displayName" defaultValue={invitation?.targetName || ""} required /></label>
      <label><span>Create a PIN</span><input name="pin" type="password" inputMode="numeric" minLength={4} maxLength={12} required /></label>
      <label><span>Confirm PIN</span><input name="pinConfirmation" type="password" inputMode="numeric" minLength={4} maxLength={12} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Joining…" : invitation?.alreadyAccepted ? "Sign in again" : "Join household"}</button>
        <button type="button" onClick={goHome}>Cancel</button></div>
    </form></section></main>;
}
