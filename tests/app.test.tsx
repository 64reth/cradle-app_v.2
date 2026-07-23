import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

function response(status: number, body: object) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => vi.restoreAllMocks());

describe("Phase 3 application", () => {
  it("renders all public entry choices after an unauthenticated session check", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(401, { ok: false, error: { message: "Sign in" } })));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Create Household" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Household" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("shows the household creation fields", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(401, { ok: false, error: { message: "Sign in" } })));
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Household" }));
    expect(screen.getByLabelText("Household name")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner display name")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm PIN")).toBeInTheDocument();
  });

  it("renders an authenticated owner, membership, invitations, and placeholder", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, { ok: true, data: {
        household: { name: "Fox House", reference: "fox-house-a1b2c3" },
        member: { displayName: "Alex", reference: "alex", role: "owner" }, expiresAt: "later"
      } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { members: [
        { displayName: "Alex", profileReference: "alex", role: "owner" }
      ] } }));
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Fox House" })).toBeInTheDocument();
    expect(await screen.findByText("Alex", { selector: ".member-list span" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Invite someone" })).toBeInTheDocument();
    expect(screen.getByText(/operational features|rooms, routines/i)).toBeInTheDocument();
  });

  it("hides invitation controls from a child", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => response(200, { ok: true, data: {
        household: { name: "Fox House", reference: "fox" },
        member: { displayName: "Sam", reference: "sam", role: "child" }, expiresAt: "later"
      } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { members: [] } })));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Fox House" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Invite someone" })).not.toBeInTheDocument();
  });

  it("handles network failure and retry", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<App />);
    expect(await screen.findByText(/couldn’t connect/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("returns to public state after sign-out", async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(() => response(200, { ok: true, data: {
        household: { name: "Home", reference: "home" }, member: { displayName: "A", reference: "a", role: "adult" }, expiresAt: "later"
      } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { members: [] } }))
      .mockImplementationOnce(() => response(200, { ok: true, data: { signedOut: true } }));
    vi.stubGlobal("fetch", fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument());
  });
});
