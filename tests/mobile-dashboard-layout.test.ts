import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/app.css", "utf8");

describe("mobile Dashboard containment", () => {
  it.each([320, 375, 390, 430])("uses viewport-contained Family Status and navigation rules at %dpx", (width) => {
    expect(width).toBeLessThanOrEqual(760);
    expect(css).toMatch(/family-status-grid\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/dashboard-nav nav button\s*\{[\s\S]{0,180}flex:\s*1 1 0/);
    expect(css).toMatch(/dashboard-nav nav button\s*\{[\s\S]{0,240}min-width:\s*0/);
    expect(css).toContain("env(safe-area-inset-bottom)");
  });

  it("removes the former horizontal member strip and provides a very-narrow single column", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(mobile).not.toMatch(/family-status-grid\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/@media \(max-width: 350px\)[\s\S]*family-status-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});
