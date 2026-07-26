import type { CSSProperties } from "react";
import {
  COMPANION_EXPRESSIONS, FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE,
  type CompanionExpressionKey, type CompanionPaletteKey
} from "../shared/companion";

export type CompanionConfig = {
  name: string;
  furPaletteKey: CompanionPaletteKey;
  patchPrimaryPaletteKey: CompanionPaletteKey;
  patchSecondaryPaletteKey: CompanionPaletteKey;
  expressionKey: CompanionExpressionKey;
};

function row(palette: readonly { key: string; row: number }[], key: string): number {
  return palette.find((option) => option.key === key)?.row ?? 0;
}

export function Companion({ config }: { config: CompanionConfig }) {
  const frame = COMPANION_EXPRESSIONS.find(({ key }) => key === config.expressionKey)?.frame ?? 0;
  const style = {
    "--fur-position": `${row(FUR_PALETTE, config.furPaletteKey) * -192}px`,
    "--patch-one-position": `${row(PATCH_PRIMARY_PALETTE, config.patchPrimaryPaletteKey) * -192}px`,
    "--patch-two-position": `${row(PATCH_SECONDARY_PALETTE, config.patchSecondaryPaletteKey) * -192}px`,
    "--expression-position": `${frame * -192}px`
  } as CSSProperties;
  return <div className="companion-figure" role="img"
    aria-label={`${config.name}’s cat avatar, shown with a ${config.furPaletteKey.replace("_", "-")} coat`}>
    <div className="companion-sprite" style={style}>
      <span className="sprite-layer sprite-fur" />
      <span className="sprite-layer sprite-patch-one" />
      <span className="sprite-layer sprite-patch-two" />
      <span className="sprite-layer sprite-expression" />
    </div>
  </div>;
}
