import assert from 'node:assert/strict';
import test from 'node:test';
import { runC04Chain } from '../lib/chain-v01.ts';

function parsed(sourceId, period, attr, attrYoy, adj, adjYoy, nr) {
  return {
    source: { sourceId, period, url: 'official' },
    metrics: {
      attributable_np: { key:'attributable_np', label:'归母净利润', current:attr, comparison:1, disclosedChange:attrYoy, unit:'CNY_mn', sourceId, page:2, confidence:1 },
      adjusted_np: { key:'adjusted_np', label:'扣非归母净利润', current:adj, comparison:1, disclosedChange:adjYoy, unit:'CNY_mn', sourceId, page:2, confidence:1 },
      non_recurring_total: { key:'non_recurring_total', label:'非经常性损益合计', current:nr, unit:'CNY_mn', sourceId, page:3, confidence:1 },
    }, issues:[], blockers:[], canPromoteToEvidence:true,
  };
}

test('S-05 C-04 chain strengthens but remains professionally gated', () => {
  const r = runC04Chain(parsed('S-05','2026Q1',471.59418971,-0.0487,546.75889690,0.2439,-75.16470719), {
    runId:'REG-S05', gates:{eg01:'pending',eg02:'pending'}, valuation:{dilutedSharesMn:536.158873, peMultiples:{bear:18,base:24,bull:30}},
  });
  assert.equal(r.claim.systemSignal, '增强');
  assert.equal(r.formula?.consistent, true);
  assert.equal(r.killCriterion.currentState, 'clear');
  assert.equal(r.valuation.annualizationFactor, 4);
  assert.ok(Math.abs(r.valuation.scenarios.base.perShare - 97.8979491819396) < 1e-9);
  assert.deepEqual(r.decision.blockedGates, ['EG-01','EG-02']);
  assert.equal(r.decision.formalRecommendation, null);
  assert.deepEqual(r.graphDiff.unchangedNodeIds, ['C-01','C-02','C-03','C-05','C-06']);
});

test('S-08 preserves counter-evidence and blocks valuation when historical share count is absent', () => {
  const r = runC04Chain(parsed('S-08','2024H1',872.12618617,0.0636,765.76531177,0.4053,106.3608744), {
    runId:'REG-S08', gates:{eg01:'pending',eg02:'pending'}, valuation:{dilutedSharesMn:null, peMultiples:{bear:18,base:24,bull:30}},
  });
  assert.equal(r.claim.systemSignal, '增强');
  assert.equal(r.evidence.find((e)=>e.id.endsWith('-NR')).direction, '反证');
  assert.equal(r.evidence.find((e)=>e.id.endsWith('-SPREAD')).direction, '支持');
  assert.equal(r.formula?.consistent, true);
  assert.equal(r.valuation.annualizationFactor, 2);
  assert.ok(r.valuation.blockedGates.includes('VALUATION_SHARE_COUNT_MISSING'));
  assert.equal(r.valuation.scenarios, null);
  assert.equal(r.decision.formalRecommendation, null);
});

test('K-07 triggers only after two consecutive non-positive adjusted-profit periods', () => {
  const r = runC04Chain(parsed('T-01','2027Q1',100,0.05,90,-0.02,10), {
    runId:'NEG-K07', priorAdjustedYoy:[-0.01], gates:{eg01:'pending',eg02:'pending'}, valuation:{},
  });
  assert.equal(r.killCriterion.consecutiveNonPositivePeriods, 2);
  assert.equal(r.killCriterion.currentState, 'triggered');
  assert.equal(r.claim.systemSignal, '削弱');
  assert.equal(r.valuation.earningsBasis, 'attributable_np');
});

test('parser blocker prevents any evidence promotion or formula propagation', () => {
  const blocked = parsed('T-BLOCK','2027Q1',100,0.1,90,0.2,10);
  blocked.canPromoteToEvidence = false;
  blocked.blockers = [{ code:'REQUIRED_FIELD_MISSING', severity:'FAIL', message:'blocked' }];
  const r = runC04Chain(blocked, { runId:'NEG-BLOCK', gates:{eg01:'pending',eg02:'pending'} });
  assert.equal(r.status, 'blocked');
  assert.equal(r.evidence.length, 0);
  assert.equal(r.formula, null);
  assert.ok(r.decision.blockedGates.includes('PARSER_OR_REQUIRED_EVIDENCE'));
  assert.equal(r.decision.formalRecommendation, null);
});
