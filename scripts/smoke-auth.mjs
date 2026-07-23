const base = process.env.CRADLE_SMOKE_URL || "http://127.0.0.1:8788";

async function call(path, options = {}, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers || {}) }
  });
  const body = await response.json();
  return { response, body, cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function post(path, data, cookie = "") {
  return call(path, { method: "POST", body: JSON.stringify(data) }, cookie);
}

const suffix = Date.now().toString().slice(-7);
const pin = "4829";
const createdA = await post("/api/auth/households", {
  householdName: `Smoke Home A ${suffix}`, displayName: "Owner Smoke", pin, pinConfirmation: pin
});
assert(createdA.response.status === 201 && createdA.cookie, "Household A creation/session failed");
const aReference = createdA.body.data.householdReference;
const ownerReference = createdA.body.data.profileReference;

const signedOut = await post("/api/auth/sign-out", {}, createdA.cookie);
assert(signedOut.response.status === 200, "Owner sign-out failed");
const revokedSession = await call("/api/auth/session", {}, createdA.cookie);
assert(revokedSession.response.status === 401, "Revoked session remained valid");
const signedIn = await post("/api/auth/sign-in", {
  householdReference: aReference, profileReference: ownerReference, pin
});
assert(signedIn.response.status === 200 && signedIn.cookie, "Owner sign-in failed");

const roleCookies = {};
for (const role of ["parent_admin", "adult", "child"]) {
  const invitation = await post("/api/household/invitations", { role }, signedIn.cookie);
  assert(invitation.response.status === 201, `${role} invitation creation failed`);
  const joined = await post("/api/auth/join", {
    invitationCode: invitation.body.data.code, displayName: `${role} ${suffix}`,
    pin, pinConfirmation: pin
  });
  assert(joined.response.status === 201 && joined.body.data.role === role, `${role} redemption failed`);
  roleCookies[role] = joined.cookie;
  const reused = await post("/api/auth/join", {
    invitationCode: invitation.body.data.code, displayName: `Replay ${role}`,
    pin, pinConfirmation: pin
  });
  assert(reused.response.status === 400, `${role} invitation was reusable`);
}

const parentInvite = await post("/api/household/invitations", { role: "adult" }, roleCookies.parent_admin);
assert(parentInvite.response.status === 201, "Parent/Admin could not invite");
for (const role of ["adult", "child"]) {
  const denied = await post("/api/household/invitations", { role: "child" }, roleCookies[role]);
  assert(denied.response.status === 403, `${role} could create an invitation`);
}

const childMembers = await call("/api/household/members", {}, roleCookies.child);
assert(childMembers.body.data.members.length === 1, "Child did not receive child-safe membership");
const adultMembers = await call("/api/household/members", {}, roleCookies.adult);
assert(adultMembers.body.data.members.length === 4, "Adult membership view was incomplete");

const createdB = await post("/api/auth/households", {
  householdName: `Smoke Home B ${suffix}`, displayName: "Owner B", pin, pinConfirmation: pin
});
assert(createdB.response.status === 201, "Household B creation failed");
const bMembers = await call("/api/household/members?household_id=forged", {}, createdB.cookie);
assert(bMembers.body.data.members.length === 1 && bMembers.body.data.members[0].displayName === "Owner B",
  "Household B could read Household A");
execFileSync("npx", ["wrangler", "d1", "execute", "cradle-db", "--local", "--command",
  `UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z' WHERE household_id = (SELECT id FROM households WHERE lookup_reference = '${createdB.body.data.householdReference}')`],
{ stdio: "ignore" });
const expiredSession = await call("/api/auth/session", {}, createdB.cookie);
assert(expiredSession.response.status === 401, "Expired session remained valid");

console.log(JSON.stringify({
  householdA: aReference, owner: ownerReference, createdRoles: Object.keys(roleCookies),
  reuseRejected: true, rolePolicyVerified: true, childSafeView: true, tenantIsolation: true,
  revokedSessionRejected: true, expiredSessionRejected: true
}, null, 2));
import { execFileSync } from "node:child_process";
