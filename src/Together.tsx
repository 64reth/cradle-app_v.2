import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, failureMessage, jsonInit } from "./api";
import { CradleIcon } from "./components/ui/CradleIcon";
import { Navigation, type AuthenticatedView } from "./Dashboard";
import { participantContext, type TogetherMoment } from "../shared/together";
import { MotionCard, MotionPage } from "./motion";

type TogetherData = { localDate: string; moments: TogetherMoment[]; traditions: Array<{ id: string; title: string; description: string; recurrence: string; isActive: number }> };

export function Together({ navigate, signOut }: { navigate: (view: AuthenticatedView) => void; signOut: () => void }) {
  const [data, setData] = useState<TogetherData | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [memoryMoment, setMemoryMoment] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError("");
    try { setData(await api<TogetherData>("/api/together")); } catch (reason) { setError(failureMessage(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const primary = data?.moments.find((moment) => moment.isPrimary);
  const optional = data?.moments.find((moment) => !moment.isPrimary);
  async function action(moment: TogetherMoment, name: "accept" | "start" | "complete" | "skip" | "save" | "swap") {
    setBusy(true); setError("");
    try {
      const next = await api<TogetherMoment>(`/api/together/${moment.id}/${name}`, jsonInit("POST", {}));
      setData((current) => current ? {
        ...current,
        moments: current.moments.map((item) => item.id === (name === "swap" ? moment.id : next.id) ? next : item)
      } : current);
      setNotice(name === "swap" ? "Here’s another Moment to look forward to." : name === "skip" ? "Today is left open for your household." : name === "save" ? "Saved for another day." : name === "complete" ? "That Moment is now part of your household story." : "Moment updated.");
      if (name === "complete") setMemoryMoment(next.id);
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!memoryMoment) return; setBusy(true); setError("");
    try { await api(`/api/together/${memoryMoment}/memory`, jsonInit("POST", Object.fromEntries(new FormData(event.currentTarget)))); setNotice("Memory saved."); setMemoryMoment(null); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div className="dashboard-shell"><Navigation active="together" navigate={navigate} signOut={signOut} /><MotionPage motionKey="together" className="motion-page">
    <section className="calendar-hero together-hero dashboard-card"><div><p className="eyebrow"><CradleIcon name="family" size="sm" decorative /> Together</p><h1>Make a moment to look forward to.</h1><p>Optional invitations to connect, learn, play and make memories—never another chore list.</p></div></section>
    {error && <section className="dashboard-card local-error"><p className="error" role="alert">{error}</p><button className="primary" onClick={() => void load()}>Retry</button></section>}
    {notice && <p className="inline-success-chip" role="status">{notice}</p>}
    <main className="together-layout">
      <section className="dashboard-card together-primary" aria-labelledby="today-moment-title">
        <p className="eyebrow">Today’s Moment</p>
        {primary ? <MomentCard moment={primary} busy={busy} onAction={action} /> : <div className="empty-action"><h2 id="today-moment-title">No Moment chosen for today.</h2><p>Leave today open or let Cradle surprise your household with something gentle.</p><button className="primary" onClick={() => void load()}>Surprise us</button></div>}
      </section>
      {optional && <section className="dashboard-card together-optional"><p className="eyebrow">Optional Moment</p><MomentCard moment={optional} busy={busy} onAction={action} compact /></section>}
      <section className="dashboard-card together-traditions"><div className="card-heading"><div><p className="eyebrow"><CradleIcon name="recurring" size="sm" decorative /> Family Traditions</p><h2>Things your family returns to</h2></div></div>
        {data?.traditions.length ? <ul>{data.traditions.slice(0, 5).map((tradition) => <li key={tradition.id}><strong>{tradition.title}</strong><span>{tradition.description}</span></li>)}</ul> : <p className="soft-notice">Complete a Moment and save it as a Tradition when it feels like something your family would enjoy again.</p>}
      </section>
      {memoryMoment && <section className="dashboard-card together-memory"><h2>What would you like to remember?</h2><form onSubmit={saveMemory}><label><span>Short note (optional)</span><textarea name="note" maxLength={1000} /></label><label><span>Would you do it again?</span><select name="wouldRepeat" defaultValue=""><option value="">Prefer not to say</option><option value="true">Yes</option><option value="false">Not this one</option></select></label><div className="row-actions"><button className="primary" disabled={busy}>Save memory</button><button type="button" onClick={() => setMemoryMoment(null)}>Not now</button></div></form></section>}
    </main>
  </MotionPage></div>;
}

function MomentCard({ moment, busy, onAction, compact = false }: { moment: TogetherMoment; busy: boolean; onAction: (moment: TogetherMoment, name: "accept" | "start" | "complete" | "skip" | "save" | "swap") => void; compact?: boolean }) {
  const closed = ["completed", "skipped", "swapped", "saved_for_later", "cancelled"].includes(moment.status);
  return <MotionCard className="motion-card-shell" interactive><article className={`together-moment-card ${compact ? "compact" : ""}`}><h2>{moment.title}</h2><p>{moment.description}</p><div className="together-meta"><span><CradleIcon name="family" size="sm" decorative /> {participantContext(moment.participants)}</span><span><CradleIcon name="time" size="sm" decorative /> {moment.durationMinutes} minutes</span><span>{moment.indoorOutdoor} · {moment.screenMode === "off_screen" ? "Off-screen" : "Shared screen"}</span></div><small>{moment.whySuggested || "A gentle invitation for your household."}</small>
    {!closed && <div className="row-actions"><button className="primary" disabled={busy} onClick={() => onAction(moment, moment.status === "suggested" ? "accept" : moment.status === "accepted" ? "start" : "complete")}>{moment.status === "suggested" ? "Start Moment" : moment.status === "accepted" ? "Start Moment" : "Complete Moment"}</button><button disabled={busy} onClick={() => onAction(moment, "swap")}>Try another</button><button disabled={busy} onClick={() => onAction(moment, "save")}>Save for later</button></div>}
    {moment.status === "completed" && <p className="inline-success-chip">Shared together. Add a memory if you’d like.</p>}{moment.status === "skipped" && <p className="soft-notice">Not for today. Your household can try another time.</p>}</article></MotionCard>;
}
