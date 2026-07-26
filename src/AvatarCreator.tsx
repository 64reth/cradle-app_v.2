import { type FormEvent, useState } from "react";
import { DEFAULT_MEMBER_AVATAR, memberAvatar, type MemberAvatar } from "../shared/member-avatar";
import { failureMessage } from "./api";
import { AvatarPalette } from "./AvatarPalette";
import { FamilyAvatar } from "./FamilyAvatar";

export function AvatarCreator({ name, initialAvatar, title = "Create your cat.",
  description = "Choose the colours that feel like you. You can change them later in My Cradle.",
  submitLabel = "Save my cat", onSave, cancel }: {
  name: string;
  initialAvatar?: Partial<MemberAvatar> | null;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSave: (avatar: MemberAvatar) => Promise<void>;
  cancel?: () => void;
}) {
  const [avatar, setAvatar] = useState(() => memberAvatar(initialAvatar || DEFAULT_MEMBER_AVATAR));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave(avatar); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <div className="avatar-creator">
    <div className="avatar-creator-intro"><p className="eyebrow">This is me</p><h1>{title}</h1><p>{description}</p></div>
    <div className="avatar-creator-layout">
      <div className="avatar-creator-preview"><FamilyAvatar name={name} avatar={avatar} /></div>
      <form onSubmit={submit}>
        <AvatarPalette avatar={avatar} disabled={busy} onChange={setAvatar} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-actions"><button className="primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}</button>
          {cancel && <button type="button" onClick={cancel}>Cancel</button>}
        </div>
      </form>
    </div>
  </div>;
}
