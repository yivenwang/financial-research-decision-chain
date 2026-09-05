import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV06Strict } from '../lib/parser-v06-strict.ts';
import { parseFinancialReportV07Strict } from '../lib/parser-v07-strict.ts';
import { runC04Chain } from '../lib/chain-v01.ts';

const NORMAL = [
  { sourceId:'S-05', period:'2026Q1', url:'https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF' },
  { sourceId:'S-06', period:'2026H1', url:'https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF' },
  { sourceId:'S-07', period:'2025H1', url:'https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF' },
  { sourceId:'S-08', period:'2024H1', url:'https://static.cninfo.com.cn/finalpage/2024-08-30/1221057646.PDF' },
  { sourceId:'S-09', period:'2022H1', url:'https://static.cninfo.com.cn/finalpage/2022-08-25/1214390466.PDF' },
];
const S10={ sourceId:'S-10', period:'2021H1', url:'https://static.cninfo.com.cn/finalpage/2021-08-20/1210793830.PDF' };

async function extract(source){
  const response=await fetch(source.url);
  assert.equal(response.ok,true,`download failed ${source.sourceId}: ${response.status}`);
  const doc=await pdfjs.getDocument({data:new Uint8Array(await response.arrayBuffer()),disableWorker:true}).promise;
  const items=[];
  for(let p=1;p<=doc.numPages;p+=1){
    const page=await doc.getPage(p); const content=await page.getTextContent();
    for(const raw of content.items){
      if(typeof raw.str!=='string'||!Array.isArray(raw.transform)) continue;
      const x=Number(raw.transform[4]); const y=Number(raw.transform[5]);
      if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
      items.push({str:raw.str,x,y,page:p,width:typeof raw.width==='number'?raw.width:undefined});
    }
  }
  return items;
}

for(const source of NORMAL){
  test(`V0.7 preserves V0.6 output for ${source.sourceId}`,async()=>{
    const items=await extract(source);
    const oldR=parseFinancialReportV06Strict(items,source);
    const newR=parseFinancialReportV07Strict(items,source);
    assert.equal(oldR.canPromoteToEvidence,true,JSON.stringify(oldR.blockers));
    assert.equal(newR.canPromoteToEvidence,true,JSON.stringify(newR.blockers));
    assert.deepEqual(newR.metrics,oldR.metrics);
    assert.deepEqual(newR.blockers,oldR.blockers);
  });
}

test('V0.7 parses S-10 older adjusted-profit label and closes F-02',async()=>{
  const items=await extract(S10);
  const r=parseFinancialReportV07Strict(items,S10);
  assert.equal(r.canPromoteToEvidence,true,JSON.stringify(r.blockers));
  assert.equal(r.blockers.length,0);
  const m=r.metrics.adjusted_np;
  assert.ok(m);
  assert.ok(Math.abs(m.current-300.27415771)<1e-8);
  assert.ok(Math.abs(m.comparison-244.47214143)<1e-8);
  assert.ok(Math.abs(m.disclosedChange-0.2283)<1e-8);
  assert.ok(Math.abs(r.metrics.non_recurring_total.current-108.02267662)<1e-8);

  const chain=runC04Chain(r,{runId:'REG-S10-V07',priorAdjustedYoy:[],accountingAdjustmentRecurring:null,gates:{eg01:'pending',eg02:'pending'},valuation:{dilutedSharesMn:null,peMultiples:{bear:18,base:24,bull:30}}});
  assert.equal(chain.status,'ready-for-human-review');
  assert.equal(chain.formula.consistent,true);
  assert.equal(chain.decision.action,'继续研究');
  assert.equal(chain.decision.formalRecommendation,null);
  assert.ok(chain.decision.blockedGates.includes('EG-01'));
  assert.ok(chain.decision.blockedGates.includes('EG-02'));
});
