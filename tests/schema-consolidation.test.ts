import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storageRoomType } from "../shared/routines";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);
}

describe("room schema consolidation", () => {
  it("removes speculative migration 0014 and keeps numbering coherent", () => {
    expect(existsSync("migrations/0014_room_allocations_and_routine_audit.sql")).toBe(false);
    expect(readdirSync("migrations").filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort().at(-1))
      .toBe("0013_authentication_operations.sql");
  });

  it("has no runtime SQL dependency on removed speculative columns", () => {
    const runtime = sourceFiles("functions/api/household/rooms").concat([
      "functions/api/systems.ts", "functions/api/household/systems/index.ts", "functions/api/household/systems/[systemId].ts"
    ]).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(runtime).not.toMatch(/\bspace_type\b|\broutine_category\b|\bcreated_by_member_id\b|\bupdated_by_member_id\b/);
  });

  it("maps friendly room wording to stable existing persisted values", () => {
    expect(storageRoomType("utility")).toBe("laundry");
    expect(storageRoomType("outdoor")).toBe("garden");
    expect(storageRoomType("shared_space")).toBe("other");
    expect(storageRoomType("kitchen")).toBe("kitchen");
  });
});
