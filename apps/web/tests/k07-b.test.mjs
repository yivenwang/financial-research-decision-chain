import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runC04Chain } from '../../../lib/chain-v01.ts';
import { REVIEW_CHAIN_VERSION } from '../../../lib/chain-professional-review.ts';
import { runC04ChainK07B } from '../../../lib/chain-k07-b.ts';
import { buildMemoContext, canonicalJson } from '../lib/research-memo.ts';
import { resolveQuestionEvidence } from '../lib/research-question.ts';
import { questionTestSnapshot, questionTestConfig, questionRequest, planOutput, answerOutput, providerResponse } from './question-test-helpers.mjs';
import { createRollbackSnapshot } from '../lib/research-versions.ts';
import { extractCandidates, reviewAndRun } from '../lib/research-engine.ts';
import { createQuestionHandler } from '../lib/research-question.server.ts';
import { questionReferenceIds } from '../lib/research-question.ts';
import { QUESTION_BUDGET_VERSION, checkQuestionInputBudget } from '../lib/question-batch-budget.ts';
import { runBoundedQuestionBatch, verifyLiveQuestionPhase, assertArchiveSafe } from '../scripts/run-question-batch.mjs';

const period = (name, yoy = -0.1, patch = {}) => ({ companyId: '300866.SZ', period: name,
  periodBasis: 'single-quarter', profitBasis: 'adjusted-attributable', unit: 'CNY_mn', yoy,
  evidenceId: `EV-${name}-ADJ`, review: { status: 'accepted', scope: 'evidence-only' }, ...patch });
const parsed = (name = '2027Q1', yoy = -0.1) => ({ source: { sourceId: 'T-K07', period: name, url: 'synthetic' },
  metrics: {
    attributable_np: { key: 'attributable_np', current: 100, disclosedChange: -0.2, page: 2 },
    adjusted_np: { key: 'adjusted_np', current: 90, disclosedChange: yoy, page: 2 },
    non_recurring_total: { key: 'non_recurring_total', current: 10, page: 3 },
  }, issues: [], blockers: [], canPromoteToEvidence: true });
const run = (yoy = -0.1, priorPeriods = [], patch = {}) => runC04ChainK07B(parsed('2027Q1', yoy), {
  runId: 'synthetic-K07-B', gates: { eg01: 'pending', eg02: 'pending' },
  valuation: { dilutedSharesMn: 100, peMultiples: { bear: 18, base: 24, bull: 30 } },
  currentPeriod: period('2027Q1', yoy, { evidenceId: 'EV-T-K07-C04-ADJ' }), priorPeriods, ...patch });

test('first non-positive period watches and weakens without changing earnings basis', () => {
  for (const yoy of [0, -0.1]) {
    const r = run(yoy);
    assert.equal(r.killCriterion.currentState, 'watch');
    assert.equal(r.killCriterion.sequenceStatus, 'missing');
    assert.equal(r.claim.systemSignal, '削弱');
    assert.equal(r.valuation.earningsBasis, 'adjusted_np');
    assert.equal(r.valuation.scenarios.base.equityValueMn, 90 * 4 * 24);
    assert.equal(r.claim.humanFinalState, '成立');
    assert.equal(r.decision.formalRecommendation, null);
  }
});

test('two accepted comparable periods including year rollover trigger and use attributable earnings', () => {
  for (const yoy of [0, -0.1]) {
    const r = run(yoy, [period('2026Q4', 0)]);
    assert.equal(r.killCriterion.sequenceStatus, 'verified');
    assert.equal(r.killCriterion.currentState, 'triggered');
    assert.equal(r.killCriterion.consecutiveNonPositivePeriods, 2);
    assert.equal(r.valuation.earningsBasis, 'attributable_np');
    assert.equal(r.valuation.scenarios.base.equityValueMn, 100 * 4 * 24);
    assert.deepEqual(r.decision.blockedGates, ['EG-01', 'EG-02']);
  }
});

test('unreviewed, gaps, mixed company/basis/unit, duplicates and non-finite prior cannot trigger', () => {
  for (const rows of [
    [period('2026Q3')], [period('2026Q4', NaN)], [period('2026Q4', Infinity)],
    [period('2026Q4', '-0.1')], [period('2026Q4', -0.1, { review: { status: 'pending' } })],
    [period('2026Q4', -0.1, { companyId: 'another-company' })],
    [period('2026Q4', -0.1, { unit: 'CNY' })],
    [period('2026Q4', -0.1, { profitBasis: 'attributable' })],
    [period('2026H1', -0.1, { periodBasis: 'cumulative-half-year' })],
    [period('2026Q4'), period('2026Q4')], [period('2026Q4'), period('2026Q3')], [null],
  ]) {
    const r = run(-0.1, rows);
    assert.equal(r.killCriterion.sequenceStatus, 'invalid', JSON.stringify(rows));
    assert.equal(r.killCriterion.currentState, 'watch');
    assert.equal(r.valuation.earningsBasis, 'adjusted_np');
  }
  assert.equal(run(-0.1, [], { priorAdjustedYoy: [-0.1] }).killCriterion.currentState, 'watch');
});

test('future snapshot supports all six synthetic phases inside the existing wire budget', async t => {
  const snapshot = questionTestSnapshot(), receipts = [];
  const previous = process.env.QUESTION_ACCEPTANCE_BUDGET_MODE;
  process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = QUESTION_BUDGET_VERSION;
  t.after(() => { if (previous === undefined) delete process.env.QUESTION_ACCEPTANCE_BUDGET_MODE; else process.env.QUESTION_ACCEPTANCE_BUDGET_MODE = previous; });
  const result = await runBoundedQuestionBatch({ commitSha: '0'.repeat(40),
    persist: async value => assertArchiveSafe(value, []), archive: async (_index, value) => assertArchiveSafe(value, []),
    executePhase: async ({ spec, phase, draft }) => {
      const handler = createQuestionHandler(() => questionTestConfig, { fetcher: async (_url, init) => {
        receipts.push({ intent: spec.intent, phase, ...checkQuestionInputBudget(init.body) });
        return providerResponse(phase === 'plan' ? planOutput({ intent: spec.intent,
          referenceIds: questionReferenceIds('2026Q1'), company: 'Anker Innovations', reason: '💡'.repeat(160) }) :
          answerOutput({ sufficiency: spec.intent === 'CHANGE_EXPLAIN' ? 'partial' : 'complete' }));
      } });
      const response = await handler.POST(questionRequest(phase === 'plan' ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot }));
      const data = await response.json();
      const audit = await verifyLiveQuestionPhase({ spec, phase, response: { httpStatus: response.status, data }, snapshot, draft });
      return { ok: true, data, audit, record: { run: data.run } };
    } });
  assert.equal(result.status, 'technical-completed-awaiting-content-review', JSON.stringify(result.requests));
  assert.equal(receipts.length, 6);
  assert.equal(result.maxRequests, 6);
  assert.ok(receipts.every(r => r.estimatedInputTokens <= 16000));
  t.diagnostic(JSON.stringify({ transport: 'synthetic-NOT-LIVE', realModelCalls: 0, receipts }));
});

test('positive period resets count and missing current evidence is unknown', () => {
  const positive = run(0.1, [period('2026Q4')]);
  assert.equal(positive.killCriterion.quantitativeState, 'clear');
  assert.equal(positive.killCriterion.consecutiveNonPositivePeriods, 0);
  assert.equal(positive.killCriterion.currentState, 'unknown', 'pending accounting is not a risk clearance');
  const missing = run(-0.1, [period('2026Q4')], { currentPeriod: null });
  assert.equal(missing.killCriterion.quantitativeState, 'unknown');
  assert.equal(missing.valuation.earningsBasis, 'adjusted_np');
});

test('only approved accounting recognition triggers immediately without quantitative history', () => {
  assert.equal(run(0.1, [], { accountingAdjustmentRecurring: true }).killCriterion.currentState, 'unknown');
  const r = run(0.1, [], { accountingAdjustmentRecurring: true, gates: { eg01: 'approved', eg02: 'pending' } });
  assert.equal(r.killCriterion.currentState, 'triggered');
  assert.equal(r.valuation.earningsBasis, 'attributable_np');
  assert.equal(r.decision.formalRecommendation, null);
});

test('new snapshots use version B while legacy output, context and rollback retain original bytes', async () => {
  const next = questionTestSnapshot();
  assert.equal(next.chainVersion, REVIEW_CHAIN_VERSION);
  const nextContext = await buildMemoContext(next);
  assert.match(nextContext.references.find(r => r.id === 'K-07').excerpt, /首次|连续两个/);
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/question-live-38047109824/request-02.json', import.meta.url), 'utf8')).record.run;
  const before = canonicalJson(legacy);
  const snapshot = legacy.answer.evidence.snapshot;
  assert.deepEqual(await buildMemoContext(snapshot), legacy.answer.evidence.context);
  const replay = await resolveQuestionEvidence(legacy.contract, snapshot);
  assert.equal(replay.status, 'READY');
  assert.deepEqual(replay.evidence, legacy.answer.evidence);
  const rollback = createRollbackSnapshot(snapshot, [snapshot, next], next.versionId, 'research');
  assert.equal(rollback.chainVersion, 'V0.1');
  assert.deepEqual(rollback.chain, snapshot.chain);
  await buildMemoContext(rollback);
  assert.equal(canonicalJson(legacy), before);
  const corrupt = structuredClone(next); corrupt.chainVersion = 'V0.1';
  await assert.rejects(buildMemoContext(corrupt), /复算/);
});

test('ordinary positive financial calculations remain identical to frozen v1', () => {
  for (const [name, basis] of [['2027Q1', 'single-quarter'], ['2027H1', 'cumulative-half-year']]) {
    const p = parsed(name, 0.1);
    const context = { runId: 'normal-regression', gates: { eg01: 'pending', eg02: 'pending' },
      valuation: { dilutedSharesMn: 100, peMultiples: { bear: 18, base: 24, bull: 30 } } };
    const old = runC04Chain(p, context);
    const next = runC04ChainK07B(p, { ...context, currentPeriod: period(name, 0.1, { periodBasis: basis, evidenceId: 'EV-T-K07-C04-ADJ' }) });
    for (const key of ['evidence', 'formula', 'valuation', 'claim', 'assumption', 'decision']) assert.deepEqual(next[key], old[key]);
  }
});

test('an unlabeled Q2 or Q3 upload cannot silently become a single-quarter series', () => {
  const snapshot = questionTestSnapshot();
  for (const name of ['2026Q2', '2026Q3']) {
    const p = { source: { sourceId: 'S-05', period: name, url: snapshot.source.url },
      metrics: snapshot.parser.originalMetrics, blockers: [], issues: [], canPromoteToEvidence: true };
    const candidates = extractCandidates(p).map(row => ({ ...row, reviewStatus: 'accepted' }));
    const r = reviewAndRun(p, candidates, 'ambiguous-period');
    assert.equal(r.chain.killCriterion.quantitativeState, 'unknown');
    assert.equal(r.chain.killCriterion.currentState, 'unknown');
  }
});
