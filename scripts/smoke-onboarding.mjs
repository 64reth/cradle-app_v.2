const base = process.env.CRADLE_SMOKE_URL || "http://127.0.0.1:8788";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function raw(path, method = "GET", data, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {})
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  return {
    response,
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie
  };
}

async function call(path, method = "GET", data, cookie = "") {
  const result = await raw(path, method, data, cookie);
  assert(result.response.ok,
    `${method} ${path} failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  assert(result.body.requestId, `${method} ${path} did not include a request ID`);
  return result;
}

const suffix = Date.now().toString().slice(-6);
const created = await call("/api/auth/households", "POST", {
  householdName: `Assignment Review ${suffix}`,
  displayName: "Gareth",
  pin: "4829",
  pinConfirmation: "4829"
});
const ownerCookie = created.cookie;
const householdReference = created.body.data.householdReference;
assert(ownerCookie, "Household creation did not establish the Owner session");

const requestIds = [created.body.requestId];
async function ownerCall(path, method = "GET", data) {
  const result = await call(path, method, data, ownerCookie);
  requestIds.push(result.body.requestId);
  return result.body.data;
}

await ownerCall("/api/household/setup/leadership", "PATCH", {});
const ownerId = (await ownerCall("/api/household/members")).members
  .find(({ role }) => role === "owner")?.id;
assert(ownerId, "The canonical Owner Family member could not be resolved");
async function addMember(displayName, accessLevel, ageBand) {
  return (await ownerCall("/api/household/members", "POST", {
    displayName,
    accessLevel,
    ageBand,
    clientKey: `${displayName.toLowerCase()}-${suffix}`
  })).member;
}

const gillian = await addMember("Gillian", "household_admin", "adult");
const sam = await addMember("Sam", "household_member", "adult");
const tyrel = await addMember("Tyrel", "managed_member", "teen");
const taryn = await addMember("Taryn", "managed_member", "child");
const retry = await ownerCall("/api/household/members", "POST", {
  displayName: "Tyrel",
  accessLevel: "managed_member",
  ageBand: "teen",
  clientKey: `tyrel-${suffix}`
});
assert(retry.created === false && retry.member.id === tyrel.id,
  "Retrying Family creation duplicated a Managed member");

await ownerCall("/api/household/setup/members-complete", "POST", {});
await ownerCall("/api/me/avatar", "PUT", {
  furPaletteKey: "orange",
  patchPrimaryPaletteKey: "cream",
  patchSecondaryPaletteKey: "white",
  expressionKey: "neutral"
});
await ownerCall("/api/household/setup/avatar-complete", "POST", {});

async function addRoom(name, roomType, occupantMemberIds = []) {
  return (await ownerCall("/api/household/rooms", "POST", {
    name,
    roomType,
    occupantMemberIds
  })).room;
}

const parentsRoom = await addRoom("Parents’ bedroom", "bedroom", [ownerId, gillian.id]);
const childrenRoom = await addRoom("Children’s bedroom", "child_bedroom", [tyrel.id, taryn.id]);
await addRoom("Kitchen", "kitchen");
await addRoom("Bathroom", "bathroom");
await addRoom("Shared living area", "living_room");
await ownerCall("/api/household/setup/rooms-complete", "POST", {});
await ownerCall("/api/household/setup/pets-complete", "POST", {});
await ownerCall("/api/household/setup/complete", "POST", {});

const dashboard = await ownerCall("/api/dashboard");
assert(dashboard.members.length === 5, "Family Status did not contain exactly five real Family members");
assert(dashboard.rooms.length === 5, "The five-room household did not persist");
assert(dashboard.activeRoutineCount > 0, "No active Routines were generated");
assert(dashboard.incompleteTaskCount > 0, "Today’s Mission was not populated after setup");
assert(dashboard.members.every(({ dailyProgress }) =>
  dailyProgress?.percentage === 100 && ["On track", "Ready"].includes(dailyProgress?.status)),
  "Family Status did not begin with valid full green states");

const together = await ownerCall("/api/together/today");
const togetherPrimary = together.moments.find(({ isPrimary }) => isPrimary);
assert(togetherPrimary, "Today’s Moment was not generated for the household");
const togetherRefresh = await ownerCall("/api/together/today");
assert(togetherRefresh.moments.find(({ isPrimary }) => isPrimary)?.id === togetherPrimary.id,
  "Together generation was not idempotent across refresh");
const togetherSwap = await ownerCall(`/api/together/${togetherPrimary.id}/swap`, "POST", {});
assert(togetherSwap.id !== togetherPrimary.id, "Together swap did not create a replacement Moment");
const togetherAfterSwap = await ownerCall("/api/together/today");
assert(togetherAfterSwap.moments.length <= 2 && togetherAfterSwap.moments.filter(({ isPrimary }) => isPrimary).length === 1,
  "Together swap created duplicate or multiple primary Moments");

const routineLibrary = await ownerCall("/api/household/systems");
const activeRoutines = routineLibrary.routines.filter(({ status }) => status === "active");
const parentRotations = activeRoutines.filter(({ roomId, assignmentMode }) =>
  roomId === parentsRoom.id && assignmentMode === "rotation");
assert(parentRotations.length > 0, "Parents’ bedroom did not receive a Rotation");
assert(parentRotations.every(({ participantMemberIds }) =>
  JSON.stringify([...participantMemberIds].sort()) === JSON.stringify([ownerId, gillian.id].sort())),
  "Parents’ bedroom Rotation was not limited to its occupants");

const childShared = activeRoutines.find(({ roomId, assignmentMode }) =>
  roomId === childrenRoom.id && assignmentMode === "shared_team");
assert(childShared, "Children’s bedroom did not receive a Shared-team Routine");
assert(JSON.stringify([...childShared.participantMemberIds].sort()) ===
  JSON.stringify([tyrel.id, taryn.id].sort()),
  "Children’s Shared team did not match the room occupants");

const commonRotations = activeRoutines.filter(({ roomId, assignmentMode }) =>
  ![parentsRoom.id, childrenRoom.id].includes(roomId) && assignmentMode === "rotation");
assert(commonRotations.length > 4, "Common Rooms did not receive enough balanced Rotations");
assert(new Set(commonRotations.slice(0, 5).map(({ rotationNextIndex }) => rotationNextIndex)).size > 1,
  "Every generated Rotation began at the same carousel position");
assert(commonRotations.some(({ rotationNextIndex }) => rotationNextIndex !== 0),
  "Generated responsibility silently fell back to the Owner");

const editable = commonRotations.find(({ participantMemberIds }) => participantMemberIds.length >= 3);
assert(editable, "No editable household Rotation was available");
const detail = (await ownerCall(`/api/household/systems/${editable.id}`)).routine;
const removedMemberId = detail.rotationMembers.at(-1).memberId;
const retainedMemberIds = detail.rotationMembers.slice(0, -1).map(({ memberId }) => memberId);
await ownerCall(`/api/household/systems/${editable.id}`, "PATCH", {
  name: detail.name,
  frequency: detail.frequency,
  status: detail.status,
  assignmentMode: "rotation",
  assignedMemberId: null,
  participantMemberIds: retainedMemberIds,
  note: detail.note,
  customFrequencyNote: detail.customFrequencyNote
});
const edited = (await ownerCall(`/api/household/systems/${editable.id}`)).routine;
assert(!edited.rotationMembers.some(({ memberId }) => memberId === removedMemberId),
  "An unchecked Rotation member was silently re-added");
assert(JSON.stringify(edited.rotationMembers.map(({ memberId }) => memberId)) ===
  JSON.stringify(retainedMemberIds), "Rotation selection did not survive reload");

async function acceptProfile(member, pin) {
  const invite = (await ownerCall("/api/household/invites", "POST", {
    targetMemberId: member.id,
    expiry: "7_days"
  })).invite;
  const accepted = await call(`/api/invites/${invite.token}/accept`, "POST", {
    displayName: member.displayName,
    pin,
    pinConfirmation: pin,
    clientKey: `accept-${member.id}-${suffix}`
  });
  assert(accepted.cookie, `${member.displayName} did not receive a session`);
  return accepted.cookie;
}

const gillianCookie = await acceptProfile(gillian, "5931");
const samCookie = await acceptProfile(sam, "6742");
const ownerTasks = (await call("/api/me", "GET", undefined, ownerCookie)).body.data;
const gillianTasks = (await call("/api/me", "GET", undefined, gillianCookie)).body.data;
const samTasks = (await call("/api/me", "GET", undefined, samCookie)).body.data;
const tyrelTasks = (await call(`/api/me?memberId=${tyrel.id}`, "GET", undefined, ownerCookie)).body.data;
const tarynTasks = (await call(`/api/me?memberId=${taryn.id}`, "GET", undefined, ownerCookie)).body.data;
const taskViews = [ownerTasks, gillianTasks, samTasks, tyrelTasks, tarynTasks];
assert(taskViews.every(({ personalTasks }) => Array.isArray(personalTasks.tasks)),
  "A Family member’s My Tasks view was not derived from task instances");
assert(taskViews.every(({ personalTasks }) => personalTasks.tasks.length > 0),
  "Balanced generation left at least one Family member without today’s assigned work");
assert(tyrelTasks.personalTasks.tasks.some(({ assignmentMode }) => assignmentMode === "shared_team") &&
  tarynTasks.personalTasks.tasks.some(({ assignmentMode }) => assignmentMode === "shared_team"),
  "Shared-team work was not visible to every required participant");

const managedTask = tyrelTasks.personalTasks.tasks.find(({ contributionState, assignmentMode }) =>
  contributionState !== "complete" && assignmentMode !== "shared_team") ||
  tyrelTasks.personalTasks.tasks.find(({ contributionState }) => contributionState !== "complete");
assert(managedTask, "No Managed-member task was available for help acceptance");
await ownerCall(`/api/household/tasks/${managedTask.id}/help`, "POST", {
  requestedByMemberId: tyrel.id,
  helperMemberId: ownerId
});
const ownerWithHelp = (await call("/api/me", "GET", undefined, ownerCookie)).body.data;
assert(ownerWithHelp.helpRequested.some(({ id }) => id === managedTask.id),
  "A help request did not appear in the helper’s My Cradle");
await ownerCall(`/api/household/tasks/${managedTask.id}/complete`, "POST", {});
const tyrelAfterHelp = (await call(`/api/me?memberId=${tyrel.id}`, "GET", undefined, ownerCookie)).body.data;
assert(tyrelAfterHelp.personalTasks.tasks.find(({ id }) => id === managedTask.id)?.contributionState === "complete",
  "Helper sign-off did not complete the Managed member’s requested contribution");

const refreshed = await ownerCall("/api/dashboard");
assert(refreshed.members.find(({ id }) => id === tyrel.id)?.dailyProgress?.percentage === 100,
  "Completing work did not preserve or restore the Family member’s full daily state");
const expectedRemaining = dashboard.incompleteTaskCount -
  (managedTask.assignmentMode === "shared_team" ? 0 : 1);
assert(refreshed.incompleteTaskCount === expectedRemaining,
  "Today’s Mission counter did not come from incomplete current-day tasks");

const other = await call("/api/auth/households", "POST", {
  householdName: `Isolation Review ${suffix}`,
  displayName: "Other Owner",
  pin: "4829",
  pinConfirmation: "4829"
});
const crossRead = await raw(`/api/household/systems/${editable.id}`, "GET", undefined, other.cookie);
const crossComplete = await raw(`/api/household/tasks/${managedTask.id}/complete`, "POST", {}, other.cookie);
assert(crossRead.response.status >= 400 && crossComplete.response.status >= 400 &&
  !crossRead.body.data && !crossComplete.body.data,
  "Another household could read or modify canonical assignment data");

const duplicateCheck = await ownerCall("/api/dashboard");
assert(duplicateCheck.activeRoutineCount === refreshed.activeRoutineCount,
  "Refreshing onboarding output duplicated generated Routines");

console.log(JSON.stringify({
  base,
  route: "/dashboard",
  householdReference,
  family: {
    householdAdmins: ["Gareth", "Gillian"],
    householdMembers: ["Sam"],
    managedTeen: "Tyrel",
    managedChild: "Taryn"
  },
  rooms: {
    parentsBedroom: [ownerId, gillian.id],
    childrenBedroom: [tyrel.id, taryn.id],
    common: ["Kitchen", "Bathroom", "Shared living area"]
  },
  allocation: {
    activeRoutines: refreshed.activeRoutineCount,
    parentBedroomRotations: parentRotations.length,
    childrenSharedTeam: childShared.name,
    balancedCommonStarts: commonRotations.slice(0, 8).map(({ rotationNextIndex }) => rotationNextIndex),
    ownerDidNotReceiveEverything: true,
    savedSubsetSurvivedReload: true
  },
  today: {
    initialIncomplete: dashboard.incompleteTaskCount,
    afterHelpCompletion: refreshed.incompleteTaskCount,
    allFiveTaskViewsPopulated: true,
    helpRequestCompleted: true
  },
  together: {
    primaryId: togetherPrimary.id,
    stableAcrossRefresh: true,
    swapped: true,
    dailyMomentCount: togetherAfterSwap.moments.length
  },
  familyStatus: {
    initialPercentages: dashboard.members.map(({ displayName, dailyProgress }) => ({
      displayName,
      percentage: dailyProgress.percentage,
      status: dailyProgress.status
    })),
    managedMemberRecovered: true
  },
  tenantIsolation: true,
  duplicateRoutines: false,
  requestCount: requestIds.length
}, null, 2));
