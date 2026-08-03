import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPatch, onRequestDelete } from "../functions/api/household/rooms/[roomId]";
import { SESSION_COOKIE } from "../functions/api/auth";
import { RoomsSpaces } from "../src/RoomsSpaces";

const identity = { sessionId: "session", householdId: "home", householdName: "Home", householdReference: "home",
  memberId: "owner", displayName: "Owner", profileReference: "owner", role: "owner", accessLevel: "household_admin",
  expiresAt: "2999", setupStatus: "complete", setupStep: "complete" };

function database(linkedRoutines = 0) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = { prepare(sql: string) { const call = { sql, values: [] as unknown[] }; calls.push(call); return { bind(...values: unknown[]) {
    call.values = values; return { first: async () => sql.includes("FROM sessions s") ? identity : sql.includes("count(*)")
      ? { count: linkedRoutines } : sql.includes("SELECT id FROM rooms") ? { id: "room" } : null,
    all: async () => ({ results: sql.includes("SELECT id FROM members") ? [{ id: "owner" }] : [] }),
    run: async () => ({ success: true, meta: { changes: 1 } }) }; } }; },
    batch: async (statements: unknown[]) => statements.map(() => ({ success: true, meta: { changes: 1 } })) } as unknown as D1Database;
  return { db, calls };
}
const request = (method: string, body = {}) => new Request("https://cradle.test/api/household/rooms/room", {
  method, headers: { cookie: `${SESSION_COOKIE}=token`, "content-type": "application/json" }, body: JSON.stringify(body)
});

describe("Rooms & spaces allocation safety", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("changes the canonical room type without replacing the room or its routine references", async () => {
    const { db, calls } = database();
    const response = await onRequestPatch({ request: request("PATCH", { name: "Laundry", roomType: "utility",
      description: "Downstairs", occupantMemberIds: ["owner"] }), env: { DB: db }, params: { roomId: "room" } });
    expect(response.status).toBe(200);
    const update = calls.find(({ sql }) => sql.includes("UPDATE rooms SET"))!;
    expect(update.sql).not.toContain("space_type");
    expect(update.values).toEqual(expect.arrayContaining(["laundry", "home", "room"]));
    expect(calls.some(({ sql }) => sql.includes("UPDATE household_systems"))).toBe(false);
  });

  it("refuses to archive a room while routines still reference it", async () => {
    const { db, calls } = database(2);
    const response = await onRequestDelete({ request: request("DELETE"), env: { DB: db }, params: { roomId: "room" } });
    expect(response.status).toBe(409);
    expect(calls.some(({ sql }) => sql.includes("UPDATE rooms SET is_active = 0"))).toBe(false);
  });

  it("shows room type, assigned people and associated routines in management", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, requestId: "rooms",
      data: { rooms: [{ id: "room", name: "Laundry", roomType: "laundry", description: null,
        occupantMemberIds: ["owner"], isActive: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02",
        routines: [{ id: "routine", name: "Laundry rotation", status: "active" }] }] } }),
      { status: 200, headers: { "content-type": "application/json" } })));
    render(<RoomsSpaces members={[{ id: "owner", displayName: "Owner", role: "owner" } as never]} close={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Laundry" })).toBeInTheDocument();
    expect(screen.getByText(/Laundry \/ utility · Active/)).toBeInTheDocument();
    expect(screen.getByText(/Laundry rotation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Type")).toHaveValue("laundry");
  });
});
