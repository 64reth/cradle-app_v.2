import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ROOM_TYPES, ROUTINE_FREQUENCIES, frequencyLabel, type RoomType, type RoutineFrequency } from "../shared/routines";
import type { PetType } from "../shared/pets";
import { memberAvatar, memberAvatarTone, type MemberAvatar } from "../shared/member-avatar";
import { api, failureMessage, jsonInit } from "./api";
import { FamilyPanel } from "./Family";
import { eventTypeLabel, type EventRecurrence, type HouseholdEventType } from "../shared/coordination";
import { FamilyAvatar } from "./FamilyAvatar";
import type { RoutineAssignmentMode } from "../shared/assignments";
import { MemberSelector } from "./MemberSelector";
import { CradleIcon } from "./components/ui/CradleIcon";
import type { TogetherMoment } from "../shared/together";
import { participantContext } from "../shared/together";
import { AnimatePresence, MotionButtonFeedback, MotionList, MotionListItem, MotionPage } from "./motion";

export type AuthenticatedView = "dashboard" | "systems" | "calendar" | "me" | "meals" | "together" | "operations";
export type DashboardMember = {
  id: string; displayName: string; preferredName?: string | null; role: string;
  accessLevel?: string; ageBand?: string; ageGroup?: string | null;
  lifecycleState?: string; relationshipLabel?: string | null; hasAccount?: number;
  avatarId?: string | null; avatarFurPaletteKey?: MemberAvatar["furPaletteKey"] | null;
  avatarPatchPrimaryPaletteKey?: MemberAvatar["patchPrimaryPaletteKey"] | null;
  avatarPatchSecondaryPaletteKey?: MemberAvatar["patchSecondaryPaletteKey"] | null;
  avatarExpressionKey?: MemberAvatar["expressionKey"] | null;
  dailyProgress?: {
    percentage: number; status: string; expression: MemberAvatar["expressionKey"];
    assigned: number; complete: number; overdue: number; hasWork: boolean;
  };
};
export type RoutineSummary = {
  id: string; name: string; status: "draft" | "active" | "paused" | "archived"; frequency: RoutineFrequency;
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  ownerMemberId: string; ownerName: string; note: string | null; stepCount: number;
  sourceKind: "template" | "custom"; sourceTemplateKey: string | null; rotationEnabled: boolean;
  rotationMemberIds: string[];
  assignmentMode?: RoutineAssignmentMode; assignedMemberId?: string | null;
  participantMemberIds?: string[]; rotationNextIndex?: number;
};
export type RoutineRecommendation = {
  selectionKey: string; templateKey: string; templateVersion: number; contextType: "room" | "pet";
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  name: string; frequency: RoutineFrequency; estimatedMinutes: number; defaultEnabled: boolean;
  steps: readonly string[]; defaultAssignment: "rotate" | "assigned"; configuredRoutine: RoutineSummary | null;
};
export type DashboardData = {
  household: { name: string; reference: string; timezone?: string };
  currentUser: { id: string; displayName: string; role: string; accessLevel?: string; ageBand?: string };
  members: DashboardMember[];
  rooms: Array<{ id: string; name: string; roomType: RoomType }>;
  pets: Array<{ id: string; name: string; petType: PetType }>;
  family: { canManage: boolean; pendingInviteCount: number; joinRequestCount: number };
  suggestions: { canReview: boolean; openCount: number };
  schedule: {
    canCreate: boolean; canCreateLeadership: boolean; upcomingCount: number;
    upcoming: Array<{ id: string; title: string; eventType: HouseholdEventType; startsAt: string;
      endsAt: string | null; recurrence: EventRecurrence; reminderMinutes: number | null;
      visibility: "household" | "leadership" }>;
  };
  setup: { canManage: boolean; routinesChosen: boolean; readyForPlanning: boolean; complete?: boolean;
    steps: Array<{ key: string; label: string; complete: boolean }> };
  recommendations: RoutineRecommendation[];
  routines: RoutineSummary[];
  activeRoutineCount: number;
  incompleteTaskCount?: number;
  todayMissions?: Array<{
    id: string; title: string; roomName: string | null; petName: string | null;
    duePeriod: string; dueAt: string | null; assignmentMode: RoutineAssignmentMode | "manual";
    state: string; participants: Array<{ memberId: string; memberName: string; status: string; participantKind: "required" | "helper" }>;
  }>;
  todayMission: { state: "setup" | "ready" | "waiting"; message: string };
  currentDate: string;
  deferredModules: string[];
  together?: { localDate: string; moments: TogetherMoment[] };
};

type Choice = {
  enabled: boolean; frequency: RoutineFrequency; assignedMemberId: string; assignmentMode: RoutineAssignmentMode;
  participantMemberIds: string[]; customisedName: string; note: string; customFrequencyNote: string;
};
type CustomChoice = {
  clientKey: string; contextType: "room" | "pet" | "household"; roomId: string | null; petId: string | null;
  name: string; frequency: RoutineFrequency; assignedMemberId: string; note: string; customFrequencyNote: string;
};
type ApplySelection = {
  templateKey: string | null; clientKey: string | null; enabled: boolean;
  roomId: string | null; petId: string | null; frequency: RoutineFrequency;
  assignmentMode: RoutineAssignmentMode; assignedMemberId: string | null;
  participantMemberIds: string[]; customisedName: string; note: string;
  customFrequencyNote: string;
};

const key = () => crypto.randomUUID();
const groupKey = (recommendation: RoutineRecommendation) =>
  `${recommendation.contextType}:${recommendation.roomId || recommendation.petId}`;

function Navigation({ active, navigate, signOut }: {
  active: AuthenticatedView; navigate: (view: AuthenticatedView) => void; signOut: () => void;
}) {
  return <header className="dashboard-nav">
    <button className="brand-button" onClick={() => navigate("dashboard")} aria-label="Cradle Dashboard"><CradleIcon name="household" decorative /> Cradle</button>
    <nav aria-label="Primary navigation">
      <button aria-current={active === "dashboard" ? "page" : undefined} onClick={() => navigate("dashboard")}><CradleIcon name="dashboard" decorative /> Dashboard</button>
      <button aria-current={active === "systems" ? "page" : undefined} onClick={() => navigate("systems")}><CradleIcon name="routine" decorative /> Routines</button>
      <button aria-current={active === "calendar" ? "page" : undefined}
        onClick={() => navigate("calendar")}><CradleIcon name="calendar" decorative /> Schedule</button>
      <button aria-current={active === "meals" ? "page" : undefined}
        onClick={() => navigate("meals")}><CradleIcon name="cooking" decorative /> Meals</button>
      <button aria-current={active === "together" ? "page" : undefined}
        onClick={() => navigate("together")}><CradleIcon name="family" decorative /> Together</button>
      <button aria-current={active === "me" ? "page" : undefined} onClick={() => navigate("me")}><CradleIcon name="member" decorative /> My Cradle</button>
    </nav>
    <button className="nav-signout" onClick={signOut}>Sign out</button>
  </header>;
}

function RoutineSetup({ dashboard, onClose, onApplied }: {
  dashboard: DashboardData; onClose: () => void; onApplied: (data: DashboardData) => void;
}) {
  const eligibleMembers = dashboard.members;
  const defaultOwner = eligibleMembers.find(({ role }) => role === "owner")?.id ||
    eligibleMembers[0]?.id || dashboard.currentUser.id;
  const groups = useMemo(() => {
    const grouped = new Map<string, RoutineRecommendation[]>();
    for (const recommendation of dashboard.recommendations) {
      const id = groupKey(recommendation);
      grouped.set(id, [...(grouped.get(id) || []), recommendation]);
    }
    return [...grouped.values()];
  }, [dashboard.recommendations]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(
    dashboard.recommendations.map((recommendation) => {
      const configured = recommendation.configuredRoutine;
      return [recommendation.selectionKey, {
        enabled: configured ? configured.status === "active" : recommendation.defaultEnabled,
        frequency: configured?.frequency || recommendation.frequency,
        assignedMemberId: configured?.assignedMemberId || defaultOwner,
        assignmentMode: configured?.assignmentMode || (
          recommendation.defaultAssignment === "rotate" && eligibleMembers.length ? "rotation" : "one_person"),
        participantMemberIds: configured?.participantMemberIds ||
          (recommendation.defaultAssignment === "rotate" && eligibleMembers.length > 1
            ? eligibleMembers.map(({ id }) => id) : []),
        customisedName: configured?.name !== recommendation.name ? configured?.name || "" : "",
        note: configured?.note || "", customFrequencyNote: ""
      }];
    })
  ));
  const [custom, setCustom] = useState<CustomChoice[]>([]);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newCustomFrequency, setNewCustomFrequency] = useState<RoutineFrequency>("weekly");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const group = groups[groupIndex]; const finalIndex = Math.max(0, groups.length - 1);
  const context = group?.[0];
  const contextLabel = context?.roomName || context?.petName || "Your household";
  const update = (selectionKey: string, patch: Partial<Choice>) =>
    setChoices((current) => ({ ...current, [selectionKey]: { ...current[selectionKey], ...patch } }));
  function addCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim(); if (!name) return;
    setCustom((items) => [...items, {
      clientKey: key(), contextType: context?.contextType || "household",
      roomId: context?.roomId || null, petId: context?.petId || null, name,
      frequency: form.get("frequency") as RoutineFrequency,
      assignedMemberId: String(form.get("assignedMemberId") || defaultOwner),
      note: String(form.get("note") || "").trim(),
      customFrequencyNote: String(form.get("customFrequencyNote") || "").trim()
    }]);
    setAddingCustom(false);
  }
  async function apply() {
    setBusy(true); setError("");
    const selections: ApplySelection[] = [...dashboard.recommendations.map((recommendation) => {
      const choice = choices[recommendation.selectionKey];
      return {
        templateKey: recommendation.templateKey, clientKey: null, enabled: choice.enabled,
        roomId: recommendation.roomId, petId: recommendation.petId, frequency: choice.frequency,
        assignmentMode: choice.assignmentMode,
        assignedMemberId: choice.assignmentMode === "one_person" ? choice.assignedMemberId : null,
        participantMemberIds: ["rotation", "shared_team"].includes(choice.assignmentMode)
          ? choice.participantMemberIds : [],
        customisedName: choice.customisedName, note: choice.note, customFrequencyNote: choice.customFrequencyNote
      };
    }), ...custom.map((routine) => ({
      templateKey: null, clientKey: routine.clientKey, enabled: true, roomId: routine.roomId, petId: routine.petId,
      frequency: routine.frequency, assignmentMode: "one_person" as const,
      assignedMemberId: routine.assignedMemberId, participantMemberIds: [] as string[],
      customisedName: routine.name, note: routine.note,
      customFrequencyNote: routine.customFrequencyNote
    }))];
    try {
      const result = await api<DashboardData>("/api/household/routine-setup/apply", jsonInit("POST", { selections }));
      onApplied(result);
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  if (!groups.length) return <section className="routine-setup-panel" aria-labelledby="routine-setup-title">
    <button className="text-button" onClick={onClose}><CradleIcon name="back" decorative /> Dashboard</button><h2 id="routine-setup-title">Your home is ready for custom routines.</h2>
    <p>You can add more later from Routines.</p></section>;
  return <section className="routine-setup-panel" aria-labelledby="routine-setup-title">
    <div className="setup-panel-heading"><div><p className="eyebrow">Step {groupIndex + 1} of {groups.length}</p>
      <h2 id="routine-setup-title">Choose what happens in {contextLabel}</h2>
      <p>Cradle suggested these from your {context?.contextType === "pet" ? "Pet" : "Room"}. You can change any of this later.</p></div>
      <button className="text-button" onClick={onClose}>Close</button></div>
    <div className="setup-dots" aria-label={`Setup step ${groupIndex + 1} of ${groups.length}`}>
      {groups.map((_, index) => <span key={index} className={index === groupIndex ? "current" : index < groupIndex ? "done" : ""} />)}
    </div>
    <div className="recommendation-list">{group.map((recommendation) => {
      const choice = choices[recommendation.selectionKey];
      return <article className={`recommendation-card ${choice.enabled ? "selected" : ""}`} key={recommendation.selectionKey}>
        <div className="recommendation-title"><label className="switch-label"><input type="checkbox" checked={choice.enabled}
          onChange={(event) => update(recommendation.selectionKey, { enabled: event.target.checked })} />
          <span>{choice.customisedName || recommendation.name}</span></label><span>{recommendation.estimatedMinutes} min</span></div>
        {choice.enabled && <div className="routine-quick-controls">
          <label><span>How often?</span><select value={choice.frequency}
            onChange={(event) => update(recommendation.selectionKey, { frequency: event.target.value as RoutineFrequency })}>
            {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}
          </select></label>
          {choice.frequency === "custom" && <label><span>Custom timing</span><input value={choice.customFrequencyNote}
            placeholder="For example, on the first Sunday"
            onChange={(event) => update(recommendation.selectionKey, { customFrequencyNote: event.target.value })} /></label>}
          <label><span>How is this shared?</span><select value={choice.assignmentMode}
            onChange={(event) => update(recommendation.selectionKey, {
              assignmentMode: event.target.value as RoutineAssignmentMode
            })}>
            <option value="rotation">Rotation</option><option value="one_person">One person</option>
            <option value="shared_team">Shared team</option><option value="decide_later">Decide later</option>
          </select></label>
          {choice.assignmentMode === "one_person" && <MemberSelector members={eligibleMembers} label="Who takes this?"
            value={choice.assignedMemberId} onChange={(memberId) => update(recommendation.selectionKey, { assignedMemberId: memberId })} />}
          {(choice.assignmentMode === "rotation" || choice.assignmentMode === "shared_team") &&
            <MemberSelector members={eligibleMembers} multiple values={choice.participantMemberIds}
              label={choice.assignmentMode === "rotation" ? "Rotation participants" : "Shared team"}
              helperText={choice.assignmentMode === "rotation" ? "One person takes each turn." : "Everyone contributes to one mission."}
              onValuesChange={(participantMemberIds) => update(recommendation.selectionKey, { participantMemberIds })} />}
          {choice.assignmentMode === "decide_later" && <p className="soft-notice">This stays unassigned until reviewed.</p>}
          <details><summary>See what’s included</summary><ul>{recommendation.steps.map((step) => <li key={step}>{step}</li>)}</ul></details>
          <details><summary>Make it your own</summary>
            <label><span>Edit label</span><input value={choice.customisedName}
              placeholder={recommendation.name} onChange={(event) => update(recommendation.selectionKey, { customisedName: event.target.value })} /></label>
            <label><span>Optional short note</span><textarea value={choice.note}
              onChange={(event) => update(recommendation.selectionKey, { note: event.target.value })} /></label>
          </details>
        </div>}
      </article>;
    })}</div>
    {custom.filter((routine) => routine.roomId === context?.roomId && routine.petId === context?.petId).map((routine) =>
      <article className="custom-routine-summary" key={routine.clientKey}><strong>{routine.name}</strong>
        <span>{frequencyLabel(routine.frequency)}</span><button onClick={() => setCustom((items) => items.filter(({ clientKey }) => clientKey !== routine.clientKey))}>Remove</button></article>)}
    {addingCustom ? <form className="custom-routine-form" onSubmit={addCustom}>
      <h3>Add something for {contextLabel}</h3>
      <label><span>What needs doing?</span><input name="name" required autoFocus /></label>
      <label><span>How often?</span><select name="frequency" value={newCustomFrequency}
        onChange={(event) => setNewCustomFrequency(event.target.value as RoutineFrequency)}>
        {ROUTINE_FREQUENCIES.map((frequency) => <option value={frequency.value} key={frequency.value}>{frequency.label}</option>)}</select></label>
      {newCustomFrequency === "custom" && <label><span>Custom timing</span><input name="customFrequencyNote"
        placeholder="For example, on the first Sunday" /></label>}
      <label><span>Who usually handles it?</span><select name="assignedMemberId" defaultValue={defaultOwner}>
        <option value={defaultOwner}>{eligibleMembers.find(({ id }) => id === defaultOwner)?.displayName}</option>
        {eligibleMembers.filter(({ id }) => id !== defaultOwner).map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label>
      <label><span>Optional short note</span><textarea name="note" /></label>
      <div className="row-actions"><button className="primary">Add routine</button><button type="button" onClick={() => setAddingCustom(false)}>Cancel</button></div>
      </form> : <button className="add-routine-button" onClick={() => setAddingCustom(true)}><CradleIcon name="add" size="sm" decorative /> Add something for {contextLabel}</button>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="setup-panel-actions">
      <button disabled={groupIndex === 0 || busy} onClick={() => setGroupIndex((index) => index - 1)}>Back</button>
      {groupIndex < finalIndex
        ? <button className="primary" disabled={busy} onClick={() => setGroupIndex((index) => index + 1)}>Next room</button>
        : <button className="primary" disabled={busy} onClick={() => void apply()}>{busy ? "Saving your plan…" : "Save household plan"}</button>}
    </div>
  </section>;
}

function avatarFor(member: DashboardMember, celebrating = false): MemberAvatar {
  const percentage = member.dailyProgress?.percentage ?? 100;
  const thresholdExpression = percentage >= 76 ? "on_track" : percentage >= 51 ? "calm" : "behind";
  return memberAvatar({
    furPaletteKey: member.avatarFurPaletteKey || undefined,
    patchPrimaryPaletteKey: member.avatarPatchPrimaryPaletteKey || undefined,
    patchSecondaryPaletteKey: member.avatarPatchSecondaryPaletteKey || undefined,
    expressionKey: celebrating ? "completed" : thresholdExpression
  });
}

function familyStatus(member: DashboardMember): string {
  if (member.dailyProgress) return member.dailyProgress.status;
  if (member.lifecycleState === "managed") return "Managed profile";
  if (member.lifecycleState === "invited") return "Invite pending";
  if (member.lifecycleState === "unclaimed" || member.lifecycleState === "join_requested") return "Waiting to join";
  if (!member.avatarId) return "Customise avatar";
  return "Ready";
}

function isoWeek(dateString: string): number {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function FamilyStatusCard({ member, activate, celebrating = false }: {
  member: DashboardMember;
  activate: (element: HTMLButtonElement) => void;
  celebrating?: boolean;
}) {
  const [scowling, setScowling] = useState(false);
  const name = member.preferredName || member.displayName;
  const status = familyStatus(member);
  const percentage = member.dailyProgress?.percentage ?? 100;
  const tone = percentage >= 76 ? "positive" : percentage >= 51 ? "steady" : percentage >= 26 ? "attention" : "support";
  useEffect(() => {
    if (percentage > 25 || celebrating) { setScowling(false); return; }
    let active = true; let timeout: number | undefined; let cycle: number | undefined;
    const offset = [...member.id].reduce((total, character) => total + character.charCodeAt(0), 0) % 6000;
    const trigger = () => {
      if (!active) return;
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
        setScowling(true); timeout = window.setTimeout(() => setScowling(false), 1000);
      }
      cycle = window.setTimeout(trigger, 8000 + offset);
    };
    cycle = window.setTimeout(trigger, 8000 + offset);
    return () => { active = false; if (cycle) window.clearTimeout(cycle); if (timeout) window.clearTimeout(timeout); };
  }, [member.id, percentage, celebrating]);
  const expressionAvatar = celebrating ? "completed" : percentage <= 25 && scowling ? "needs_help" : undefined;
  return <button className={`family-status-card avatar-tone-${memberAvatarTone(member.id)} ${celebrating ? "celebrating" : ""} ${percentage <= 25 ? "low-support" : ""} ${scowling ? "scowling" : ""}`}
    aria-label={`${name}: ${status}`} onClick={(event) => activate(event.currentTarget)}>
    <span className="family-status-avatar">
      <FamilyAvatar name={name} avatar={expressionAvatar ? { ...avatarFor(member), expressionKey: expressionAvatar } : avatarFor(member, celebrating)} />
    </span>
    <span className="family-status-info">
      <strong>{name}</strong>
      <span>{status}</span>
      <span className="family-progress" role="progressbar" aria-label={`${name} daily household progress`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <span className={`family-progress-fill ${tone}`} style={{ width: `${percentage}%` }} />
      </span>
      <small>{percentage}%</small>
    </span>
  </button>;
}

export function Dashboard({ data, setData, navigate, signOut, startSetup = false, onSetupOpened,
  startFamily = false, onFamilyOpened, suggest, openPersonalMember }: {
  data: DashboardData; setData: (data: DashboardData) => void; navigate: (view: AuthenticatedView) => void;
  signOut: () => void; startSetup?: boolean; onSetupOpened?: () => void; startFamily?: boolean;
  onFamilyOpened?: () => void; suggest?: () => void;
  openPersonalMember?: (memberId: string) => void;
}) {
  const [setupOpen, setSetupOpen] = useState(startSetup);
  const [familyOpen, setFamilyOpen] = useState(startFamily);
  const [familyMemberToManage, setFamilyMemberToManage] = useState<string | undefined>();
  const [focusedMember, setFocusedMember] = useState<DashboardMember | null>(null);
  const checklistComplete = data.setup.complete ??
    (data.setup.readyForPlanning && data.setup.steps.every(({ complete }) => complete));
  const [setupReviewOpen, setSetupReviewOpen] = useState(!checklistComplete);
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [celebratingMemberIds, setCelebratingMemberIds] = useState<string[]>(() => {
    try {
      const value = JSON.parse(window.sessionStorage.getItem("cradle:task-celebration") || "[]");
      window.sessionStorage.removeItem("cradle:task-celebration");
      return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
    } catch { return []; }
  });
  const memberDialogRef = useRef<HTMLElement | null>(null);
  const memberReturnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (startSetup) { setSetupOpen(true); onSetupOpened?.(); } }, [startSetup, onSetupOpened]);
  useEffect(() => { if (startFamily) { setFamilyOpen(true); onFamilyOpened?.(); } }, [startFamily, onFamilyOpened]);
  useEffect(() => { setSetupReviewOpen(!checklistComplete); }, [checklistComplete]);
  useEffect(() => {
    if (!celebratingMemberIds.length) return;
    const timer = window.setTimeout(() => setCelebratingMemberIds([]), 950);
    return () => window.clearTimeout(timer);
  }, [celebratingMemberIds]);
  useEffect(() => {
    if (!focusedMember) return;
    const dialog = memberDialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") || [])];
    requestAnimationFrame(() => focusable()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setFocusedMember(null); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (memberReturnFocusRef.current?.isConnected) memberReturnFocusRef.current.focus();
    };
  }, [focusedMember]);
  const currentDate = new Date(`${data.currentDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(currentDate);
  const calendarDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", timeZone: "UTC" }).format(currentDate);
  const nextSetupStep = data.setup.steps.find(({ complete }) => !complete);
  const [missionBusy, setMissionBusy] = useState<string | null>(null);
  const [missionError, setMissionError] = useState("");
  async function addRequiredRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRoomBusy(true); setSetupError("");
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    try {
      await api("/api/household/rooms", jsonInit("POST", values));
      setData(await api<DashboardData>("/api/dashboard")); setRoomFormOpen(false); form.reset();
    } catch (reason) { setSetupError(failureMessage(reason)); }
    finally { setRoomBusy(false); }
  }
  function continueHomeSetup() {
    if (nextSetupStep?.key === "rooms") { setRoomFormOpen(true); return; }
    if (nextSetupStep?.key === "members") { setFamilyOpen(true); return; }
    setSetupOpen(true);
  }
  async function completeMission(mission: NonNullable<DashboardData["todayMissions"]>[number]) {
    setMissionBusy(mission.id); setMissionError("");
    const currentMember = mission.participants.find(({ memberId, status }) =>
      memberId === data.currentUser.id && status !== "complete");
    const canOverride = data.currentUser.accessLevel === "household_admin" &&
      mission.participants.some(({ memberId, status, participantKind }) =>
        participantKind === "required" && status !== "complete" && data.members.find((member) => member.id === memberId)?.accessLevel === "managed_member");
    if (!currentMember && !canOverride) {
      setMissionError("This mission is assigned to another family member."); setMissionBusy(null); return;
    }
    try {
      const result = await api<{ celebrationMemberIds?: string[] }>(`/api/household/tasks/${mission.id}/complete`, jsonInit("POST", canOverride ? { override: true } : {}));
      if (result.celebrationMemberIds?.length) setCelebratingMemberIds(result.celebrationMemberIds);
      setData(await api<DashboardData>("/api/dashboard"));
    } catch (reason) { setMissionError(failureMessage(reason)); }
    finally { setMissionBusy(null); }
  }
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const familyName = /\bfamily$/i.test(data.household.name.trim())
    ? data.household.name.trim() : `${data.household.name.trim()} Family`;
  if (familyOpen) return <div className="dashboard-shell"><Navigation active="dashboard" navigate={navigate} signOut={signOut} /><MotionPage motionKey="family" className="motion-page">
    <FamilyPanel dashboard={data} initialMemberId={familyMemberToManage}
      onClose={() => { setFamilyOpen(false); setFamilyMemberToManage(undefined); }} onChanged={setData} /></MotionPage></div>;
  if (setupOpen) return <div className="dashboard-shell"><Navigation active="dashboard" navigate={navigate} signOut={signOut} /><MotionPage motionKey="routine-setup" className="motion-page">
    <RoutineSetup dashboard={data} onClose={() => setSetupOpen(false)} onApplied={(next) => { setData(next); setSetupOpen(false); }} /></MotionPage></div>;
  return <div className="dashboard-shell"><Navigation active="dashboard" navigate={navigate} signOut={signOut} /><MotionPage motionKey="dashboard" className="motion-page">
    <section className="dashboard-greeting"><div>
      <h1>{greeting} {familyName}</h1><p>Signed in as {data.currentUser.displayName}</p></div>
      <div className="date-card" aria-label={`${weekday}, ${calendarDate}, week ${isoWeek(data.currentDate)}`}>
        <span>{weekday}</span><strong>{calendarDate}</strong><small>Week {isoWeek(data.currentDate)}</small></div></section>
    <div className="dashboard-grid">
      <section className="dashboard-card family-status-section" aria-labelledby="family-status-title">
        <div className="card-heading"><div><p className="eyebrow">Everyone belongs</p>
          <h2 id="family-status-title">Family Status</h2></div>
          <span>{data.members.length} {data.members.length === 1 ? "family member" : "family members"}</span></div>
        <div className="family-status-grid">{data.members.map((member) =>
          <FamilyStatusCard key={member.id} member={member}
            celebrating={celebratingMemberIds.includes(member.id)} activate={(element) => {
            memberReturnFocusRef.current = element; setFocusedMember(member);
          }} />)}</div>
        {data.family.canManage && <button onClick={() => setFamilyOpen(true)}>
          Manage family{(data.family.joinRequestCount || data.family.pendingInviteCount)
            ? ` · ${data.family.joinRequestCount + data.family.pendingInviteCount} waiting` : ""}
        </button>}
      </section>
      <section className="dashboard-card today-mission-card"><div className="card-heading"><div>
        <p className="eyebrow">Today at home</p><h2>Today’s Mission</h2></div>
        <strong className="routine-count"
          aria-label={data.incompleteTaskCount === undefined ? `${data.activeRoutineCount} routines` :
            `${data.incompleteTaskCount} household missions remaining today`}>
          {data.incompleteTaskCount ?? data.activeRoutineCount}</strong></div>
        <p>{(data.incompleteTaskCount ?? data.activeRoutineCount) > 0
          ? data.todayMission.message
          : data.activeRoutineCount
            ? "Today’s household missions are complete."
          : "Choose a few routines so Cradle understands how your home works."}</p>
        {!!data.todayMissions?.length && <MotionList className="mission-list" aria-label="Today’s household missions">
          <AnimatePresence initial={false}>{data.todayMissions.map((mission) => {
            const incompleteParticipants = mission.participants.filter(({ status }) => status !== "complete");
            const currentParticipant = mission.participants.find(({ memberId }) => memberId === data.currentUser.id);
            const canOverride = data.currentUser.accessLevel === "household_admin" && incompleteParticipants.some(({ memberId, participantKind }) =>
              participantKind === "required" && data.members.find((member) => member.id === memberId)?.accessLevel === "managed_member");
            const canComplete = Boolean(currentParticipant && currentParticipant.status !== "complete") || canOverride;
            return <MotionListItem key={mission.id}><article className={`mission-row ${mission.state === "complete" ? "complete" : ""}`}>
              <div className="mission-row-details"><strong><CradleIcon name="mission" size="sm" decorative /> {mission.title}</strong>
                <small>{[mission.roomName || mission.petName, mission.duePeriod && mission.duePeriod[0].toUpperCase() + mission.duePeriod.slice(1)].filter(Boolean).join(" · ")}</small>
                <span className="mission-assignees">{mission.participants.length ? `For ${mission.participants.map(({ memberName }) => memberName).join(", ")}` : "Unassigned"}</span></div>
              <div className="mission-row-actions">{mission.state === "complete" ? <span className="task-state complete"><CradleIcon name="complete" size="sm" decorative /> Complete</span>
                : canComplete ? <MotionButtonFeedback className="primary" disabled={missionBusy === mission.id} onClick={() => void completeMission(mission)}>{missionBusy === mission.id ? "Saving…" : "Sign off"}</MotionButtonFeedback>
                : <span className={`task-state ${mission.state === "waiting_for_team" ? "waiting_for_team" : mission.participants.length ? "assigned" : "unassigned"}`}>{mission.state === "waiting_for_team" ? "Waiting for team" : mission.participants.length ? "Assigned" : "Unassigned"}</span>}
                {currentParticipant && mission.state !== "complete" && <button className="mission-help-button" onClick={() => navigate("me")}><CradleIcon name="help" size="sm" decorative /> Need a hand?</button>}</div>
            </article></MotionListItem>;
          })}</AnimatePresence>
        </MotionList>}
        {missionError && <p className="error" role="alert">{missionError}</p>}
        {data.currentUser.role !== "child" && <button onClick={() => navigate("systems")}><CradleIcon name="routine" size="sm" decorative /> Review routines</button>}
      </section>
      <TodayMomentCard navigate={navigate} initialMoment={data.together?.moments.find((moment) => moment.isPrimary) || null} />
      <section className="dashboard-card schedule-card"><div className="card-heading"><div><p className="eyebrow">Coordination</p>
        <h2>Household Schedule</h2></div><span>{data.schedule.upcomingCount} planned</span></div>
        {!data.schedule.upcoming.length ? <div className="empty-action"><p>Nothing planned yet.</p>
          <p>Create a Family Meeting, appointment, trip or reminder so everyone knows what is coming up.</p>
          {data.schedule.canCreate ? <button className="primary" onClick={() => navigate("calendar")}>Add to schedule</button>
            : <button onClick={() => navigate("calendar")}>View Household Schedule</button>}</div>
          : <><div className="schedule-preview">{data.schedule.upcoming.map((event) => <article key={event.id}>
            <div><strong>{event.title}</strong><small>{eventTypeLabel(event.eventType)}</small></div>
            <time dateTime={event.startsAt}>{new Intl.DateTimeFormat(undefined, {
              weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
              timeZone: data.household.timezone
            }).format(new Date(event.startsAt))}</time></article>)}</div>
            <button onClick={() => navigate("calendar")}>View full schedule</button></>}</section>
      <section className="dashboard-card suggestion-quick-card"><p className="eyebrow">Household ideas</p><h2>Notice something that needs doing?</h2>
        <p>Suggestions stay collaborative and never become routines automatically.</p>
        <button onClick={() => suggest ? suggest() : navigate("me")}>Suggest something</button>
        {data.suggestions.canReview && data.suggestions.openCount > 0 && <small>{data.suggestions.openCount} open for household leadership to review.</small>}</section>
      {setupReviewOpen && <section className="dashboard-card progress-card"><p className="eyebrow">Getting started</p><h2>Set up your home</h2>
        <p>A few thoughtful choices help Cradle fit the way your family lives.</p>
        <ol>{data.setup.steps.map((step) => <li className={step.complete ? "complete" : ""} key={step.key}>
          <span aria-hidden="true"><CradleIcon name={step.complete ? "complete" : "pending"} size="sm" decorative /></span>{step.label}</li>)}</ol>
        {setupError && <p role="alert" className="error">{setupError}</p>}
        {roomFormOpen && <form className="inline-form" onSubmit={addRequiredRoom}>
          <label><span>Room name</span><input name="name" required /></label>
          <label><span>Room type</span><select name="roomType">{ROOM_TYPES.map(({ value, label }) =>
            <option value={value} key={value}>{label}</option>)}</select></label>
          <div className="row-actions"><button className="primary" disabled={roomBusy}>{roomBusy ? "Adding…" : "Add Room"}</button>
            <button type="button" onClick={() => setRoomFormOpen(false)}>Cancel</button></div>
        </form>}
        {data.setup.canManage ? <div className="row-actions">
          {!checklistComplete && <button className="primary" onClick={continueHomeSetup}>
            {nextSetupStep?.key === "rooms" ? "Add a Room" : nextSetupStep?.key === "members"
              ? "Add family" : "Choose routines"}</button>}
          {checklistComplete && <button onClick={() => setSetupReviewOpen(false)}>Close checklist</button>}
        </div> : <p className="soft-notice">Your household leaders will take care of the remaining setup.</p>}</section>}
      {!setupReviewOpen && checklistComplete && <aside className="setup-complete-strip" aria-label="Home setup">
        <strong>Home setup complete <span aria-hidden="true"><CradleIcon name="complete" size="sm" decorative /></span></strong>
        {data.setup.canManage && <button onClick={() => setSetupReviewOpen(true)}>Review setup</button>}
      </aside>}
    </div>
    {focusedMember && <section ref={memberDialogRef} className="personal-sheet companion-view-sheet" role="dialog" aria-modal="true"
      aria-labelledby="family-member-title"><div><div><p className="eyebrow">Family Status</p>
        <h2 id="family-member-title">{focusedMember.preferredName || focusedMember.displayName}</h2></div>
        <button onClick={() => setFocusedMember(null)}>Close</button></div>
      <FamilyAvatar name={focusedMember.preferredName || focusedMember.displayName} avatar={avatarFor(focusedMember)} />
      <p>{familyStatus(focusedMember)}</p>
      <div className="row-actions">{focusedMember.id === data.currentUser.id
        ? <button className="primary" onClick={() => { setFocusedMember(null); navigate("me"); }}>
          {focusedMember.avatarId ? "Edit appearance" : "Customise your cat"}</button>
        : data.family.canManage && (focusedMember.accessLevel === "managed_member" || focusedMember.role === "child")
          ? <><button className="primary" onClick={() => {
            setFocusedMember(null); openPersonalMember?.(focusedMember.id);
          }}>Open My Cradle</button><button onClick={() => {
            setFocusedMember(null); setFamilyMemberToManage(focusedMember.id); setFamilyOpen(true);
          }}>Manage family member</button></> : null}
        <button onClick={() => setFocusedMember(null)}>Done</button></div></section>}
  </MotionPage></div>;
}

function TodayMomentCard({ navigate, initialMoment }: { navigate: (view: AuthenticatedView) => void; initialMoment: TogetherMoment | null }) {
  const [moment, setMoment] = useState<TogetherMoment | null>(initialMoment); const [busy, setBusy] = useState(false);
  useEffect(() => { setMoment(initialMoment); }, [initialMoment]);
  async function act(action: "swap" | "accept" | "start" | "complete") {
    if (!moment) return; setBusy(true);
    try { const next = await api<TogetherMoment>(`/api/together/${moment.id}/${action}`, jsonInit("POST", {})); setMoment(next); }
    catch { /* the Together page provides the full retry and error context */ }
    finally { setBusy(false); }
  }
  return <section className="dashboard-card today-moment-card" aria-labelledby="today-moment-card-title"><p className="eyebrow"><CradleIcon name="family" size="sm" decorative /> Today’s Moment</p>
    {moment ? <><h2 id="today-moment-card-title">{moment.title}</h2><p>{moment.description}</p><div className="together-meta"><span>{participantContext(moment.participants)}</span><span>{moment.durationMinutes} minutes</span></div><div className="row-actions"><button className="primary" disabled={busy} onClick={() => navigate("together")}>View Moment</button>{!["completed", "skipped", "swapped", "saved_for_later"].includes(moment.status) && <button disabled={busy} onClick={() => void act("swap")}>Try another</button>}</div></> : <><h2 id="today-moment-card-title">No Moment chosen for today.</h2><p>Give your household something positive to look forward to.</p><div className="row-actions"><button className="primary" onClick={() => navigate("together")}>Surprise us</button><button onClick={() => navigate("together")}>Choose a Moment</button></div></>}
  </section>;
}

export { Navigation };
