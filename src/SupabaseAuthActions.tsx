import { useState } from "react";
import {
  requestSupabaseOtp, startSupabaseOAuth, supabaseAuthConfigured, verifySupabaseOtp
} from "./supabaseAuth";

export function SupabaseAuthActions({ onComplete, onOAuthStart }: {
  onComplete: () => void;
  onOAuthStart?: () => void;
}) {
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!supabaseAuthConfigured) return null;
  async function oauth(provider: "google" | "apple") {
    setBusy(true); setError("");
    try {
      onOAuthStart?.();
      await startSupabaseOAuth(provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in is not available right now.");
      setBusy(false);
    }
  }
  async function otp() {
    setBusy(true); setError("");
    try {
      if (!sent) { await requestSupabaseOtp(email); setSent(true); }
      else { await verifySupabaseOtp(email, code); onComplete(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We couldn’t complete that sign-in."); }
    finally { setBusy(false); }
  }
  return <section className="supabase-auth-actions" aria-label="Modern sign-in options">
    <p className="eyebrow">Fast sign-in</p>
    <div className="row-actions"><button type="button" disabled={busy} onClick={() => void oauth("google")}>Continue with Google</button>
      <button type="button" disabled={busy} onClick={() => void oauth("apple")}>Continue with Apple</button></div>
    <form onSubmit={(event) => { event.preventDefault(); void otp(); }}>
      <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {sent && <label><span>One-time code</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Working…" : sent ? "Verify code" : "Continue with Email"}</button>
    </form>
  </section>;
}
