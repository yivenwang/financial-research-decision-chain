import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV05 } from '../lib/parser-v05.ts';
import { runC04Chain } from '../lib/chain-v01.ts';

const TARGET = {
  sourceId: 'S-09',
  period: '2022H1',
  securityCode: '300866',
  searchKey: '安克创新2022年半年度报告',
};

async function discoverOfficialPdf() {
  const endpoint = 'https://www.cninfo.com.cn/new/hisAnnouncement/query';
  const form = new URLSearchParams({
    pageNum: '1',
    pageSize: '30',
    column: 'szse',
    tabName: 'fulltext',
    plate: 'sz',
    stock: '',
    searchkey: TARGET.searchKey,
    secid: '',
    category: '',
    trade: '',
    seDate: '2022-01-01~2022-12-31',
    sortName: 'time',
    sortType: 'desc',
    isHLtitle: 'true',
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'Mozilla/5.0 ChainBlindTest/1.0',
      referer: 'https://www.cninfo.com.cn/',
      origin: 'https://www.cninfo.com.cn',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: form,
  });
  assert.equal(response.ok, true, `CNINFO discovery failed: ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload.announcements) ? payload.announcements : [];
  const normalize = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const candidates = rows.filter((row) => {
    const title = normalize(row.announcementTitle);
    return String(row.secCode ?? '') === TARGET.securityCode &&
      title.includes('2022年半年度报告') &&
      !title.includes('摘要');
  });
  assert.equal(candidates.length >= 1, true, `No full 2022H1 report discovered. Candidate count=${rows.length}`);
  const selected = candidates[0];
  assert.equal(typeof selected.adjunctUrl, 'string');
  return {
    title: normalize(selected.announcementTitle),
    announcementId: selected.announcementId ?? null,
    announcementTime: selected.announcementTime ?? null,
    url: `https://static.cninfo.com.cn/${String(selected.adjunctUrl).replace(/^\//, '')}`,
  };
}

async function extractPdf(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 ChainBlindTest/1.0' } });
  assert.equal(response.ok, true, `PDF download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(buffer).digest('hex');
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const items = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (typeof raw.str !== 'string' || !Array.isArray(raw.transform)) continue;
      const x = Number(raw.transform[4]);
      const y = Number(raw.transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      items.push({ str: raw.str, x, y, page: pageNumber, width: typeof raw.width === 'number' ? raw.width : undefined });
    }
  }
  return { items, pageCount: doc.numPages, pdfBytes: buffer.length, pdfSha256: hash };
}

const discovered = await discoverOfficialPdf();
const extracted = await extractPdf(discovered.url);
const source = { sourceId: TARGET.sourceId, period: TARGET.period, url: discovered.url };
const parser = parseFinancialReportV05(extracted.items, source);
const chain = runC04Chain(parser, {
  runId: 'CHAIN-BLIND-01-S09-FIRST',
  priorAdjustedYoy: [],
  accountingAdjustmentRecurring: null,
  gates: { eg01: 'pending', eg02: 'pending' },
  valuation: {
    dilutedSharesMn: null,
    peMultiples: { bear: 18, base: 24, bull: 30 },
  },
});

const artifact = {
  protocol: 'Chain Blind Test 01 / S-09 first run before human truth comparison',
  frozenBaseline: {
    parser: 'V0.5-main',
    chain: 'V0.1-main',
  },
  discoveredSource: {
    sourceId: TARGET.sourceId,
    period: TARGET.period,
    title: discovered.title,
    announcementId: discovered.announcementId,
    announcementTime: discovered.announcementTime,
    url: discovered.url,
  },
  pdfSha256: extracted.pdfSha256,
  pdfBytes: extracted.pdfBytes,
  pageCount: extracted.pageCount,
  textItemCount: extracted.items.length,
  parserFirstRun: parser,
  chainFirstRun: chain,
  discipline: {
    expectedFinancialValuesEmbedded: false,
    parserModifiedForS09: false,
    chainModifiedForS09: false,
    humanTruthComparisonPerformed: false,
  },
};

// Preserve machine output before any governance assertion can fail.
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/S09_CHAIN_FIRST_RUN_FROZEN.json', JSON.stringify(artifact, null, 2));
console.log(`S-09 first-run artifact preserved. PDF sha256=${artifact.pdfSha256}`);

// Governance-only assertions. No S-09 financial truth is embedded here.
assert.equal(chain.decision.action, '继续研究');
assert.equal(chain.decision.formalRecommendation, null);
assert.ok(chain.decision.blockedGates.includes('EG-01'));
assert.ok(chain.decision.blockedGates.includes('EG-02'));
assert.deepEqual(chain.graphDiff.unchangedNodeIds, ['C-01','C-02','C-03','C-05','C-06']);
assert.equal(chain.valuation.publishable, false);
