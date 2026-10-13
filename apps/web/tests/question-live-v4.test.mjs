import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, sha256Text } from "../lib/research-memo.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { QUESTION_ANSWER_PROMPT_VERSION, QUESTION_ANSWER_INSTRUCTIONS_V4, QUESTION_PROFESSIONAL_LIMIT_ID, questionPromptInstructions,
  questionAnswerConstraints, questionExplanationSchema, resolveQuestionEvidence, validateQuestionExplanation } from "../lib/research-question.ts";
import { assertArchiveSafe, runBoundedQuestionBatch } from "../scripts/run-question-batch.mjs";
import { questionTestConfig as config, planOutput, providerResponse, questionRequest as req } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "v4 regression uses synthetic transport only");
const bytes = readFileSync(new URL("./fixtures/question-live-38108168529/request-02.json", import.meta.url), "utf8");
const run = JSON.parse(bytes).record.run;
const snapshot = run.events.find(e => e.event === "snapshot_supplied").details;
const resolved = await resolveQuestionEvidence(run.contract, snapshot);
assert.equal(resolved.status, "READY");
const { context } = resolved.evidence;
const original = JSON.parse(run.calls[0].rawOutput);
// Synthetic editorial examples exercise the validator; never rewrite the archived output.
const completeCitations = () => {
  const a = structuredClone(original);
  a.inference.citations.push("EV-S-05-C04-ATTR");
  a.counterEvidence.citations = ["EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ", "EV-S-05-C04-NR"];
  a.uncertainty.citations.push(QUESTION_PROFESSIONAL_LIMIT_ID);
  return a;
};

test("third live output preserves v3 prompt/hash and original professional-limit failure", async () => {
  assert.equal(await sha256Text(bytes), "1ce215ecca3edf986debfc5a71eee676e41d1a8b89270cff799841c1e93921c3");
  assert.equal(await sha256Text(questionPromptInstructions("question-explanation.v3")), run.calls[0].promptSha256);
  assert.equal(run.calls[0].promptVersion, "question-explanation.v3");
  assert.equal(run.status, "BLOCKED"); assert.deepEqual(run.reasons, ["PROFESSIONAL_LIMIT_OMITTED"]);
  assert.equal(run.answer, null); assert.equal(run.answerSha256, null);
  const before = canonicalJson(run); await validateQuestionRun(run); assert.equal(canonicalJson(run), before);
  assertArchiveSafe(JSON.parse(bytes), []);
  for (const version of ["question-explanation.v3", "question-explanation.v4", QUESTION_ANSWER_PROMPT_VERSION])
    assert.throws(() => validateQuestionExplanation(original, context, version), /PROFESSIONAL_LIMIT_OMITTED/);
});

test("one repaired citation cannot mask independent paragraph evidence omissions", () => {
  const professionalOnly = structuredClone(original); professionalOnly.uncertainty.citations.push(QUESTION_PROFESSIONAL_LIMIT_ID);
  assert.throws(() => validateQuestionExplanation(professionalOnly, context), /PARAGRAPH_EVIDENCE_OMITTED/);
  const counterOnly = structuredClone(original); counterOnly.counterEvidence = completeCitations().counterEvidence;
  assert.throws(() => validateQuestionExplanation(counterOnly, context), /PROFESSIONAL_LIMIT_OMITTED/);
  for (const version of ["question-explanation.v3", "question-explanation.v4", QUESTION_ANSWER_PROMPT_VERSION])
    assert.doesNotThrow(() => validateQuestionExplanation(completeCitations(), context, version));
  assert.equal(canonicalJson(original), canonicalJson(JSON.parse(run.calls[0].rawOutput)));
});

test("v4 instructions, wire constraints, schema and local professional requirement agree", () => {
  assert.equal(questionPromptInstructions("question-explanation.v4"), QUESTION_ANSWER_INSTRUCTIONS_V4);
  assert.match(questionPromptInstructions("question-explanation.v4"), /uncertainty.*必引A-03/);
  assert.match(questionPromptInstructions("question-explanation.v4"), /逐段引指标、缺口、比较双方及规则ID.*条件\/否定句/);
  assert.ok(questionExplanationSchema(context).properties.directAnswer.properties.citations.items.enum.some(token => token.includes("SPREAD") && token.includes("ATTR") && token.includes("ADJ")));
  assert.deepEqual(questionAnswerConstraints(context).uncertaintyCitations, [QUESTION_PROFESSIONAL_LIMIT_ID]);
  assert.ok(questionExplanationSchema(context).properties.uncertainty.properties.citations.items.enum.every(token => token.split("|").includes("A-03")));
  const a = completeCitations(); a.uncertainty.citations = a.uncertainty.citations.filter(id => id !== QUESTION_PROFESSIONAL_LIMIT_ID);
  assert.throws(() => validateQuestionExplanation(a, context), /PROFESSIONAL_LIMIT_OMITTED/);
});

test("every mentioned metric, missing input, rule and derived result still requires local citations", () => {
  const cases = [
    ["归母净利润仍须核验。", "EV-S-05-C04-ATTR"], ["扣非净利润仍须核验。", "EV-S-05-C04-ADJ"],
    ["非经常性损益比较期未提供，需核验。", "EV-S-05-C04-NR"], ["利润桥只说明本期勾稽。", "F-02"],
    ["核心经营代表性是假设。", "A-03"], ["连续可比期间仍须核验。", "K-07"], ["估值输入未提供。", "Valuation-B5"],
  ];
  for (const [text, id] of cases) {
    const a = completeCitations(); a.directAnswer = { text, citations: context.references.map(r => r.id) };
    assert.doesNotThrow(() => validateQuestionExplanation(a, context));
    a.directAnswer.citations = a.directAnswer.citations.filter(ref => ref !== id);
    assert.throws(() => validateQuestionExplanation(a, context), /PARAGRAPH_EVIDENCE_OMITTED/);
  }
});

test("archived v3 counter guard remains active after v4 is current", () => {
  const a = completeCitations(); a.counterEvidence.text = "未知会计性质仍须核验。";
  for (const version of ["question-explanation.v3", "question-explanation.v4", QUESTION_ANSWER_PROMPT_VERSION])
    assert.throws(() => validateQuestionExplanation(a, context, version), /COUNTER_FACT_NOT_STATED/);
});

test("actual professional-limit failure stops after two mock calls and cannot rebill on replay", async () => {
  let calls = 0, executeBody, failed; const archived = [];
  const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
    calls++; return JSON.parse(init.body).text.format.name.endsWith("plan") ? providerResponse(planOutput())
      : providerResponse(original, { output: [{ type: "message", content: [{ type: "output_text", text: run.calls[0].rawOutput }] }] });
  } });
  const manifest = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async () => {}, archive: async (_i, value) => archived.push(value),
    executePhase: async ({ spec, phase, draft }) => {
      const body = phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot };
      if (phase === "execute") executeBody = body;
      const data = await (await handler.POST(req(body))).json();
      const ok = data.run.status !== "BLOCKED"; if (!ok) failed = data;
      return { ok, failureCode: data.run.reasons[0], data, audit: data.run.calls[0], record: { run: data.run } };
    } });
  assert.equal(manifest.status, "stopped-after-failure"); assert.equal(calls, 2); assert.equal(archived.length, 2);
  assert.deepEqual(failed.run.reasons, ["ANSWER_CITATION_OR_TEXT_INVALID"]); assert.equal(failed.run.answer, null);
  assert.equal(failed.run.calls[0].rawOutput, run.calls[0].rawOutput);
  assert.deepEqual(await (await handler.POST(req(executeBody))).json(), failed); assert.equal(calls, 2);
});
