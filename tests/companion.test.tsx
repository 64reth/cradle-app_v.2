import { existsSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { Companion } from "../src/Companion";
import { COMPANION_EXPRESSIONS, FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE } from "../shared/companion";

const files = {
  expressions: ["public/companions/companion-expressions.png", 384, 64],
  fur: ["public/companions/companion-fur.png", 64, 512],
  patchPrimary: ["public/companions/companion-patch-primary.png", 64, 512],
  patchSecondary: ["public/companions/companion-patch-secondary.png", 64, 512]
} as const;

async function dominantRows(path: string) {
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  return Array.from({ length: 8 }, (_, row) => {
    const colours = new Map<string, number>();
    for (let y = row * 64; y < (row + 1) * 64; y += 1) for (let x = 0; x < 64; x += 1) {
      const index = (y * info.width + x) * 4; if (!data[index + 3]) continue;
      const colour = `#${[data[index], data[index + 1], data[index + 2]].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
      colours.set(colour, (colours.get(colour) || 0) + 1);
    }
    return [...colours].sort((left, right) => right[1] - left[1])[0][0];
  });
}

describe("Companion artwork and canonical metadata", () => {
  it("requires correctly sized RGBA sprite sheets with transparency", async () => {
    for (const [path, width, height] of Object.values(files)) {
      expect(existsSync(path), `${path} is required`).toBe(true);
      const metadata = await sharp(path).metadata();
      expect([metadata.width, metadata.height, metadata.channels]).toEqual([width, height, 4]);
      const stats = await sharp(path).stats();
      expect(stats.isOpaque).toBe(false);
    }
  });
  it("maps all six expressions to valid unique frames", () => {
    expect(COMPANION_EXPRESSIONS.map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(COMPANION_EXPRESSIONS.map(({ key }) => key)).size).toBe(6);
  });
  it("matches deterministic non-transparent dominant artwork colours", async () => {
    expect(await dominantRows(files.fur[0])).toEqual(FUR_PALETTE.map(({ swatch }) => swatch));
    expect(await dominantRows(files.patchPrimary[0])).toEqual(PATCH_PRIMARY_PALETTE.map(({ swatch }) => swatch));
    expect(await dominantRows(files.patchSecondary[0])).toEqual(PATCH_SECONDARY_PALETTE.map(({ swatch }) => swatch));
    for (const palette of [FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE]) {
      expect(new Set(palette.map(({ key }) => key)).size).toBe(8);
      palette.forEach(({ label, row, swatch }) => {
        expect(label.length).toBeGreaterThan(0); expect(row).toBeGreaterThanOrEqual(0); expect(row).toBeLessThan(8);
        expect(swatch).toMatch(/^#[0-9a-f]{6}$/);
      });
    }
  });
  it("renders four registered layers with selected frame positions and an accessible label", () => {
    const { container, rerender } = render(<Companion config={{ name: "Miso", furPaletteKey: "orange",
      patchPrimaryPaletteKey: "cream", patchSecondaryPaletteKey: "white", expressionKey: "neutral" }} />);
    expect(screen.getByRole("img", { name: /Miso.*orange coat/i })).toBeInTheDocument();
    expect(container.querySelectorAll(".sprite-layer")).toHaveLength(4);
    const sprite = container.querySelector(".companion-sprite") as HTMLElement;
    expect(sprite.style.getPropertyValue("--fur-position")).toBe("0px");
    rerender(<Companion config={{ name: "Miso", furPaletteKey: "ginger",
      patchPrimaryPaletteKey: "orange", patchSecondaryPaletteKey: "charcoal", expressionKey: "completed" }} />);
    expect(sprite.style.getPropertyValue("--fur-position")).toBe("-1344px");
  });
});
