import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, sha256Text } from "../lib/research-memo.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { QUESTION_PLAN_PROMPT_VERSION, QUESTION_INTENT_GUIDANCE, questionPlanSchema, questionPromptInstructions,
  makeResearchContract, validateQuestionPlan } from "../lib/research-question.ts";
import { QUESTION_LIVE_CASES, assertArchiveSafe, runBoundedQuestionBatch, verifyLiveQuestionPhase } from "../scripts/run-question-batch.mjs";
import { questionTestConfig as config, providerResponse, questionRequest } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Planner routing regression uses synthetic transport only");
const bytes = readFileSync(new URL("./fixtures/question-live-38129833565/request-01.json", import.meta.url), "utf8");
const manifestBytes = readFileSync(new URL("./fixtures/question-live-38129833565/manifest.json", import.meta.url), "utf8");
const archive = JSON.parse(bytes), original = archive.record.run;
const plan = JSON.parse(original.calls[0].rawOutput), manifest = JSON.parse(manifestBytes);

test("first planner intent failure preserves original bytes, v2 hash and one-request stop receipt", async () => {
  assert.equal(await sha256Text(bytes), "7ab209120dda14a278c161a64533f9f61066dd71d7257d7950c59835f50931f3");
  assert.equal(await sha256Text(manifestBytes), "77bae29e4a4486ed819ab7743199c7aa66051d43e9ea8a869697d910f83cf9e6");
  assert.equal(await sha256Text(questionPromptInstructions("question-contract.v2")), original.calls[0].promptSha256);
  const before = canonicalJson(original); await validateQuestionRun(original); assert.equal(canonicalJson(original), before);
  assert.equal(original.status, "CONTRACT_DRAFTED"); assert.equal(original.contract.intent, "EVIDENCE_AUDIT");
  assert.equal(manifest.status, "stopped-after-failure"); assert.equal(manifest.requests.length, 1);
  assert.equal(manifest.requests[0].failureCode, "INTENT_MISMATCH"); assert.equal(manifest.contentReview, "pending");
  for (const value of [archive, manifest]) assertArchiveSafe(value, []);
});

test("v3 prompt and schema distinguish primary objective from incidental verification without changing scope", () => {
  assert.equal(questionPromptInstructions("question-contract.v3").includes(QUESTION_INTENT_GUIDANCE), true);
  const prompt = questionPromptInstructions("question-contract.v3");
  assert.equal(questionPlanSchema.properties.intent.description, QUESTION_INTENT_GUIDANCE);
  assert.ok(prompt.endsWith(QUESTION_INTENT_GUIDANCE));
  assert.match(QUESTION_INTENT_GUIDANCE, /解释变化、原因或同比分化用CHANGE_EXPLAIN/);
  assert.match(QUESTION_INTENT_GUIDANCE, /附带.*仍属变化解释/);
  assert.match(QUESTION_INTENT_GUIDANCE, /核对原文位置、数字或勾稽是否一致用EVIDENCE_AUDIT/);
  assert.match(QUESTION_INTENT_GUIDANCE, /影响用DECISION_IMPACT/);
  assert.match(QUESTION_INTENT_GUIDANCE, /任意超范围目标优先整体OUT_OF_SCOPE/);
  assert.match(prompt, /明确给出的公司和期间必须原样识别/);
  assert.match(prompt, /不能联网、计算数字、改规则、交易或操作决策/);
  // No code silently rewrites a semantically wrong but schema-valid model plan.
  const contract = makeResearchContract(original.queryRaw, validateQuestionPlan(plan), original.requestId, original.createdAt);
  assert.deepEqual(contract, original.contract);
});

test("historical v2 strict validation remains active and v1 retains its original rules", () => {
  const invalid = { ...plan, referenceIds: ["S-05"] };
  assert.doesNotThrow(() => validateQuestionPlan(invalid, "question-contract.v1"));
  for (const version of ["question-contract.v2", QUESTION_PLAN_PROMPT_VERSION]) {
    assert.throws(() => validateQuestionPlan(invalid, version), /CONTRACT_SCHEMA_INVALID/);
    assert.throws(() => validateQuestionPlan({ ...plan, reason: "💡".repeat(161) }, version), /CONTRACT_SCHEMA_INVALID/);
    assert.doesNotThrow(() => validateQuestionPlan(plan, version));
  }
});

test("raw intent mismatch replay fails after one mock request and idempotent replay cannot bill again", async () => {
  let calls = 0, body, data; const archives = [], checkpoints = [];
  const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
    calls++; const wire = JSON.parse(init.body);
    assert.equal(wire.input[0].content, questionPromptInstructions(QUESTION_PLAN_PROMPT_VERSION));
    assert.equal(wire.text.format.schema.properties.intent.description, QUESTION_INTENT_GUIDANCE);
    return providerResponse({}, { output: [{ type: "message", content: [{ type: "output_text", text: original.calls[0].rawOutput }] }] });
  } });
  const result = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async m => checkpoints.push(m), archive: async (_i, value) => archives.push(value),
    executePhase: async ({ spec, phase, draft }) => {
      assert.equal(phase, "plan"); body = { phase, question: spec.question };
      const response = await handler.POST(questionRequest(body, { "Idempotency-Key": "f5979356-8614-42a4-84a6-c9e32aa076ac" })); data = await response.json();
      try { await verifyLiveQuestionPhase({ phase, spec, response: { httpStatus: response.status, data }, draft }); assert.fail("Wrong intent must stop"); }
      catch (e) { assert.equal(e.message, "INTENT_MISMATCH"); }
      return { ok: false, failureCode: "INTENT_MISMATCH", data, audit: data.run.calls[0], record: { run: data.run } };
    } });
  assert.equal(calls, 1); assert.equal(result.requests.length, 1); assert.equal(archives.length, 1);
  assert.equal(result.status, "stopped-after-failure"); assert.equal(checkpoints.at(-1).status, result.status);
  assert.equal(data.run.calls[0].rawOutput, original.calls[0].rawOutput); assert.equal(data.run.contract.intent, "EVIDENCE_AUDIT");
  assert.deepEqual(await (await handler.POST(questionRequest(body, { "Idempotency-Key": "f5979356-8614-42a4-84a6-c9e32aa076ac" }))).json(), data); assert.equal(calls, 1);
});

test("wrong intent in each of three planning positions stops the remaining fixed batch", async () => {
  for (const position of [0, 1, 2]) {
    let calls = 0; const result = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async m => assertArchiveSafe(m, []), archive: async () => {},
      executePhase: async ({ spec, phase }) => {
        calls++; const failed = phase === "plan" && spec.id === QUESTION_LIVE_CASES[position].id;
        return { ok: !failed, failureCode: failed ? "INTENT_MISMATCH" : null, data: {}, record: { synthetic: true }, audit: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } };
      } });
    assert.equal(calls, position * 2 + 1); assert.equal(result.requests.length, calls);
    assert.equal(result.status, "stopped-after-failure"); assert.equal(result.requests.at(-1).failureCode, "INTENT_MISMATCH");
  }
});
