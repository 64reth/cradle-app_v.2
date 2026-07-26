import type { CSSProperties } from "react";
import {
  FUR_PALETTE, PATCH_PRIMARY_PALETTE, PATCH_SECONDARY_PALETTE,
  type CompanionPaletteKey
} from "../shared/companion";
import type { MemberAvatar } from "../shared/member-avatar";
import { CradleIcon } from "./components/ui/CradleIcon";

function PaletteGroup({ title, name, options, selected, disabled, onChange }: {
  title: string;
  name: string;
  options: readonly { key: CompanionPaletteKey; label: string; swatch: string }[];
  selected: CompanionPaletteKey;
  disabled?: boolean;
  onChange: (value: CompanionPaletteKey) => void;
}) {
  return <fieldset className="palette-group" disabled={disabled}>
    <legend>{title}</legend>
    <div className="palette-options">
      {options.map((option) => <label className="palette-option" key={option.key}
        title={`${title}: ${option.label}`}>
        <input type="radio" name={name} value={option.key} checked={selected === option.key}
          aria-label={`${title}: ${option.label}`} onChange={() => onChange(option.key)} />
        <span style={{ "--swatch": option.swatch } as CSSProperties}>
          <span className="swatch" aria-hidden="true" />
          {selected === option.key && <span className="palette-check" aria-hidden="true"><CradleIcon name="complete" size="sm" decorative /></span>}
        </span>
      </label>)}
    </div>
  </fieldset>;
}

export function AvatarPalette({ avatar, disabled, onChange, namePrefix = "avatar" }: {
  avatar: MemberAvatar;
  disabled?: boolean;
  onChange: (avatar: MemberAvatar) => void;
  namePrefix?: string;
}) {
  return <div className="avatar-palette">
    <PaletteGroup title="Fur" name={`${namePrefix}-fur`} options={FUR_PALETTE}
      selected={avatar.furPaletteKey} disabled={disabled}
      onChange={(furPaletteKey) => onChange({ ...avatar, furPaletteKey })} />
    <PaletteGroup title="Patch 1" name={`${namePrefix}-patch-1`} options={PATCH_PRIMARY_PALETTE}
      selected={avatar.patchPrimaryPaletteKey} disabled={disabled}
      onChange={(patchPrimaryPaletteKey) => onChange({ ...avatar, patchPrimaryPaletteKey })} />
    <PaletteGroup title="Patch 2" name={`${namePrefix}-patch-2`} options={PATCH_SECONDARY_PALETTE}
      selected={avatar.patchSecondaryPaletteKey} disabled={disabled}
      onChange={(patchSecondaryPaletteKey) => onChange({ ...avatar, patchSecondaryPaletteKey })} />
  </div>;
}
