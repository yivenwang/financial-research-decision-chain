import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const appRoot = resolve(import.meta.dirname, "..");
const validationRoot = resolve(appRoot, "../../validation/cross-company/bull-group-2026q1");

test("transfer probe owns and destroys the PDF loading task without converting parser blockers into execution failure", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "beacon-transfer-probe-"));
  const output = resolve(parent, "output");
  t.after(() => rm(parent, { recursive: true, force: true }));

  const run = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/run-transfer-probe.mjs",
    resolve(validationRoot, "first-run/source.pdf"),
    resolve(validationRoot, "source-metadata.json"),
    output,
  ], { cwd: appRoot, encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const result = JSON.parse(await readFile(resolve(output, "first-output.json"), "utf8"));
  assert.equal(result.modelRequests, 0);
  assert.equal(result.financialRulesChanged, false);
  assert.ok(["PARSED_REVIEW_PENDING", "BLOCKED_REVIEW_REQUIRED"].includes(result.status));
  await assert.rejects(readFile(resolve(output, "execution-failure.json"), "utf8"), { code: "ENOENT" });
});
