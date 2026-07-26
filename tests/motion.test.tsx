import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionConfig } from "motion/react";
import { MotionButtonFeedback, MotionPage } from "../src/motion";

describe("Cradle motion foundation", () => {
  it("keeps page content and button semantics available through the shared primitives", () => {
    const action = vi.fn();
    render(<MotionPage motionKey="dashboard"><h1>Dashboard</h1><MotionButtonFeedback onClick={action}>Save</MotionButtonFeedback></MotionPage>);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("renders immediately and remains interactive when reduced motion is requested", () => {
    const action = vi.fn();
    render(<MotionConfig reducedMotion="always"><MotionPage><MotionButtonFeedback onClick={action}>Complete</MotionButtonFeedback></MotionPage></MotionConfig>);
    const button = screen.getByRole("button", { name: "Complete" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not apply active press feedback to disabled controls", () => {
    const action = vi.fn();
    render(<MotionButtonFeedback disabled onClick={action}>Saving…</MotionButtonFeedback>);
    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
  });
});
