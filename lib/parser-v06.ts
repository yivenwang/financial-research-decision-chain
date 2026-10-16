import { finiteChange, isFiniteNumber } from "./financial-numbers.ts";
import {
  groupRows,
  parseNonRecurringTotal,
  type MetricKey,
  type MetricValue,
  type PdfTextItem,
  type SourceMeta,
} from './parser-v04.ts';
import {
  type ParseIssueV05,
  type ParseResultV05,
} from './parser-v05.ts';
import { alignedPrimaryCells, detectPrimarySegments, numericItems, parseLayoutNumber, primaryRowLabel, type PrimarySegment, type ReportRow } from './parser-primary-layout.ts';

export type ParseResultV06 = ParseResultV05;
export type ParseIssueV06 = ParseIssueV05;

const FIELD_PATTERNS: Array<{ key: MetricKey; patterns: RegExp[] }> = [
  { key: 'revenue', patterns: [/营业收入/, /营业总收入/] },
  { key: 'adjusted_np', patterns: [/归属于上市公司股东的扣除非经常性损益的净利润/, /扣除非经常性损益的净利润/] },
  { key: 'attributable_np', patterns: [/归属于上市公司股东的净利润/] },
  { key: 'operating_cash_flow', patterns: [/经营活动产生的现金流量净额/] },
  { key: 'basic_eps', patterns: [/基本每股收益/] },
  { key: 'diluted_eps', patterns: [/稀释每股收益/] },
  { key: 'roe', patterns: [/加权平均净资产收益率/] },
  { key: 'total_assets', patterns: [/总资产/] },
  { key: 'attributable_equity', patterns: [/归属于上市公司股东的(?:所有者权益|净资产|权益)/] },
];

function clean(value: string): string {
  return value.replace(/\s+/g, '');
}


function matchField(label: string): MetricKey | undefined {
  const normalized = clean(label).replace(/（元）/g, '').replace(/\(元\)/g, '');
  return FIELD_PATTERNS.find((field) => field.patterns.some((pattern) => pattern.test(normalized)))?.key;
}


function toMn(value: number): number {
  return value / 1_000_000;
}

const sectionHeading = /^(?:[一二三四五六七八九十]+[、．.]|[（(][一二三四五六七八九十]+[）)])/;

// The existing conversion is only yuan -> CNY million. Reject explicit
// incompatible declarations rather than guessing a new conversion or FX rate.
function incompatibleDeclaration(text: string): boolean {
  const normalized = clean(text);
  const declarations = normalized.matchAll(/(?:^|[（(，,；;])(?:金额)?单位[:：]([^（）()，,；;]*?)(?=(?:币种|审计类型)[:：]|$|[）)，,；;])/g);
  for (const match of declarations) if (!/^(?:人民币)?元$/.test(match[1])) return true;
  const currencies = normalized.matchAll(/币种[:：](.*?)(?=(?:单位|审计类型)[:：]|$|[）)，,；;])/g);
  for (const match of currencies) if (!/^(?:人民币|CNY|RMB)$/i.test(match[1])) return true;
  return false;
}

function incompatibleRowUnit(label: string, perShare = false): boolean {
  const allowed = perShare ? /^(?:人民币)?元[/／]股$/ : /^(?:人民币)?元$/;
  // An explicit unknown row suffix is ambiguous; a bare existing row keeps its
  // registered yuan context. Percent/percentage-point handling stays separate.
  const normalized = clean(label);
  return /万元|亿元|千元|美元|港元|欧元|日元|英镑|USD|HKD|EUR|JPY|GBP/i.test(normalized) ||
    [...normalized.matchAll(/[（(]([^（）()]*)[）)]/g)].some(match => !allowed.test(match[1]));
}

function unitBlocker(issues: ParseIssueV06[], row: ReportRow, field?: MetricKey): void {
  issues.push({ code: 'AMBIGUOUS_COLUMNS', severity: 'FAIL', field, page: row.page,
    message: '金额单位或币种不受支持或存在冲突；当前只支持人民币元，未换算或生成可接受证据。' });
}

function validatePrimaryUnits(rows: ReportRow[], segment: PrimarySegment, issues: ParseIssueV06[]): void {
  // A common unit above the first primary header also applies to a later asset
  // header and next-page continuation, but never crosses a section boundary.
  const prefix = rows.filter(row => row.page === segment.header.page && row.y > segment.header.top)
    .sort((a, b) => a.y - b.y);
  for (const row of prefix) {
    if (incompatibleDeclaration(row.text)) unitBlocker(issues, row);
    if (sectionHeading.test(clean(row.text))) break;
  }
  for (const row of segment.rows) if (incompatibleDeclaration(row.text)) unitBlocker(issues, row);
  if (segment.continuation) {
    const firstY = Math.max(...segment.rows.map(row => row.y));
    for (const row of rows.filter(row => row.page === segment.page && row.y > firstY)) {
      if (incompatibleDeclaration(row.text)) unitBlocker(issues, row);
    }
  }
}

function nonRecurringWithValidation(rows: ReportRow[], source: SourceMeta, issues: ParseIssueV06[]): MetricValue | undefined {
  let heading: ReportRow | undefined;
  let first: MetricValue | undefined;
  let previousPage: number | undefined;
  let pendingUnitRows: ReportRow[] = [];
  for (const row of rows) {
    const text = clean(row.text);
    if (previousPage !== undefined && row.page > previousPage + 1) { heading = undefined; pendingUnitRows = []; }
    previousPage = row.page;
    if (/非经常性损益项目(?:及|和)金额/.test(text)) {
      heading = row;
      pendingUnitRows = incompatibleDeclaration(text) ? [row] : [];
      continue;
    }
    if (!heading) continue;
    const newTable = /本报告期/.test(text) && /上年同期|上年度末/.test(text) && /增减|同比/.test(text);
    if (sectionHeading.test(text) || newTable || /期末余额|期初余额|管理层讨论与分析|股东信息|主要会计数据和财务指标发生变动/.test(text)) {
      heading = undefined;
      pendingUnitRows = [];
      continue;
    }
    if (incompatibleDeclaration(text)) pendingUnitRows.push(row);
    // Reuse the frozen numeric extraction, while V06 owns section boundaries
    // and ambiguity checks. Historical parser entry points remain untouched.
    const candidate = parseNonRecurringTotal([heading, row], source);
    if (!candidate) continue;
    for (const unitRow of pendingUnitRows) unitBlocker(issues, unitRow, 'non_recurring_total');
    pendingUnitRows = [];
    const label = row.items.filter(item => parseLayoutNumber(item.str) === undefined).map(item => item.str).join('');
    if (incompatibleRowUnit(label) || row.items.some(item => parseLayoutNumber(item.str) !== undefined && /[%％]|个百分点/.test(item.str))) {
      unitBlocker(issues, row, 'non_recurring_total');
    }
    if (!first) first = candidate;
    else if (candidate.current !== first.current) {
      issues.push({ code: 'AMBIGUOUS_COLUMNS', severity: 'FAIL', field: 'non_recurring_total', page: row.page,
        message: '非经常性损益合计存在冲突；保留首条原始值，阻断证据提升。' });
    }
  }
  return first;
}


function approxEqual(left: number, right: number, absTol = 0.001, relTol = 1e-6): boolean {
  const difference = Math.abs(left - right);
  return difference <= absTol || difference <= relTol * Math.max(1, Math.abs(left), Math.abs(right));
}

function addNumericValidation(metrics: Partial<Record<MetricKey, MetricValue>>, issues: ParseIssueV06[]): void {
  for (const [key, metric] of Object.entries(metrics) as [MetricKey, MetricValue][]) {
    if (key === 'non_recurring_total') continue;
    if (metric.current === undefined || metric.comparison === undefined || metric.disclosedChange === undefined) {
      if (!issues.some((issue) => issue.code === 'PRIMARY_ROW_INCOMPLETE' && issue.field === key)) {
        issues.push({
          code: 'PRIMARY_ROW_INCOMPLETE',
          severity: 'FAIL',
          field: key,
          page: metric.page,
          message: `${key}: primary-table row is missing current, comparison, or disclosed change; promotion must be blocked.`,
        });
      }
      continue;
    }
    const recalculated = finiteChange(metric.current, metric.comparison, metric.unit === "ratio");
    if (recalculated === null || !isFiniteNumber(metric.disclosedChange)) {
      issues.push({ code: "YOY_RECONCILIATION_FAIL", severity: "FAIL", field: key, page: metric.page,
        message: `${key}: change cannot be calculated from a zero, missing or non-finite basis; promotion is blocked.` });
      continue;
    }
    if (Math.abs(recalculated - metric.disclosedChange) > 0.005) {
      issues.push({
        code: 'YOY_RECONCILIATION_FAIL',
        severity: 'FAIL',
        field: key,
        page: metric.page,
        message: metric.unit === 'ratio'
          ? `${key}: recalculated delta ${(recalculated * 100).toFixed(2)}pp != disclosed ${(metric.disclosedChange * 100).toFixed(2)}pp.`
          : `${key}: recalculated change ${(recalculated * 100).toFixed(2)}% != disclosed ${(metric.disclosedChange * 100).toFixed(2)}%.`,
      });
    }
    if (metric.unit !== 'ratio' && Math.abs(metric.disclosedChange) > 5) {
      issues.push({
        code: 'EXTREME_DISCLOSED_CHANGE',
        severity: 'WARN',
        field: key,
        page: metric.page,
        message: `${key}: disclosed change exceeds 500%; require explicit review even if arithmetic reconciles.`,
      });
    }
  }

  const attributable = metrics.attributable_np?.current;
  const adjusted = metrics.adjusted_np?.current;
  const nonRecurring = metrics.non_recurring_total?.current;
  if (attributable !== undefined && adjusted !== undefined && nonRecurring !== undefined) {
    const bridged = attributable - nonRecurring;
    if (!approxEqual(bridged, adjusted)) {
      issues.push({
        code: 'BRIDGE_RECONCILIATION_FAIL',
        severity: 'FAIL',
        field: 'adjusted_np',
        message: `F-02 bridge failed: attributable NP ${attributable} - non-recurring ${nonRecurring} = ${bridged}, expected adjusted NP ${adjusted}.`,
      });
    }
  }
}

/**
 * V0.6 uses bounded primary-header segments. Restated comparisons require
 * explicit before/after identities; all reconciliation formulas remain frozen.
 */
export function parseFinancialReportV06(items: PdfTextItem[], source: SourceMeta): ParseResultV06 {
  const metrics: Partial<Record<MetricKey, MetricValue>> = {};
  const issues: ParseIssueV06[] = [];
  if (!source?.sourceId || !source?.period || !source?.url) {
    issues.push({ code: 'SOURCE_META_MISSING', severity: 'FAIL',
      message: 'sourceId/period/url must be injected by the import context; parser must never hard-code a source identifier.' });
  }
  const rows = groupRows(items);
  const layout = detectPrimarySegments(rows, label => matchField(label) !== undefined);
  for (const problem of layout.problems) issues.push({ code: 'AMBIGUOUS_COLUMNS', severity: 'FAIL', ...problem });
  if (!layout.segments.length) issues.push({ code: 'TABLE_HEADER_NOT_FOUND', severity: 'FAIL',
    message: 'Primary financial table header was not found with usable geometry.' });
  for (const segment of layout.segments) {
    let unitsChecked = false;
    for (const row of segment.rows) {
      if (!numericItems(row, segment.header).length) continue;
      const label = primaryRowLabel(row, segment.rows, segment.header);
      const key = matchField(label);
      if (!key) continue;
      if (!unitsChecked) { validatePrimaryUnits(rows, segment, issues); unitsChecked = true; }
      const cells = alignedPrimaryCells(row, segment.header);
      const unit = key === 'roe' ? 'ratio' : /eps$/.test(key) ? 'CNY_share' : 'CNY_mn';
      if (unit !== 'ratio' && (incompatibleRowUnit(label, unit === 'CNY_share') || cells &&
          [cells[0], cells[segment.header.comparisonIndex]].some(cell => /[%％]|个百分点/.test(cell.str)))) unitBlocker(issues, row, key);
      const rowPercent = /[%％]/.test(label);
      const current = cells && parseLayoutNumber(cells[0].str, rowPercent);
      const comparison = cells && parseLayoutNumber(cells[segment.header.comparisonIndex].str, rowPercent);
      const disclosedChange = cells && parseLayoutNumber(cells[cells.length - 1].str, segment.header.changePercent);
      const candidate: MetricValue = {
        key, label, current: current === undefined ? undefined : unit === 'CNY_mn' ? toMn(current) : current,
        comparison: comparison === undefined ? undefined : unit === 'CNY_mn' ? toMn(comparison) : comparison,
        disclosedChange, unit, sourceId: source.sourceId, page: row.page, confidence: 1,
      };
      const existing = metrics[key];
      if (existing) {
        if (existing.current !== candidate.current || existing.comparison !== candidate.comparison ||
            existing.disclosedChange !== candidate.disclosedChange) {
          issues.push({ code: 'AMBIGUOUS_COLUMNS', severity: 'FAIL', field: key, page: row.page,
            message: key + ': conflicting primary-table rows; first parsed record retained and promotion blocked.' });
        }
        continue;
      }
      metrics[key] = candidate;
    }
  }
  const nonRecurring = nonRecurringWithValidation(rows, source, issues);
  if (nonRecurring) metrics.non_recurring_total = nonRecurring;
  for (const key of ['attributable_np', 'adjusted_np', 'non_recurring_total'] as MetricKey[]) {
    if (!isFiniteNumber(metrics[key]?.current)) issues.push({ code: 'REQUIRED_FIELD_MISSING', severity: 'FAIL', field: key,
      message: 'Required field ' + key + ' is missing; F-02 and Graph Diff must be blocked.' });
  }
  addNumericValidation(metrics, issues);
  const blockers = issues.filter(issue => issue.severity === 'FAIL');
  return { source, metrics, issues, blockers, canPromoteToEvidence: blockers.length === 0 };
}
