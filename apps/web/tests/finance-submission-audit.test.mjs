import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseResearchReport, extractCandidates, reviewAndRun } from '../lib/research-engine.ts';
import { verifiedSampleItems } from '../lib/sample-s05.ts';
import { getSourceRecord } from '../lib/source-records.ts';

const source = getSourceRecord('S-05');
const sample = () => structuredClone(verifiedSampleItems);
const item = (str, y, page = 2, x = 80) => ({ str, x, y, page });
const unitFailure = (items, field) => {
  const result = parseResearchReport(items, source);
  assert.equal(result.canPromoteToEvidence, false);
  assert.ok(result.blockers.some(issue => /金额单位或币种/.test(issue.message) && (!field || issue.field === field)));
  const reviewed = reviewAndRun(result, extractCandidates(result).map(candidate => ({ ...candidate, reviewStatus: 'accepted' })), 'AUDIT-NOT-LIVE');
  assert.equal(reviewed.chain, null, 'human acceptance cannot bypass the source-unit blocker');
  return result;
};

test('scaled ten-thousand-yuan inputs cannot pass merely because yoy and the profit bridge reconcile', () => {
  const monetaryRows = new Set([665, 630, 595, 560, 420, 385]);
  const scaled = sample().map(value => {
    if (value.page === 2 && value.x === 80 && monetaryRows.has(value.y)) return { ...value, str: value.str.replace('（元）', '（万元）') };
    if ((value.page === 2 && monetaryRows.has(value.y) && [390, 550].includes(value.x)) || (value.page === 3 && value.x === 420)) {
      return { ...value, str: String(Number(value.str.replaceAll(',', '')) / 10000) };
    }
    return value;
  });
  scaled.push(item('单位：万元', 740, 3));
  const result = unitFailure(scaled, 'adjusted_np');
  assert.equal(result.blockers.some(issue => issue.code === 'YOY_RECONCILIATION_FAIL' || issue.code === 'BRIDGE_RECONCILIATION_FAIL'), false);
});

test('explicit unsupported amount and EPS units or currencies are rejected without conversion', () => {
  for (const unit of ['万元', '亿元', '千元', '百万元', '美元', '港元', 'USD', '未知单位']) {
    unitFailure(sample().map(value => value.y === 595 && value.x === 80 ? { ...value, str: value.str.replace('（元）', `（${unit}）`) } : value), 'adjusted_np');
  }
  for (const unit of ['万元/股', '美元/股', 'USD/share']) {
    unitFailure(sample().map(value => value.y === 525 && value.x === 80 ? { ...value, str: `基本每股收益（${unit}）` } : value), 'basic_eps');
  }
  unitFailure(sample().map(value => value.y === 595 && value.x === 80 ? { ...value, str: '归属于上市公司股东的扣除非经常性损益的净利润万元' } : value), 'adjusted_np');
});

test('money and EPS value cells cannot acquire percentage units while their labels declare yuan', () => {
  for (const y of [595, 525]) {
    unitFailure(sample().map(value => value.y === y && value.x === 390 ? { ...value, str: value.str + '%' } : value), y === 595 ? 'adjusted_np' : 'basic_eps');
  }
  unitFailure(sample().map(value => value.page === 3 && value.x === 420 ? { ...value, str: value.str + '%' } : value), 'non_recurring_total');
});

test('primary-table declarations above the header or between rows override no source assumptions', () => {
  for (const declaration of ['单位：万元', '单位:百万元', '单位：元 币种：美元', '币种：USD', '单位：未知单位']) {
    for (const y of [740, 680]) unitFailure([...sample(), item(declaration, y)]);
  }
  const approved = [...sample(), item('单位：元 币种：人民币', 740)];
  assert.deepEqual(parseResearchReport(approved, source), parseResearchReport(sample(), source));
});

test('non-recurring section and total-row units are checked across the page break', () => {
  for (const declaration of ['单位：万元', '币种：美元', '单位：元 币种：EUR']) {
    unitFailure([...sample(), item(declaration, 280)], 'non_recurring_total');
    unitFailure([...sample(), item(declaration, 740, 3)], 'non_recurring_total');
  }
  unitFailure(sample().map(value => value.page === 3 && value.str === '合计' ? { ...value, str: '合计（万元）' } : value), 'non_recurring_total');
  unitFailure(sample().map(value => value.y === 300 ? { ...value, str: value.str + '（单位：万元）' } : value), 'non_recurring_total');
});

test('inherited primary-table currency is still checked for next-page continuation', async () => {
  const path = new URL('../../../validation/cross-company/bull-group-2026q1/second-run/coordinates.json', import.meta.url);
  const coordinates = JSON.parse(await readFile(path));
  const changed = coordinates.map(value => value.page === 1 && value.str === '币种：人民币' ? { ...value, str: '币种：美元' } : value);
  const result = unitFailure(changed);
  assert.equal(result.metrics.roe.page, 2, 'continuation still parses while promotion is blocked');
});

test('conflicting non-recurring totals block promotion while retaining the first original value', () => {
  const baseline = parseResearchReport(sample(), source);
  const result = parseResearchReport([...sample(), item('合计', 650, 3), item('123,456,789.00', 650, 3, 420)], source);
  assert.equal(result.canPromoteToEvidence, false);
  assert.equal(result.metrics.non_recurring_total.current, baseline.metrics.non_recurring_total.current);
  assert.ok(result.blockers.some(issue => issue.code === 'AMBIGUOUS_COLUMNS' && issue.field === 'non_recurring_total'));
  assert.equal(reviewAndRun(result, extractCandidates(result).map(candidate => ({ ...candidate, reviewStatus: 'accepted' })), 'DUPLICATE-NOT-LIVE').chain, null);
  const identical = [...sample(), item('合计', 650, 3), item('-75,164,707.19', 650, 3, 420)];
  assert.deepEqual(parseResearchReport(identical, source), baseline);
});

test('unrelated sections cannot provide non-recurring totals or leak their units into approved tables', () => {
  const unrelated = [item('（三）其他资料', 680, 3), item('单位：万元', 650, 3), item('合计', 620, 3), item('123,456,789.00', 620, 3, 420)];
  assert.deepEqual(parseResearchReport([...sample(), ...unrelated], source), parseResearchReport(sample(), source));
  const missing = sample().filter(value => value.page !== 3);
  const result = parseResearchReport([...missing, ...unrelated], source);
  assert.equal(result.metrics.non_recurring_total, undefined);
  assert.equal(result.canPromoteToEvidence, false);
});

test('a later unrelated table with a valid-looking period header cannot create a money-unit blocker', () => {
  for (const page of [4, 5]) {
    const unrelated = [item('单位：股', 740, page), item('项目', 700, page), item('本报告期', 700, page, 390),
      item('上年同期', 700, page, 550), item('同比（%）', 700, page, 710), item('普通股股东总数', 650, page),
      item('100', 650, page, 390), item('100', 650, page, 550), item('0', 650, page, 710)];
    assert.deepEqual(parseResearchReport([...sample(), ...unrelated], source), parseResearchReport(sample(), source));
  }
});
