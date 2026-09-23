import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewState, decideReview, jevJudge, reviewCandidate } from "../lib/adversarial-review.ts";
import { resolveQuestionEvidence, makeResearchContract } from "../lib/research-question.ts";
import { answerOutput, planOutput, questionTestSnapshot, mainQuestion } from "./question-test-helpers.mjs";

async function input() {
  const contract = makeResearchContract(mainQuestion, planOutput(), "request-test", new Date().toISOString());
  const resolved = await resolveQuestionEvidence(contract, questionTestSnapshot());
  assert.equal(resolved.status, "READY");
  return { context: resolved.evidence.context, explanation: answerOutput() };
}
const verdict = (patch = {}) => ({ decision: "supported", confidence: 0.94, evidenceSupports: 0.96,
  counterAddressed: 0.93, model: "jev-test", ...patch });

test("validated snapshot, citation and counter-evidence form a bounded independent review state", async () => {
  const { context, explanation } = await input();
  const state = buildReviewState(context, explanation);
  assert.equal(state.snapshotSha256, context.snapshotSha256);
  assert.ok(state.references.some(r => r.direction === "反证"));
  assert.equal(state.points.length, 4);
  assert.ok(!JSON.stringify(state).includes(context.source.url));
  const a = await reviewCandidate(context, explanation, async () => verdict());
  assert.equal(a.outcome, "PASS_CANDIDATE"); assert.equal(a.humanGate, "pending");
  assert.equal(a.stateSha256.length, 64); assert.equal(a.verdictSha256.length, 64);
  const b = await reviewCandidate(context, explanation, async () => verdict());
  assert.equal(a.stateSha256, b.stateSha256);
});

test("missing or invented counter citation stops before judge request", async () => {
  const { context, explanation } = await input();
  explanation.counterEvidence.citations = ["A-03"];
  let calls = 0;
  await assert.rejects(reviewCandidate(context, explanation, async () => { calls++; return verdict(); }), /COUNTER_EVIDENCE_OMITTED/);
  assert.equal(calls, 0);
});

test("semantic conflict blocks candidate, uncertainty and failures require review", async () => {
  const { context, explanation } = await input();
  const block = await reviewCandidate(context, explanation, async () => verdict({ decision: "contradicted", confidence: 0.9 }));
  assert.equal(block.outcome, "BLOCK");
  assert.equal(decideReview(verdict({ decision: "supported", confidence: 0.4 })).outcome, "REVIEW");
  assert.equal(decideReview(verdict({ evidenceSupports: NaN })).outcome, "REVIEW");
  const failed = await reviewCandidate(context, explanation, async () => { throw new Error("secret provider detail"); });
  assert.equal(failed.outcome, "REVIEW"); assert.deepEqual(failed.reasons, ["JUDGE_UNAVAILABLE"]);
  assert.ok(!JSON.stringify(failed).includes("secret provider detail"));
});

test("Jev adapter makes one bounded request with no SDK retry and preserves typed outcome", async () => {
  const { context, explanation } = await input(); const state = buildReviewState(context, explanation);
  let calls = 0;
  const fetcher = async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body.questions).sort(), ["counterAddressed", "decision", "evidenceSupports"]);
    assert.equal(body.state.snapshotSha256, context.snapshotSha256);
    return Response.json({ model: "jev-test", answers: {
      decision: { type: "choice", choice: "supported", confidence: 0.94, probabilities: { supported: 0.94, uncertain: 0.04, contradicted: 0.02 } },
      evidenceSupports: { type: "noul", noul: 0.96 }, counterAddressed: { type: "noul", noul: 0.93 },
    }, usage: { input_tokens: 10, output_tokens: 4 } });
  };
  assert.equal((await jevJudge(state, "synthetic-key", { fetcher, model: "jev-test" })).decision, "supported");
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(jevJudge(state, "synthetic-key", { model: "jev-test", fetcher: async () => { calls++; return new Response("failed", { status: 503 }); } }));
  assert.equal(calls, 1);
  await assert.rejects(jevJudge(state, ""), /TYPESAFE_API_KEY_REQUIRED/);
  await assert.rejects(jevJudge(state, "synthetic-key"), /PINNED_JEV_MODEL_REQUIRED/);
});
