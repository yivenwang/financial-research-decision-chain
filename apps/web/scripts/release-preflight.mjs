import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Local release receipt only: never sends a POST or contacts a model provider.
const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const checks = [];
const check = (name, passed) => checks.push({ name, passed });
const commitSha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;
const buildReceiptPath = resolve(root, ".next/beacon-build-receipt.json");
if (process.argv.includes("--record-build")) {
  await writeFile(buildReceiptPath, JSON.stringify({ commitSha, workingTreeClean: !dirty, recordedAt: new Date().toISOString() }, null, 2));
  console.log("Recorded local build provenance; no model request.");
  process.exit(0);
}
const major = Number(process.versions.node.split(".")[0]);
check("node-22-or-later", major >= 22);
let buildId = null;
try { buildId = (await readFile(resolve(root, ".next/BUILD_ID"), "utf8")).trim(); } catch { /* reported below */ }
check("production-build-present", Boolean(buildId));
let buildReceipt = null;
try { buildReceipt = JSON.parse(await readFile(buildReceiptPath, "utf8")); } catch { /* absent receipt cannot pass */ }
check("build-from-current-clean-commit", buildReceipt?.commitSha === commitSha && buildReceipt?.workingTreeClean === true);
for (const route of ["research-memo", "research-question"]) {
  const text = await readFile(resolve(root, `app/api/${route}/route.ts`), "utf8");
  check(`${route}-180-second-platform-window`, /export const maxDuration = 180/.test(text));
}
const receipt = {
  schemaVersion: "release-preflight.v1", createdAt: new Date().toISOString(), commitSha,
  workingTreeClean: !dirty, buildId, buildReceipt, nodeVersion: process.versions.node,
  packageLockSha256: hash(await readFile(resolve(root, "package-lock.json"))),
  checks, status: checks.every(c => c.passed) && !dirty ? "local-ready-target-rehearsal-pending" : "not-release-ready",
  limitation: "Local build receipt; does not prove a remote deployment SHA, live model quality, content acceptance or professional review.",
  modelRequests: 0,
};
const out = resolve(root, "artifacts-release");
await mkdir(out, { recursive: true });
await writeFile(resolve(out, `preflight-${Date.now()}.json`), JSON.stringify(receipt, null, 2), { flag: "wx" });
console.log(JSON.stringify(receipt, null, 2));
if (!checks.every(c => c.passed) || dirty) process.exitCode = 1;
