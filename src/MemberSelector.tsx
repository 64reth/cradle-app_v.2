import type { DashboardMember } from "./Dashboard";
import { memberAvatar } from "../shared/member-avatar";
import { accessLevelLabel, lifecycleLabel, type MemberLifecycleState } from "../shared/members";
import { FamilyAvatar } from "./FamilyAvatar";

export function MemberSelector({ members, value, onChange, label, includeUnclaimed = false, name,
  multiple = false, values, defaultValues, onValuesChange, helperText }: {
  members: DashboardMember[]; value?: string; onChange?: (memberId: string) => void;
  label: string; includeUnclaimed?: boolean; name?: string; multiple?: boolean;
  values?: string[]; defaultValues?: string[]; onValuesChange?: (memberIds: string[]) => void; helperText?: string;
}) {
  const available = members.filter((member) =>
    ["active", "managed", "unclaimed", "invited", "join_requested"].includes(member.lifecycleState || "active"));
  const selected = available.find((member) => member.id === value);
  if (multiple) {
    const selectedValues = values || defaultValues || [];
    return <fieldset className="member-selector member-selector-multiple">
      <legend>{label}</legend>
      {onValuesChange && <div className="member-selector-actions">
        <button type="button" onClick={() => onValuesChange(available.map(({ id }) => id))}>Select all</button>
        <button type="button" onClick={() => onValuesChange([])}>Clear all</button>
      </div>}
      <div className="member-selector-options">
        {available.map((member) => <label className="member-option" key={member.id}>
          <input type="checkbox" aria-label={member.preferredName || member.displayName} name={name} value={member.id} defaultChecked={defaultValues?.includes(member.id)}
            checked={values ? selectedValues.includes(member.id) : undefined}
            onChange={onValuesChange ? (event) => onValuesChange(
              event.target.checked ? [...selectedValues, member.id] : selectedValues.filter((id) => id !== member.id)
            ) : undefined} />
          <span><strong>{member.preferredName || member.displayName}</strong>
            <small>{accessLevelLabel(member.accessLevel ||
              (member.role === "owner" || member.role === "parent_admin" ? "household_admin" :
                member.role === "adult" ? "household_member" : "managed_member"))}</small></span>
        </label>)}
      </div>
      {helperText && <small>{helperText}</small>}
    </fieldset>;
  }
  return <label className="member-selector"><span>{label}</span>
    <select aria-label={label} name={name} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>
      {available.map((member) => <option value={member.id} key={member.id}>
        {member.displayName}{includeUnclaimed && member.lifecycleState ? ` · ${lifecycleLabel(member.lifecycleState as MemberLifecycleState)}` : ""}
      </option>)}
    </select>
    {selected && <span className="member-selector-preview">
        <FamilyAvatar name={selected.preferredName || selected.displayName} avatar={memberAvatar({
          furPaletteKey: selected.avatarFurPaletteKey || undefined,
          patchPrimaryPaletteKey: selected.avatarPatchPrimaryPaletteKey || undefined,
          patchSecondaryPaletteKey: selected.avatarPatchSecondaryPaletteKey || undefined,
          expressionKey: selected.avatarExpressionKey || undefined
        })} />
        <small>{selected.preferredName || selected.displayName}</small>
      </span>}
  </label>;
}
