import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "functions", "api");
const workerPath = join(process.cwd(), "functions", "worker.ts");

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function routePattern(file: string): string {
  let value = relative(apiRoot, file).replace(/\\/g, "/").replace(/\.ts$/, "");
  if (value.endsWith("/index")) value = value.slice(0, -6);
  return `/api/${value}`;
}

describe("Worker API route registry", () => {
  it("registers every API handler file in the Worker adapter", () => {
    const handlerFiles = filesIn(apiRoot).filter((file) => {
      const source = readFileSync(file, "utf8");
      return /export\s+(?:async\s+)?function\s+onRequest\b|export\s+const\s+onRequest\b|export\s*\{\s*onRequest\b/.test(source);
    });
    const registered = [...readFileSync(workerPath, "utf8").matchAll(/route\("([^"]+)"/g)].map((match) => match[1]);
    const expected = [...handlerFiles.map(routePattern), "/health"];

    expect(new Set(registered)).toEqual(new Set(expected));
  });
});
