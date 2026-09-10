import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalJson, MEMO_INSTRUCTIONS, MEMO_PROMPT_VERSION, validateMemoOutput } from "../lib/research-memo.ts";

export const MAX_MEMO_BATCH_SAMPLES = 3;
const digest = (value) => createHash("sha256").update(value).digest("hex");

// One bounded manual experiment, not a retry-until-success mechanism. Persist
// before each sample so interruption cannot erase the fact it was started.
export async function runBoundedMemoBatch({ commitSha, executeSample, persist }) {
  assert.match(commitSha, /^[a-f0-9]{40}$/);
  const manifest = {
    schemaVersion: "research-memo-batch.v1", commitSha, promptVersion: MEMO_PROMPT_VERSION,
    promptSha256: digest(MEMO_INSTRUCTIONS), sourceId: "S-05", model: "deepseek-v4-pro",
    maxSamples: MAX_MEMO_BATCH_SAMPLES, maxOutputTokensPerSample: 6000,
    maxBatchOutputTokens: 18000, timeoutMsPerSample: 150000, reasoningEffort: "low",
    status: "running", contentReview: "pending", startedAt: new Date().toISOString(), samples: [],
  };
  await persist(structuredClone(manifest));
  let fingerprint;
  for (let index = 1; index <= MAX_MEMO_BATCH_SAMPLES; index++) {
    const sample = { index, status: "running", startedAt: new Date().toISOString() };
    manifest.samples.push(sample);
    await persist(structuredClone(manifest));
    let outcome;
    try { outcome = await executeSample(index); }
    catch { outcome = { ok: false, failureCode: "SAMPLE_EXECUTION_OR_AUDIT_FAILED" }; }
    Object.assign(sample, outcome, { status: outcome?.ok === true ? "technical-completed" : "failed", finishedAt: new Date().toISOString() });
    if (outcome?.ok === true) {
      if (typeof outcome.fingerprint !== "string" || (fingerprint && outcome.fingerprint !== fingerprint)) {
        sample.ok = false; sample.status = "failed"; sample.failureCode = "SAMPLE_INPUT_OR_MODEL_CHANGED";
      } else fingerprint = outcome.fingerprint;
    }
    if (sample.ok !== true) manifest.status = "stopped-after-failure";
    else if (index === MAX_MEMO_BATCH_SAMPLES) manifest.status = "technical-completed-awaiting-content-review";
    manifest.knownInputTokens = manifest.samples.reduce((sum, item) => sum + (item.usage?.inputTokens ?? 0), 0);
    manifest.knownOutputTokens = manifest.samples.reduce((sum, item) => sum + (item.usage?.outputTokens ?? 0), 0);
    manifest.samplesWithoutUsage = manifest.samples.filter((item) => !item.usage).length;
    await persist(structuredClone(manifest));
    if (sample.ok !== true) break;
  }
  manifest.finishedAt = new Date().toISOString();
  await persist(structuredClone(manifest));
  return manifest;
}

export function assertManualBatchEnvironment(env) {
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch", "Live batch requires a manual workflow dispatch");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.equal(env.LIVE_MODEL_E2E, "1");
  assert.equal(env.MODEL_PROVIDER, "deepseek");
  assert.equal(env.DEEPSEEK_MODEL, "deepseek-v4-pro");
  assert.ok(env.DEEPSEEK_API_KEY?.trim(), "The repository DeepSeek secret is required");
}

async function optionalJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function sampleResult(directory, exitCode) {
  const call = await optionalJson(resolve(directory, "S-05-live-deepseek-model-call.json"));
  const completion = await optionalJson(resolve(directory, "sample-completion.json"));
  const run = call?.run;
  const base = {
    exitCode, runId: run?.runId ?? null, responseId: run?.audit?.responseId ?? null,
    providerStatus: run?.audit?.providerStatus ?? null, failureCode: run?.audit?.failureCode ?? null,
    validation: run?.audit?.validation ?? [], usage: run?.audit?.usage ?? null,
    reasoningTokens: run?.audit?.reasoningTokens ?? null, durationMs: run?.audit?.durationMs ?? null,
    snapshotSha256: run?.context?.snapshotSha256 ?? null,
    requestSha256: run?.audit?.requestSha256 ?? null, responseSha256: run?.audit?.responseSha256 ?? null,
    modelRequestsReported: completion?.modelRequests ?? null,
  };
  if (exitCode !== 0 || !run || run.status !== "completed" || !run.memo) return { ...base, ok: false, failureCode: base.failureCode ?? "SAMPLE_FLOW_FAILED" };
  const checked = validateMemoOutput(JSON.parse(run.audit.rawOutput), run.context);
  const correct = call.evaluation === "live-provider-call" && completion?.technicalFlow === "completed"
    && completion.contentReview === "pending" && completion.modelRequests === 1
    && run.audit.promptVersion === MEMO_PROMPT_VERSION && run.audit.promptSha256 === digest(MEMO_INSTRUCTIONS)
    && run.audit.provider === "deepseek" && run.audit.requestedModel === "deepseek-v4-pro"
    && /^deepseek-v4-pro(?:-|$)/.test(run.audit.returnedModel ?? "")
    && run.audit.requestLimits?.maxOutputTokens === 6000 && run.audit.requestLimits.timeoutMs === 150000
    && run.audit.usage?.outputTokens > 0 && run.audit.usage.outputTokens <= 6000
    && run.context.source.sourceId === "S-05" && run.context.source.mode === "pdf"
    && checked.memo && canonicalJson(checked.memo) === canonicalJson(run.memo);
  if (!correct) return { ...base, ok: false, failureCode: "SAMPLE_AUDIT_MISMATCH" };
  // Independent browser snapshots have distinct timestamps/hashes. All actual
  // model context other than that hash, and the returned model, must be equal.
  const { snapshotSha256: _snapshot, ...context } = run.context;
  return { ...base, ok: true, fingerprint: digest(canonicalJson({ context, returnedModel: run.audit.returnedModel })) };
}

async function main() {
  assertManualBatchEnvironment(process.env);
  const appRoot = fileURLToPath(new URL("../", import.meta.url));
  const root = resolve(appRoot, "artifacts-web");
  await mkdir(root, { recursive: true });
  const result = await runBoundedMemoBatch({
    commitSha: process.env.GITHUB_SHA,
    persist: (manifest) => writeFile(resolve(root, "live-batch-manifest.json"), JSON.stringify(manifest, null, 2)),
    executeSample: async (index) => {
      const directory = resolve(root, `sample-${String(index).padStart(2, "0")}`);
      await mkdir(directory, { recursive: false }); // Never overwrite a previous sample.
      const exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(process.execPath, ["--experimental-strip-types", "--test", "tests/browser-e2e.test.mjs"], {
          cwd: appRoot, stdio: "inherit", env: { ...process.env, MEMO_ARTIFACT_DIR: directory },
        });
        child.once("error", reject);
        child.once("close", (code) => resolveExit(code ?? 1));
      });
      return sampleResult(directory, exitCode);
    },
  });
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
    `Memo batch: ${result.status}\n\nCommit: ${result.commitSha}\n\nSamples started: ${result.samples.length}/3. Known output tokens: ${result.knownOutputTokens}. Content review: pending.\n`);
  if (result.status !== "technical-completed-awaiting-content-review") process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
