import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MEMBER_AVATAR, memberAvatar, type MemberAvatar } from "../shared/member-avatar";
import { accessLevelLabel } from "../shared/members";
import { api, failureMessage, jsonInit } from "./api";
import { FamilyAvatar } from "./FamilyAvatar";
import { AvatarPalette } from "./AvatarPalette";
import type { DashboardData } from "./Dashboard";
import { Navigation, type AuthenticatedView } from "./Dashboard";
import { taskStateLabel, type RoutineAssignmentMode, type TaskState } from "../shared/assignments";
import { CradleIcon } from "./components/ui/CradleIcon";
import { MotionPage } from "./motion";
import { getTaskIconName } from "./iconMappings";
import {
  INTEREST_CATEGORIES, INTEREST_CATEGORY_LABELS, INTEREST_LEVEL_LABELS, INTEREST_PARTICIPATION_LABELS,
  INTEREST_SETTING_LABELS, SUGGESTED_INTERESTS, type InterestCategory, type MemberInterest
} from "../shared/interests";

type PersonalTask = {
  id: string; title: string; roomName: string | null; petName: string | null;
  duePeriod: string; dueAt: string | null; assignmentMode: RoutineAssignmentMode | "manual";
  state: TaskState; contributionState: Exclude<TaskState, "waiting_for_team">;
  teamCompleted: number; teamTotal: number; participantKind: "required" | "helper";
  helpRequested: boolean;
};
const assignmentLabel = (task: PersonalTask): string => task.assignmentMode === "shared_team"
  ? `Shared team · ${task.teamCompleted}/${task.teamTotal}` : task.assignmentMode === "rotation" ? "Rotates" :
    task.assignmentMode === "one_person" ? "One person" : "Decide later";

type MeData = {
  member: {
    id: string; displayName: string; preferredName: string | null; role: string;
    accessLevel?: string; lifecycleState: string; householdName: string
  };
  avatar: (MemberAvatar & { id: string }) | null;
  suggestions: Array<{ id: string; title: string; status: string; suggestionType: string }>;
  favourites?: Array<{ id: string; memberId: string; memberName: string; mealId: string | null; mealName: string; priority: number }>;
  mealPreferences?: { dietaryRequirements?: string | null; allergies?: string | null; dislikes?: string | null } | null;
  interests?: MemberInterest[];
  personalTasks: { state: string; message: string; tasks: PersonalTask[] };
  helpRequested: PersonalTask[];
  helpers: Array<{ id: string; displayName: string }>;
  viewedMemberId: string;
  deferred: string[];
};

export function PersonalArea({ dashboard, navigate, signOut, startSuggestion = false, onSuggestionOpened,
  onDashboardChanged, memberId }: {
  dashboard: DashboardData; navigate: (view: AuthenticatedView) => void; signOut: () => void;
  startSuggestion?: boolean; onSuggestionOpened?: () => void;
  onDashboardChanged?: (dashboard: DashboardData) => void;
  memberId?: string;
}) {
  const [data, setData] = useState<MeData | null>(null); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<"details" | "avatar" | "suggestion" | "favourites" | "meal-preferences" | "interests" | null>(startSuggestion ? "suggestion" : null);
  const [interestEditing, setInterestEditing] = useState<MemberInterest | null>(null);
  const [interestName, setInterestName] = useState(""); const [interestSearch, setInterestSearch] = useState(""); const [interestCategory, setInterestCategory] = useState<InterestCategory | "">("");
  const sheetRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [suggestionKey, setSuggestionKey] = useState(() => crypto.randomUUID());
  const [avatar, setAvatar] = useState<MemberAvatar>(DEFAULT_MEMBER_AVATAR);
  const [helperChoice, setHelperChoice] = useState<Record<string, string>>({});
  const [celebrating, setCelebrating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const next = await api<MeData>(memberId ? `/api/me?memberId=${encodeURIComponent(memberId)}` : "/api/me"); setData(next);
      setAvatar(memberAvatar(next.avatar));
    } catch (reason) { setError(failureMessage(reason)); }
    finally { setLoading(false); }
  }, [memberId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (startSuggestion) { setEditing("suggestion"); onSuggestionOpened?.(); } }, [startSuggestion, onSuggestionOpened]);
  useEffect(() => {
    if (!editing) return;
    const sheet = sheetRef.current;
    const focusable = () => [...(sheet?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    ) || [])];
    requestAnimationFrame(() => (sheet?.querySelector<HTMLElement>("[autofocus]") || focusable()[0])?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setEditing(null); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [editing]);
  function openEditor(next: "details" | "avatar" | "suggestion" | "favourites" | "meal-preferences" | "interests") {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(next);
  }
  function closeEditor() { setEditing(null); }
  function openInterestEditor(interest: MemberInterest | null = null) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInterestEditing(interest); setInterestName(interest?.name || ""); setInterestCategory(interest?.category || ""); setInterestSearch(""); setEditing("interests");
  }
  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    try {
      const next = await api<MeData>("/api/me", jsonInit("PATCH", {
        displayName: form.get("displayName"), preferredName: form.get("preferredName")
      }));
      setData(next); setNotice("Your personal details were saved."); closeEditor();
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function saveAvatar(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      await api("/api/me/avatar", jsonInit("PUT", avatar));
      const next = await api<MeData>("/api/me"); setData(next);
      setAvatar(memberAvatar(next.avatar));
      setNotice("Your cat’s appearance was saved."); closeEditor();
      try { onDashboardChanged?.(await api<DashboardData>("/api/dashboard")); }
      catch (reason) { setError(`Your cat was saved, but the Dashboard could not refresh. ${failureMessage(reason)}`); }
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function suggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const context = String(form.get("context") || "");
    try {
      await api("/api/household/task-suggestions", jsonInit("POST", {
        title: form.get("title"), suggestionType: form.get("suggestionType"), note: form.get("note"),
        roomId: context.startsWith("room:") ? context.slice(5) : null,
        petId: context.startsWith("pet:") ? context.slice(4) : null, clientKey: suggestionKey
      }));
      await load(); setNotice("Suggestion sent to your household leaders."); closeEditor(); setSuggestionKey(crypto.randomUUID());
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function saveFavourite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api("/api/household/meals/favourites", jsonInit("POST", {
        customMealName: form.get("customMealName"), priority: Number(form.get("priority") || 0)
      }));
      await load(); setNotice("Favourite meal saved for the household’s meal ideas."); closeEditor();
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function saveMealPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    try {
      await api("/api/household/meals/preferences", jsonInit("PATCH", {
        memberId: viewedMemberId, dietaryRequirements: form.get("dietaryRequirements"), allergies: form.get("allergies"), dislikes: form.get("dislikes")
      }));
      await load(); setNotice("Meal preferences saved for future suggestions."); closeEditor();
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function saveInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const id = interestEditing?.id;
    const body = { name: form.get("name"), category: form.get("category") || null, level: form.get("level") || null,
      setting: form.get("setting") || null, participation: form.get("participation") || null, note: form.get("note") || null,
      ...(viewedMemberId && viewedMemberId !== dashboard.currentUser.id ? { memberId: viewedMemberId } : {}) };
    try {
      await api(id ? `/api/me/interests/${encodeURIComponent(id)}` : "/api/me/interests", jsonInit(id ? "PATCH" : "POST", body));
      await load(); setNotice(id ? "Interest updated." : "Interest added to your Cradle."); closeEditor(); setInterestEditing(null);
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function archiveInterest(interest: MemberInterest) {
    try { await api(`/api/me/interests/${encodeURIComponent(interest.id)}`, jsonInit("PATCH", { active: false, ...(viewedMemberId && viewedMemberId !== dashboard.currentUser.id ? { memberId: viewedMemberId } : {}) })); await load(); setNotice("Interest archived. It will no longer shape Together suggestions."); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  async function removeInterest(interest: MemberInterest) {
    try { await api(`/api/me/interests/${encodeURIComponent(interest.id)}${viewedMemberId && viewedMemberId !== dashboard.currentUser.id ? `?memberId=${encodeURIComponent(viewedMemberId)}` : ""}`, jsonInit("DELETE")); await load(); setNotice("Interest removed."); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  async function withdraw(id: string) {
    try { await api(`/api/household/task-suggestions/${id}/withdraw`, jsonInit("POST")); await load(); setNotice("Suggestion withdrawn."); }
    catch (reason) { setError(failureMessage(reason)); }
  }
  async function completeTask(taskId: string) {
    setError("");
    try {
      const result = await api<{ completed: boolean; celebrationMemberIds: string[] }>(
        `/api/household/tasks/${taskId}/complete`, jsonInit("POST",
          memberId && memberId !== dashboard.currentUser.id
            ? { contributionMemberId: memberId } : {}));
      window.sessionStorage.setItem("cradle:task-celebration", JSON.stringify(result.celebrationMemberIds));
      setCelebrating(true); window.setTimeout(() => setCelebrating(false), 950);
      await load();
      try { onDashboardChanged?.(await api<DashboardData>("/api/dashboard")); }
      catch (reason) { setError(`The mission was updated, but the Dashboard could not refresh. ${failureMessage(reason)}`); }
      setNotice(result.completed ? "Household mission complete." : "Your part is complete. The team can finish their parts.");
    } catch (reason) { setError(failureMessage(reason)); }
  }
  async function askForHelp(taskId: string) {
    const helperMemberId = helperChoice[taskId];
    if (!helperMemberId) { setError("Choose a family member to lend a hand."); return; }
    setError("");
    try {
      await api(`/api/household/tasks/${taskId}/help`, jsonInit("POST", {
        helperMemberId,
        ...(memberId && memberId !== dashboard.currentUser.id ? { requestedByMemberId: memberId } : {})
      }));
      await load(); setNotice("Help requested. They can now see this in My Cradle.");
    } catch (reason) { setError(failureMessage(reason)); }
  }
  const viewedMemberId = data?.viewedMemberId || data?.member.id;
  const canEditInterests = Boolean(data && (viewedMemberId === dashboard.currentUser.id ||
    (dashboard.currentUser.role === "owner" || dashboard.currentUser.role === "parent_admin") && data.member.accessLevel === "managed_member"));
  return <div className="dashboard-shell"><Navigation active="me" navigate={navigate} signOut={signOut} /><MotionPage motionKey={`me-${viewedMemberId || dashboard.currentUser.id}`} className="motion-page">
    <section className="personal-hero"><div><p className="eyebrow">Dashboard → My Cradle</p><div className="personal-title-row"><h1>My Cradle</h1>
      {notice && <span className="inline-success-chip" role="status">{notice}</span>}</div>
      <p>Your details, your cat and the things you want the household to notice.</p></div>
      <button onClick={() => navigate("dashboard")}>Back to Dashboard</button></section>
    {loading && <section className="dashboard-card"><p role="status">Loading your area…</p></section>}
    {error && <section className="dashboard-card local-error"><p className="error" role="alert">{error}</p>
      <button className="primary" onClick={() => void load()}>Retry</button><button onClick={closeEditor}>Cancel</button>
      </section>}
    {data && <div className="personal-grid">
      <section className="dashboard-card personal-profile-hero">
        <div className={`personal-profile-avatar ${celebrating ? "task-celebration" : ""}`}>
          <FamilyAvatar name={data.member.preferredName || data.member.displayName}
            avatar={celebrating ? { ...avatar, expressionKey: "completed" } : avatar} />
        </div>
        <div className="personal-profile-details">
          <p className="eyebrow">My Cradle</p>
          <h2>{data.member.preferredName || data.member.displayName}</h2>
          <p>{accessLevelLabel(data.member.accessLevel || (data.member.role === "owner" ||
            data.member.role === "parent_admin" ? "household_admin" :
            data.member.role === "adult" ? "household_member" : "managed_member"))} · {data.member.householdName}</p>
          <p>{data.member.lifecycleState === "active"
            ? "Signed in to Cradle" : "Cared for by household leaders"}</p>
          {viewedMemberId === dashboard.currentUser.id
            ? <div className="row-actions">
              <button className="primary" onClick={() => openEditor("details")}>Edit personal details</button>
              <button onClick={() => openEditor("avatar")}>{data.avatar ? "Edit appearance" : "Customise your cat"}</button>
            </div>
            : <p className="soft-notice">You’re viewing this Managed member as a Household admin.</p>}
        </div>
      </section>
      <section className="dashboard-card mission-card"><p className="eyebrow">My Tasks</p><h2>Today in My Cradle</h2>
        <p>{data.personalTasks.message}</p>
        <div className="personal-task-list">{(data.personalTasks.tasks || []).filter(({ participantKind }) =>
          participantKind === "required").map((task) => <article key={task.id}>
          <div><strong><CradleIcon name={getTaskIconName(task.title)} size="sm" decorative /> {task.title}</strong><small>{[task.roomName || task.petName,
            task.duePeriod && task.duePeriod[0].toUpperCase() + task.duePeriod.slice(1), assignmentLabel(task)].filter(Boolean).join(" · ")}</small>
            <span className={`task-state ${task.contributionState}`}><CradleIcon name={task.contributionState === "complete" ? "complete" : task.contributionState === "missed" ? "overdue" : "pending"} size="sm" decorative /> {taskStateLabel(task.contributionState)}</span></div>
          {task.contributionState !== "complete" && <div className="task-actions">
            <button className="primary" onClick={() => void completeTask(task.id)}>Sign off</button>
            {!task.helpRequested && (data.helpers || []).length > 0 && <details><summary aria-label={`Ask for help with ${task.title}`}><CradleIcon name="help" size="sm" decorative /> Need a hand?</summary>
              <label><span>Who can help?</span><select value={helperChoice[task.id] || ""}
                onChange={(event) => setHelperChoice({ ...helperChoice, [task.id]: event.target.value })}>
                <option value="">Choose someone</option>{(data.helpers || []).map((helper) =>
                  <option value={helper.id} key={helper.id}>{helper.displayName}</option>)}</select></label>
              <button onClick={() => void askForHelp(task.id)}>Ask for help</button></details>}
            {task.helpRequested && <small>Help requested</small>}</div>}
        </article>)}</div>
        {!(data.personalTasks.tasks || []).some(({ participantKind }) => participantKind === "required") &&
          <div className="empty-action"><p>You have no household missions assigned today.</p>
            <button onClick={() => navigate("systems")}>View household routines</button></div>}
        </section>
      <section className="dashboard-card help-requested-card"><p className="eyebrow">Help requested</p>
        <h2>Lend a hand</h2>
        {!(data.helpRequested || []).length && <p>No one has asked you for help today.</p>}
        {(data.helpRequested || []).map((task) => <article key={task.id}><div><strong><CradleIcon name={getTaskIconName(task.title)} size="sm" decorative /> {task.title}</strong>
          <small>{task.roomName || task.petName || "Whole household"} · {taskStateLabel(task.contributionState)}</small></div>
          {task.contributionState !== "complete" && <button className="primary"
            onClick={() => void completeTask(task.id)}>Sign off together</button>}</article>)}</section>
      <section className="dashboard-card favourites-card"><p className="eyebrow">Meal favourites</p><h2>Meals I love</h2>
        {!data.favourites?.length && <p>No favourite meals saved yet.</p>}
        {!!data.favourites?.length && <ul>{data.favourites.map((favourite) => <li key={favourite.id}>{favourite.mealName}</li>)}</ul>}
        {viewedMemberId === dashboard.currentUser.id && <button onClick={() => openEditor("favourites")}>Add a favourite meal</button>}
      </section>
      <section className="dashboard-card meal-preferences-card"><p className="eyebrow">Meal preferences</p><h2>What should Cradle keep in mind?</h2>
        <p>{data.mealPreferences?.allergies || data.mealPreferences?.dietaryRequirements || data.mealPreferences?.dislikes
          ? "Saved dietary needs and dislikes will guide meal suggestions." : "No dietary needs or dislikes saved yet."}</p>
        {viewedMemberId === dashboard.currentUser.id && <button onClick={() => openEditor("meal-preferences")}>Edit meal preferences</button>}
      </section>
      <section className="dashboard-card interests-card"><p className="eyebrow">Hobbies and Interests</p><h2>Hobbies and Interests</h2>
        <p>Add the things you enjoy so Cradle can suggest better ways to spend time together.</p>
        {!(data.interests || []).filter((interest) => interest.active).length
          ? <div className="empty-action"><p>Add a few things you enjoy to make Together suggestions feel more personal.</p>{canEditInterests && <button className="primary" onClick={() => openInterestEditor()}>Add interest</button>}</div>
          : <><ul className="interest-chip-list">{(data.interests || []).filter((interest) => interest.active).map((interest) => <li key={interest.id}><span>{interest.name}</span>{canEditInterests && <span className="interest-chip-actions"><button aria-label={`Edit ${interest.name}`} onClick={() => openInterestEditor(interest)}>Edit</button><button aria-label={`Remove ${interest.name}`} onClick={() => void removeInterest(interest)}>Remove</button></span>}</li>)}</ul>{canEditInterests && <button onClick={() => openInterestEditor()}>Add interest</button>}</>}
        {canEditInterests && (data.interests || []).some((interest) => !interest.active) && <small className="soft-notice">{(data.interests || []).filter((interest) => !interest.active).length} archived interest{(data.interests || []).filter((interest) => !interest.active).length === 1 ? "" : "s"} no longer shape Together suggestions.</small>}
      </section>
      <section className="dashboard-card suggestions-card"><p className="eyebrow">My Suggestions</p><h2>Ideas for your home</h2>
        {!data.suggestions.length && <div className="empty-action"><p>No suggestions yet. Tell your household what could help.</p>
          <button className="primary" onClick={() => openEditor("suggestion")}>Suggest something</button>
          </div>}
        {data.suggestions.map((suggestion) => <article key={suggestion.id}><div><strong>{suggestion.title}</strong><small>{suggestion.status}</small></div>
          {suggestion.status === "open" && <button onClick={() => void withdraw(suggestion.id)}>Withdraw</button>}</article>)}
        {data.suggestions.length > 0 && <button onClick={() => openEditor("suggestion")}>Suggest something else</button>}</section>
    </div>}

    {editing === "details" && data && <section ref={sheetRef} className="personal-sheet" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <div><h2 id="details-title">Edit personal details</h2><button onClick={closeEditor}>Close</button></div>
      <form onSubmit={saveDetails}><label><span>Display name</span><input name="displayName" defaultValue={data.member.displayName} required /></label>
        <label><span>Optional preferred name</span><input name="preferredName" defaultValue={data.member.preferredName || ""} /></label>
        <p>Your household role can only be changed by household leadership.</p>
        <div className="row-actions"><button className="primary">Save</button><button type="button" onClick={closeEditor}>Cancel</button></div></form></section>}
    {editing === "avatar" && data && <section ref={sheetRef} className="personal-sheet" role="dialog" aria-modal="true" aria-labelledby="avatar-title">
      <div><h2 id="avatar-title">Edit your cat</h2><button onClick={closeEditor}>Close</button></div>
      <FamilyAvatar name={data.member.preferredName || data.member.displayName} avatar={avatar} /><form onSubmit={saveAvatar}>
        <AvatarPalette avatar={avatar} onChange={setAvatar} namePrefix="my-cradle-avatar" />
        <div className="row-actions"><button className="primary">Save appearance</button><button type="button" onClick={closeEditor}>Cancel</button></div></form></section>}
    {editing === "suggestion" && <section ref={sheetRef} className="personal-sheet" role="dialog" aria-modal="true" aria-labelledby="suggest-title">
      <div><h2 id="suggest-title">Suggest something</h2><button onClick={closeEditor}>Close</button></div>
      <form onSubmit={suggest}><label><span>What needs doing?</span><input name="title" required autoFocus /></label>
        <label><span>Where or who is it for?</span><select name="context"><option value="">Whole household</option>
          {dashboard.rooms.map((room) => <option value={`room:${room.id}`} key={room.id}>{room.name}</option>)}
          {dashboard.pets.map((pet) => <option value={`pet:${pet.id}`} key={pet.id}>{pet.name}</option>)}</select></label>
        <label><span>One-off or recurring?</span><select name="suggestionType"><option value="one_off">One-off</option><option value="recurring">Recurring idea</option></select></label>
        <label><span>Optional note</span><textarea name="note" /></label>
        <div className="row-actions"><button className="primary">Send suggestion</button><button type="button" onClick={closeEditor}>Cancel</button></div></form></section>}
    {editing === "favourites" && data && <section ref={sheetRef} className="personal-sheet" role="dialog" aria-modal="true" aria-labelledby="favourite-title">
      <div><h2 id="favourite-title">Add a favourite meal</h2><button onClick={closeEditor}>Close</button></div>
      <form onSubmit={saveFavourite}><label><span>Meal name</span><input name="customMealName" autoFocus required placeholder="For example, Friday pizza" /></label>
        <label><span>How much does this feel like a favourite?</span><select name="priority" defaultValue="3"><option value="5">Top choice</option><option value="3">Favourite</option><option value="1">Sometimes</option></select></label>
        <div className="row-actions"><button className="primary">Save favourite</button><button type="button" onClick={closeEditor}>Cancel</button></div></form></section>}
    {editing === "meal-preferences" && data && <section ref={sheetRef} className="personal-sheet" role="dialog" aria-modal="true" aria-labelledby="meal-preferences-title">
      <div><h2 id="meal-preferences-title">Meal preferences</h2><button onClick={closeEditor}>Close</button></div>
      <form onSubmit={saveMealPreferences}><label><span>Dietary needs</span><input name="dietaryRequirements" defaultValue={data.mealPreferences?.dietaryRequirements || ""} placeholder="For example, vegetarian" /></label>
        <label><span>Allergies</span><input name="allergies" defaultValue={data.mealPreferences?.allergies || ""} placeholder="For example, peanuts, shellfish" /></label>
        <label><span>Dislikes</span><input name="dislikes" defaultValue={data.mealPreferences?.dislikes || ""} placeholder="For example, mushrooms" /></label>
        <div className="row-actions"><button className="primary">Save preferences</button><button type="button" onClick={closeEditor}>Cancel</button></div></form></section>}
    {editing === "interests" && data && <section ref={sheetRef} className="personal-sheet interest-editor" role="dialog" aria-modal="true" aria-labelledby="interests-title">
      <div><h2 id="interests-title">{interestEditing ? "Edit interest" : "Add an interest"}</h2><button onClick={closeEditor}>Close</button></div>
      <p>Choose something from the list or add anything your household enjoys.</p>
      <label><span>Search suggestions</span><input autoFocus value={interestSearch} onChange={(event) => setInterestSearch(event.target.value)} placeholder="Try music, games or gardening" /></label>
      <div className="interest-suggestions" aria-label="Suggested interests">{SUGGESTED_INTERESTS.filter((suggestion) => suggestion.name.toLowerCase().includes(interestSearch.trim().toLowerCase())).map((suggestion) => <button type="button" key={suggestion.name} onClick={() => { setInterestName(suggestion.name); setInterestCategory(suggestion.category); setInterestSearch(""); }}><strong>{suggestion.name}</strong><small>{INTEREST_CATEGORY_LABELS[suggestion.category]}</small></button>)}</div>
      <form onSubmit={saveInterest}><label><span>Interest</span><input name="name" value={interestName} onChange={(event) => setInterestName(event.target.value)} required placeholder="Anything you enjoy" /></label>
        <label><span>Category (optional)</span><select name="category" value={interestCategory} onChange={(event) => setInterestCategory(event.target.value as InterestCategory | "")}><option value="">No category</option>{INTEREST_CATEGORIES.map((category) => <option key={category} value={category}>{INTEREST_CATEGORY_LABELS[category]}</option>)}</select></label>
        <label><span>How do you feel about it? (optional)</span><select name="level" defaultValue={interestEditing?.level || ""}><option value="">No preference</option><option value="like">{INTEREST_LEVEL_LABELS.like}</option><option value="love">{INTEREST_LEVEL_LABELS.love}</option><option value="try">{INTEREST_LEVEL_LABELS.try}</option></select></label>
        <label><span>Where do you prefer it? (optional)</span><select name="setting" defaultValue={interestEditing?.setting || ""}><option value="">No preference</option><option value="home">{INTEREST_SETTING_LABELS.home}</option><option value="outdoors">{INTEREST_SETTING_LABELS.outdoors}</option><option value="either">{INTEREST_SETTING_LABELS.either}</option></select></label>
        <label><span>Who would you like to do it with? (optional)</span><select name="participation" defaultValue={interestEditing?.participation || ""}><option value="">{INTEREST_PARTICIPATION_LABELS.no_preference}</option><option value="alone">{INTEREST_PARTICIPATION_LABELS.alone}</option><option value="one_to_one">{INTEREST_PARTICIPATION_LABELS.one_to_one}</option><option value="whole_family">{INTEREST_PARTICIPATION_LABELS.whole_family}</option></select></label>
        <label><span>Note (optional)</span><textarea name="note" defaultValue={interestEditing?.note || ""} placeholder="Anything Cradle should remember" /></label>
        <div className="row-actions"><button className="primary">Save interest</button>{interestEditing && <button type="button" onClick={() => void archiveInterest(interestEditing)}>Archive interest</button>}<button type="button" onClick={closeEditor}>Cancel</button></div></form>
    </section>}
  </MotionPage></div>;
}
