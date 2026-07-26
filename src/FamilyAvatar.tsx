import { memberAvatar, type MemberAvatar } from "../shared/member-avatar";
import { Companion } from "./Companion";

export function FamilyAvatar({ name, avatar, className = "" }: {
  name: string;
  avatar?: Partial<MemberAvatar> | null;
  className?: string;
}) {
  return <div className={`family-avatar ${className}`.trim()}>
    <Companion config={{ name, ...memberAvatar(avatar) }} />
  </div>;
}
