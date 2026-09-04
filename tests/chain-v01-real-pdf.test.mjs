import assert from 'node:assert/strict';
import test from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV05 } from '../lib/parser-v05.ts';
import { runC04Chain } from '../lib/chain-v01.ts';

const CASES = [
  {
    source: { sourceId:'S-05', period:'2026Q1', url:'https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF' },
    context: { runId:'REAL-S05', gates:{eg01:'pending',eg02:'pending'}, valuation:{ dilutedSharesMn:536.158873, peMultiples:{bear:18,base:24,bull:30} } },
    expected: { signal:'增强', factor:4, nrDirection:'支持', basePerShare:97.8979491819396 },
  },
  {
    source: { sourceId:'S-08', period:'2024H1', url:'https://static.cninfo.com.cn/finalpage/2024-08-30/1221057646.PDF' },
    context: { runId:'REAL-S08', gates:{eg01:'pending',eg02:'pending'}, valuation:{ dilutedSharesMn:null, peMultiples:{bear:18,base:24,bull:30} } },
    expected: { signal:'增强', factor:2, nrDirection:'反证', basePerShare:null },
  },
];

async function extract(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
  const items = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (typeof raw.str !== 'string' || !Array.isArray(raw.transform)) continue;
      const x = Number(raw.transform[4]);
      const y = Number(raw.transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      items.push({ str:raw.str, x, y, page:pageNumber, width:typeof raw.width === 'number' ? raw.width : undefined });
    }
  }
  return items;
}

for (const c of CASES) {
  test(`real PDF chain ${c.source.sourceId}`, async () => {
    const items = await extract(c.source.url);
    const parsed = parseFinancialReportV05(items, c.source);
    assert.equal(parsed.canPromoteToEvidence, true, JSON.stringify(parsed.blockers));
    assert.equal(parsed.blockers.length, 0);

    const chain = runC04Chain(parsed, c.context);
    assert.equal(chain.status, 'ready-for-human-review');
    assert.equal(chain.claim.systemSignal, c.expected.signal);
    assert.equal(chain.formula?.consistent, true);
    assert.equal(chain.killCriterion.currentState, 'clear');
    assert.equal(chain.valuation.annualizationFactor, c.expected.factor);
    assert.equal(chain.evidence.find((e)=>e.id.endsWith('-NR'))?.direction, c.expected.nrDirection);
    assert.deepEqual(chain.graphDiff.unchangedNodeIds, ['C-01','C-02','C-03','C-05','C-06']);
    assert.equal(chain.decision.action, '继续研究');
    assert.equal(chain.decision.formalRecommendation, null);
    assert.ok(chain.decision.blockedGates.includes('EG-01'));
    assert.ok(chain.decision.blockedGates.includes('EG-02'));

    if (c.expected.basePerShare === null) {
      assert.equal(chain.valuation.scenarios, null);
      assert.ok(chain.valuation.blockedGates.includes('VALUATION_SHARE_COUNT_MISSING'));
    } else {
      assert.ok(Math.abs(chain.valuation.scenarios.base.perShare - c.expected.basePerShare) < 1e-9);
    }
  });
}
