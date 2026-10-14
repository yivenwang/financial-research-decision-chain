import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runC04ChainReviewed, REVIEW_CHAIN_VERSION } from '../../../lib/chain-professional-review.ts';
import { runC04ChainK07B, K07_B_VERSION } from '../../../lib/chain-k07-b.ts';
import { reviewAndRun, createResearchSnapshot, extractCandidates } from '../lib/research-engine.ts';
import { buildMemoContext, canonicalJson } from '../lib/research-memo.ts';
import { createRollbackSnapshot } from '../lib/research-versions.ts';
import { validateQuestionRun } from '../lib/research-question-storage.ts';
import { validateQuestionExplanation as validateV10Explanation, validateQuestionOutput, questionExplanationSchema, questionPromptInstructions } from '../lib/research-question.ts';
import { questionTestSnapshot, answerOutput, syntheticQuestionWire } from './question-test-helpers.mjs';
import { controlledQuestionPoints } from '../lib/question-explanation-contract.ts';
import { assertArchiveSafe } from '../scripts/run-question-batch.mjs';

// Preserve historical free-prose semantics; current v11 has its own closed-contract regressions.
const validateQuestionExplanation=(value,context,version="question-explanation.v10",contract)=>validateV10Explanation(value,context,version,contract);


assert.notEqual(process.env.LIVE_MODEL_E2E, '1');
const snapshot = questionTestSnapshot();
const result = { source: { sourceId:'S-05',period:'2026Q1',url:snapshot.source.url },
  metrics:snapshot.parser.originalMetrics,issues:[],blockers:[],canPromoteToEvidence:true };
const currentPeriod = { companyId:'300866.SZ',period:'2026Q1',periodBasis:'single-quarter',
  profitBasis:'adjusted-attributable',unit:'CNY_mn',yoy:result.metrics.adjusted_np.disclosedChange,
  evidenceId:'EV-S-05-C04-ADJ',review:{status:'accepted',scope:'evidence-only'} };
const opinion = (patch={}) => ({
  recordId:'synthetic-opinion-NOT-signature', workflow:'completed',
  source:{kind:'human-opinion',author:'Synthetic reviewer NOT authenticated',reference:'Synthetic review evidence',
    reviewedAt:'2026-10-13T00:00:00Z'},
  scope:{companyId:'300866.SZ',sourceId:'S-05',period:'2026Q1'},
  limitations:['Synthetic state combination only; not actual professional approval'],
  assumption:{conclusion:'rejected',evidenceIds:['EV-S-05-C04-ADJ'],rationale:'Does not establish core economic quality'},
  accounting:[{item:'Synthetic whole-normalization opinion',amountMn:-75.16470719,
    classification:'recurring',coverage:'entire-normalization',evidenceIds:['EV-S-05-C04-NR'],
    rationale:'Synthetic recurring conclusion with explicit scope'}], ...patch });
const run = review => runC04ChainReviewed(result, {runId:'synthetic-state-combination',currentPeriod,priorPeriods:[],
  gates:{eg01:'approved',eg02:'approved'},professionalReview:review,
  valuation:{dilutedSharesMn:100,peMultiples:{bear:18,base:24,bull:30}}});

test('completed review can reject the hypothesis while preserving and applying independent recurring recognition', () => {
  for (const [conclusion,status] of [['accepted','approved'],['qualified','qualified'],['rejected','rejected'],['insufficient','insufficient-evidence']]) {
    const review=opinion();review.assumption.conclusion=conclusion;
    const before=canonicalJson(review), chain=run(review);
    assert.equal(chain.assumption.status,status);
    assert.equal(chain.killCriterion.accountingState,'triggered');
    assert.equal(chain.valuation.earningsBasis,'attributable_np');
    assert.deepEqual(chain.professionalReview,review);
    assert.equal(canonicalJson(review),before);
    assert.equal(chain.professionalReview.workflow,'completed');
    assert.equal(chain.decision.formalRecommendation,null);
  }
});

test('AI completion and pending review never close gates or promote a hypothesis; opinions remain saved', () => {
  for (const review of [opinion({workflow:'pending'}),opinion({source:{...opinion().source,kind:'ai-assisted'}})]) {
    const chain=run(review);
    assert.equal(chain.assumption.status,'pending-review');
    assert.equal(chain.killCriterion.accountingState,'unknown');
    assert.deepEqual(chain.professionalReview,review);
    if(review.source.kind==='ai-assisted') assert.deepEqual(chain.decision.blockedGates,['EG-01','EG-02']);
  }
});

test('partial, conflicting and insufficient classifications retain their evidence without broadening normalization', () => {
  for(const change of [{coverage:'item-only'},{classification:'unknown'}]) {
    const review=opinion();Object.assign(review.accounting[0],change);
    const chain=run(review);assert.equal(chain.killCriterion.accountingState,'unknown');
    assert.deepEqual(chain.professionalReview.accounting,review.accounting);
  }
  const review=opinion();review.accounting.push({...review.accounting[0],item:'conflicting-synthetic-opinion',classification:'non-recurring'});
  assert.equal(run(review).killCriterion.accountingState,'unknown');
  for(const scope of [{...review.scope,period:'2026H1'},{...review.scope,sourceId:'S-06'}]) {
    assert.throws(()=>run(opinion({scope})),/PROFESSIONAL_REVIEW_INVALID/);
  }
  const bad=opinion();bad.accounting[0].amountMn=Infinity;
  assert.throws(()=>run(bad),/ARCHIVE_INVALID_NUMBER/);
  const fabricated=opinion();fabricated.source.identityVerified=true;
  assert.throws(()=>run(fabricated),/PROFESSIONAL_REVIEW_INVALID/);
});

test('current positive quantitative condition is clear independently of missing history and accounting', () => {
  const chain=runC04ChainReviewed(result,{runId:'positive-test',currentPeriod,gates:{eg01:'pending',eg02:'pending'}});
  assert.equal(chain.killCriterion.quantitativeState,'clear');assert.equal(chain.killCriterion.currentState,'unknown');
  assert.match(chain.killCriterion.reviewNote,/已中断以本期结束/);
  assert.doesNotMatch(chain.killCriterion.reviewNote,/不能排除或确认连续触发/);
  assert.equal(chain.killCriterion.accountingState,'unknown');
});

test('filling shares, historic multiples and gate flags cannot publish a forecast or partial valuation', () => {
  const chain=run(opinion());
  assert.equal(chain.valuation.status,'blocked');assert.equal(chain.valuation.scenarios,null);
  assert.equal(chain.valuation.annualizedEarnings,null);assert.equal(chain.valuation.publishable,false);
  assert.ok(chain.valuation.blockedGates.includes('VALUATION_EVIDENCE_UNVERIFIED'));
  assert.equal(chain.decision.formalRecommendation,null);
  assert.ok(chain.decision.blockedGates.includes('EG-02'));
  const absent=run(undefined);
  assert.equal(absent.assumption.status,'pending-review');
  assert.deepEqual(absent.decision.blockedGates,['EG-01','EG-02']);
});

test('future opinion snapshot and rollback preserve provenance while V0.2 and all archived runs replay unchanged', async () => {
  const candidates=extractCandidates(result).map(row=>({...row,reviewStatus:'accepted'}));
  const review=opinion({source:{...opinion().source,kind:'ai-assisted'}});
  const next=createResearchSnapshot({versionId:'V-03',parentVersionId:'V-01',
    createdAt:'2026-10-13T00:00:00Z',reviewer:'Synthetic evidence-only reviewer',source:snapshot.source,
    result,candidates,scope:'research',professionalReview:review});
  assert.equal(next.chainVersion,REVIEW_CHAIN_VERSION);
  assert.deepEqual(next.chain.professionalReview,review);
  await buildMemoContext(next);
  const supported=createResearchSnapshot({versionId:'V-04',parentVersionId:'V-03',createdAt:'2026-10-13T00:00:00Z',
    reviewer:'Synthetic evidence reviewer',source:snapshot.source,result,candidates,scope:'research',
    professionalReview:opinion(),professionalGates:{eg01:'approved',eg02:'pending'}});
  assert.equal(supported.chain.assumption.status,'rejected');
  assert.equal(supported.chain.killCriterion.accountingState,'triggered');
  const supportedContext=await buildMemoContext(supported);
  assert.match(supportedContext.references.find(row=>row.id==='A-03').excerpt,/状态：不认可/);
  assert.match(controlledQuestionPoints(supportedContext).inference.texts[0],/不认可核心经营代理假设/);
  assert.match(supportedContext.references.find(row=>row.id==='K-07').excerpt,/会计认定经常性/);
  assert.deepEqual(supported.chain.professionalGates,{eg01:'approved',eg02:'pending'});
  const old=structuredClone(snapshot);old.chainVersion=K07_B_VERSION;
  const oldRun=reviewAndRun(result,candidates,old.chain.runId,K07_B_VERSION);
  old.chain=oldRun.chain;old.blockedGates=oldRun.chain.decision.blockedGates;
  const before=canonicalJson(old);await buildMemoContext(old);
  const rollback=createRollbackSnapshot(old,[old,next],next.versionId,'research');
  assert.equal(rollback.chainVersion,K07_B_VERSION);assert.deepEqual(rollback.chain,old.chain);
  await buildMemoContext(rollback);assert.equal(canonicalJson(old),before);
  assert.deepEqual(runC04ChainK07B(result,{runId:old.chain.runId,currentPeriod,gates:{eg01:'pending',eg02:'pending'}}),old.chain);
  for(const id of ['38047109824','38062132788','38108168529','38138604171','38381793600','38390408233']) {
    const run=JSON.parse(readFileSync(new URL('./fixtures/question-live-'+id+'/request-02.json',import.meta.url),'utf8')).record.run;
    const bytes=canonicalJson(run);await validateQuestionRun(run);assert.equal(canonicalJson(run),bytes);
  }
});

test('current financial negative examples remain blocked without repairing text or selected evidence', async () => {
  const context=await buildMemoContext(snapshot);
  const schema=questionExplanationSchema(context);
  const examples=[
    ['税前项目范围差归因于所得税和少数股东影响。','PRETAX_SCOPE_ATTRIBUTION_UNSUPPORTED'],
    ['机械年化就是已验证的全年预测。','MECHANICAL_ANNUALIZATION_PROMOTED'],
    ['本次输入缺少明细，但报告没有解释。','DISCLOSURE_SCOPE_OVERCLAIM'],
    ['归母下降主要受非经常性损益拖累。','UNSUPPORTED_YOY_ATTRIBUTION'],
  ];
  for(const [text,code] of examples) {
    const answer=answerOutput();answer.directAnswer={text,citations:['EV-S-05-C04-ATTR','EV-S-05-C04-ADJ','EV-S-05-C04-NR','F-02','Valuation-B5','A-03']};
    const wire=syntheticQuestionWire(answer,'question-explanation.v10'),before=canonicalJson(wire);
    assert.throws(()=>validateQuestionOutput(wire,context,'question-explanation.v10'),new RegExp(code));
    assert.equal(canonicalJson(wire),before);
  }
  for(const text of ['税前项目范围差不能归因于所得税或少数股东。','机械年化不是盈利预测，估值仍待复核。']) {
    const answer=answerOutput();answer.directAnswer={text,citations:['Valuation-B5','EV-S-05-C04-NR']};
    assert.doesNotThrow(()=>validateQuestionExplanation(answer,context));
  }
  for(const text of ['A-03已完成','金额１２３％','S-05与C-04','利润<扣非','利润>扣非']) {
    assert.equal(new RegExp(schema.properties.directAnswer.properties.text.pattern).test(text),false);
    const answer=answerOutput();answer.directAnswer.text=text;
    assert.throws(()=>validateQuestionExplanation(answer,context),/ANSWER_CITATION_OR_TEXT_INVALID/);
  }
  assert.match(questionPromptInstructions('question-explanation.v9'),/公司解释须有输入依据/);
  const credential=opinion();credential.limitations.push('nested {"ＡＰＩ＿ＫＥＹ":"synthetic-value"}');
  assert.throws(()=>assertArchiveSafe(credential,[]),/ARCHIVE_CREDENTIAL_FIELD_BLOCKED/);
});
