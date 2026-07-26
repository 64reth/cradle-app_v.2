import type { CompanionExpressionKey, CompanionPaletteKey } from "./companion";

export type MemberAvatar = {
  id?: string;
  furPaletteKey: CompanionPaletteKey;
  patchPrimaryPaletteKey: CompanionPaletteKey;
  patchSecondaryPaletteKey: CompanionPaletteKey;
  expressionKey: CompanionExpressionKey;
};

export const DEFAULT_MEMBER_AVATAR: MemberAvatar = {
  furPaletteKey: "cream",
  patchPrimaryPaletteKey: "ginger",
  patchSecondaryPaletteKey: "charcoal",
  expressionKey: "neutral"
};

export function memberAvatar(
  value?: Partial<MemberAvatar> | null
): MemberAvatar {
  return {
    furPaletteKey: value?.furPaletteKey || DEFAULT_MEMBER_AVATAR.furPaletteKey,
    patchPrimaryPaletteKey: value?.patchPrimaryPaletteKey || DEFAULT_MEMBER_AVATAR.patchPrimaryPaletteKey,
    patchSecondaryPaletteKey: value?.patchSecondaryPaletteKey || DEFAULT_MEMBER_AVATAR.patchSecondaryPaletteKey,
    expressionKey: value?.expressionKey || DEFAULT_MEMBER_AVATAR.expressionKey
  };
}

const AVATAR_TONES = ["mint", "yellow", "lavender", "coral", "blue"] as const;
export type MemberAvatarTone = typeof AVATAR_TONES[number];

export function memberAvatarTone(memberId: string): MemberAvatarTone {
  let value = 2166136261;
  for (const character of memberId) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return AVATAR_TONES[(value >>> 0) % AVATAR_TONES.length];
}
