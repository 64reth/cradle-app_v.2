const base = process.env.CRADLE_SMOKE_URL || "http://127.0.0.1:8788";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function call(path, method = "GET", data, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {})
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const body = await response.json();
  const nextCookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
  assert(response.ok, `${method} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  assert(body.requestId, `${method} ${path} did not return a request ID`);
  return { body, cookie: nextCookie, status: response.status };
}

const suffix = Date.now().toString().slice(-6);
const created = await call("/api/auth/households", "POST", {
  householdName: `Dashboard Smoke ${suffix}`,
  displayName: "Review Owner",
  pin: "4829",
  pinConfirmation: "4829"
});
const cookie = created.cookie;
assert(cookie, "Household creation did not set a session cookie");

const requestIds = [created.body.requestId];
async function step(path, method = "POST", data) {
  const result = await call(path, method, data ?? (method === "GET" ? undefined : {}), cookie);
  requestIds.push(result.body.requestId);
  return result.body.data;
}

await step("/api/household/setup/leadership", "PATCH");
const invitation = await step("/api/household/invitations", "POST", { role: "adult" });
const joined = await call("/api/auth/join", "POST", {
  invitationCode: invitation.code,
  displayName: "Review Participant",
  pin: "5931",
  pinConfirmation: "5931"
});
const participantCookie = joined.cookie;
assert(participantCookie && joined.body.data.role === "adult", "Adult participant did not join");
await step("/api/household/setup/members-complete");

const kitchen = await step("/api/household/rooms", "POST", {
  name: "Kitchen", roomType: "kitchen", description: "Main kitchen"
});
const bathroom = await step("/api/household/rooms", "POST", {
  name: "Bathroom", roomType: "bathroom", description: "Family bathroom"
});
const bedroom = await step("/api/household/rooms", "POST", {
  name: "Bedroom", roomType: "bedroom", description: "Main bedroom"
});
await step("/api/household/setup/rooms-complete");
const pet = await step("/api/household/pets", "POST", {
  name: "Tori", petType: "cat", breed: "Domestic shorthair", notes: "Indoor cat"
});
await step("/api/household/setup/pets-complete");
await step("/api/household/companion", "PUT", {
  name: "Mochi", furPaletteKey: "orange", patchPrimaryPaletteKey: "ginger",
  patchSecondaryPaletteKey: "cream", expressionKey: "neutral"
});
await step("/api/household/setup/companion-complete");
await step("/api/household/setup/complete");

const dashboard = await step("/api/dashboard", "GET");
assert(dashboard.household.name.includes("Dashboard Smoke"), "Dashboard household was incorrect");
assert(dashboard.rooms.length === 3 && dashboard.pets[0].name === "Tori", "Dashboard context was incomplete");
assert(dashboard.companion.name === "Mochi", "Dashboard Companion was missing");
assert(dashboard.setup.routinesChosen === false && dashboard.todayMission.state === "setup",
  "Fresh Dashboard did not show routine guidance");
const recommendationKeys = dashboard.recommendations.map(({ templateKey }) => templateKey);
for (const templateKey of [
  "kitchen.evening_reset", "bathroom.daily_reset", "bedroom.weekly_clean",
  "pet.cat.morning_feed", "pet.cat.refresh_water"
]) assert(recommendationKeys.includes(templateKey), `Missing recommendation ${templateKey}`);
assert(!("tasks" in dashboard) && !("progressPercentage" in dashboard), "Dashboard fabricated task or performance data");

const owner = dashboard.members.find(({ role }) => role === "owner");
const participant = dashboard.members.find(({ displayName }) => displayName === "Review Participant");
assert(owner && participant, "Routine responsibility options were incomplete");
const selectedKeys = new Set([
  "kitchen.evening_reset", "bathroom.daily_reset", "bedroom.weekly_clean",
  "pet.cat.morning_feed", "pet.cat.refresh_water"
]);
const selections = dashboard.recommendations.filter(({ templateKey }) => selectedKeys.has(templateKey)).map((recommendation, index) => ({
  templateKey: recommendation.templateKey,
  clientKey: null,
  enabled: true,
  roomId: recommendation.roomId,
  petId: recommendation.petId,
  frequency: recommendation.templateKey === "bedroom.weekly_clean" ? "weekly" : "daily",
  ownerMemberId: index % 2 ? participant.id : owner.id,
  rotationEnabled: recommendation.templateKey === "bathroom.daily_reset",
  rotationMemberIds: recommendation.templateKey === "bathroom.daily_reset" ? [owner.id, participant.id] : [],
  customisedName: "",
  note: ""
}));
const customKey = `custom-${suffix}`;
selections.push({
  templateKey: null, clientKey: customKey, enabled: true,
  roomId: kitchen.room.id, petId: null, frequency: "twice_weekly",
  ownerMemberId: participant.id, rotationEnabled: false, rotationMemberIds: [],
  customisedName: "Water kitchen herbs", note: "Check the soil first"
});
const applyPayload = { householdId: "forged-household", selections };
const applied = await step("/api/household/routine-setup/apply", "POST", applyPayload);
assert(applied.activeRoutineCount === 6, `Expected 6 active routines, found ${applied.activeRoutineCount}`);
assert(applied.setup.routinesChosen && applied.setup.readyForPlanning, "Dashboard setup progress did not advance");
assert(applied.todayMission.state === "ready" && !("tasks" in applied.todayMission), "Today’s Mission was not an honest ready state");

const reapplied = await step("/api/household/routine-setup/apply", "POST", applyPayload);
assert(reapplied.activeRoutineCount === 6 && reapplied.routines.length === 6, "Repeating setup created duplicate routines");
const refreshed = await step("/api/dashboard", "GET");
assert(refreshed.activeRoutineCount === 6 && refreshed.setup.routinesChosen, "Routine setup did not survive Dashboard refresh");
const library = await step("/api/household/systems?status=active", "GET");
assert(library.routines.length === 6, "Friendly routine library did not contain the generated routines");
const generated = library.routines.find(({ sourceTemplateKey }) => sourceTemplateKey === "kitchen.evening_reset");
assert(generated?.roomId === kitchen.room.id, "Kitchen routine lost its Room context");
assert(library.routines.some(({ petId }) => petId === pet.pet.id), "Pet-care routine lost Pet context");
const adultLibrary = await call("/api/household/systems?status=archived", "GET", undefined, participantCookie);
assert(adultLibrary.body.data.routines.length === 6 && adultLibrary.body.data.canManage === false,
  "Adult active-only routine view was incorrect");

const other = await call("/api/auth/households", "POST", {
  householdName: `Isolated Smoke ${suffix}`, displayName: "Other Owner",
  pin: "4829", pinConfirmation: "4829"
});
const otherCookie = other.cookie;
async function otherStep(path, method = "POST", data = {}) {
  return (await call(path, method, method === "GET" ? undefined : data, otherCookie)).body.data;
}
await otherStep("/api/household/setup/leadership", "PATCH");
await otherStep("/api/household/setup/members-complete");
await otherStep("/api/household/rooms", "POST", { name: "Other Kitchen", roomType: "kitchen" });
await otherStep("/api/household/setup/rooms-complete");
await otherStep("/api/household/setup/pets-complete");
await otherStep("/api/household/companion", "PUT", {
  name: "Other Cat", furPaletteKey: "grey", patchPrimaryPaletteKey: "cream",
  patchSecondaryPaletteKey: "white", expressionKey: "neutral"
});
await otherStep("/api/household/setup/companion-complete");
await otherStep("/api/household/setup/complete");
const crossHousehold = await fetch(`${base}/api/household/systems/${generated.id}`, {
  headers: { cookie: otherCookie }
});
assert(crossHousehold.status === 404, "Another household could read a generated routine");

console.log(JSON.stringify({
  base,
  route: "/dashboard",
  householdReference: created.body.data.householdReference,
  rooms: [kitchen.room.name, bathroom.room.name, bedroom.room.name],
  pet: pet.pet.name,
  recommendationsVerified: [...selectedKeys],
  activeRoutines: refreshed.activeRoutineCount,
  customRoutine: "Water kitchen herbs",
  repeatedApplyCreatedDuplicates: false,
  tenantIsolation: true,
  fakeTaskInstances: false,
  requestIds
}, null, 2));
