import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalJson, sha256Text } from "../lib/research-memo.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { QUESTION_ANSWER_PROMPT_VERSION, questionPromptInstructions, questionExplanationSchema,
  resolveQuestionEvidence, validateQuestionExplanation } from "../lib/research-question.ts";
import { assertArchiveSafe, runBoundedQuestionBatch } from "../scripts/run-question-batch.mjs";
import { questionTestConfig as config, planOutput, providerResponse, questionRequest as req } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Historical v4 replay uses synthetic transport only");
const bytes = readFileSync(new URL("./fixtures/question-live-38138604171/request-02.json", import.meta.url), "utf8");
const manifestBytes = readFileSync(new URL("./fixtures/question-live-38138604171/manifest.json", import.meta.url), "utf8");
const run = JSON.parse(bytes).record.run;
const snapshot = run.events.find(e => e.event === "snapshot_supplied").details;
const resolved = await resolveQuestionEvidence(run.contract, snapshot);
assert.equal(resolved.status, "READY");
const { context } = resolved.evidence;
const original = JSON.parse(run.calls[0].rawOutput);
// These edits exist only in synthetic examples, never in the archived model output.
const completeCitations = () => {
  const a = structuredClone(original);
  a.inference.citations.push("EV-S-05-C04-ATTR");
  a.counterEvidence.citations.push("EV-S-05-C04-ADJ", "EV-S-05-C04-NR");
  a.uncertainty.citations.push("EV-S-05-C04-ADJ");
  return a;
};

test("real v4 failure preserves exact bytes, prompt hash, two calls and first-failure stop", async () => {
  assert.equal(await sha256Text(bytes), "abbb8217b1fadefd2f443ee9383eb9fe215913d4014bc4777144673475d14888");
  assert.equal(await sha256Text(manifestBytes), "f0906f6acaf1aadc6b790e22aac5852f25ecf2061471a8727864ab9b3067f550");
  assert.equal(await sha256Text(questionPromptInstructions("question-explanation.v4")), run.calls[0].promptSha256);
  assert.equal(run.calls[0].failureCode, null); assert.equal(run.calls[0].promptVersion, "question-explanation.v4");
  assert.equal(run.status, "BLOCKED"); assert.equal(run.answer, null); assert.equal(run.answerSha256, null);
  assert.deepEqual(run.reasons, ["PARAGRAPH_EVIDENCE_OMITTED"]);
  const before = canonicalJson(run); await validateQuestionRun(run); assert.equal(canonicalJson(run), before);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.requests.length, 2); assert.equal(manifest.status, "stopped-after-failure");
  assert.equal(manifest.requests[0].status, "technical-completed");
  assert.equal(manifest.requests[1].failureCode, "PARAGRAPH_EVIDENCE_OMITTED");
  for (const value of [JSON.parse(bytes), manifest]) assertArchiveSafe(value, []);
});

test("three independent citation omissions remain blocked under both original and current contracts", () => {
  for (const version of ["question-explanation.v4", QUESTION_ANSWER_PROMPT_VERSION]) {
    assert.throws(() => validateQuestionExplanation(original, context, version), /PARAGRAPH_EVIDENCE_OMITTED/);
    assert.doesNotThrow(() => validateQuestionExplanation(completeCitations(), context, version));
    for (const key of ["inference", "counterEvidence", "uncertainty"]) {
      const a = completeCitations(); a[key] = structuredClone(original[key]);
      assert.throws(() => validateQuestionExplanation(a, context, version), /PARAGRAPH_EVIDENCE_OMITTED/);
    }
  }
  assert.equal(canonicalJson(original), canonicalJson(JSON.parse(run.calls[0].rawOutput)));
});

test("v5 selects paragraph evidence before text without adding output fields or weakening checks", () => {
  assert.equal(questionPromptInstructions("question-explanation.v5").includes("先选citations再写text"), true);
  const prompt = questionPromptInstructions("question-explanation.v5");
  assert.match(prompt, /先选citations再写text/); assert.match(prompt, /勿引用别段代替本段/);
  assert.match(prompt, /条件\/否定句/); assert.match(prompt, /派生引用补citationDependencies/);
  assert.match(prompt, /输入缺失不等于报告未披露/); assert.match(prompt, /必引A-03/);
  const schema = questionExplanationSchema(context);
  for (const key of ["directAnswer", "inference", "counterEvidence", "uncertainty"]) {
    assert.deepEqual(Object.keys(schema.properties[key].properties), ["citations", "text"]);
    assert.deepEqual(schema.properties[key].required, ["citations", "text"]);
  }
  const invalid = completeCitations(); invalid.inference.text = "扣非已证明核心经营改善。";
  assert.throws(() => validateQuestionExplanation(invalid, context), /INFERENCE_NOT_MARKED|ASSUMPTION_PROMOTED/);
});

test("actual omitted-citation response stops after two mock calls and replay cannot rebill", async () => {
  let calls = 0, executeBody, failed;
  const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
    calls++; return JSON.parse(init.body).text.format.name.endsWith("plan") ? providerResponse(planOutput())
      : providerResponse({}, { output: [{ type: "message", content: [{ type: "output_text", text: run.calls[0].rawOutput }] }] });
  } });
  const manifest = await runBoundedQuestionBatch({ commitSha: "0".repeat(40), persist: async () => {}, archive: async (_i, data) => assertArchiveSafe(data, []),
    executePhase: async ({ spec, phase, draft }) => {
      const body = phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot };
      if (phase === "execute") executeBody = body;
      const data = await (await handler.POST(req(body))).json();
      const ok = data.run.status !== "BLOCKED"; if (!ok) failed = data;
      return { ok, failureCode: data.run.reasons[0], data, audit: data.run.calls[0], record: { run: data.run } };
    } });
  assert.equal(calls, 2); assert.equal(manifest.requests.length, 2); assert.equal(manifest.status, "stopped-after-failure");
  assert.deepEqual(failed.run.reasons, ["ANSWER_CITATION_OR_TEXT_INVALID"]); assert.equal(failed.run.answer, null);
  assert.equal(failed.run.calls[0].rawOutput, run.calls[0].rawOutput);
  assert.deepEqual(await (await handler.POST(req(executeBody))).json(), failed); assert.equal(calls, 2);
});
