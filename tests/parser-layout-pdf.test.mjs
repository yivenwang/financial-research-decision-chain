import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getDocument } from '../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV06Strict as parse } from '../lib/parser-v06-strict.ts';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function extract(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
  const items = [];
  try {
    const doc = await task.promise;
    for (let page = 1; page <= doc.numPages; page++) {
      for (const raw of (await (await doc.getPage(page)).getTextContent()).items) {
        if (typeof raw.str === 'string' && Array.isArray(raw.transform)) {
          items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], page, width: raw.width });
        }
      }
    }
    return items;
  } finally { await task.destroy(); }
}

const mirrors = {
  's-05': 'https://pdf.dfcfw.com/pdf/H2_AN202604291821773803_1.pdf',
  's-06': 'https://pdf.dfcfw.com/pdf/H2_AN202608300006761478_1.pdf',
};
for (const id of ['s-05', 's-06']) test(`${id} frozen-hash real PDF preserves all strict metrics, issues and gates`, async () => {
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/parser-layout/${id}.json`, import.meta.url)));
  const localPath = process.env[id === 's-05' ? 'PARSER_S05_PDF' : 'PARSER_S06_PDF'];
  let bytes = localPath && await readFile(localPath);
  if (!bytes) {
    const outcomes = [];
    for (const url of [fixture.source.url, mirrors[id]]) {
      try {
        const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: new URL(url).origin }, signal: AbortSignal.timeout(60000) });
        if (!response.ok) { outcomes.push(`${response.status}`); await response.body?.cancel(); continue; }
        bytes = Buffer.from(await response.arrayBuffer());
      } catch (error) { outcomes.push(error.name); continue; }
      // A changed source is never silently substituted or used to refresh truth.
      assert.equal(digest(bytes), fixture.pdfSha256, 'Frozen source hash mismatch');
      break;
    }
    assert.ok(bytes, `Approved frozen PDF acquisition failed: ${outcomes.join(',')}`);
  }
  assert.equal(digest(bytes), fixture.pdfSha256);
  const items = await extract(bytes);
  assert.deepEqual(items.filter(v => fixture.pages.includes(v.page)), fixture.items);
  assert.deepEqual(parse(items, fixture.source), fixture.expected);
}, { timeout: 150000 });

test('Bull frozen PDF -> fresh coordinates -> strict parser is a non-blind PASS rerun', async () => {
  const root = new URL('../validation/cross-company/bull-group-2026q1/second-run/', import.meta.url);
  const registration = JSON.parse(await readFile(new URL('registration.json', root)));
  const bytes = await readFile(new URL('source.pdf', root));
  assert.equal(digest(bytes), registration.source.pdfSha256);
  const items = await extract(bytes);
  const frozen = JSON.parse(await readFile(new URL('coordinates.json', root)));
  assert.deepEqual(items, frozen);
  const { sourceId, period, url } = registration.source;
  const result = parse(items, { sourceId, period, url });
  assert.deepEqual(result, parse(frozen, { sourceId, period, url }));
  const review = JSON.parse(await readFile(new URL('manual-review.json', root)));
  assert.equal(review.sourceSha256, digest(bytes));
  assert.deepEqual(result.blockers, []);
  assert.equal(Object.keys(result.metrics).length, review.checks.length);
  for (const fact of review.checks) {
    const metric = result.metrics[fact.metric];
    const scale = metric.unit === 'CNY_mn' ? 1e6 : metric.unit === 'ratio' ? 100 : 1;
    assert.ok(Math.abs(metric.current * scale - (fact.sourceCurrent ?? fact.sourceCurrentPercent)) < 1e-5, fact.metric);
    if (fact.metric === 'non_recurring_total') continue;
    assert.ok(Math.abs(metric.comparison * scale - (fact.sourceComparison ?? fact.sourceComparisonPercent)) < 1e-5, fact.metric);
    assert.equal(metric.disclosedChange, (fact.sourceDisclosedChangePercent ?? fact.sourceDisclosedChangePercentagePoints) / 100);
  }
  assert.ok(Math.abs(result.metrics.attributable_np.current - result.metrics.non_recurring_total.current - result.metrics.adjusted_np.current) < 1e-8);
  console.log('Bull parser rerun: PASS; not blind; ten source-reviewed metrics; F-02 reconciles; no model calls; no professional approval.');
});
