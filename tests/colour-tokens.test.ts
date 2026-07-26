import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const styles = readFileSync("src/styles/app.css", "utf8");

describe("Cradle colour token foundation", () => {
  it("preserves the approved base palette", () => {
    expect(tokens).toContain("--colour-ink: #232323;");
    expect(tokens).toContain("--colour-paper: #fffaf0;");
    expect(tokens).toContain("--colour-sun: #ffd447;");
    expect(tokens).toContain("--colour-mint: #8fe3af;");
    expect(tokens).toContain("--colour-sky: #72c9f4;");
    expect(tokens).toContain("--colour-coral: #ff806d;");
    expect(tokens).toContain("--colour-lilac: #b69cff;");
  });

  it("defines compatibility aliases for previously missing colours", () => {
    expect(tokens).toContain("--colour-muted-ink: var(--colour-text-muted);");
    expect(tokens).toContain("--colour-cream: var(--colour-paper);");
  });

  it("defines semantic surface, action, focus, state and module roles", () => {
    for (const token of [
      "--colour-surface-elevated",
      "--colour-surface-disabled",
      "--colour-text-disabled",
      "--colour-action-primary-hover",
      "--colour-action-secondary-pressed",
      "--colour-action-danger",
      "--colour-focus-inner",
      "--colour-focus-outer",
      "--colour-state-complete",
      "--colour-state-away",
      "--colour-state-needs-help",
      "--colour-module-dashboard-surface",
      "--colour-module-meals-surface",
      "--colour-module-together-surface",
    ]) {
      expect(tokens).toContain(token);
    }
  });

  it("routes key UI states through semantic aliases", () => {
    expect(styles).toContain("background: var(--colour-state-error-surface)");
    expect(styles).toContain("background: var(--colour-state-success-surface)");
    expect(styles).toContain("background: var(--colour-state-warning-surface)");
    expect(styles).toContain("outline: 3px solid var(--colour-focus-inner)");
    expect(styles).toContain("box-shadow: 0 0 0 5px var(--colour-focus-outer)");
  });

  it("does not leave the audited variables unresolved in app styles", () => {
    expect(styles).not.toMatch(/var\(--colour-muted-ink\)/);
    expect(styles).not.toMatch(/var\(--colour-cream\)/);
  });
});
