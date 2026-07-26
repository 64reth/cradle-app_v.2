import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CradleIcon, CRADLE_ICON_NAMES, cradleIconRegistry } from "../src/components/ui/CradleIcon";
import { getRoomIconName, getTaskIconName } from "../src/iconMappings";

describe("Cradle icon system", () => {
  it("keeps the semantic registry closed and backed by Lucide components", () => {
    expect(Object.keys(cradleIconRegistry).sort()).toEqual([...CRADLE_ICON_NAMES].sort());
    for (const icon of Object.values(cradleIconRegistry)) expect(icon).toBeTruthy();
  });

  it("uses the shared size presets and current-colour SVG defaults", () => {
    const { container } = render(<CradleIcon name="calendar" size="sm" decorative />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("supports accessible labels for non-decorative icons", () => {
    const { container } = render(<CradleIcon name="help" label="Ask for help" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "Ask for help");
    expect(container.querySelector("svg")).not.toHaveAttribute("aria-hidden");
  });

  it("maps room concepts to stable semantic names", () => {
    expect(getRoomIconName("Kitchen")).toBe("kitchen");
    expect(getRoomIconName("Living Room")).toBe("livingRoom");
    expect(getRoomIconName("Laundry / Utility")).toBe("utility");
    expect(getRoomIconName("A room Cradle does not know yet")).toBe("room");
  });

  it("maps task concepts to stable semantic names", () => {
    expect(getTaskIconName("Laundry")).toBe("laundry");
    expect(getTaskIconName("Vacuum the floors")).toBe("vacuum");
    expect(getTaskIconName("Take the bins out")).toBe("rubbish");
    expect(getTaskIconName("A new household mission")).toBe("mission");
  });

  it("keeps feature code independent from Lucide and retired icon assets", () => {
    const featureSources = ["src/App.tsx", "src/Dashboard.tsx", "src/Systems.tsx", "src/Calendar.tsx", "src/Family.tsx", "src/PersonalArea.tsx"]
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(featureSources).not.toContain("lucide-react");
    expect(featureSources).not.toMatch(/public\/icons|\/icons\//);
  });
});
