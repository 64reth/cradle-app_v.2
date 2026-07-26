import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles/app.css", "utf8");

describe("My Cradle layout containment", () => {
  it("keeps Dashboard placement rules scoped away from personal cards", () => {
    expect(styles).toContain(".dashboard-grid > .mission-card, .dashboard-grid > .next-card");
    expect(styles).not.toMatch(/\.mission-card\s*\{[^}]*grid-column\s*:/);
  });

  it("gives Dashboard Mission its own row and pairs Moment with Schedule", () => {
    expect(styles).toContain(".dashboard-grid > .today-mission-card { grid-column: 1 / -1; }");
    expect(styles).toContain(".dashboard-grid > .today-moment-card, .dashboard-grid > .schedule-card { grid-column: span 6; }");
    expect(styles).toContain(".mission-list");
    expect(styles).toContain("max-height: clamp(16rem, 42vh, 28rem);");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain(".dashboard-grid > .today-mission-card, .dashboard-grid > .today-moment-card,");
  });

  it("defines one content-driven profile hero with responsive containment", () => {
    expect(styles).toContain(".personal-profile-hero {");
    expect(styles).toContain("grid-column: 1 / -1;");
    expect(styles).toContain(".personal-profile-details { display: grid; min-width: 0;");
    expect(styles).toContain(".personal-profile-hero { grid-template-columns: minmax(0, 1fr);");
  });
});
