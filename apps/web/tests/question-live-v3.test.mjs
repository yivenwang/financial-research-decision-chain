import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, sha256Text } from "../lib/research-memo.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { QUESTION_ANSWER_PROMPT_VERSION, questionPromptInstructions, questionAnswerConstraints, questionExplanationSchema,
  questionExplanationInput, resolveQuestionEvidence, validateQuestionExplanation, questionReferenceIds } from "../lib/research-question.ts";
import { QUESTION_BUDGET_VERSION, checkQuestionInputBudget } from "../lib/question-batch-budget.ts";
import { QUESTION_LIVE_CASES, assertArchiveSafe, verifyLiveQuestionPhase, runBoundedQuestionBatch } from "../scripts/run-question-batch.mjs";
import { questionTestConfig as config, planOutput, providerResponse, questionRequest as req } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "v3 regression uses synthetic transport only");
const bytes = readFileSync(new URL("./fixtures/question-live-38062132788/request-02.json", import.meta.url), "utf8");
const run = JSON.parse(bytes).record.run;
const snapshot = run.events.find(e => e.event === "snapshot_supplied").details;
const resolved = await resolveQuestionEvidence(run.contract, snapshot);
assert.equal(resolved.status, "READY");
const { context } = resolved.evidence;
const original = JSON.parse(run.calls[0].rawOutput);
// Editorial examples are labelled synthetic test outputs, never automatic replacements for raw model output.
export const safeLiveAnswer = (intent = "CHANGE_EXPLAIN") => ({
  ...structuredClone(original),
  directAnswer: {
    text: ({ CHANGE_EXPLAIN: "归母同比下降、扣非同比上升。本期利润桥已闭合，负向非经常性损益使本期归母低于扣非；比较期未提供，同比原因待核验。",
      EVIDENCE_AUDIT: "归母、扣非及非经常性损益均有本期原文定位，利润桥已闭合；非经常性损益比较期未提供，不能解释同比原因。",
      DECISION_IMPACT: "归母同比下降、扣非同比上升，应同时核对；本期非经常性损益与利润桥不证明同比原因，研究判断仍待人工复核。" })[intent],
    citations: ["EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ", "EV-S-05-C04-NR", "F-02"],
  },
  counterEvidence: { text: "归母净利润同比下降是已有反向证据，不能忽略。非经常性损益比较期未提供，无法确认同比原因；扣非代表核心经营仍是假设。",
    citations: ["EV-S-05-C04-ATTR", "EV-S-05-C04-NR", "EV-S-05-C04-ADJ", "A-03"] },
});

test("second live failure retains exact bytes, prompt v2 hash, BLOCKED state and immutable history", async () => {
  assert.equal(await sha256Text(bytes), "ea5322c8f25bc48771c841c0a8378915c4e781658638b519169906171b2bc308");
  assert.equal(await sha256Text(run.calls[0].rawOutput), "a7a4a0253119e1afcd794ca2a4b1b1fc0040f7909c3868b9931faabcf0e89806");
  assert.equal(run.calls[0].promptVersion, "question-explanation.v2");
  assert.equal(await sha256Text(questionPromptInstructions("question-explanation.v2")), run.calls[0].promptSha256);
  const before = canonicalJson(run); await validateQuestionRun(run); assert.equal(canonicalJson(run), before);
  assert.equal(run.status, "BLOCKED"); assert.equal(run.answer, null); assert.equal(run.answerSha256, null);
  assert.equal(run.events.some(e => e.event === "answer_generated"), false);
  assertArchiveSafe(JSON.parse(bytes), []);
});

test("actual failure, citation-only patch and causal patch are independently blocked with no repair", () => {
  assert.throws(() => validateQuestionExplanation(original, context), /COUNTER_EVIDENCE_OMITTED/);
  const citationOnly = structuredClone(original); citationOnly.counterEvidence.citations.push("EV-S-05-C04-ATTR");
  assert.throws(() => validateQuestionExplanation(citationOnly, context), /COUNTER_FACT_NOT_STATED/);
  const counterOnly = structuredClone(original); counterOnly.counterEvidence = safeLiveAnswer().counterEvidence;
  assert.throws(() => validateQuestionExplanation(counterOnly, context), /UNSUPPORTED_YOY_ATTRIBUTION/);
  assert.throws(() => validateQuestionExplanation(citationOnly, context, "question-explanation.v2"), /UNSUPPORTED_YOY_ATTRIBUTION/);
  for (const { intent } of QUESTION_LIVE_CASES) assert.doesNotThrow(() => validateQuestionExplanation(safeLiveAnswer(intent), context));
  assert.equal(JSON.stringify(original), run.calls[0].rawOutput);
});

test("v3 qualified uncertainty cannot excuse a separate asserted causal attribution", () => {
  for (const text of ["归母与扣非同比分化来自非经常性损益，但仍待复核。", "归母与扣非同比背离。分歧源于非经常性损益。", "归母与扣非同比相反，其原因在于剔除非经常性损益。", "归母与扣非同比相反，扣非可能改善，分歧由非经常性损益引起。", "本期口径差异导致归母与扣非同比背离。"] ) {
    const a = safeLiveAnswer(); a.directAnswer.text = text;
    assert.throws(() => validateQuestionExplanation(a, context), /UNSUPPORTED_YOY_ATTRIBUTION/);
  }
  for (const text of ["归母与扣非同比相反，不能归因于非经常性损益，比较期未提供。", "归母与扣非同比相反，可能来自非经常性损益，但其比较期未提供，仍待核验。", "归母同比下降、扣非同比上升，本期利润桥已闭合，不能证明同比原因。", "无法证明同比分歧由本期非经常性损益变化或上期基数引起，仍待核验。", "归母同比下降、扣非同比上升。本期口径差异来自非经常性损益的剔除；其比较期未提供，同比原因待核验。"] ) {
    const a = safeLiveAnswer(); a.directAnswer.text = text;
    assert.doesNotThrow(() => validateQuestionExplanation(a, context));
  }
});

test("model input preserves semantic contract and engine outputs while making counter and comparison requirements explicit", () => {
  const before = canonicalJson(resolved.evidence);
  const input = questionExplanationInput(run.contract, resolved.evidence);
  assert.deepEqual(input.constraints.counterEvidenceIds, ["EV-S-05-C04-ATTR"]);
  assert.equal(input.constraints.comparisonMissing, true);
  const trace = ["schemaVersion", "requestId", "createdAt", "capabilityVersion", "status"];
  assert.deepEqual(input.contract, Object.fromEntries(Object.entries(run.contract).filter(([key]) => !trace.includes(key))));
  assert.deepEqual(input.evidence, Object.fromEntries(Object.entries(context).filter(([key]) => !["schemaVersion", "snapshotSha256"].includes(key))));
  for (const key of ["facts", "calculations", "graphDiff"]) assert.deepEqual(input[key], resolved.evidence[key]);
  assert.equal(canonicalJson(resolved.evidence), before);
  const reverse = structuredClone(context); reverse.references.find(r => r.id.endsWith("ATTR")).direction = "支持";
  reverse.references.find(r => r.id.endsWith("ADJ")).direction = "反证";
  assert.deepEqual(questionAnswerConstraints(reverse).counterEvidenceIds, ["EV-S-05-C04-ADJ"]);
  assert.match(questionExplanationSchema(reverse).properties.counterEvidence.description, /EV-S-05-C04-ADJ/);
  const a = safeLiveAnswer(); a.counterEvidence = { text: "扣非净利润下降仍是反证，需人工复核。", citations: ["EV-S-05-C04-ADJ"] };
  assert.doesNotThrow(() => validateQuestionExplanation(a, reverse));
  const none = structuredClone(context); none.references.forEach(r => r.direction = null);
  assert.deepEqual(questionAnswerConstraints(none).counterEvidenceIds, []);
  assert.match(questionExplanationSchema(none).properties.counterEvidence.description, /本次输入未提供/);
});

test("six request rehearsal uses real snapshot, all intents, maximal references and original budget with synthetic transport", async t => {
  const previous = process.env.QUESTION_ACCEPTANCE_BUDGET_MODE; process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION;
  t.after(() => { if (previous === undefined) delete process.env.QUESTION_ACCEPTANCE_BUDGET_MODE; else process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = previous; });
  let calls = 0; const receipts = [];
  const manifest = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async value => assertArchiveSafe(value, []), archive: async (_index, value) => assertArchiveSafe(value, []),
    executePhase: async ({ spec, phase, draft }) => {
      const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
        calls++; receipts.push({ intent: spec.intent, phase, ...checkQuestionInputBudget(init.body) });
        return providerResponse(phase === "plan" ? planOutput({ intent: spec.intent, company: "Anker Innovations", referenceIds: questionReferenceIds("2026Q1"), reason: "💡".repeat(160) }) : safeLiveAnswer(spec.intent));
      } });
      const response = await handler.POST(req(phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot }));
      const data = await response.json(); await validateQuestionRun(data.run);
      const audit = await verifyLiveQuestionPhase({ spec, phase, response: { httpStatus: response.status, data }, snapshot, draft });
      const record = { run: data.run }; // Signed ticket remains in memory, never archived.
      assert.equal(data.run.calls[0].promptVersion, phase === "plan" ? "question-contract.v2" : QUESTION_ANSWER_PROMPT_VERSION);
      if (phase === "execute") {
        assert.equal(data.run.answer.verification.professional, "pending"); assert.equal(data.run.answer.formalRecommendation, null);
        assert.deepEqual(data.run.answer.evidence.calculations, resolved.evidence.calculations);
      }
      return { ok: true, data, audit, record };
    } });
  assert.equal(calls, 6); assert.equal(manifest.status, "technical-completed-awaiting-content-review"); assert.equal(manifest.contentReview, "pending");
  assert.equal(manifest.maxRequests, 6); assert.equal(manifest.requests.length, 6);
  t.diagnostic(JSON.stringify({ transport: "synthetic-NOT-LIVE", realModelCalls: 0, receipts }));
});

test("raw failed live output replay stops the batch after two mock calls and idempotent execution cannot resend", async () => {
  let calls = 0, executeRequest, failedResult; const archives = [];
  const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
    calls++; return providerResponse(JSON.parse(init.body).text.format.name.endsWith("plan") ? planOutput() : original);
  } });
  const manifest = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async () => {}, archive: async (_i, value) => archives.push(value),
    executePhase: async ({ spec, phase, draft }) => {
      const body = phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot };
      if (phase === "execute") executeRequest = body;
      const data = await (await handler.POST(req(body))).json();
      const ok = data.run.status !== "BLOCKED";
      if (!ok) failedResult = data;
      return { ok, failureCode: data.run.reasons[0], data, audit: data.run.calls[0], record: { run: data.run } };
    } });
  assert.equal(manifest.status, "stopped-after-failure"); assert.equal(calls, 2); assert.equal(archives.length, 2);
  assert.equal(failedResult.run.answer, null); assert.equal(failedResult.run.calls[0].rawOutput, run.calls[0].rawOutput);
  assert.deepEqual(await (await handler.POST(req(executeRequest))).json(), failedResult); assert.equal(calls, 2);
});
