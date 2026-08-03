import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, jsonInit, RequestTimeoutError } from "../src/api";
import { useStableMutation } from "../src/useStableMutation";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function abortableNever(signal?: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

function MutationHarness({ task }: { task: (signal: AbortSignal) => Promise<string> }) {
  const stable = useStableMutation();
  const [value, setValue] = useState("preserved input");
  return <div><input aria-label="Member name" value={value} onChange={(event) => setValue(event.target.value)} />
    <button disabled={stable.isPending("invite:gillian")} onClick={() => void stable.run({
      key: "invite:gillian", pendingLabel: "Creating invite…", task, onSuccess: setValue
    })}>{stable.isPending("invite:gillian") ? "Creating invite…" : "Invite again"}</button>
    {stable.feedback && <p role="status">{stable.feedback.message}</p>}</div>;
}

describe("central request and mutation stability", () => {
  it("times out a mutation with an explicit unknown-outcome error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path: RequestInfo | URL, init?: RequestInit) => abortableNever(init?.signal || undefined)));
    const pending = api("/api/slow", { ...jsonInit("POST"), timeoutMs: 50 });
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("prevents duplicate clicks, preserves input, and unlocks after timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path: RequestInfo | URL, init?: RequestInit) => abortableNever(init?.signal || undefined)));
    const task = vi.fn((signal: AbortSignal) => api<string>("/api/slow", {
      ...jsonInit("POST"), signal
    }));
    render(<MutationHarness task={task} />);
    const input = screen.getByLabelText("Member name");
    fireEvent.change(input, { target: { value: "Gillian" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite again" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating invite…" }));
    expect(task).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Creating invite…" })).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); await Promise.resolve(); });
    expect(screen.getByText("This is taking longer than expected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite again" })).toBeEnabled();
    expect(input).toHaveValue("Gillian");
  });

  it("ignores a late mutation result after unmount", async () => {
    let resolve!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(<MutationHarness task={task} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite again" }));
    view.unmount();
    await act(async () => { resolve("late result"); await Promise.resolve(); });
    expect(error).not.toHaveBeenCalled();
  });

  it("does not let an earlier completion overwrite the current action state", async () => {
    const resolvers: Array<(value: string) => void> = [];
    const task = vi.fn(() => new Promise<string>((done) => resolvers.push(done)));
    render(<MutationHarness task={task} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite again" }));
    fireEvent.click(screen.getByRole("button", { name: "Creating invite…" }));
    expect(resolvers).toHaveLength(1);
    await act(async () => { resolvers[0]("new state"); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByLabelText("Member name")).toHaveValue("new state"));
  });
});
