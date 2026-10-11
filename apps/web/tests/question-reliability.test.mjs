import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { canonicalJson, sha256Text, buildMemoContext } from "../lib/research-memo.ts";
import { questionReferenceIds, questionPlanSchema, validateQuestionPlan, validateQuestionExplanation, resolveQuestionEvidence, makeResearchContract,
  questionPromptInstructions, QUESTION_INTENTS } from "../lib/research-question.ts";
import { QUESTION_BUDGET_VERSION, checkQuestionInputBudget } from "../lib/question-batch-budget.ts";
import { QUESTION_LIVE_CASES } from "../scripts/run-question-batch.mjs";
import { questionTestConfig as config, mainQuestion, planOutput, answerOutput, questionTestSnapshot, providerResponse, questionRequest as req } from "./question-test-helpers.mjs";
import { extractCandidates, createResearchSnapshot } from "../lib/research-engine.ts";

// Immutable historical failures are replay inputs, never a positive synthetic fallback.
const fixtureText = n => readFileSync(new URL(`./fixtures/question-live-38047109824/request-0${n}.json`, import.meta.url), "utf8").trimEnd();
const historical = JSON.parse(fixtureText(2)).record.run;
const failedPlan = JSON.parse(fixtureText(3)).record.run;
const context = historical.answer.evidence.context;
const snapshot = historical.answer.evidence.snapshot;
const repaired = () => ({ ...structuredClone(historical.answer.explanation),
  directAnswer: { text: "归母同比下降而扣非同比上升；本期非经常性损益与利润桥仅证明本期勾稽，不能据此确认同比分化原因。", citations: ["EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ", "EV-S-05-C04-NR", "F-02"] },
  inference: { ...structuredClone(historical.answer.explanation.inference), citations: ["EV-S-05-C04-SPREAD", "A-03", "EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ"] },
  counterEvidence: { ...structuredClone(historical.answer.explanation.counterEvidence), citations: [...historical.answer.explanation.counterEvidence.citations, "A-03"] },
  uncertainty: { ...structuredClone(historical.answer.explanation.uncertainty), citations: [...historical.answer.explanation.uncertainty.citations, "EV-S-05-C04-ADJ"] } });

test("captured first failures and v1 prompts retain exact hashes and historical validation", async () => {
  assert.equal(await sha256Text(fixtureText(2)), "bf23ca4694b95a4139a01d202c228fb220e83c38d1759c9e334830baffef29ab");
  assert.equal(await sha256Text(fixtureText(3)), "1d0b38ff23d9f88e865abf0428d4fe156fe8e5b042697faa4983886e682ff468");
  for (const run of [historical, failedPlan]) {
    const before = canonicalJson(run);
    await validateQuestionRun(run);
    assert.equal(canonicalJson(run), before);
    assert.equal(await sha256Text(questionPromptInstructions(run.calls[0].promptVersion)), run.calls[0].promptSha256);
  }
  assert.equal(historical.status, "PARTIAL"); assert.equal(historical.answer.verification.professional, "pending");
  assert.equal(failedPlan.status, "OUT_OF_SCOPE");
  assert.throws(() => questionPromptInstructions("question-explanation.v999"), /UNSUPPORTED/);
});

test("v2 constrains identifiers without translating Source IDs or coercing unsupported company/period", () => {
  assert.deepEqual(questionPlanSchema.properties.referenceIds.items.enum, questionReferenceIds());
  for (const id of questionReferenceIds()) assert.doesNotThrow(() => validateQuestionPlan(planOutput({ referenceIds: [id] })));
  const raw = JSON.parse(failedPlan.calls[0].rawOutput);
  assert.doesNotThrow(() => validateQuestionPlan(raw, "question-contract.v1"));
  assert.throws(() => validateQuestionPlan(raw), /CONTRACT_SCHEMA_INVALID/);
  for (const patch of [{ referenceIds: ["S-05"] }, { metricKeys: ["revenue"] }, { reason: " " }, { company: " " },
    { comparisonPeriod: "" }, { reason: "字".repeat(161) }, { referenceIds: ["F-02", "F-02"] }])
    assert.throws(() => validateQuestionPlan(planOutput(patch)), /CONTRACT_SCHEMA_INVALID/);
  assert.doesNotThrow(() => validateQuestionPlan(planOutput({ reason: "💡".repeat(160) })));
  assert.doesNotThrow(() => validateQuestionPlan(planOutput({ comparisonPeriod: "💡".repeat(19) })));
  for (const patch of [{ company: "其他公司" }, { period: "2027Q1" }, { comparisonPeriod: "2025FY" }]) {
    const plan = validateQuestionPlan(planOutput(patch));
    assert.equal(makeResearchContract(mainQuestion, plan, "synthetic", new Date().toISOString()).status, "OUT_OF_SCOPE");
    for (const [key, value] of Object.entries(patch)) assert.equal(plan[key], value);
  }
});

test("actual causal overclaim and missing comparison-side citation are independent controlled failures", () => {
  assert.throws(() => validateQuestionExplanation(historical.answer.explanation, context), /UNSUPPORTED_YOY_ATTRIBUTION/);
  const oneFix = repaired(); oneFix.inference.citations = historical.answer.explanation.inference.citations;
  assert.throws(() => validateQuestionExplanation(oneFix, context), /PARAGRAPH_EVIDENCE_OMITTED/);
  assert.doesNotThrow(() => validateQuestionExplanation(repaired(), context)); // Proposal only, no recorded approval.
  assert.equal(historical.answer.explanation.directAnswer.text.includes("差异来自"), true);
});

test("paragraph dependency, disclosure, assumption and professional boundaries block known adversarial claims", () => {
  const cases = [
    [a => a.directAnswer.citations = ["F-02"], "PARAGRAPH_EVIDENCE_OMITTED"],
    [a => a.inference.citations = ["EV-S-05-C04-SPREAD", "A-03", "EV-S-05-C04-ADJ"], "PARAGRAPH_EVIDENCE_OMITTED"],
    [a => a.directAnswer.citations.push(a.directAnswer.citations[0]), "ANSWER_CITATION_OR_TEXT_INVALID"],
    [a => a.directAnswer.text = "归母与扣非同比分化来自非经常性损益；仍需人工复核。", "UNSUPPORTED_YOY_ATTRIBUTION"],
    [a => a.uncertainty.text = "报告未披露非经常性损益比较期，需复核。", "DISCLOSURE_SCOPE_OVERCLAIM"],
    [a => a.inference.text = "已证明核心经营改善，但专业审核仍待完成。", "ASSUMPTION_PROMOTED"],
    [a => a.inference.text = "核心经营可能更强，建议买入。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
    [a => a.inference.text = "会计复核已通过，核心经营仍是待复核假设。", "PROFESSIONAL_BOUNDARY_VIOLATION"],
  ];
  for (const [mutate, code] of cases) { const a = repaired(); mutate(a); assert.throws(() => validateQuestionExplanation(a, context), new RegExp(code)); }
  for (const text of ["本次结构化输入未提供非经常性损益比较期，不能断言报告未披露，仍待核验。", "无法证明核心经营改善，仍是待专业复核假设。", "核心经营改善可能成立，不能建议买入，仍需复核。"] ) {
    const a = repaired(); a.inference.text = text;
    a.inference.citations = ["A-03", "EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ", "EV-S-05-C04-NR"];
    assert.doesNotThrow(() => validateQuestionExplanation(a, context));
  }
});

test("provider identity, malformed envelope and unsafe/inconsistent usage each stop one request, without retries", async t => {
  const previous = process.env.QUESTION_ACCEPTANCE_BUDGET_MODE;
  process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION;
  t.after(() => { if (previous === undefined) delete process.env.QUESTION_ACCEPTANCE_BUDGET_MODE; else process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = previous; });
  const cases = [
    [() => providerResponse(planOutput(), { model: "different-model" }), "PROVIDER_MODEL_MISMATCH"],
    [() => Response.json(null), "PROVIDER_RESPONSE_INVALID"],
    [() => providerResponse(planOutput(), { usage: null }), "PROVIDER_USAGE_INVALID"],
    ...[{ input_tokens: -1, output_tokens: 1, total_tokens: 0 }, { input_tokens: 1, output_tokens: 6001, total_tokens: 6002 },
      { input_tokens: 1, output_tokens: 1, total_tokens: 3 }, { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER + 2 },
      { input_tokens: 1, output_tokens: 0, total_tokens: 1 }, { input_tokens: 20000, output_tokens: 1, total_tokens: 20001 }].map(usage => [() => providerResponse(planOutput(), { usage }), "PROVIDER_USAGE_INVALID"]),
  ];
  for (const [response, code] of cases) {
    let calls = 0;
    const handler = createQuestionHandler(() => config, { fetcher: async () => { calls++; return response(); } });
    const key = crypto.randomUUID(); const request = () => req({ phase: "plan", question: mainQuestion }, { "Idempotency-Key": key });
    const result = await (await handler.POST(request())).json();
    assert.equal(result.run.status, "BLOCKED"); assert.deepEqual(result.run.reasons, [code]);
    await validateQuestionRun(result.run);
    assert.deepEqual(await (await handler.POST(request())).json(), result); assert.equal(calls, 1);
  }
});

test("registered real-PDF snapshot fits exact unchanged wire budget for all three intents and maximal plan references", async t => {
  const previous = process.env.QUESTION_ACCEPTANCE_BUDGET_MODE;
  process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION;
  try {
    const receipts = [];
    for (const [i, intent] of QUESTION_INTENTS.entries()) {
      let calls = 0;
      const handler = createQuestionHandler(() => config, { fetcher: async (_url, init) => {
        calls++; const body = JSON.parse(init.body); receipts.push({ intent, ...checkQuestionInputBudget(init.body) });
        assert.equal(body.model, "deepseek-v4-pro"); assert.equal(body.max_output_tokens, 6000);
        return providerResponse(body.text.format.name.endsWith("plan") ? planOutput({ intent, referenceIds: questionReferenceIds("2026Q1"), reason: "字".repeat(160) }) : repaired());
      } });
      const draft = await (await handler.POST(req({ phase: "plan", question: QUESTION_LIVE_CASES[i].question }))).json();
      assert.equal(draft.run.status, "CONTRACT_DRAFTED", JSON.stringify(draft.run.reasons));
      const result = await (await handler.POST(req({ phase: "execute", draft, confirmed: true, snapshot }))).json();
      assert.equal(result.run.status, "PARTIAL", JSON.stringify(result.run.reasons));
      await validateQuestionRun(result.run); assert.equal(calls, 2);
    }
    assert.equal(receipts.length, 6); t.diagnostic(JSON.stringify({ transport: "synthetic-NOT-LIVE", realModelCalls: 0, receipts }));
  } finally { if (previous === undefined) delete process.env.QUESTION_ACCEPTANCE_BUDGET_MODE; else process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = previous; }
});

test("question calculations block zero and non-finite optional comparison instead of division", async () => {
  const contract = makeResearchContract(mainQuestion, planOutput(), "synthetic", new Date().toISOString());
  const normal = await resolveQuestionEvidence(contract, questionTestSnapshot()); assert.equal(normal.status, "READY");
  assert.equal(normal.evidence.calculations.find(c => c.id === "YOY-attributable_np").result.calculatedRatio,
    (normal.evidence.facts[0].value - normal.evidence.facts[0].comparisonValue) / Math.abs(normal.evidence.facts[0].comparisonValue));
  for (const invalid of [0, Infinity, -Infinity, NaN]) {
    const original = questionTestSnapshot();
    const result = { source: { sourceId: original.source.sourceId, period: original.source.period, url: original.source.url }, metrics: structuredClone(original.parser.originalMetrics), issues: [], blockers: [], canPromoteToEvidence: true };
    result.metrics.non_recurring_total.comparison = invalid;
    const create = () => createResearchSnapshot({ versionId: "V-02", parentVersionId: "V-01", createdAt: original.createdAt, reviewer: "Synthetic fixture reviewer", scope: "research", source: original.source,
      result, candidates: extractCandidates(result).map(item => ({ ...item, reviewStatus: "accepted" })) });
    let v;
    if (Number.isNaN(invalid)) {
      assert.throws(create); // Existing evidence reconciliation also rejects NaN.
      v = original; v.parser.originalMetrics.non_recurring_total.comparison = invalid;
      v.parser.reviewedMetrics.non_recurring_total.comparison = invalid;
      v.evidence.find(e => e.metricKey === "non_recurring_total").comparisonMn = invalid;
    } else v = create();
    const resolved = await resolveQuestionEvidence(contract, v); assert.equal(resolved.status, "BLOCKED");
    assert.ok(!JSON.stringify(resolved).includes("Infinity"));
    if (invalid !== 0) await assert.rejects(buildMemoContext(v));
    else await assert.doesNotReject(buildMemoContext(v)); // Question's own zero guard, not a failed fixture.
  }
});

test("rehashing edits cannot detach an answer from original output, prompt version or confirmed plan", async () => {
  for (const mutate of [r => r.answer.explanation.directAnswer.text = "归母与扣非变化需核验。",
    r => r.calls[0].promptVersion = "question-explanation.v2", r => r.events.find(e => e.event === "contract_confirmed").details.planRunId = "changed-plan",
    r => r.calls[0].rawOutput = JSON.stringify(answerOutput())]) {
    const altered = structuredClone(historical); mutate(altered);
    altered.answerSha256 = await sha256Text(canonicalJson(altered.answer));
    for (const e of altered.events) e.detailsSha256 = await sha256Text(canonicalJson(e.details));
    await assert.rejects(validateQuestionRun(altered));
  }
});
