export const COMPANION_FRAME_SIZE = 64;
export const COMPANION_EXPRESSIONS = [
  { key: "neutral", label: "Neutral", frame: 0 },
  { key: "on_track", label: "On track", frame: 1 },
  { key: "completed", label: "Completed", frame: 2 },
  { key: "calm", label: "Calm", frame: 3 },
  { key: "behind", label: "Behind", frame: 4 },
  { key: "needs_help", label: "Needs help", frame: 5 }
] as const;
export type CompanionExpressionKey = typeof COMPANION_EXPRESSIONS[number]["key"];

export type CompanionPaletteOption = {
  key: "orange" | "grey" | "charcoal" | "cream" | "brown" | "blue_grey" | "white" | "ginger";
  label: string;
  row: number;
  swatch: `#${string}`;
};

export const FUR_PALETTE = [
  { key: "orange", label: "Orange", row: 0, swatch: "#ff6e00" },
  { key: "grey", label: "Grey", row: 1, swatch: "#8e8f86" },
  { key: "charcoal", label: "Charcoal", row: 2, swatch: "#16161c" },
  { key: "cream", label: "Cream", row: 3, swatch: "#fffbe8" },
  { key: "brown", label: "Brown", row: 4, swatch: "#a14600" },
  { key: "blue_grey", label: "Blue-grey", row: 5, swatch: "#6a94b6" },
  { key: "white", label: "White", row: 6, swatch: "#e9eded" },
  { key: "ginger", label: "Ginger", row: 7, swatch: "#df7e3d" }
] as const satisfies readonly CompanionPaletteOption[];

export const PATCH_PRIMARY_PALETTE = [
  { key: "cream", label: "Cream", row: 0, swatch: "#fffbe8" },
  { key: "orange", label: "Orange", row: 1, swatch: "#ff6e00" },
  { key: "charcoal", label: "Charcoal", row: 2, swatch: "#16161c" },
  { key: "grey", label: "Grey", row: 3, swatch: "#7d7d72" },
  { key: "brown", label: "Brown", row: 4, swatch: "#663a1a" },
  { key: "blue_grey", label: "Blue-grey", row: 5, swatch: "#6a94b6" },
  { key: "white", label: "White", row: 6, swatch: "#e9eded" },
  { key: "ginger", label: "Ginger", row: 7, swatch: "#df7e3d" }
] as const satisfies readonly CompanionPaletteOption[];

export const PATCH_SECONDARY_PALETTE = [
  { key: "cream", label: "Cream", row: 0, swatch: "#f5f5e4" },
  { key: "orange", label: "Orange", row: 1, swatch: "#ff6e00" },
  { key: "charcoal", label: "Charcoal", row: 2, swatch: "#16161c" },
  { key: "grey", label: "Grey", row: 3, swatch: "#8e8f86" },
  { key: "brown", label: "Brown", row: 4, swatch: "#663a1a" },
  { key: "blue_grey", label: "Blue-grey", row: 5, swatch: "#6a94b6" },
  { key: "white", label: "White", row: 6, swatch: "#e9eded" },
  { key: "ginger", label: "Ginger", row: 7, swatch: "#df7e3d" }
] as const satisfies readonly CompanionPaletteOption[];

export type CompanionPaletteKey = typeof FUR_PALETTE[number]["key"];
export const isCompanionExpression = (value: unknown): value is CompanionExpressionKey =>
  typeof value === "string" && COMPANION_EXPRESSIONS.some(({ key }) => key === value);
export const paletteHas = (palette: readonly CompanionPaletteOption[], value: unknown): value is CompanionPaletteKey =>
  typeof value === "string" && palette.some(({ key }) => key === value);
