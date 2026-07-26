import {
  displayRoutineName, templatesForPet, templatesForRoom, type RoomType, type RoutineTemplate
} from "../../shared/routines";
import type { MemberAccessLevel, MemberAgeBand } from "../../shared/members";
import type { RoutineAssignmentMode } from "../../shared/assignments";
import type { PetType } from "../../shared/pets";

type FamilyMember = {
  id: string; role: string; accessLevel: MemberAccessLevel; ageBand: MemberAgeBand; createdAt: string
};
type Room = { id: string; name: string; roomType: RoomType; occupantMemberIds: string[] };
type Pet = { id: string; name: string; petType: PetType };
type Existing = { sourceTemplateKey: string; roomId: string | null; petId: string | null };

const familyMembers = (db: D1Database, householdId: string) => db.prepare(`SELECT id, role,
  access_level AS accessLevel, age_band AS ageBand, created_at AS createdAt FROM members
  WHERE household_id = ? AND is_active = 1 AND lifecycle_state NOT IN ('left', 'suspended')
  ORDER BY created_at, id`).bind(householdId).all<FamilyMember>();

/**
 * Compatibility hook retained for older call sites. It only creates missing
 * canonical assignment rows; it never rewrites a family's saved participant
 * subset or rotation position.
 */
export async function syncRoutineRotationsToFamily(db: D1Database, householdId: string): Promise<void> {
  const missing = await db.prepare(`SELECT s.id, s.owner_member_id AS ownerMemberId,
    s.rotation_enabled AS rotationEnabled, s.created_at AS createdAt, s.updated_at AS updatedAt
    FROM household_systems s LEFT JOIN routine_assignments a
      ON a.household_id = s.household_id AND a.system_id = s.id
    WHERE s.household_id = ? AND a.system_id IS NULL`).bind(householdId).all<{
      id: string; ownerMemberId: string; rotationEnabled: number; createdAt: string; updatedAt: string
    }>();
  if (!missing.results.length) return;
  await db.batch(missing.results.map((routine) => db.prepare(`INSERT INTO routine_assignments
    (household_id, system_id, assignment_mode, assigned_member_id, rotation_next_index,
      previous_assignee_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, NULL, ?, ?)`).bind(
    householdId, routine.id, routine.rotationEnabled ? "rotation" : "one_person",
    routine.rotationEnabled ? null : routine.ownerMemberId, routine.createdAt, routine.updatedAt
  )));
}

function safeFor(member: FamilyMember, template: RoutineTemplate): boolean {
  if (member.ageBand === "adult") return true;
  const key = template.key;
  if (member.ageBand === "young_child") {
    return /(child_bedroom|bedroom).(weekly_reset|weekly_clean)/.test(key);
  }
  if (member.ageBand === "child") {
    return !/(weekly_clean|toilet|clean_litter|walk|reptile|habitat|horse|garden)/.test(key);
  }
  return !/(medication|reptile.clean_enclosure)/.test(key);
}

function assignmentFor(
  template: RoutineTemplate, room: Room | null, allMembers: FamilyMember[]
): { mode: RoutineAssignmentMode; pool: FamilyMember[] } {
  const occupants = room?.occupantMemberIds.length
    ? room.occupantMemberIds.map((id) => allMembers.find((member) => member.id === id)).filter(Boolean) as FamilyMember[]
    : allMembers;
  let pool = occupants.filter((member) => safeFor(member, template));
  if (!pool.length) pool = allMembers.filter((member) => member.ageBand === "adult");
  if (!pool.length) pool = allMembers;
  if (room?.roomType === "child_bedroom" && pool.length >= 2 &&
    template.key === "child_bedroom.weekly_reset") return { mode: "shared_team", pool };
  if (template.defaultAssignment === "assigned") return { mode: "one_person", pool };
  return { mode: pool.length ? "rotation" : "decide_later", pool };
}

/**
 * Create an idempotent, balanced first draft. Bedroom occupants constrain the
 * pool; common Rooms use the active Family. Each consecutive Rotation begins
 * at a different persisted carousel position.
 */
export async function generateRoutineDraft(db: D1Database, householdId: string): Promise<number> {
  const [membersResult, roomsResult, occupantsResult, petsResult, existingResult, orderResult] = await Promise.all([
    familyMembers(db, householdId),
    db.prepare(`SELECT id, name, room_type AS roomType FROM rooms
      WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at`)
      .bind(householdId).all<Omit<Room, "occupantMemberIds">>(),
    db.prepare(`SELECT room_id AS roomId, member_id AS memberId FROM room_occupants
      WHERE household_id = ? ORDER BY created_at`).bind(householdId).all<{ roomId: string; memberId: string }>(),
    db.prepare(`SELECT id, name, pet_type AS petType FROM pets
      WHERE household_id = ? AND is_active = 1 ORDER BY created_at`)
      .bind(householdId).all<Pet>(),
    db.prepare(`SELECT source_template_key AS sourceTemplateKey, room_id AS roomId, pet_id AS petId
      FROM household_systems WHERE household_id = ? AND source_template_key IS NOT NULL`)
      .bind(householdId).all<Existing>(),
    db.prepare(`SELECT COALESCE(MAX(display_order), -1) + 1 AS value
      FROM household_systems WHERE household_id = ?`).bind(householdId).first<{ value: number }>()
  ]);
  const members = membersResult.results;
  if (!members.length) return 0;
  const owner = members.find(({ role }) => role === "owner") || members[0];
  const rooms: Room[] = roomsResult.results.map((room) => ({
    ...room, occupantMemberIds: occupantsResult.results
      .filter(({ roomId }) => roomId === room.id).map(({ memberId }) => memberId)
  }));
  const existing = new Set(existingResult.results.map(({ sourceTemplateKey, roomId, petId }) =>
    `${sourceTemplateKey}|${roomId || ""}|${petId || ""}`));
  const now = new Date().toISOString();
  let created = 0; let displayOrder = orderResult?.value ?? 0; let balanceOffset = 0;

  async function add(template: RoutineTemplate, room: Room | null, pet: Pet | null) {
    const contextKey = `${template.key}|${room?.id || ""}|${pet?.id || ""}`;
    if (existing.has(contextKey)) return;
    const { mode, pool } = assignmentFor(template, room, members);
    let startIndex = 0;
    let nextBalanceOffset = balanceOffset;
    if (pool.length && (mode === "rotation" || mode === "one_person")) {
      for (let shift = 0; shift < members.length; shift += 1) {
        const familyIndex = (balanceOffset + shift) % members.length;
        const poolIndex = pool.findIndex(({ id }) => id === members[familyIndex].id);
        if (poolIndex < 0) continue;
        startIndex = poolIndex;
        if (template.defaultEnabled) nextBalanceOffset = (familyIndex + 1) % members.length;
        break;
      }
    }
    const assigned = mode === "one_person" && pool.length ? pool[startIndex] : null;
    const participants = mode === "rotation" || mode === "shared_team" ? pool : [];
    const legacyOwner = assigned || participants[startIndex] || owner;
    const id = crypto.randomUUID(); const name = displayRoutineName(template, pet?.name);
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO household_systems
        (id, household_id, name, purpose, room_id, pet_id, owner_member_id, status, frequency_key,
          custom_frequency_note, rotation_enabled, estimated_minutes, definition_of_done, notes, display_order,
          source_kind, source_template_key, source_template_version, template_customised, client_key,
          created_at, updated_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ${template.defaultEnabled ? "'active'" : "'paused'"},
          ?, NULL, ?, ?, ?, NULL, ?, 'template', ?, ?, 0, NULL, ?, ?, NULL)`)
        .bind(id, householdId, name, template.purpose.replace("{pet}", pet?.name || "your pet"),
          room?.id || null, pet?.id || null, legacyOwner.id, template.defaultFrequency,
          mode === "rotation" ? 1 : 0, template.estimatedMinutes,
          template.definitionOfDone.replace("{pet}", pet?.name || "The pet"),
          displayOrder++, template.key, template.version, now, now),
      db.prepare(`INSERT INTO routine_assignments
        (household_id, system_id, assignment_mode, assigned_member_id, rotation_next_index,
          previous_assignee_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`)
        .bind(householdId, id, mode, assigned?.id || null, startIndex, now, now),
      ...template.steps.map((label, index) => db.prepare(`INSERT INTO household_system_steps
        (id, household_id, system_id, label, display_order, is_required, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(crypto.randomUUID(), householdId, id, label, index, now, now))
    ];
    participants.forEach((member, index) => {
      statements.push(db.prepare(`INSERT INTO routine_assignment_participants
        (household_id, system_id, member_id, participant_order, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(householdId, id, member.id, index, now));
      statements.push(db.prepare(`INSERT INTO household_system_participants
        (household_id, system_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(householdId, id, member.id, now));
    });
    try {
      await db.batch(statements);
      existing.add(contextKey); created += 1;
      if (template.defaultEnabled && (mode === "rotation" || mode === "one_person")) {
        balanceOffset = nextBalanceOffset;
      }
    } catch (error) {
      if (!String(error).includes("UNIQUE constraint")) throw error;
    }
  }

  for (const room of rooms) for (const template of templatesForRoom(room.roomType)) await add(template, room, null);
  for (const pet of petsResult.results) for (const template of templatesForPet(pet.petType)) await add(template, null, pet);
  return created;
}
