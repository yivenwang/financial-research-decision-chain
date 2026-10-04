import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseFinancialReportV06Strict as parse } from '../lib/parser-v06-strict.ts';
import { verifiedSampleItems } from '../apps/web/lib/sample-s05.ts';
import { groupRows } from '../lib/parser-v04.ts';
import { detectPrimarySegments } from '../lib/parser-primary-layout.ts';

const source = { sourceId: 'LAYOUT-TEST', period: '2026Q1', url: 'https://example.test/report.pdf' };
const item = (str, x, y, page = 2) => ({ str, x, y, page });
const row = (label, current, comparison, change, y, page = 2) => [
  item(label, 80, y, page), item(current, 390, y, page),
  item(comparison, 550, y, page), item(change, 710, y, page),
];
const sample = () => structuredClone(verifiedSampleItems);

for (const id of ['s-05', 's-06']) test(`${id} frozen PDF coordinates preserve the entire pre-change strict result`, async () => {
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/parser-layout/${id}.json`, import.meta.url)));
  assert.deepEqual(parse(fixture.items, fixture.source), fixture.expected);
});

test('bare percentage cells inherit only the detected change header; explicit % is not divided twice', () => {
  const explicit = parse(sample(), source);
  const bare = sample().map(v => v.x === 710 && /%$/.test(v.str) ? { ...v, str: v.str.slice(0, -1) } : v);
  assert.deepEqual(parse(bare, source), explicit);
});

test('wrapped percent header and row percent units normalize values and signed percentage points', () => {
  const items = sample().filter(v => !(v.y === 700 && v.x === 710));
  items.push(item('本报告期比上年同期增减', 710, 690), item('（%）', 710, 680));
  for (const v of items) if (v.y === 455) {
    if (v.x === 80) v.str += '（%）';
    if (v.x === 390 || v.x === 550) v.str = v.str.replace('%', '');
    if (v.x === 710) v.str = '减少 1.06 个百分点';
  }
  const result = parse(items, source);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.metrics.roe.current, 0.0435);
  assert.equal(result.metrics.roe.disclosedChange, -0.0106);
});

test('continuation on the immediately following page retains the first header; later primary header owns its rows', () => {
  const items = sample().filter(v => ![455, 420, 385, 300].includes(v.y));
  for (const v of items) if (v.y === 490) v.y = 90;
  items.push(...row('加权平均净资产收益率（%）', '4.35', '5.41', '减少1.06个百分点', 760, 3));
  items.push(...row('项目', '本报告期末', '上年度末', '本报告期末比上年度末增减（%）', 700, 3));
  items.push(...row('总资产（元）', '20,228,357,751.74', '20,066,892,453.86', '0.80', 650, 3));
  items.push(...row('归属于上市公司股东的所有者权益（元）', '11,170,909,982.81', '10,527,603,265.38', '6.11', 610, 3));
  items.push(item('（二）非经常性损益项目和金额', 80, 500, 3));
  // Move the total out of the continuation prefix.
  for (const v of items) if (v.page === 3 && v.y === 700 && ['合计', '-75,164,707.19'].includes(v.str)) { v.page = 4; }
  const result = parse(items, source);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.metrics.roe.page, 3);
  assert.equal(result.metrics.total_assets.page, 3);
  assert.equal(result.metrics.total_assets.disclosedChange, 0.008);
});

test('unrelated table/section closes context, including across pages', () => {
  const items = sample().filter(v => v.y !== 455);
  items.push(item('（三）其他资料', 80, 200));
  items.push(...row('加权平均净资产收益率', '4.35%', '5.41%', '-1.06%', 760, 3));
  const result = parse(items, source);
  assert.equal(result.metrics.roe, undefined);
  assert.ok(result.blockers.some(v => v.code === 'PRIMARY_ROW_INCOMPLETE' && v.field === 'roe'));
});

test('missing or extra numeric columns and ambiguous header identities stay blocked', () => {
  for (const mutate of [
    items => items.filter(v => !(v.y === 665 && v.x === 550)),
    items => [...items, item('100', 620, 665)],
    items => [...items, item('上年同期', 610, 700)],
    items => items.map(v => v.y === 700 && v.x === 550 ? { ...v, str: '上年度末' } : v),
  ]) {
    const result = parse(mutate(sample()), source);
    assert.equal(result.canPromoteToEvidence, false);
    assert.ok(result.blockers.some(v => ['PRIMARY_ROW_INCOMPLETE', 'AMBIGUOUS_COLUMNS'].includes(v.code)));
  }
});

test('unrelated malformed headers later in a complete report cannot contribute metrics or create primary blockers', () => {
  const result = parse([...sample(), ...row('项目', '本报告期', '', '同比', 700, 5),
    ...row('营业收入', '1000000', '1000000', '0%', 650, 5)], source);
  assert.deepEqual(result, parse(sample(), source));
});

test('conflicting duplicate primary rows do not overwrite history or silently promote', () => {
  const result = parse([...sample(), ...row('项目', '本报告期', '上年同期', '同比（%）', 700, 5),
    ...row('营业收入', '2000000', '1000000', '100', 650, 5)], source);
  assert.equal(result.canPromoteToEvidence, false);
  assert.equal(result.metrics.revenue.current, parse(sample(), source).metrics.revenue.current);
  assert.ok(result.blockers.some(v => v.code === 'AMBIGUOUS_COLUMNS'));
});

test('restated comparison requires explicit before/after header identities', () => {
  const items = sample();
  items.push(item('调整前', 510, 680), item('调整后', 570, 680));
  // Header context explicitly declares four columns, with after-adjustment on the right.
  for (const v of items) if (v.y < 680 && v.page === 2 && v.x === 550) {
    items.push({ ...v, x: 510 }); v.x = 570;
  }
  const result = parse(items, source);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.metrics.adjusted_np.comparison, 439.55840722000005);
});

test('a bare cell never acquires percent semantics without a column declaration', () => {
  const items = sample();
  for (const v of items) if (v.x === 710) v.str = v.str.replace(/（%）|%/g, '');
  const result = parse(items, source);
  assert.equal(result.metrics.revenue.disclosedChange, 26.93);
  assert.ok(result.blockers.some(v => v.code === 'YOY_RECONCILIATION_FAIL'));
});

test('header-specific units do not leak to a subsequent primary segment', () => {
  const items = sample().filter(v => ![420, 385, 300].includes(v.y));
  items.push(...row('项目', '本报告期末', '上年度末', '同比', 420));
  items.push(...row('总资产', '20,228,357,751.74', '20,066,892,453.86', '0.80', 385));
  const result = parse(items, source);
  assert.equal(result.metrics.total_assets.disclosedChange, 0.8);
  assert.ok(result.blockers.some(v => v.code === 'YOY_RECONCILIATION_FAIL' && v.field === 'total_assets'));
});

test('a page gap, non-edge row, unrelated header, or incomplete restatement cannot supply missing metrics', () => {
  const base = sample().filter(v => v.y !== 455);
  for (const extra of [
    row('加权平均净资产收益率', '4.35%', '5.41%', '-1.06%', 760, 5),
    row('加权平均净资产收益率', '4.35%', '5.41%', '-1.06%', 760, 3),
    [...row('项目', '期末余额', '期初余额', '说明', 400), ...row('加权平均净资产收益率', '4.35%', '5.41%', '-1.06%', 350)],
    [item('调整前', 510, 680)],
    [...row('项目', '本报告期', '', '同比（%）', 200), ...row('加权平均净资产收益率', '4.35%', '5.41%', '-1.06%', 150)],
  ]) assert.equal(parse([...base, ...extra], source).canPromoteToEvidence, false);
});

test('bad disclosed change and F-02 bridge remain blockers, never repaired from calculated values', () => {
  for (const mutation of [
    v => v.y === 665 && v.x === 710 ? { ...v, str: '0%' } : v,
    v => v.str === '-75,164,707.19' ? { ...v, str: '0' } : v,
  ]) {
    const result = parse(sample().map(mutation), source);
    assert.equal(result.canPromoteToEvidence, false);
    assert.ok(result.blockers.some(v => ['YOY_RECONCILIATION_FAIL', 'BRIDGE_RECONCILIATION_FAIL'].includes(v.code)));
  }
});

test('frozen Bull coordinates reproduce all ten independently reviewed facts, without a result backfill', async () => {
  const root = new URL('../validation/cross-company/bull-group-2026q1/second-run/', import.meta.url);
  const items = JSON.parse(await readFile(new URL('coordinates.json', root)));
  const review = JSON.parse(await readFile(new URL('manual-review.json', root)));
  const result = parse(items, source);
  const layout = detectPrimarySegments(groupRows(items), label => /营业收入|收益率|净利润|现金流量|总资产|权益/.test(label));
  assert.deepEqual(layout.segments.map(v => ({ page: v.page, continuation: v.continuation, periods: v.header.periodColumns })), [
    { page: 1, continuation: false, periods: ['本报告期', '上年同期'] },
    { page: 2, continuation: true, periods: ['本报告期', '上年同期'] },
    { page: 2, continuation: false, periods: ['本报告期末', '上年度末'] },
  ]);
  assert.deepEqual(result.blockers, []);
  assert.equal(Object.keys(result.metrics).length, 10);
  for (const fact of review.checks) {
    const metric = result.metrics[fact.metric];
    const scale = metric.unit === 'CNY_mn' ? 1e6 : metric.unit === 'ratio' ? 100 : 1;
    assert.ok(Math.abs(metric.current * scale - (fact.sourceCurrent ?? fact.sourceCurrentPercent)) < 1e-5, fact.metric);
    assert.equal(metric.page, fact.page);
    if (fact.metric === 'non_recurring_total') continue;
    assert.ok(Math.abs(metric.comparison * scale - (fact.sourceComparison ?? fact.sourceComparisonPercent)) < 1e-5, fact.metric);
    assert.equal(metric.disclosedChange, (fact.sourceDisclosedChangePercent ?? fact.sourceDisclosedChangePercentagePoints) / 100);
  }
  assert.ok(Math.abs(result.metrics.attributable_np.current - result.metrics.non_recurring_total.current - result.metrics.adjusted_np.current) < 1e-8);
});
