import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { makeResearchContract, resolveQuestionEvidence, validateQuestionExplanation as validateV10Explanation, validateQuestionOutput,
  questionExplanationSchema, questionAnswerConstraints, questionPromptInstructions } from "../lib/research-question.ts";
import { QUESTION_POINTS, questionCitationPolicy, questionCitationChoices, expandQuestionCitationChoices } from "../lib/question-citation-policy.ts";
import { answerOutput, planOutput, mainQuestion, questionTestSnapshot, syntheticQuestionWire,
  questionTestConfig, providerResponse, questionRequest } from "./question-test-helpers.mjs";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun, appendQuestionReview, readQuestionLedger, QUESTION_STORAGE_KEY } from "../lib/research-question-storage.ts";
import { storageKeys } from "../lib/research-versions.ts";

// Preserve historical free-prose semantics; current v11 has its own closed-contract regressions.
const validateQuestionExplanation=(value,context,version="question-explanation.v10",contract)=>validateV10Explanation(value,context,version,contract);


assert.notEqual(process.env.LIVE_MODEL_E2E, "1");
const contract = makeResearchContract(mainQuestion, planOutput(), crypto.randomUUID(), new Date().toISOString());
const resolved = await resolveQuestionEvidence(contract, questionTestSnapshot());
assert.equal(resolved.status, "READY");
const context = resolved.evidence.context;

test("a disclaimer cannot license a later trading recommendation or full-report assertion", () => {
  for (const [text, code] of [
    ["不应贸然给出交易建议，但现在建议买入。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
    ["不能建议买入，推荐卖出。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
    ["本次输入并未说明完整披露情况，但报告未披露该事项。", "DISCLOSURE_SCOPE_OVERCLAIM"],
  ]) {
    const answer = answerOutput(); answer.directAnswer.text = text;
    assert.throws(() => validateQuestionExplanation(answer, context), new RegExp(code));
  }
  for (const text of ["不能据此建议买入，仍需专业复核。", "本次输入缺少比较材料，不能断言报告未披露。", "不提供投资建议，专业审核尚未通过。"] ) {
    const answer = answerOutput(); answer.directAnswer.text = text;
    assert.doesNotThrow(() => validateQuestionExplanation(answer, context));
  }
});

test("an explicitly year-on-year question cannot execute a plan without its comparison period", () => {
  const query = "请解释安克创新归母净利润同比下降的原因。";
  const invalid = makeResearchContract(query, planOutput({ comparisonPeriod: null }), crypto.randomUUID(), new Date().toISOString());
  assert.equal(invalid.status, "OUT_OF_SCOPE");
  const valid = makeResearchContract(query, planOutput(), crypto.randomUUID(), new Date().toISOString());
  assert.equal(valid.status, "CONTRACT_DRAFTED");
});


test("all provider citation enums are closed selections with actual counter and professional limits", () => {
  const schema = questionExplanationSchema(context,undefined,"question-explanation.v10");
  for (const point of QUESTION_POINTS) {
    const choices = questionCitationChoices(context, point);
    assert.deepEqual(schema.properties[point].properties.citations.items.enum, choices);
    for (const token of choices) {
      const ids = expandQuestionCitationChoices([token], context, point);
      assert.deepEqual(ids, token.split("|"), "Every ID was explicitly selected; no repair");
      assert.ok(ids.every(id => context.references.some(r => r.id === id)));
      for (const rule of questionCitationPolicy(context)) if (ids.includes(rule.id)) assert.ok(rule.requires.every(id => ids.includes(id)));
      if (point === "uncertainty") assert.ok(ids.includes("A-03"));
      if (point === "counterEvidence") assert.ok(context.references.some(r => r.direction === "反证" && ids.includes(r.id)));
    }
  }
  const wire = syntheticQuestionWire(answerOutput());
  const before = JSON.stringify(wire);
  const mapped = validateQuestionOutput(wire, context);
  for (const point of QUESTION_POINTS) {
    assert.equal(mapped[point].text, wire[point].text);
    assert.deepEqual(new Set(mapped[point].citations), new Set(wire[point].citations.flatMap(token => token.split("|"))));
  }
  assert.equal(JSON.stringify(wire), before);
  for (const citations of [["F-02"], ["F-02|EV-S-05-C04-ATTR"], ["invented"], ["A-03", "A-03"]]) {
    const bad = structuredClone(wire); bad.inference.citations = citations;
    assert.throws(() => validateQuestionOutput(bad, context));
  }
});

test("missing causal comparison is partial in both schema and validation, without corrupting historical versions", () => {
  const query = "请解释安克创新归母净利润与扣非归母净利润同比变化的原因。";
  const task = makeResearchContract(query, planOutput(), crypto.randomUUID(), new Date().toISOString());
  assert.deepEqual(questionAnswerConstraints(context, task).sufficiency, ["partial"]);
  assert.deepEqual(questionExplanationSchema(context, task).properties.sufficiency.enum, ["partial"]);
  assert.throws(() => validateQuestionOutput(syntheticQuestionWire(answerOutput()), context, undefined, task), /ANSWER_SUFFICIENCY_INVALID/);
  assert.doesNotThrow(() => validateQuestionOutput(syntheticQuestionWire(answerOutput({ sufficiency: "partial" })), context, undefined, task));
  const audit = { ...task, intent: "EVIDENCE_AUDIT" };
  assert.deepEqual(questionAnswerConstraints(context, audit).sufficiency, ["complete", "partial"]);
  assert.equal(makeResearchContract(query, planOutput({ comparisonPeriod: null }), task.requestId, task.createdAt, "question-contract.v3").status, "CONTRACT_DRAFTED");
  assert.doesNotThrow(() => validateQuestionExplanation(answerOutput(), context, "question-explanation.v5", task));
  assert.match(questionPromptInstructions("question-explanation.v5"), /先选citations再写text/);
});

test("mixed assertions fail locally while conditional and negated statements retain scope", () => {
  for (const [text, code] of [
    ["不能证明核心经营改善并建议买入。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
    ["不代表核心经营已获认可，但会计复核已通过。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
    ["没有证据证明核心经营，已证明核心经营改善。", "ASSUMPTION_PROMOTED"],
    ["非经常项目可能有影响，报告未提供比较信息。", "DISCLOSURE_SCOPE_OVERCLAIM"],
  ]) {
    const answer = answerOutput(); answer.inference.text = text + "仍待核验。";
    assert.throws(() => validateQuestionExplanation(answer, context), new RegExp(code));
  }
  for (const text of ["若扣非更接近核心经营，则同比改善可作为待复核信号。", "不能认为已证明核心经营改善，仍需人工复核。", "缺失仅限本次输入，不代表报告未披露。"] ) {
    const answer = answerOutput(); answer.inference.text = text + "仍待核验。";
    assert.doesNotThrow(() => validateQuestionExplanation(answer, context));
  }
});

test("v6 handler persists the exact wire, selected evidence, numeric upstream status and a single replayable call", async () => {
  let calls = 0;
  const handler = createQuestionHandler(() => questionTestConfig, { fetcher: async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    return providerResponse(body.text.format.name.endsWith("plan") ? planOutput() : answerOutput());
  } });
  const draft = await (await handler.POST(questionRequest({ phase: "plan", question: mainQuestion }))).json();
  const body = { phase: "execute", draft, confirmed: true, snapshot: questionTestSnapshot() };
  const data = await (await handler.POST(questionRequest(body))).json();
  assert.equal(data.run.status, "ANSWER_READY", JSON.stringify(data.run.reasons));
  assert.equal(data.run.calls[0].rawOutput, JSON.stringify(syntheticQuestionWire(answerOutput())));
  assert.equal(data.run.calls[0].providerHttpStatus, 200);
  assert.equal(data.run.answer.formalRecommendation, null);
  assert.equal(data.run.answer.verification.professional, "pending");
  await validateQuestionRun(data.run);
  assert.deepEqual(await (await handler.POST(questionRequest(body))).json(), data);
  assert.equal(calls, 2);
});

test("historical records stay readable but a new acceptance cannot promote a known-invalid legacy answer", async () => {
  const legacy = JSON.parse(readFileSync(new URL("./fixtures/question-live-38047109824/request-02.json", import.meta.url), "utf8")).record.run;
  const snapshot = legacy.answer.evidence.snapshot;
  const pastReview = { id: crypto.randomUUID(), runId: legacy.runId, answerSha256: legacy.answerSha256,
    snapshotSha256: legacy.answer.evidence.context.snapshotSha256, status: "accepted", reviewer: "Historical synthetic review",
    note: "Preserved event, not current content approval", reviewedAt: legacy.createdAt, scope: "question-draft-only", identityVerified: false };
  const records = new Map();
  const keys = storageKeys("research");
  records.set(keys.versions, JSON.stringify([snapshot])); records.set(keys.active, snapshot.versionId);
  const bytes = JSON.stringify({ runs: [legacy], reviews: [pastReview] }); records.set(QUESTION_STORAGE_KEY, bytes);
  const previousWindow = globalThis.window, previousLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_key, fn) => fn() } });
  globalThis.window = { isSecureContext: true, crypto: globalThis.crypto, navigator: { locks: navigator.locks }, localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) } };
  try {
    await validateQuestionRun(legacy);
    await assert.rejects(appendQuestionReview(legacy.runId, "accepted", "New synthetic reviewer", ""), /UNSUPPORTED_YOY_ATTRIBUTION/);
    assert.equal(records.get(QUESTION_STORAGE_KEY), bytes);
    await appendQuestionReview(legacy.runId, "rejected", "New synthetic reviewer", "Retain first failure; reject current promotion");
    const ledger = readQuestionLedger();
    assert.deepEqual(ledger.runs, [legacy]); assert.deepEqual(ledger.reviews[0], pastReview);
    assert.equal(ledger.reviews.at(-1).status, "rejected");
    assert.equal(ledger.reviews.at(-1).identityVerified, false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousLocks) Object.defineProperty(navigator, "locks", previousLocks); else delete navigator.locks;
  }
});
