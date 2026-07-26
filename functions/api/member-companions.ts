// Compatibility exports for internal callers while the legacy storage filename
// remains in place. New code uses the MemberAvatar vocabulary.
export {
  memberAvatarOptions as memberCompanionOptions,
  memberAvatarSelect as memberCompanionSelect,
  parseMemberAvatar as parseMemberCompanion,
  upsertMemberAvatar as upsertMemberCompanion
} from "./member-avatars";
