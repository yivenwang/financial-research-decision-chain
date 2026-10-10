import assert from "node:assert/strict";
import test from "node:test";
import { assertQuestionBatchEnvironment, runBoundedQuestionBatch, verifyLiveQuestionPhase, QUESTION_LIVE_CASES, QUESTION_BATCH_AUTHORIZATION, assertArchiveSafe } from "../scripts/run-question-batch.mjs";
import { QUESTION_BUDGET_ACK, QUESTION_BUDGET_VERSION, checkQuestionInputBudget, budgetSummary } from "../lib/question-batch-budget.ts";
process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION; // Isolated NOT-LIVE test worker only.
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { questionTestConfig, planOutput, answerOutput, providerResponse, questionRequest, questionTestSnapshot, questionTestCookie } from "./question-test-helpers.mjs";

const commitSha = "a".repeat(40);
test("archive guards reject unknown credentials in string encodings and non-finite values while allowing safe approval receipts", () => {
  for (const key of ["Cookie", "API Key", "api_key", "api.key", "api\u200bkey", "session-secret", "session—secret", "ticket", "AUTHORIZATION", "ＡＰＩ＿ＫＥＹ"]) {
    const value = { [key]: "unknown-credential-value" };
    for (const payload of [value, { raw: JSON.stringify(value) }, { raw: JSON.stringify({ nested: JSON.stringify(value) }) },
      { raw: `prose ${JSON.stringify(value)}` }, { raw: `{'${key}':'unknown-value'}` }, { raw: JSON.stringify(value).replaceAll("a", "\\u0061") }]) assert.throws(() => assertArchiveSafe(payload, []));
  }
  for (const payload of [{ value: NaN }, { value: Infinity }, undefined]) assert.throws(() => assertArchiveSafe(payload, []));
  const circular = {}; circular.self = circular; assert.throws(() => assertArchiveSafe(circular, []));
  let deep = {}; for (let i = 0; i < 65; i++) deep = { nested: deep };
  for (const payload of [deep, Array(100001).fill(0)]) assert.throws(() => assertArchiveSafe(payload, []), /ARCHIVE_STRUCTURE_LIMIT/);
  assert.doesNotThrow(() => assertArchiveSafe({ approvalReference: "question-acceptance-2026-09-20", commitSha: "a".repeat(40), raw: "待项目负责人确认" }, []));
});

test("archive and checkpoint failures terminate without another request and preserve a safe receipt", async () => {
  let calls = 0; const checkpoints = [];
  const result = await runBoundedQuestionBatch({ commitSha: "a".repeat(40), persist: async m => checkpoints.push(m), archive: async () => { throw new Error("credential detail must not escape"); },
    executePhase: async () => { calls++; return { ok: true, record: {}, audit: { usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } } }; } });
  assert.equal(calls, 1); assert.equal(result.status, "stopped-after-failure");
  assert.equal(result.requests[0].failureCode, "ARCHIVE_WRITE_FAILED"); assert.equal(checkpoints.at(-1).status, result.status);
  assertArchiveSafe(result, []);
  calls = 0; let writes = 0;
  await assert.rejects(runBoundedQuestionBatch({ commitSha: "a".repeat(40), persist: async () => { if (++writes === 2) throw new Error("disk failed"); }, archive: async () => {},
    executePhase: async () => { calls++; return { ok: true }; } }), /CHECKPOINT_WRITE_FAILED/);
  assert.equal(calls, 0);
  for (const outcome of [null, { ok: false, audit: { usage: { inputTokens: NaN, outputTokens: 1 } } },
    { ok: false, audit: { usage: { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0 } } }]) {
    const stopped = await runBoundedQuestionBatch({ commitSha: "a".repeat(40), persist: async () => {}, archive: async () => {}, executePhase: async () => outcome });
    assert.equal(stopped.status, "stopped-after-failure"); assert.equal(stopped.requests.length, 1); assert.equal(stopped.knownInputTokens, 0); assertArchiveSafe(stopped, []);
  }
});
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

test("actual initial manifest and all six handler archives pass the production archive guard (NOT-LIVE)", async () => {
  const snapshot = questionTestSnapshot();
  const secrets = [questionTestConfig.apiKey, questionTestConfig.accessToken, process.env.REVIEW_SESSION_SECRET,
    questionTestCookie, questionTestCookie.slice(questionTestCookie.indexOf("=") + 1)];
  const checkpoints = []; const archives = [];
  let transportCalls = 0;
  const result = await runBoundedQuestionBatch({ commitSha,
    persist: async manifest => {
      assertArchiveSafe(manifest, secrets);
      checkpoints.push(manifest);
    },
    archive: async (index, record) => {
      assertArchiveSafe(record, secrets);
      archives.push([index, record]);
    },
    executePhase: async ({ spec, phase, draft }) => {
      const handler = createQuestionHandler(() => questionTestConfig, { fetcher: async (_url, init) => {
        transportCalls++;
        const body = JSON.parse(init.body);
        checkQuestionInputBudget(init.body);
        return providerResponse(body.text.format.name.endsWith("plan") ? planOutput({ intent: spec.intent }) : answerOutput(),
          { id: "NOT-LIVE-manifest-regression", model: "deepseek-v4-pro" });
      } });
      const body = phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot };
      const response = await handler.POST(questionRequest(body));
      const data = await response.json();
      if (typeof data.ticket === "string") secrets.push(data.ticket);
      const audit = await verifyLiveQuestionPhase({ phase, spec, response: { httpStatus: response.status, data }, snapshot, draft });
      return { ok: true, data, audit, record: { httpStatus: response.status, run: data.run ?? null, code: data.code ?? null } };
    },
  });
  const initial = checkpoints[0];
  assert.equal(initial.approvalReference, QUESTION_BATCH_AUTHORIZATION);
  assert.equal(Object.hasOwn(initial, "authorization"), false);
  assert.equal(initial.commitSha, commitSha);
  assert.equal(initial.schemaVersion, "question-live-batch.v1");
  assert.deepEqual(initial.budget, budgetSummary());
  assert.deepEqual(initial.cases, []); assert.deepEqual(initial.requests, []);
  assert.equal(initial.reservedInputEstimateTokens, 0);
  assert.equal(initial.maxRequests, 6); assert.equal(initial.maxOutputTokensPerRequest, 6000);
  assert.equal(initial.maxPossibleOutputTokens, 36000); assert.equal(initial.timeoutMsPerRequest, 150000);
  assert.equal(initial.status, "running"); assert.equal(initial.contentReview, "pending");
  // The former field name must still be rejected, even with this harmless value.
  const oldManifest = { ...initial, authorization: initial.approvalReference };
  delete oldManifest.approvalReference;
  assert.throws(() => assertArchiveSafe(oldManifest, secrets), /ARCHIVE_CREDENTIAL_FIELD_BLOCKED/);
  assert.equal(checkpoints.length, 14); assert.equal(archives.length, 6); assert.equal(transportCalls, 6);
  assert.equal(result.status, "technical-completed-awaiting-content-review");
  assert.equal(result.reservedInputEstimateTokens, 96000);
});

test("credential fields and JSON string leak variants fail before the first request (NOT-LIVE)", async () => {
  const leaks = [];
  for (const key of ["cookie", "Cookie", "COOKIE", "authorization", "Authorization", "AUTHORIZATION",
    "ticket", "Ticket", "apiKey", "APIKEY", "sessionSecret", "SESSIONSECRET"]) {
    leaks.push({ value: { audit: [{ [key]: "NOT-LIVE" }] }, secrets: [], code: /ARCHIVE_CREDENTIAL_FIELD_BLOCKED/ });
  }
  for (const secret of ["NOT-LIVE-cookie-value", 'NOT-LIVE-key-"quoted', "NOT-LIVE-session-\\slash",
    "NOT-LIVE-ticket-\nnewline\ttab", "NOT-LIVE-authorization-中文"]) {
    // JSON.stringify in the real guard escapes quotes, slashes and control characters.
    for (const variant of [secret, `Bearer ${secret}`, `cookie=${secret}; HttpOnly`]) {
      leaks.push({ value: { audit: [{ rawOutput: `prefix ${variant} suffix` }] }, secrets: [secret], code: /ARCHIVE_SECRET_BLOCKED/ });
    }
  }
  for (const leak of leaks) {
    let calls = 0;
    await assert.rejects(runBoundedQuestionBatch({ commitSha,
      persist: async manifest => assertArchiveSafe({ ...manifest, leak: leak.value }, leak.secrets),
      archive: async () => {}, executePhase: async () => { calls++; },
    }), /CHECKPOINT_WRITE_FAILED/);
    assert.equal(calls, 0);
  }
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
  const result = await runBoundedQuestionBatch({ commitSha, persist: async () => {}, archive: async () => { throw Error("disk unavailable"); }, executePhase: async () => { calls++; return { ok: true }; } });
  assert.equal(result.status, "stopped-after-failure"); assert.equal(result.requests[0].failureCode, "ARCHIVE_WRITE_FAILED");
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
    const planResponse = await handler.POST(questionRequest({ phase: "plan", question: spec.question }));
    assert.equal(planResponse.bodyUsed,false);const draft = await planResponse.json();
    await verifyLiveQuestionPhase({ phase: "plan", spec, response: { httpStatus: 200, data: draft }, snapshot });
    const answerResponse = await handler.POST(questionRequest({ phase: "execute", draft, confirmed: true, snapshot }));
    assert.equal(answerResponse.bodyUsed,false);const data = await answerResponse.json();
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
