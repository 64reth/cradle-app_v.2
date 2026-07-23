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
  householdName: `Onboarding Smoke ${suffix}`,
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
async function sessionMustPersist() {
  const result = await call("/api/auth/session", "GET", undefined, cookie);
  requestIds.push(result.body.requestId);
  assert(result.body.data.member?.role === "owner", "Session was lost during onboarding");
}

await step("/api/household/setup/leadership", "PATCH");
await sessionMustPersist();
await step("/api/household/setup/members-complete");

let interrupted = false;
try {
  await fetch("http://127.0.0.1:1/api/household/rooms", {
    method: "POST",
    body: JSON.stringify({ name: "Kitchen" }),
    headers: { "content-type": "application/json" }
  });
} catch {
  interrupted = true;
}
assert(interrupted, "Deliberately interrupted request unexpectedly connected");

const kitchen = await step("/api/household/rooms", "POST", { name: "Kitchen", description: "Main kitchen" });
const study = await step("/api/household/rooms", "POST", { name: "Study", description: "Quiet room" });
await step(`/api/household/rooms/${study.room.id}`, "PATCH", { name: "Home Office", description: "Quiet room" });
await step(`/api/household/rooms/${kitchen.room.id}`, "DELETE");
const rooms = await step("/api/household/rooms", "GET", undefined);
assert(rooms.rooms.length === 1 && rooms.rooms[0].name === "Home Office", "Room edit/removal did not persist");
await step("/api/household/setup/rooms-complete");

await step("/api/household/pets", "POST", {
  name: "Miso",
  petType: "cat",
  breed: "Domestic shorthair",
  notes: "Indoor cat"
});
await step("/api/household/setup/pets-complete");

await step("/api/household/companion", "PUT", {
  name: "Mochi",
  furPaletteKey: "orange",
  patchPrimaryPaletteKey: "ginger",
  patchSecondaryPaletteKey: "cream",
  expressionKey: "calm"
});
await sessionMustPersist();
await step("/api/household/setup/companion-complete");

const review = await step("/api/household/setup", "GET", undefined);
assert(review.state.step === "review", "Review did not load");
assert(review.companion?.name === "Mochi", "Companion was absent from Review");
assert(review.rooms.length === 1 && review.pets.length === 1, "Review household data was incomplete");

await step("/api/household/setup/complete");
await sessionMustPersist();
const refreshed = await step("/api/household/setup", "GET", undefined);
assert(refreshed.state.status === "complete", "Completed setup did not survive refresh");
assert(refreshed.rooms.length === 1 && refreshed.companion?.name === "Mochi", "Refreshed setup lost state");

console.log(JSON.stringify({
  base,
  householdReference: created.body.data.householdReference,
  interruptedRequestRetried: true,
  activeRooms: refreshed.rooms.map(({ name }) => name),
  pets: refreshed.pets.map(({ name }) => name),
  companion: refreshed.companion.name,
  setupStatus: refreshed.state.status,
  requestIds
}, null, 2));
