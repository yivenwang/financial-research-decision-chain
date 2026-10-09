import assert from "node:assert/strict";
import test from "node:test";
import { assertQuestionBatchEnvironment, runBoundedQuestionBatch, verifyLiveQuestionPhase, QUESTION_LIVE_CASES, QUESTION_BATCH_AUTHORIZATION, assertArchiveSafe } from "../scripts/run-question-batch.mjs";
import { QUESTION_BUDGET_ACK, QUESTION_BUDGET_VERSION, checkQuestionInputBudget, budgetSummary } from "../lib/question-batch-budget.ts";
process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION; // Isolated NOT-LIVE test worker only.
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { questionTestConfig, planOutput, answerOutput, providerResponse, questionRequest, questionTestSnapshot } from "./question-test-helpers.mjs";

const commitSha = "a".repeat(40);
const env = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commitSha, EXPECTED_COMMIT_SHA: commitSha,
  QUESTION_ACCEPTANCE_APPROVAL: QUESTION_BATCH_AUTHORIZATION, QUESTION_BUDGET_ACKNOWLEDGEMENT: QUESTION_BUDGET_ACK, MODEL_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-v4-pro", DEEPSEEK_API_KEY: "synthetic-NOT-LIVE" };

test("paid batch rejects automatic events, reruns, moving code and missing authorization before execution", () => {
  assert.doesNotThrow(() => assertQuestionBatchEnvironment(env));
  for (const patch of [{ GITHUB_EVENT_NAME: "push" }, { GITHUB_RUN_ATTEMPT: "2" }, { EXPECTED_COMMIT_SHA: "b".repeat(40) },
    { QUESTION_ACCEPTANCE_APPROVAL: "" }, { QUESTION_BUDGET_ACKNOWLEDGEMENT: "" }, { DEEPSEEK_API_KEY: "" }, { MODEL_PROVIDER: "openai" }]) {
    assert.throws(() => assertQuestionBatchEnvironment({ ...env, ...patch }));
  }
});

test("three distinct intents reserve exactly six requests and never claim content acceptance (NOT-LIVE)", async () => {
  const checkpoints = []; const archives = []; const phases = [];
  const result = await runBoundedQuestionBatch({ commitSha, persist: async m => checkpoints.push(m), archive: async (i, a) => archives.push([i, a]),
    executePhase: async ({ spec, phase, draft, index }) => {
      assert.equal(checkpoints.at(-1).requests.at(-1).status, "reserved");
      if (phase === "execute") assert.equal(draft.intent, spec.intent);
      phases.push(phase);
      return { ok: true, data: { intent: spec.intent }, record: { synthetic: true, index }, audit: { usage: { inputTokens: 3, outputTokens: 2 } } };
    },
  });
  assert.deepEqual(phases, ["plan", "execute", "plan", "execute", "plan", "execute"]);
  assert.equal(result.requests.length, 6); assert.equal(archives.length, 6); assert.equal(new Set(result.cases.map(c => c.intent)).size, 3);
  assert.equal(result.status, "technical-completed-awaiting-content-review"); assert.equal(result.contentReview, "pending");
  assert.equal(result.knownOutputTokens, 12); assert.equal(result.requestsWithoutUsage, 0);
});

test("failure at any of the six positions stops the whole batch and preserves unknown usage (NOT-LIVE)", async () => {
  for (let failureAt = 1; failureAt <= 6; failureAt++) {
    let calls = 0; const archived = [];
    const result = await runBoundedQuestionBatch({ commitSha, persist: async () => {}, archive: async (i, a) => archived.push([i, a]),
      executePhase: async () => { calls++; if (calls === failureAt) return { ok: false, failureCode: "SYNTHETIC_FAILURE", record: { firstFailure: true } };
        return { ok: true, data: {}, record: { synthetic: true }, audit: { usage: { inputTokens: 1, outputTokens: 1 } } }; },
    });
    assert.equal(calls, failureAt); assert.equal(archived.length, failureAt); assert.equal(archived.at(-1)[1].record.firstFailure, true);
    assert.equal(result.status, "stopped-after-failure"); assert.equal(result.requestsWithoutUsage, 1);
    assert.equal(result.requests.at(-1).failureCode, "SYNTHETIC_FAILURE");
  }
});

test("checkpoint or archive failure cannot cause another paid request (NOT-LIVE)", async () => {
  let calls = 0;
  await assert.rejects(runBoundedQuestionBatch({ commitSha, persist: async () => { throw Error("disk unavailable"); }, archive: async () => {}, executePhase: async () => { calls++; } }));
  assert.equal(calls, 0);
  await assert.rejects(runBoundedQuestionBatch({ commitSha, persist: async () => {}, archive: async () => { throw Error("disk unavailable"); }, executePhase: async () => { calls++; return { ok: true }; } }));
  assert.equal(calls, 1);
});

test("acceptance verifier replays actual handler outputs for three intents and rejects tampering (NOT-LIVE transport)", async () => {
  const snapshot = questionTestSnapshot();
  for (const spec of QUESTION_LIVE_CASES) {
    let calls = 0;
    const handler = createQuestionHandler(() => questionTestConfig, { fetcher: async (_url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      return providerResponse(body.text.format.name.endsWith("plan") ? planOutput({ intent: spec.intent }) : answerOutput(),
        { id: "NOT-LIVE-verifier-fixture", model: "deepseek-v4-pro" });
    } });
    const draft = await (await handler.POST(questionRequest({ phase: "plan", question: spec.question }))).json();
    await verifyLiveQuestionPhase({ phase: "plan", spec, response: { httpStatus: 200, data: draft }, snapshot });
    const data = await (await handler.POST(questionRequest({ phase: "execute", draft, confirmed: true, snapshot }))).json();
    await verifyLiveQuestionPhase({ phase: "execute", spec, response: { httpStatus: 200, data }, snapshot, draft });
    assert.equal(calls, 2);
    for (const mutate of [r => r.answer.evidence.facts[0].current = 999, r => r.answer.formalRecommendation = "BUY",
      r => r.answerSha256 = "0".repeat(64), r => r.calls[0].returnedModel = "NOT-LIVE", r => r.events = [],
      r => r.events[0].details = {}, r => r.calls[0].phase = "plan", r => r.calls[0].requestLimits.timeoutMs = 300000]) {
      const bad = structuredClone(data); mutate(bad.run);
      await assert.rejects(verifyLiveQuestionPhase({ phase: "execute", spec, response: { httpStatus: 200, data: bad }, snapshot, draft }));
    }
  }
});

test("input estimate covers full UTF-8 wire/schema and fails before provider transport", async () => {
  const body = JSON.stringify({ model: "deepseek-v4-pro", max_output_tokens: 6000, reasoning: { effort: "low" }, input: "中文", text: { schema: "schema bytes" } });
  assert.equal(checkQuestionInputBudget(body).estimatedInputTokens, Buffer.byteLength(body) + 4096);
  assert.throws(() => checkQuestionInputBudget(body.replace("6000", "6001")), /CONFIGURATION/);
  let calls = 0;
  const h = createQuestionHandler(() => questionTestConfig, { fetcher: async () => { calls++; throw Error("must not reach provider"); } });
  process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = "unsupported-mode";
  try {
    const result = await (await h.POST(questionRequest({phase:"plan",question:QUESTION_LIVE_CASES[0].question}))).json();
    assert.equal(calls,0);assert.deepEqual(result.run.reasons,["QUESTION_BUDGET_CONFIGURATION_INVALID"]);
  } finally { process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION; }
  assert.throws(() => checkQuestionInputBudget(body.replace("schema bytes", "x".repeat(16000))), /INPUT_BUDGET_EXCEEDED/);
});

test("usage over budget or missing usage stops immediately without refunding unknown reservations", async () => {
  for (const usage of [null, {inputTokens:16001,outputTokens:1}, {inputTokens:1,outputTokens:6001}]) {
    let calls=0;
    const result=await runBoundedQuestionBatch({commitSha,persist:async()=>{},archive:async()=>{},executePhase:async()=>{calls++;return {ok:true,data:{},audit:{usage}};}});
    assert.equal(calls,1); assert.equal(result.status,"stopped-after-failure");assert.equal(result.reservedInputEstimateTokens,16000);
  }
  const b=budgetSummary();assert.equal(b.estimatedMaximumUsdMicros,269280);assert.equal(b.planningReserveUsdMicros,336600);assert.equal(b.monetaryHardCap,false);
});

test("archive blocks credentials, signed tickets and escaped secrets while retaining safe audit hashes", () => {
  for(const secret of ["NOT-LIVE-cookie-value", 'NOT-LIVE-key-"escaped', "a".repeat(64)])assert.throws(()=>assertArchiveSafe({rawOutput:secret},[secret]),/SECRET_BLOCKED/);
  for(const key of ["cookie","authorization","ticket","apiKey","sessionSecret"])assert.throws(()=>assertArchiveSafe({[key]:"NOT-LIVE"},[]),/CREDENTIAL_FIELD/);
  assert.doesNotThrow(()=>assertArchiveSafe({run:{answerSha256:"b".repeat(64)},code:"MODEL_JSON_INVALID"},["NOT-LIVE-key"]));
});
