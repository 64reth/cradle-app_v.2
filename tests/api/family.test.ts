import { describe, expect, it } from "vitest";
import type { Identity } from "../../functions/api/auth";
import { SESSION_COOKIE, sha256 } from "../../functions/api/auth";
import { IDENTITY_COOKIE } from "../../functions/api/auth-provider";
import { familyMembers, onRequestPost as addMember } from "../../functions/api/household/members/index";
import { onRequestPost as createInvite } from "../../functions/api/household/invites/index";
import { onRequestPost as regenerateInvite } from "../../functions/api/household/invites/[inviteId]/regenerate";
import { onRequestPost as revokeInvite } from "../../functions/api/household/invites/[inviteId]/revoke";
import { onRequestPost as approveJoinRequest } from "../../functions/api/household/join-requests/[requestId]/approve";
import { onRequestPost as suspendMember } from "../../functions/api/household/members/[memberId]/suspend";
import { onRequestPost as restoreMember } from "../../functions/api/household/members/[memberId]/restore";
import { onRequestPut as putManagedAvatar } from "../../functions/api/household/members/[memberId]/avatar";
import { onRequestPost as acceptInvite } from "../../functions/api/invites/[reference]/accept";
import { onRequestPost as suggest } from "../../functions/api/household/task-suggestions/index";
import { onRequestPost as reviewSuggestion } from "../../functions/api/household/task-suggestions/[suggestionId]/review";
import { onRequestPost as withdrawSuggestion } from "../../functions/api/household/task-suggestions/[suggestionId]/withdraw";
import { onRequestPatch as updateMe } from "../../functions/api/me/index";
import { onRequestPut as putMyAvatar } from "../../functions/api/me/avatar";
import { familyAccess } from "../../functions/api/member-policy";

const owner: Identity = {
  sessionId: "session", accountId: "account-owner", householdId: "house-a", householdName: "Fox House",
  householdReference: "fox", memberId: "owner", displayName: "Alex", profileReference: "alex",
  role: "owner", expiresAt: "2999", setupStatus: "complete", setupStep: "complete"
};

type Options = {
  identity?: Identity | null; existingMember?: object | null; targetMember?: object | null;
  invite?: object | null; account?: object | null; joinRequest?: object | null;
  identityAccount?: object | null;
  oldInvite?: object | null; member?: object | null; room?: object | null; pet?: object | null; batchChanges?: number[];
  familyRows?: object[]; regeneratedInvite?: object | null;
};
function mockDb(options: Options = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = []; const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  const identity = options.identity === undefined ? owner : options.identity;
  const db = {
    prepare(sql: string) {
      const call = { sql, values: [] as unknown[] }; calls.push(call);
      const statement = { sql, values: call.values, bind(...values: unknown[]) {
        call.values = values; statement.values = values;
        return {
          sql, values,
          first: async () => {
            if (sql.includes("FROM sessions")) return identity;
            if (sql.includes("FROM identity_sessions")) {
              return options.identityAccount === null ? null
                : options.identityAccount ?? { accountId: "provider-account", identitySessionId: "provider-session", provider: "google" };
            }
            if (sql.includes("client_key = ?") && sql.includes("FROM members")) return options.existingMember ?? null;
            if (sql.includes("FROM members") && sql.includes("account_id AS accountId") && sql.includes("is_active = 1")) {
              return options.targetMember ?? null;
            }
            if (sql.includes("FROM household_invites i") && sql.includes("token_hash")) return options.invite ?? null;
            if (sql.includes("FROM household_invites") && sql.includes("token_hash = ?")) {
              return options.regeneratedInvite ?? null;
            }
            if (sql.includes("FROM household_invites WHERE")) return options.oldInvite ?? null;
            if (sql.includes("FROM user_accounts")) return options.account ?? null;
            if (sql.includes("FROM household_join_requests j")) return options.joinRequest ?? null;
            if (sql.includes("FROM household_join_requests")) return options.joinRequest ?? null;
            if (sql.includes("FROM members") && sql.includes("access_level AS accessLevel")) {
              return options.member ? { displayName: "Taryn", ...options.member } : null;
            }
            if (sql.includes("FROM rooms")) return options.room ?? null;
            if (sql.includes("FROM pets")) return options.pet ?? null;
            if (sql.includes("FROM member_companions")) return { id: "companion", memberId: "owner", name: "Pip" };
            if (sql.includes("FROM members m JOIN households")) return { id: "owner", displayName: "Alex", role: "owner" };
            return null;
          },
          all: async () => ({ results: sql.includes("WITH latest_invites") ? options.familyRows || [] : [] }),
          run: async () => ({ success: true, meta: { changes: 1 } })
        };
      } };
      return statement;
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      batches.push(statements);
      return statements.map((_, index) => ({ success: true, meta: { changes: options.batchChanges?.[index] ?? 1 } }));
    }
  } as unknown as D1Database;
  return { db, calls, batches };
}
function request(path: string, method = "POST", body: object = {}, authenticated = true) {
  return new Request(`https://cradle.test${path}`, {
    method, headers: { "content-type": "application/json", ...(authenticated
      ? { cookie: `${SESSION_COOKIE}=token; ${IDENTITY_COOKIE}=provider-token` }
      : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
}
const publicInvite = {
  id: "invite", householdId: "house-a", targetMemberId: "gillian", inviteType: "profile",
  role: "parent_admin", expiresAt: "2999-01-01", maxUses: 1, useCount: 0, revokedAt: null,
  acceptedAt: null, acceptedAccountId: null, householdName: "Fox House", targetName: "Gillian",
  targetAccountId: null, targetLifecycleState: "invited"
  , accessLevel: "household_admin", ageBand: "adult"
};

describe("family, invitation and personal APIs", () => {
  it("centralises Owner, Parent/Admin, Adult and Child family permissions", () => {
    expect(familyAccess(owner)).toBe("manage");
    expect(familyAccess({ ...owner, role: "parent_admin" })).toBe("manage");
    expect(familyAccess({ ...owner, role: "adult" })).toBe("participate");
    expect(familyAccess({ ...owner, role: "child" })).toBe("limited");
  });

  it("creates an unclaimed Member without credentials and derives the household from session", async () => {
    const { db, calls } = mockDb();
    const response = await addMember({ request: request("/api/household/members", "POST", {
      displayName: "Gillian", accessLevel: "household_admin", ageBand: "adult", clientKey: "member-client-1",
      householdId: "forged"
    }), env: { DB: db } });
    expect(response.status).toBe(201);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO members"));
    expect(insert?.values).toContain("house-a");
    expect(insert?.values).not.toContain("forged");
    expect(insert?.values).toContain("unclaimed");
    expect(insert?.sql).not.toContain("pin_hash");
  });

  it("keeps paused and revoked-invitation members in the authoritative Family list", async () => {
    const paused = { id: "gillian", displayName: "Gillian", lifecycleState: "suspended", hasAccount: 1 };
    const revoked = { id: "taryn", displayName: "Taryn", lifecycleState: "unclaimed", hasAccount: 0,
      invitationStatus: "revoked", inviteId: "invite-old" };
    const { db, calls } = mockDb({ familyRows: [paused, revoked] });

    const result = await familyMembers(db, "house-a");

    expect(result.results).toEqual([paused, revoked]);
    const query = calls.find(({ sql }) => sql.includes("WITH latest_invites"))?.sql || "";
    expect(query).toContain("m.is_active = 1 OR m.lifecycle_state = 'suspended'");
    expect(query).not.toContain("m.lifecycle_state NOT IN ('left', 'suspended')");
  });

  it("makes Member creation retry-safe and supports managed Child profiles", async () => {
    const existing = { id: "taryn", displayName: "Taryn", role: "child",
      accessLevel: "managed_member", ageBand: "child", lifecycleState: "managed" };
    const retry = mockDb({ existingMember: existing });
    const response = await addMember({ request: request("/api/household/members", "POST", {
      displayName: "Taryn", accessLevel: "managed_member", ageBand: "child", clientKey: "member-client-2"
    }), env: { DB: retry.db } });
    const body = await response.json() as { data: { member: object; created: boolean } };
    expect(body.data).toEqual({ member: existing, created: false });
    expect(retry.calls.some(({ sql }) => sql.includes("INSERT INTO members"))).toBe(false);
  });

  it("rejects invalid roles and denies Adult and Child Member creation", async () => {
    const invalid = mockDb();
    expect((await addMember({ request: request("/api/household/members", "POST", {
      displayName: "Person", accessLevel: "superuser", ageBand: "adult", clientKey: "member-client-3"
    }), env: { DB: invalid.db } })).status).toBe(400);
    for (const role of ["adult", "child"] as const) {
      const denied = mockDb({ identity: { ...owner, role } });
      expect((await addMember({ request: request("/api/household/members", "POST", {
        displayName: "Person", accessLevel: "household_member", ageBand: "adult", clientKey: "member-client-4"
      }), env: { DB: denied.db } })).status).toBe(403);
    }
  });

  it("creates profile-specific invitations with hashes, expiry and no client tenant authority", async () => {
    const target = { displayName: "Gillian", role: "parent_admin", accessLevel: "household_admin",
      ageBand: "adult", accountId: null, lifecycleState: "unclaimed" };
    const { db, calls } = mockDb({ targetMember: target });
    const response = await createInvite({ request: request("/api/household/invites", "POST", {
      targetMemberId: "gillian", expiry: "7_days", householdId: "forged"
    }), env: { DB: db } });
    const body = await response.json() as { data: { invite: { token: string; code: string; inviteUrl: string } }; requestId: string };
    expect(response.status).toBe(201);
    expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
    expect(body.data.invite.inviteUrl).toContain(`/invite/${body.data.invite.token}`);
    const insert = calls.find(({ sql }) => sql.includes("INSERT INTO household_invites"));
    expect(insert?.values).toContain(await sha256(body.data.invite.token));
    expect(insert?.values).toContain(await sha256(body.data.invite.code));
    expect(insert?.values).not.toContain(body.data.invite.token);
    expect(insert?.values).not.toContain("forged");
  });

  it("cannot create an invitation for a Member outside the authenticated household", async () => {
    const { db, calls } = mockDb({ targetMember: null });
    const response = await createInvite({ request: request("/api/household/invites", "POST", {
      targetMemberId: "foreign-member", expiry: "7_days", householdId: "foreign-house"
    }), env: { DB: db } });
    expect(response.status).toBe(404);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO household_invites"))).toBe(false);
  });

  it("rejects expired and revoked invitations with safe typed states", async () => {
    for (const patch of [{ revokedAt: "now" }, { expiresAt: "2000-01-01" }]) {
      const { db } = mockDb({ invite: { ...publicInvite, ...patch } });
      const response = await acceptInvite({ request: request("/api/invites/token/accept", "POST", {
        displayName: "Gillian"
      }, false), env: { DB: db }, params: { reference: "token" } });
      expect(response.status).toBe(410);
    }
  });

  it("lets an authenticated provider accept a profile invite without creating an account or PIN", async () => {
    const { db, batches, calls } = mockDb({ invite: publicInvite });
    const response = await acceptInvite({ request: request("/api/invites/token/accept", "POST", {
      displayName: "Gillian", requestedMemberId: "wrong-member"
    }), env: { DB: db, APP_ENV: "development" }, params: { reference: "token" } });
    expect(response.status).toBe(201);
    expect(response.headers.get("Set-Cookie")).toContain(SESSION_COOKIE);
    const update = batches[0].find(({ sql }) => sql.includes("UPDATE members SET account_id"));
    expect(update?.values).toContain("gillian");
    expect(update?.values).not.toContain("wrong-member");
    expect(update?.values).toContain("provider-account");
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toBe(false);
    expect(calls.some(({ sql }) => /pin_hash|pin_salt/.test(sql) && sql.includes("INSERT"))).toBe(false);
  });

  it("does not let a provider account claim an already linked Member", async () => {
    const { db, batches } = mockDb({ invite: { ...publicInvite, targetAccountId: "existing-account" } });
    const response = await acceptInvite({ request: request("/api/invites/token/accept", "POST", {
      displayName: "Different Person"
    }), env: { DB: db }, params: { reference: "token" } });
    expect(response.status).toBe(409);
    expect(batches).toHaveLength(0);
  });

  it("lets an existing provider request to join through a general invitation", async () => {
    const { db, batches } = mockDb({ invite: { ...publicInvite, targetMemberId: null, targetName: null,
      inviteType: "household", maxUses: 10 } });
    const response = await acceptInvite({ request: request("/api/invites/code/accept", "POST", {
      displayName: "New Person"
    }), env: { DB: db }, params: { reference: "code" } });
    expect(response.status).toBe(202);
    expect(batches[0].some(({ sql }) => sql.includes("INSERT INTO household_join_requests"))).toBe(true);
    expect(batches[0].some(({ sql }) => sql.includes("INSERT INTO members"))).toBe(false);
    expect(batches[0].some(({ sql }) => sql.includes("INSERT INTO user_accounts"))).toBe(false);
  });

  it("does not allow an invitation to be reused", async () => {
    const { db, batches } = mockDb({ invite: {
      ...publicInvite, acceptedAt: "2026-07-30T11:00:00.000Z", acceptedAccountId: "first-account", useCount: 1,
    } });
    const response = await acceptInvite({
      request: request("/api/invites/token/accept", "POST", {}),
      env: { DB: db },
      params: { reference: "token" },
    });
    expect(response.status).toBe(410);
    expect(batches).toHaveLength(0);
  });

  it("requires provider authentication before accepting an invitation", async () => {
    const { db, batches } = mockDb({ invite: publicInvite });
    const response = await acceptInvite({
      request: request("/api/invites/token/accept", "POST", {}, false),
      env: { DB: db },
      params: { reference: "token" },
    });
    expect(response.status).toBe(401);
    expect(batches).toHaveLength(0);
  });

  it("regenerates an invitation by revoking and replacing it atomically", async () => {
    const { db, batches } = mockDb({ oldInvite: {
      targetMemberId: null, accessLevel: "household_member", ageBand: "adult"
    } });
    const response = await regenerateInvite({
      request: request("/api/household/invites/old/regenerate", "POST", { expiry: "7_days" }),
      env: { DB: db }, params: { inviteId: "old" }
    });
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql).toContain("UPDATE household_invites SET revoked_at");
    expect(batches[0][1].sql).toContain("INSERT INTO household_invites");
  });

  it("returns the same fresh invitation when Invite again is retried", async () => {
    const regenerated = {
      id: "fresh-invite", targetMemberId: "gillian", expiresAt: "2999-01-01",
    };
    const { db, batches } = mockDb({
      oldInvite: { targetMemberId: "gillian", accessLevel: "household_member", ageBand: "adult" },
      regeneratedInvite: regenerated,
    });
    const response = await regenerateInvite({
      request: request("/api/household/invites/old/regenerate", "POST", { expiry: "7_days" }),
      env: { DB: db },
      params: { inviteId: "old" },
    });
    const body = await response.json() as { data: { invite: { id: string; targetMemberId: string; inviteUrl: string } } };

    expect(response.status).toBe(200);
    expect(body.data.invite).toMatchObject({ id: "fresh-invite", targetMemberId: "gillian" });
    expect(body.data.invite.inviteUrl).toContain("/invite/");
    expect(batches).toHaveLength(0);
  });

  it("approves a general-invite request by linking only the requested household profile", async () => {
    const { db, batches } = mockDb({ joinRequest: {
      accountId: "joining-account", requestedMemberId: "gillian", proposedDisplayName: null,
      invitedRole: "parent_admin", invitedAccessLevel: "household_admin", invitedAgeBand: "adult",
      accountName: "Gillian"
    } });
    const response = await approveJoinRequest({
      request: request("/api/household/join-requests/request/approve", "POST", { resolution: "link" }),
      env: { DB: db }, params: { requestId: "request" }
    });
    expect(response.status).toBe(200);
    expect(batches[0][0].sql).toContain("UPDATE members SET account_id");
    expect(batches[0][0].values).toContain("house-a");
    expect(batches[0][0].values).toContain("gillian");
  });

  it("denies Adult and Child join-request approval", async () => {
    for (const role of ["adult", "child"] as const) {
      const { db } = mockDb({ identity: { ...owner, role } });
      const response = await approveJoinRequest({
        request: request("/api/household/join-requests/request/approve", "POST", { resolution: "create_new" }),
        env: { DB: db }, params: { requestId: "request" }
      });
      expect(response.status).toBe(403);
    }
  });

  it("allows Child suggestions but never creates a routine", async () => {
    const { db, calls } = mockDb({ identity: { ...owner, role: "child", memberId: "child" } });
    const response = await suggest({ request: request("/api/household/task-suggestions", "POST", {
      title: "Tidy the games shelf", suggestionType: "one_off", clientKey: "suggest-client"
    }), env: { DB: db } });
    expect(response.status).toBe(201);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO task_suggestions"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO household_systems"))).toBe(false);
  });

  it("records leadership suggestion review without creating a routine or task", async () => {
    const { db, calls } = mockDb();
    const response = await reviewSuggestion({
      request: request("/api/household/task-suggestions/suggestion/review", "POST", { decision: "accepted" }),
      env: { DB: db }, params: { suggestionId: "suggestion" }
    });
    expect(response.status).toBe(200);
    expect(calls.some(({ sql }) => sql.includes("UPDATE task_suggestions"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO household_routines"))).toBe(false);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO task"))).toBe(false);
  });

  it("scopes suggestion withdrawal to the authenticated household and Member", async () => {
    const { db, calls } = mockDb({ identity: { ...owner, householdId: "house-b", memberId: "member-b" } });
    const response = await withdrawSuggestion({
      request: request("/api/household/task-suggestions/suggestion/withdraw", "POST"),
      env: { DB: db }, params: { suggestionId: "suggestion" }
    });
    expect(response.status).toBe(200);
    const update = calls.find(({ sql }) => sql.includes("UPDATE task_suggestions SET status = 'withdrawn'"));
    expect(update?.values).toEqual(expect.arrayContaining(["house-b", "suggestion", "member-b"]));
  });

  it("rejects cross-household Room and Pet suggestion references", async () => {
    for (const body of [
      { roomId: "foreign-room" }, { petId: "foreign-pet" }
    ]) {
      const { db } = mockDb({ room: null, pet: null });
      const response = await suggest({ request: request("/api/household/task-suggestions", "POST", {
        title: "Suggestion", suggestionType: "recurring", clientKey: "suggest-client", ...body
      }), env: { DB: db } });
      expect(response.status).toBe(400);
    }
  });

  it("does not let a Member change their own role", async () => {
    const { db } = mockDb();
    const response = await updateMe({ request: request("/api/me", "PATCH", {
      displayName: "Alex", role: "owner"
    }), env: { DB: db } });
    expect(response.status).toBe(400);
  });

  it("validates and persists one canonical member avatar without a separate name", async () => {
    const valid = mockDb();
    expect((await putMyAvatar({ request: request("/api/me/avatar", "PUT", {
      furPaletteKey: "orange", patchPrimaryPaletteKey: "cream",
      patchSecondaryPaletteKey: "white", expressionKey: "neutral"
    }), env: { DB: valid.db } })).status).toBe(200);
    const invalid = mockDb();
    expect((await putMyAvatar({ request: request("/api/me/avatar", "PUT", {
      furPaletteKey: "purple", patchPrimaryPaletteKey: "cream",
      patchSecondaryPaletteKey: "white", expressionKey: "neutral"
    }), env: { DB: invalid.db } })).status).toBe(400);
  });

  it("lets Household admins manage a Managed member avatar and another non-Owner profile", async () => {
    const childDb = mockDb({ member: {
      id: "child", role: "child", accessLevel: "managed_member", ageBand: "child"
    } });
    expect((await putManagedAvatar({
      request: request("/api/household/members/child/avatar", "PUT", {
        furPaletteKey: "orange", patchPrimaryPaletteKey: "cream",
        patchSecondaryPaletteKey: "white", expressionKey: "neutral"
      }), env: { DB: childDb.db }, params: { memberId: "child" }
    })).status).toBe(200);

    const peerDb = mockDb({
      identity: { ...owner, role: "parent_admin", memberId: "parent-one" },
      member: { id: "parent-two", role: "parent_admin", accessLevel: "household_admin", ageBand: "adult" }
    });
    expect((await suspendMember({
      request: request("/api/household/members/parent-two/suspend", "POST"),
      env: { DB: peerDb.db }, params: { memberId: "parent-two" }
    })).status).toBe(200);
  });

  it("restores a paused linked member without creating a new member", async () => {
    const restored = mockDb({ member: {
      id: "gillian", role: "adult", accessLevel: "household_member", accountId: "provider-account",
    } });
    const response = await restoreMember({
      request: request("/api/household/members/gillian/restore", "POST"),
      env: { DB: restored.db },
      params: { memberId: "gillian" },
    });

    expect(response.status).toBe(200);
    const update = restored.calls.find(({ sql }) => sql.includes("UPDATE members SET lifecycle_state = ?"));
    expect(update?.values[0]).toBe("active");
    expect(restored.calls.some(({ sql }) => sql.includes("INSERT INTO members"))).toBe(false);
  });

  it("denies ordinary Adults and Children from pausing or restoring access", async () => {
    for (const role of ["adult", "child"] as const) {
      const denied = mockDb({ identity: { ...owner, role } });
      expect((await suspendMember({
        request: request("/api/household/members/gillian/suspend", "POST"),
        env: { DB: denied.db },
        params: { memberId: "gillian" },
      })).status).toBe(403);
      expect((await restoreMember({
        request: request("/api/household/members/gillian/restore", "POST"),
        env: { DB: denied.db },
        params: { memberId: "gillian" },
      })).status).toBe(403);
      expect((await revokeInvite({
        request: request("/api/household/invites/invite/revoke", "POST"),
        env: { DB: denied.db },
        params: { inviteId: "invite" },
      })).status).toBe(403);
      expect((await regenerateInvite({
        request: request("/api/household/invites/invite/regenerate", "POST", { expiry: "7_days" }),
        env: { DB: denied.db },
        params: { inviteId: "invite" },
      })).status).toBe(403);
    }
  });
});
