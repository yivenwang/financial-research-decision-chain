import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV05Strict } from '../lib/parser-v05-strict.ts';
import { parseFinancialReportV06Strict } from '../lib/parser-v06-strict.ts';
import { runC04Chain } from '../lib/chain-v01.ts';

const NORMAL = [
  { sourceId:'S-05', period:'2026Q1', url:'https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF' },
  { sourceId:'S-06', period:'2026H1', url:'https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF' },
  { sourceId:'S-07', period:'2025H1', url:'https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF' },
  { sourceId:'S-08', period:'2024H1', url:'https://static.cninfo.com.cn/finalpage/2024-08-30/1221057646.PDF' },
];

const S09 = { sourceId:'S-09', period:'2022H1', url:'https://static.cninfo.com.cn/finalpage/2022-08-25/1214390466.PDF' };

async function extract(source) {
  const response = await fetch(source.url);
  assert.equal(response.ok, true, `download failed ${source.sourceId}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const doc = await pdfjs.getDocument({ data:bytes, disableWorker:true }).promise;
  const items = [];
  for (let pageNumber=1; pageNumber<=doc.numPages; pageNumber+=1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (typeof raw.str !== 'string' || !Array.isArray(raw.transform)) continue;
      const x=Number(raw.transform[4]); const y=Number(raw.transform[5]);
      if (!Number.isFinite(x)||!Number.isFinite(y)) continue;
      items.push({str:raw.str,x,y,page:pageNumber,width:typeof raw.width==='number'?raw.width:undefined});
    }
  }
  return items;
}

for (const source of NORMAL) {
  test(`V0.6 preserves V0.5 output for ${source.sourceId}`, async () => {
    const items = await extract(source);
    const oldResult = parseFinancialReportV05Strict(items, source);
    const newResult = parseFinancialReportV06Strict(items, source);
    assert.equal(oldResult.canPromoteToEvidence, true, JSON.stringify(oldResult.blockers));
    assert.equal(newResult.canPromoteToEvidence, true, JSON.stringify(newResult.blockers));
    assert.deepEqual(newResult.metrics, oldResult.metrics);
    assert.deepEqual(newResult.blockers, oldResult.blockers);
  });
}

test('V0.6 parses S-09 restated comparison columns and closes chain safely', async () => {
  const items = await extract(S09);
  const r = parseFinancialReportV06Strict(items, S09);
  assert.equal(r.canPromoteToEvidence, true, JSON.stringify(r.blockers));
  assert.equal(r.blockers.length, 0);

  const expected = {
    revenue:[5887.37135689,5370.57688861,0.0962],
    attributable_np:[575.75575010,408.29683433,0.4101],
    adjusted_np:[306.08767430,300.27415771,0.0194],
    operating_cash_flow:[86.71446400,-116.24675972,1.7460],
    basic_eps:[1.42,1.00,0.42],
    diluted_eps:[1.42,1.00,0.42],
    roe:[0.0917,0.0744,0.0173],
    total_assets:[8992.55826579,8474.23192067,0.0612],
    attributable_equity:[6296.63777953,6049.42270276,0.0409],
  };
  for (const [key,[current,comparison,change]] of Object.entries(expected)) {
    const m=r.metrics[key];
    assert.ok(m, key);
    assert.ok(Math.abs(m.current-current)<1e-8, `${key} current`);
    assert.ok(Math.abs(m.comparison-comparison)<1e-8, `${key} comparison`);
    assert.ok(Math.abs(m.disclosedChange-change)<1e-8, `${key} change`);
  }
  assert.ok(Math.abs(r.metrics.non_recurring_total.current-269.66807580)<1e-8);

  const chain = runC04Chain(r, {
    runId:'REG-S09-V06',
    gates:{eg01:'pending',eg02:'pending'},
    valuation:{dilutedSharesMn:null,peMultiples:{bear:18,base:24,bull:30}},
  });
  assert.equal(chain.status,'ready-for-human-review');
  assert.equal(chain.claim.systemSignal,'混合');
  assert.equal(chain.formula.consistent,true);
  assert.equal(chain.evidence.find((e)=>e.id.endsWith('-NR')).direction,'反证');
  assert.equal(chain.valuation.scenarios,null);
  assert.ok(chain.valuation.blockedGates.includes('VALUATION_SHARE_COUNT_MISSING'));
  assert.equal(chain.decision.action,'继续研究');
  assert.equal(chain.decision.formalRecommendation,null);
});
