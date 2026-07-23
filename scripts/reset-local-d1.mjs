import { rm } from "node:fs/promises";
import { join } from "node:path";

const d1StatePath = join(process.cwd(), ".wrangler", "state", "v3", "d1");

await rm(d1StatePath, { recursive: true, force: true });
console.log(`Removed local D1 state at ${d1StatePath}`);
