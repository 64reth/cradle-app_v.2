import { FormEvent, useState } from "react";
import {
  ALPHA_FEEDBACK_CATEGORIES,
  type AlphaFeedbackCategory,
  type AlphaScreen
} from "../shared/alpha-diagnostics";
import { AlphaFeedbackError, submitAlphaFeedback, trackAlphaEvent } from "./alphaDiagnostics";

const categoryLabels: Record<AlphaFeedbackCategory, string> = {
  confusion: "I got stuck",
  bug: "Something went wrong",
  idea: "I have an idea",
  delight: "I enjoyed this",
  other: "Something else"
};

export function AlphaFeedback({ screen }: { screen: AlphaScreen }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false); const [error, setError] = useState("");
  if (sent) return <p className="alpha-feedback-thanks" role="status">Thanks — that helps us make Cradle better.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await submitAlphaFeedback({
        category: values.category as AlphaFeedbackCategory, screen,
        rating: values.rating ? Number(values.rating) : undefined,
        message: typeof values.message === "string" ? values.message : undefined
      });
      trackAlphaEvent({ name: "feedback_submitted", screen, action: "share_feedback" });
      setSent(true); setOpen(false);
    } catch (reason) {
      trackAlphaEvent({ name: "action_failed", screen, action: "share_feedback" });
      const message = reason instanceof AlphaFeedbackError && reason.requestId
        ? `${reason.message} Request ID: ${reason.requestId}`
        : reason instanceof Error ? reason.message : "Cradle couldn’t send that feedback right now.";
      setError(message);
    }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="alpha-feedback-trigger" onClick={() => { setOpen(true); trackAlphaEvent({ name: "action_succeeded", screen, action: "open_feedback" }); }}>
      Share feedback
    </button>
    {open && <div className="alpha-feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="alpha-feedback-dialog card" role="dialog" aria-modal="true" aria-labelledby="alpha-feedback-title">
        <div className="row-actions alpha-feedback-heading"><div><p className="eyebrow">Private household alpha</p><h2 id="alpha-feedback-title">How is Cradle feeling?</h2></div>
          <button type="button" className="text-button" onClick={() => setOpen(false)}>Close</button></div>
        <p>Your note goes to the household alpha team. Please leave out private family details.</p>
        <form onSubmit={submit}>
          <label><span>What would you like to share?</span><select name="category" defaultValue="other" required>
            {ALPHA_FEEDBACK_CATEGORIES.map((category) => <option value={category} key={category}>{categoryLabels[category]}</option>)}
          </select></label>
          <label><span>How did this feel? (Optional)</span><select name="rating" defaultValue=""><option value="">Choose a rating</option>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>
          <label><span>Tell us a little more (Optional)</span><textarea name="message" maxLength={2000} rows={4} placeholder="A short note is plenty." /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row-actions"><button type="button" onClick={() => setOpen(false)}>Not now</button><button className="primary" disabled={busy}>{busy ? "Sending…" : "Send feedback"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
