import { useState } from "react";
import {
  requestSupabaseOtp, startSupabaseOAuth, takeAuthProviderError, verifySupabaseOtp
} from "./supabaseAuth";
import { availableAuthProviders, type AuthProviderDefinition, type OAuthProviderId } from "./authProviders";

export function SupabaseAuthActions({ onComplete, onOAuthStart, providers = availableAuthProviders }: {
  onComplete: () => void;
  onOAuthStart?: () => void;
  providers?: readonly AuthProviderDefinition[];
}) {
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(() => takeAuthProviderError() || "");
  const oauthProviders = providers.filter((provider) => provider.kind === "oauth");
  const emailProvider = providers.find(({ id }) => id === "email");
  if (!providers.length) return <section className="supabase-auth-actions" aria-label="Sign-in options">
    <p className="error" role="alert">Sign-in providers are not configured for this Cradle environment. Please contact support or go back.</p>
  </section>;
  async function oauth(provider: OAuthProviderId) {
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
    {oauthProviders.length > 0 && <div className="row-actions">{oauthProviders.map((provider) =>
      <button key={provider.id} type="button" disabled={busy} onClick={() => void oauth(provider.id as OAuthProviderId)}>{provider.buttonLabel}</button>)}</div>}
    {emailProvider && <form onSubmit={(event) => { event.preventDefault(); void otp(); }}>
      <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {sent && <label><span>One-time code</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Working…" : sent ? "Verify code" : emailProvider.buttonLabel}</button>
    </form>}
  </section>;
}
