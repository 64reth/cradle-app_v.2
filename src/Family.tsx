import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { COMPANION_EXPRESSIONS } from "../shared/companion";
import { memberAvatar, type MemberAvatar } from "../shared/member-avatar";
import {
  MEMBER_ACCESS_LEVELS, MEMBER_AGE_BANDS, accessLevelLabel, ageBandLabel,
  lifecycleLabel, type MemberLifecycleState
} from "../shared/members";
import { api, failureMessage, jsonInit } from "./api";
import { FamilyAvatar } from "./FamilyAvatar";
import { AvatarPalette } from "./AvatarPalette";
import type { DashboardData, DashboardMember } from "./Dashboard";
import { MemberSelector } from "./MemberSelector";
import { CradleIcon } from "./components/ui/CradleIcon";

type Invite = {
  id: string; targetMemberId: string | null; targetName: string | null; inviteType: "profile" | "household";
  role: string; expiresAt: string; status: "active" | "accepted" | "expired" | "revoked";
  inviteUrl?: string; code?: string;
};
type JoinRequest = { id: string; requestedMemberId: string | null; displayName: string; requestedMemberName: string | null };
type Suggestion = {
  id: string; title: string; suggestionType: "one_off" | "recurring"; note: string | null;
  status: "open" | "accepted" | "declined" | "withdrawn"; suggestedByName: string;
  roomName: string | null; petName: string | null;
};

const clientKey = () => crypto.randomUUID();
async function copy(value: string) { await navigator.clipboard.writeText(value); }
const memberAccess = (member: DashboardMember) => member.accessLevel ||
  (member.role === "owner" || member.role === "parent_admin" ? "household_admin" :
    member.role === "child" ? "managed_member" : "household_member");
const memberAgeBand = (member: DashboardMember) => member.ageBand ||
  (member.ageGroup === "dependent" ? "young_child" : member.ageGroup || "adult");
const avatarFor = (member: DashboardMember): MemberAvatar => memberAvatar({
  furPaletteKey: member.avatarFurPaletteKey || undefined,
  patchPrimaryPaletteKey: member.avatarPatchPrimaryPaletteKey || undefined,
  patchSecondaryPaletteKey: member.avatarPatchSecondaryPaletteKey || undefined,
  expressionKey: member.avatarExpressionKey || undefined
});

export function FamilyPanel({ dashboard, onClose, onChanged, initialMemberId }: {
  dashboard: DashboardData; onClose: () => void; onChanged: (data: DashboardData) => void;
  initialMemberId?: string;
}) {
  const [mode, setMode] = useState<"overview" | "add" | "invite" | "manage" | "success">(
    initialMemberId ? "manage" : "overview"
  );
  const [members, setMembers] = useState<DashboardMember[]>(dashboard.members);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId || "");
  const [newAccessLevel, setNewAccessLevel] = useState("household_member");
  const [managedAvatar, setManagedAvatar] = useState<MemberAvatar | null>(() => {
    const member = dashboard.members.find(({ id }) => id === initialMemberId);
    return member ? avatarFor(member) : null;
  });
  const [createdMember, setCreatedMember] = useState<DashboardMember | null>(null);
  const [newMemberKey, setNewMemberKey] = useState(clientKey);
  const [latestInvite, setLatestInvite] = useState<Invite | null>(null);
  const [qr, setQr] = useState(""); const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement | null>(null);
  const qrReturnFocusRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [family, invitationData, requestData, suggestionData] = await Promise.all([
        api<{ members: DashboardMember[] }>("/api/household/members"),
        api<{ invites: Invite[] }>("/api/household/invites"),
        api<{ requests: JoinRequest[] }>("/api/household/join-requests"),
        api<{ suggestions: Suggestion[] }>("/api/household/task-suggestions")
      ]);
      setMembers(family.members); setInvites(invitationData.invites); setRequests(requestData.requests);
      setSuggestions(suggestionData.suggestions);
    } catch (reason) { setError(failureMessage(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!showQr) return;
    const dialog = qrRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") || [])];
    requestAnimationFrame(() => focusable()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setShowQr(false); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (qrReturnFocusRef.current?.isConnected) qrReturnFocusRef.current.focus();
    };
  }, [showQr]);

  async function refreshDashboard() {
    onChanged(await api<DashboardData>("/api/dashboard"));
  }
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ member: DashboardMember }>("/api/household/members", jsonInit("POST", {
        displayName: form.get("displayName"), accessLevel: form.get("accessLevel"),
        ageBand: form.get("ageBand"), clientKey: newMemberKey
      }));
      setCreatedMember(result.member); setSelectedMemberId(result.member.id); setMode("success");
      setNotice(`${result.member.displayName} has been added.`);
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ invite: Invite }>("/api/household/invites", jsonInit("POST", {
        targetMemberId: selectedMemberId || null, accessLevel: form.get("accessLevel"),
        ageBand: form.get("ageBand"), expiry: form.get("expiry")
      }));
      setLatestInvite(result.invite); setMode("success"); setNotice(selectedMemberId
        ? `Invitation ready for ${result.invite.targetName}.` : "Household invitation ready.");
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function revealQr() {
    if (!latestInvite?.inviteUrl) return;
    qrReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQr(await QRCode.toDataURL(latestInvite.inviteUrl, { width: 280, margin: 2 }));
    setShowQr(true);
  }
  async function revoke(inviteId: string) {
    setBusy(true); setError("");
    try {
      await api(`/api/household/invites/${inviteId}/revoke`, jsonInit("POST"));
      setNotice("Invitation revoked."); await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function regenerate(invite: Invite) {
    setBusy(true); setError("");
    try {
      const result = await api<{ invite: Invite }>(`/api/household/invites/${invite.id}/regenerate`,
        jsonInit("POST", { expiry: "7_days" }));
      setLatestInvite(result.invite); setMode("success"); setNotice("A fresh invitation is ready.");
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function review(request: JoinRequest, decision: "approve" | "decline") {
    setBusy(true); setError("");
    try {
      await api(`/api/household/join-requests/${request.id}/${decision}`, jsonInit("POST", {
        resolution: request.requestedMemberId ? "link" : "create_new", displayName: request.displayName
      }));
      setNotice(decision === "approve" ? `${request.displayName} has joined the household.` : "Join request declined.");
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function reviewSuggestion(suggestion: Suggestion, decision: "accepted" | "declined") {
    setBusy(true); setError("");
    try {
      await api(`/api/household/task-suggestions/${suggestion.id}/review`, jsonInit("POST", { decision }));
      setNotice(decision === "accepted"
        ? `"${suggestion.title}" was accepted as an idea. No routine or task was created.`
        : `"${suggestion.title}" was declined.`);
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function editMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/household/members/${selectedMemberId}`, jsonInit("PATCH", {
        displayName: form.get("displayName"), accessLevel: form.get("accessLevel"),
        ageBand: form.get("ageBand")
      }));
      setNotice("Family member updated."); setMode("overview"); await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function suspendMember() {
    if (!selectedMemberId) return;
    setBusy(true); setError("");
    try {
      await api(`/api/household/members/${selectedMemberId}/suspend`, jsonInit("POST"));
      setNotice("Access suspended and active sessions revoked."); setMode("overview");
      await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function saveManagedAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    if (!managedAvatar) { setBusy(false); return; }
    try {
      await api(`/api/household/members/${selectedMemberId}/avatar`, jsonInit("PUT", {
        ...managedAvatar,
        expressionKey: form.get("expressionKey")
      }));
      setNotice("Avatar appearance saved."); await load(); await refreshDashboard();
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  const unclaimed = members.filter((member) => !member.hasAccount &&
    !["left", "suspended"].includes(member.lifecycleState || "unclaimed"));
  const selectedMember = members.find(({ id }) => id === selectedMemberId);
  const canManageAvatar = selectedMember ? memberAccess(selectedMember) === "managed_member" : false;
  const selectedAvatar = managedAvatar || (selectedMember ? avatarFor(selectedMember) : null);
  const mayManage = (member: DashboardMember) => dashboard.currentUser.role === "owner" ||
    memberAccess(member) === "managed_member";

  return <section className="family-panel" aria-labelledby="family-panel-title">
    <div className="setup-panel-heading"><div><p className="eyebrow">Dashboard → Family</p>
      <h1 id="family-panel-title">{mode === "add" ? "Add family member" : mode === "invite" ? "Invite family" :
        mode === "manage" ? `Manage ${selectedMember?.displayName || "family member"}` : "Your family"}</h1>
      <p>Add the people who share this home so Cradle can organise responsibilities.</p></div>
      <button className="text-button" onClick={onClose}>Close</button></div>
    {notice && <p className="success-message" role="status">{notice}</p>}
    {error && <div className="local-error"><p className="error" role="alert">{error}</p>
      <button onClick={() => setError("")}>Try again</button><button onClick={onClose}>Back to Dashboard</button></div>}

    {mode === "overview" && <div className="family-management-grid">
      <section className="dashboard-card"><h2>Family members</h2>
        <div className="family-manage-list">{members.map((member) => <article key={member.id}>
          <FamilyAvatar name={member.preferredName || member.displayName} avatar={avatarFor(member)} /><div><strong>{member.preferredName || member.displayName}</strong>
            <small>{accessLevelLabel(memberAccess(member))} · {ageBandLabel(memberAgeBand(member))} · {
              lifecycleLabel(member.lifecycleState as MemberLifecycleState)}</small></div>
          {member.role !== "owner" && mayManage(member) &&
            <button onClick={() => { setSelectedMemberId(member.id); setManagedAvatar(avatarFor(member)); setMode("manage"); }}>Manage</button>}
          {!member.hasAccount && member.role !== "owner" && <button onClick={() => { setSelectedMemberId(member.id); setMode("invite"); }}>Invite</button>}
        </article>)}</div>
        <div className="row-actions"><button className="primary" onClick={() => { setNewMemberKey(clientKey()); setNewAccessLevel("household_member"); setMode("add"); }}><CradleIcon name="add" size="sm" decorative /> Add family member</button>
          <button onClick={() => { setSelectedMemberId(""); setMode("invite"); }}>General invite</button><button onClick={onClose}>Done</button></div></section>
      <section className="dashboard-card"><h2>Invitations</h2>
        {!invites.length && <div className="empty-action"><p>No invitations are waiting.</p>
          <button onClick={() => setMode("invite")}>Invite family</button><button onClick={onClose}>Back to Dashboard</button></div>}
        {invites.map((invite) => <article className="invite-row" key={invite.id}><div><strong>{invite.targetName || "Household invitation"}</strong>
          <small>{invite.status} · expires {new Date(invite.expiresAt).toLocaleDateString()}</small></div>
          {invite.status === "active" && <div className="row-actions"><button disabled={busy} onClick={() => void regenerate(invite)}>Resend</button>
            <button disabled={busy} onClick={() => void revoke(invite.id)}>Revoke</button></div>}</article>)}</section>
      <section className="dashboard-card"><h2>Join requests</h2>
        {!requests.length && <div className="empty-action"><p>No join requests are waiting.</p><button onClick={onClose}>Back to Dashboard</button></div>}
        {requests.map((request) => <article className="join-request" key={request.id}><p><strong>{request.displayName}</strong> wants to join
          {request.requestedMemberName ? ` as ${request.requestedMemberName}` : ""}.</p><div className="row-actions">
            <button className="primary" disabled={busy} onClick={() => void review(request, "approve")}>
              {request.requestedMemberId ? `Welcome ${request.requestedMemberName}` : "Add as a family member"}</button>
            <button disabled={busy} onClick={() => void review(request, "decline")}>Decline</button></div></article>)}</section>
      <section className="dashboard-card"><h2>Household ideas</h2>
        {!suggestions.filter(({ status }) => status === "open").length && <div className="empty-action">
          <p>No task suggestions need review.</p><button onClick={onClose}>Back to Dashboard</button></div>}
        {suggestions.filter(({ status }) => status === "open").map((suggestion) => <article className="join-request" key={suggestion.id}>
          <p><strong>{suggestion.title}</strong> from {suggestion.suggestedByName}
            {(suggestion.roomName || suggestion.petName) ? ` · ${suggestion.roomName || suggestion.petName}` : ""}</p>
          {suggestion.note && <p>{suggestion.note}</p>}
          <div className="row-actions"><button className="primary" disabled={busy}
            onClick={() => void reviewSuggestion(suggestion, "accepted")}>Accept idea</button>
          <button disabled={busy} onClick={() => void reviewSuggestion(suggestion, "declined")}>Decline</button></div>
          <small>Accepting the idea keeps it for your household to plan later. It will not create a routine or task.</small>
        </article>)}</section>
    </div>}

    {mode === "add" && <form className="focused-form dashboard-card" onSubmit={addMember}>
      <label><span>Name</span><input name="displayName" required autoFocus /></label>
      <fieldset className="access-level-fieldset" aria-describedby="access-level-help"><legend>What can this person manage?</legend>
        <small className="fieldset-helper" id="access-level-help">This controls what they can change in Cradle.</small>
        {MEMBER_ACCESS_LEVELS.map((choice) => <label className={`choice-description ${newAccessLevel === choice.value ? "selected" : ""}`} key={choice.value}>
          <input type="radio" name="accessLevel" value={choice.value} checked={newAccessLevel === choice.value}
            onChange={() => setNewAccessLevel(choice.value)} />
          <span><strong>{choice.label}</strong><small>{choice.description}</small></span></label>)}</fieldset>
      <label><span>What age group are they in?</span><select name="ageBand">
        {MEMBER_AGE_BANDS.map((group) => <option value={group.value} key={group.value}>{group.label}</option>)}</select>
        <small>Age group helps Cradle suggest suitable household work and display age-appropriate controls.</small></label>
      <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Adding…" : "Add family member"}</button>
        <button type="button" onClick={() => setMode("overview")}>Cancel</button><button type="button" onClick={onClose}>Back to Dashboard</button></div>
    </form>}

    {mode === "invite" && <form className="focused-form dashboard-card" onSubmit={createInvite}>
      {selectedMemberId ? <MemberSelector members={unclaimed} label="Invite family member" value={selectedMemberId}
        onChange={setSelectedMemberId} includeUnclaimed /> : <>
        <p>This link lets someone ask to join your household. Household leaders will make sure they join the right family member.</p>
        <label><span>What can this person manage?</span><select name="accessLevel">
          {MEMBER_ACCESS_LEVELS.filter(({ value }) => value !== "managed_member").map((choice) =>
            <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>
        <label><span>What age group are they in?</span><select name="ageBand">
          {MEMBER_AGE_BANDS.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label></>}
      <label><span>Invitation expires</span><select name="expiry" defaultValue="7_days">
        <option value="24_hours">24 hours</option><option value="7_days">7 days</option><option value="30_days">30 days</option></select></label>
      <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button>
        <button type="button" onClick={() => setMode("overview")}>Cancel</button><button type="button" onClick={onClose}>Back to Dashboard</button></div>
    </form>}

    {mode === "manage" && selectedMember && <div className="family-management-grid">
      <form className="focused-form dashboard-card" onSubmit={editMember}>
        <h2>Family member</h2>
        <label><span>Name</span><input name="displayName" required autoFocus defaultValue={selectedMember.displayName} /></label>
        <label><span>What can this person manage?</span><select name="accessLevel" defaultValue={memberAccess(selectedMember)}>
          {MEMBER_ACCESS_LEVELS.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>
        <label><span>What age group are they in?</span><select name="ageBand" defaultValue={memberAgeBand(selectedMember)}>
          {MEMBER_AGE_BANDS.map((choice) => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select>
          <small>Age describes suitable controls and suggestions. It never grants admin access.</small></label>
        <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          <button type="button" onClick={() => setMode("overview")}>Cancel</button><button type="button" onClick={onClose}>Back to Dashboard</button></div>
        {!["suspended", "left"].includes(selectedMember.lifecycleState || "") &&
          <button className="danger-button" type="button" disabled={busy} onClick={() => void suspendMember()}>Pause access</button>}
      </form>
      {canManageAvatar && selectedAvatar && <form className="focused-form dashboard-card" onSubmit={saveManagedAvatar}>
        <h2>Family avatar</h2><FamilyAvatar name={selectedMember.preferredName || selectedMember.displayName} avatar={selectedAvatar} />
        <p>A Household admin can customise a Managed member’s cat until they manage it themselves.</p>
        <AvatarPalette avatar={selectedAvatar} onChange={setManagedAvatar} namePrefix={`managed-avatar-${selectedMember.id}`} />
        <label><span>Expression</span><select name="expressionKey" defaultValue={selectedAvatar.expressionKey}>
          {COMPANION_EXPRESSIONS.map(({ key }) => <option key={key}>{key}</option>)}</select></label>
        <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save appearance"}</button>
          <button type="button" onClick={() => setMode("overview")}>Done</button></div>
      </form>}
    </div>}

    {mode === "success" && <section className="dashboard-card invite-success">
      <h2>{notice || "All done."}</h2>
      {createdMember && !latestInvite && <div className="choice-actions">
        {memberAccess(createdMember) !== "managed_member" && <button className="primary" onClick={() => { setSelectedMemberId(createdMember.id); setMode("invite"); }}>Invite now</button>}
        <button onClick={() => { setCreatedMember(null); setNewMemberKey(clientKey()); setNewAccessLevel("household_member"); setMode("add"); }}>Add another</button>
        <button onClick={() => { setCreatedMember(null); setMode("overview"); }}>Invite later</button><button onClick={onClose}>Done</button></div>}
      {latestInvite && <><dl><div><dt>Private invite link</dt><dd className="break-value">{latestInvite.inviteUrl}</dd></div>
        <div><dt>Joining code</dt><dd className="invite-code">{latestInvite.code}</dd></div></dl>
        <div className="choice-actions"><button onClick={() => void copy(latestInvite.inviteUrl || "").then(() => setNotice("Invite link copied."))}>Copy link</button>
          <button onClick={() => void copy(latestInvite.code || "").then(() => setNotice("Joining code copied."))}>Copy code</button>
          <button onClick={() => void revealQr()}>Show QR code</button>
          {"share" in navigator && <button onClick={() => void navigator.share({ title: "Join my Cradle household", url: latestInvite.inviteUrl })}>Share</button>}
          <button className="primary" onClick={onClose}>Done</button></div>
        {showQr && <div ref={qrRef} className="qr-dialog" role="dialog" aria-modal="true" aria-label="Invitation QR code">
          <button aria-label="Close QR code" onClick={() => setShowQr(false)}>Close</button><img src={qr} alt="Scannable household invitation QR code" />
          <p>Scan to open the private invitation link.</p><button onClick={() => setShowQr(false)}>Done</button></div>}</>}
    </section>}
  </section>;
}
