import {
  detectPrimaryTableColumns,
  groupRows,
  type MetricKey,
  type MetricValue,
  type PdfTextItem,
  type SourceMeta,
} from './parser-v04.ts';
import {
  parseFinancialReportV05,
  type ParseIssueV05,
  type ParseResultV05,
} from './parser-v05.ts';

export type ParseResultV06 = ParseResultV05;
export type ParseIssueV06 = ParseIssueV05;

type Row = ReturnType<typeof groupRows>[number];
type Detection = NonNullable<ReturnType<typeof detectPrimaryTableColumns>>;
type Bounds = Detection['bounds'];

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

function parseNumber(value: string): number | undefined {
  const normalized = value.replace(/,/g, '').replace(/[−–—]/g, '-').trim();
  if (!/^[-+]?\d+(?:\.\d+)?%?$/.test(normalized)) return undefined;
  const percent = normalized.endsWith('%');
  const numeric = Number(percent ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) return undefined;
  return percent ? numeric / 100 : numeric;
}

function parseItemNumber(value: string): number | undefined {
  const normalized = clean(value).replace(/[−–—]/g, '-');
  const exact = parseNumber(normalized);
  if (exact !== undefined) return exact;
  const token = normalized.match(/[-+]?\d[\d,]*(?:\.\d+)?%?/g)?.[0];
  return token ? parseNumber(token) : undefined;
}

function cellText(row: Row, minX: number, maxX: number): string {
  return row.items
    .filter((item) => item.x >= minX && item.x < maxX)
    .map((item) => item.str)
    .join('');
}

function numericTokens(row: Row, bounds: Bounds): number[] {
  return row.items
    .filter((item) => item.x >= bounds.labelMax)
    .sort((a, b) => a.x - b.x)
    .map((item) => parseItemNumber(item.str))
    .filter((value): value is number => value !== undefined);
}

function matchField(label: string): MetricKey | undefined {
  const normalized = clean(label).replace(/（元）/g, '').replace(/\(元\)/g, '');
  return FIELD_PATTERNS.find((field) => field.patterns.some((pattern) => pattern.test(normalized)))?.key;
}

function nearbyLabelForRow(row: Row, rows: Row[], numericRows: Row[], bounds: Bounds): string {
  return rows
    .filter((candidate) => {
      if (candidate.page !== row.page) return false;
      const left = clean(cellText(candidate, Number.NEGATIVE_INFINITY, bounds.labelMax));
      if (!left || Math.abs(candidate.y - row.y) > 22) return false;
      const nearest = numericRows
        .filter((numeric) => numeric.page === candidate.page)
        .reduce((best, numeric) => {
          const distance = Math.abs(candidate.y - numeric.y);
          return !best || distance < best.distance ? { row: numeric, distance } : best;
        }, undefined as { row: Row; distance: number } | undefined);
      return nearest?.row === row;
    })
    .sort((a, b) => b.y - a.y)
    .map((candidate) => clean(cellText(candidate, Number.NEGATIVE_INFINITY, bounds.labelMax)))
    .filter(Boolean)
    .join('');
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
 * V0.6 extends V0.5 only for reports that disclose restated comparison columns:
 * current | prior-before-adjustment | prior-after-adjustment | disclosed change.
 * For rows with >=4 numeric tokens, comparison is the penultimate token and
 * disclosed change is the last token. Normal 3-token rows remain V0.5 output.
 */
export function parseFinancialReportV06(items: PdfTextItem[], source: SourceMeta): ParseResultV06 {
  const base = parseFinancialReportV05(items, source);
  const metrics: Partial<Record<MetricKey, MetricValue>> = { ...base.metrics };
  const rowsAll = groupRows(items);
  const detection = detectPrimaryTableColumns(rowsAll);
  const overridden = new Set<MetricKey>();

  if (detection) {
    const rows = rowsAll.filter((row) => row.page === detection.page);
    const numericRows = rows.filter((row) => numericTokens(row, detection.bounds).length > 0);
    for (const row of numericRows) {
      const tokens = numericTokens(row, detection.bounds);
      if (tokens.length < 4) continue;
      const label = nearbyLabelForRow(row, rows, numericRows, detection.bounds);
      const key = matchField(label);
      if (!key) continue;
      const existing = metrics[key];
      if (!existing) continue;

      const currentRaw = tokens[0];
      const comparisonRaw = tokens[tokens.length - 2];
      const disclosedChange = tokens[tokens.length - 1];
      metrics[key] = {
        ...existing,
        current: existing.unit === 'CNY_mn' ? toMn(currentRaw) : currentRaw,
        comparison: existing.unit === 'CNY_mn' ? toMn(comparisonRaw) : comparisonRaw,
        disclosedChange,
        label,
      };
      overridden.add(key);
    }
  }

  const issues: ParseIssueV06[] = base.issues.filter((issue) => {
    if (issue.code === 'YOY_RECONCILIATION_FAIL' || issue.code === 'EXTREME_DISCLOSED_CHANGE' || issue.code === 'BRIDGE_RECONCILIATION_FAIL') return false;
    if (issue.code === 'PRIMARY_ROW_INCOMPLETE' && issue.field && overridden.has(issue.field)) return false;
    return true;
  });

  addNumericValidation(metrics, issues);
  const blockers = issues.filter((issue) => issue.severity === 'FAIL');
  return {
    source: base.source,
    metrics,
    issues,
    blockers,
    canPromoteToEvidence: blockers.length === 0,
  };
}
