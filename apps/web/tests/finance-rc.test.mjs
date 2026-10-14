import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { finiteChange } from '../../../lib/financial-numbers.ts';
import { parseFinancialReport as parseFinancialReportV04 } from '../../../lib/parser-v04.ts';
import { parseFinancialReportV05 } from '../../../lib/parser-v05.ts';
import { parseFinancialReport as legacyParse } from '../lib/parser-v04.ts';
import { runC04Chain } from '../../../lib/chain-v01.ts';
import { parseResearchReport, extractCandidates, reviewAndRun } from '../lib/research-engine.ts';
import { verifiedSampleItems } from '../lib/sample-s05.ts';
import { getSourceRecord } from '../lib/source-records.ts';

const source=getSourceRecord('S-05');
const parsed=()=>parseResearchReport(verifiedSampleItems,source);
const context=(valuation={})=>({runId:'NOT-LIVE-FINANCE',gates:{eg01:'pending',eg02:'pending'},valuation:{dilutedSharesMn:536.158873,peMultiples:{bear:18,base:24,bull:30},...valuation}});

test('H-01 zero, negative, missing, strings, non-finite and overflowing comparisons fail closed',()=>{
 for(const value of [0,-0,null,undefined,NaN,Infinity,-Infinity,'0','-0',' 0 ','０','Infinity','NaN','', '100']) assert.equal(finiteChange(100,value),null);
 for(const value of [null,undefined,NaN,Infinity,-Infinity,'100']) assert.equal(finiteChange(value,100),null);
 assert.equal(finiteChange(-90,-100),0.1);assert.equal(finiteChange(-110,-100),-0.1);
 assert.equal(finiteChange(120,100),0.2);assert.equal(finiteChange(1e308,-1e308),null);
 assert.equal(finiteChange(100,Number.MIN_VALUE),null);
 // Ratio rows remain percentage-point subtraction, including zero.
 assert.equal(finiteChange(0.05,0,true),0.05);
});

test('H-01 zero and missing PDF cells cannot pass strict parser or human-review gate',()=>{
 for(const value of ['0','-0','0.00',' 0 ','—','Infinity','NaN','9'.repeat(320)]) {
  const items=verifiedSampleItems.map(i=>i.y===630&&i.x===550?{...i,str:value}:i);
  for(const parse of [parseResearchReport,parseFinancialReportV04,parseFinancialReportV05,legacyParse]) { const result=parse(items,source);assert.equal(result.canPromoteToEvidence,false,value); }
 }
 for(const basis of [0,null,undefined,Infinity,-Infinity,NaN,'0']) {
  const result=parsed();result.metrics.attributable_np.comparison=basis;
  const candidates=extractCandidates(result).map(i=>({...i,reviewStatus:'accepted'}));
  const reviewed=reviewAndRun(result,candidates,'BAD-BASIS');
  assert.equal(reviewed.canPromoteToEvidence,false,String(basis));assert.equal(reviewed.chain,null);
 }
});

test('H-02 every invalid valuation blocks the whole scenario set with no non-finite result',()=>{
 const cases=[];
 for(const value of [0,-1,null,NaN,Infinity,-Infinity,'536','',undefined]) cases.push({dilutedSharesMn:value});
 for(const value of [0,-1,NaN,Infinity,-Infinity,'4','']) cases.push({annualizationFactor:value});
 for(const name of ['bear','base','bull']) for(const value of [0,-1,null,NaN,Infinity,-Infinity,'18','',undefined]) cases.push({peMultiples:{bear:18,base:24,bull:30,[name]:value}});
 cases.push({peMultiples:null},{peMultiples:{bear:30,base:24,bull:18}},{peMultiples:{bear:18,base:31,bull:30}}, {annualizationFactor:1e308},{peMultiples:{bear:1e308,base:1e308,bull:1e308}},{dilutedSharesMn:Number.MIN_VALUE});
 for(const valuation of cases){const r=runC04Chain(parsed(),context(valuation));assert.equal(r.valuation.status,'blocked');assert.equal(r.valuation.scenarios,null,JSON.stringify(valuation));assert.equal(r.valuation.annualizedEarnings,null);assert.ok(r.valuation.annualizationFactor === null || Number.isFinite(r.valuation.annualizationFactor));}
 for(const value of [NaN,Infinity,-Infinity,'100',null]) {const input=parsed();input.metrics.adjusted_np.current=value;const r=runC04Chain(input,context());assert.equal(r.status,'blocked');assert.equal(r.valuation.scenarios,null);}
});

test('H-02 S-05 and S-06 retain exact normal formula, scenarios, rounding and professional limits',async()=>{
 for(const id of ['s-05','s-06']){
  const fixture=JSON.parse(await readFile(new URL(`../../../tests/fixtures/parser-layout/${id}.json`,import.meta.url)));
  const result=parseResearchReport(fixture.items,fixture.source);
  const r=runC04Chain(result,context());
  const factor=id==='s-05'?4:2;const earnings=result.metrics.adjusted_np.current;
  assert.equal(r.valuation.annualizationFactor,factor);
  for(const [name,pe] of Object.entries({bear:18,base:24,bull:30})) assert.deepEqual(r.valuation.scenarios[name],{pe,equityValueMn:earnings*factor*pe,perShare:earnings*factor*pe/536.158873});
  assert.deepEqual(r.decision.blockedGates,['EG-01','EG-02']);assert.equal(r.decision.formalRecommendation,null);
  assert.equal(r.formula.calculatedAdjusted,result.metrics.attributable_np.current-result.metrics.non_recurring_total.current);
 }
});

test('H-02 finite negative earnings remain valid without changing the earnings-sign policy',()=>{const input=parsed();input.metrics.attributable_np.current=-100;input.metrics.adjusted_np.current=-90;input.metrics.non_recurring_total.current=-10;input.metrics.adjusted_np.disclosedChange=-0.1;const r=runC04Chain(input,context());assert.equal(r.killCriterion.currentState,'watch');assert.equal(r.valuation.earningsBasis,'adjusted_np');assert.equal(r.valuation.scenarios.base.equityValueMn,-90*4*24);});
