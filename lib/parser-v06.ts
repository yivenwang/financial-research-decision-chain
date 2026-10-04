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
import { alignedPrimaryCells, detectPrimarySegments, numericItems, parseLayoutNumber, primaryRowLabel } from './parser-primary-layout.ts';

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

function relativeChange(current: number, comparison: number): number {
  return (current - comparison) / Math.abs(comparison);
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
    const recalculated = metric.unit === 'ratio'
      ? metric.current - metric.comparison
      : relativeChange(metric.current, metric.comparison);
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
    for (const row of segment.rows) {
      if (!numericItems(row, segment.header).length) continue;
      const label = primaryRowLabel(row, segment.rows, segment.header);
      const key = matchField(label);
      if (!key) continue;
      const cells = alignedPrimaryCells(row, segment.header);
      const unit = key === 'roe' ? 'ratio' : /eps$/.test(key) ? 'CNY_share' : 'CNY_mn';
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
  const nonRecurring = parseNonRecurringTotal(rows, source);
  if (nonRecurring) metrics.non_recurring_total = nonRecurring;
  for (const key of ['attributable_np', 'adjusted_np', 'non_recurring_total'] as MetricKey[]) {
    if (metrics[key]?.current === undefined) issues.push({ code: 'REQUIRED_FIELD_MISSING', severity: 'FAIL', field: key,
      message: 'Required field ' + key + ' is missing; F-02 and Graph Diff must be blocked.' });
  }
  addNumericValidation(metrics, issues);
  const blockers = issues.filter(issue => issue.severity === 'FAIL');
  return { source, metrics, issues, blockers, canPromoteToEvidence: blockers.length === 0 };
}
