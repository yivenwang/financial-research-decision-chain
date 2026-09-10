import assert from "node:assert/strict";
import test from "node:test";
import { runBoundedMemoBatch, assertManualBatchEnvironment } from "../scripts/run-memo-batch.mjs";

const commitSha = "a".repeat(40);
const success = () => ({ ok: true, fingerprint: "same-actual-context-and-model", usage: { inputTokens: 100, outputTokens: 6000 } });

test("manual batch is sequential, records each sample before execution and never starts a fourth", async () => {
  let active = 0; let peak = 0; const calls = []; const records = [];
  const result = await runBoundedMemoBatch({ commitSha, persist: async (record) => { records.push(record); }, executeSample: async (index) => {
    assert.equal(records.at(-1).samples.at(-1).index, index);
    assert.equal(records.at(-1).samples.at(-1).status, "running");
    active++; peak = Math.max(peak, active); calls.push(index);
    await Promise.resolve(); active--; return success();
  } });
  assert.deepEqual(calls, [1, 2, 3]); assert.equal(peak, 1);
  assert.equal(result.status, "technical-completed-awaiting-content-review");
  assert.equal(result.contentReview, "pending");
  assert.equal(result.knownOutputTokens, 18000);
  assert.equal(records[0].samples.length, 0, "Earlier journal entries must not be mutated");
  assert.equal(records.at(-1).samples.length, 3);
});

test("failure, exceptions or changed inputs stop the batch and preserve earlier attempts without retry", async () => {
  for (const failure of ["api", "truncated", "schema", "exception", "input-changed"]) {
    const calls = []; const records = [];
    const result = await runBoundedMemoBatch({ commitSha, persist: async (record) => { records.push(record); }, executeSample: async (index) => {
      calls.push(index); if (index === 1) return success();
      if (failure === "exception") throw new Error("synthetic failure");
      if (failure === "input-changed") return { ...success(), fingerprint: "different-context" };
      return { ok: false, failureCode: failure, usage: { inputTokens: 100, outputTokens: 4000 } };
    } });
    assert.deepEqual(calls, [1, 2], failure);
    assert.equal(result.status, "stopped-after-failure");
    assert.equal(result.samples[0].status, "technical-completed");
    assert.equal(result.samples[1].status, "failed");
    assert.equal(records.at(-1).samples.length, 2);
  }
  let calls = 0;
  const firstFailed = await runBoundedMemoBatch({ commitSha, persist: async () => {}, executeSample: async () => { calls++; return { ok: false }; } });
  assert.equal(calls, 1); assert.equal(firstFailed.samples.length, 1);
});

test("invalid manual configuration and unavailable audit storage cannot start a paid sample", async () => {
  const env = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: commitSha, LIVE_MODEL_E2E: "1", MODEL_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-v4-pro", DEEPSEEK_API_KEY: "synthetic-test-key" };
  assert.doesNotThrow(() => assertManualBatchEnvironment(env));
  for (const patch of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_SHA: "branch-name" }, { MODEL_PROVIDER: "openai" }, { DEEPSEEK_MODEL: "deepseek-v4-flash" }, { DEEPSEEK_API_KEY: "" }]) assert.throws(() => assertManualBatchEnvironment({ ...env, ...patch }));
  let calls = 0;
  await assert.rejects(runBoundedMemoBatch({ commitSha, executeSample: async () => { calls++; return success(); }, persist: async () => { throw new Error("storage unavailable"); } }));
  assert.equal(calls, 0);
});
