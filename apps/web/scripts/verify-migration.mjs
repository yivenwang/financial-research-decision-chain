import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("../../snapshots/web-v5-migration.json", root), "utf8"));
for (const [file, hash] of Object.entries(manifest.unchanged_files)) {
  const actual = createHash("sha256").update(await readFile(new URL(file, root))).digest("hex");
  assert.equal(actual, hash, `Unexpected change to migrated V5 source: ${file}`);
}
console.log(`Verified ${Object.keys(manifest.unchanged_files).length} unchanged V5 files.`);
