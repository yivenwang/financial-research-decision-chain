import {
  detectPrimaryTableColumns,
  groupRows,
  parseNonRecurringTotal,
  type MetricKey,
  type MetricValue,
  type ParseIssue,
  type PdfTextItem,
  type SourceMeta,
} from "./parser-v04.ts";

type Row = ReturnType<typeof groupRows>[number];
type Detection = NonNullable<ReturnType<typeof detectPrimaryTableColumns>>;
type Bounds = Detection["bounds"];

export type ParseIssueV05 = Omit<ParseIssue, "code"> & {
  code: ParseIssue["code"] | "PRIMARY_ROW_INCOMPLETE";
};

export type ParseResultV05 = {
  source: SourceMeta;
  metrics: Partial<Record<MetricKey, MetricValue>>;
  issues: ParseIssueV05[];
  blockers: ParseIssueV05[];
  canPromoteToEvidence: boolean;
};

const FIELD_PATTERNS: Array<{
  key: MetricKey;
  patterns: RegExp[];
  unit: MetricValue["unit"];
}> = [
  { key: "revenue", patterns: [/营业收入/, /营业总收入/], unit: "CNY_mn" },
  {
    key: "adjusted_np",
    patterns: [
      /归属于上市公司股东的扣除非经常性损益的净利润/,
      /扣除非经常性损益的净利润/,
    ],
    unit: "CNY_mn",
  },
  {
    key: "attributable_np",
    patterns: [/归属于上市公司股东的净利润/],
    unit: "CNY_mn",
  },
  {
    key: "operating_cash_flow",
    patterns: [/经营活动产生的现金流量净额/],
    unit: "CNY_mn",
  },
  { key: "basic_eps", patterns: [/基本每股收益/], unit: "CNY_share" },
  { key: "diluted_eps", patterns: [/稀释每股收益/], unit: "CNY_share" },
  { key: "roe", patterns: [/加权平均净资产收益率/], unit: "ratio" },
  { key: "total_assets", patterns: [/总资产/], unit: "CNY_mn" },
  {
    key: "attributable_equity",
    patterns: [/归属于上市公司股东的(?:所有者权益|净资产)/],
    unit: "CNY_mn",
  },
];

function clean(value: string): string {
  return value.replace(/\s+/g, "");
}

function parseNumber(value: string): number | undefined {
  const normalized = value
    .replace(/,/g, "")
    .replace(/[−–—]/g, "-")
    .trim();
  if (!/^[-+]?\d+(?:\.\d+)?%?$/.test(normalized)) return undefined;
  const isPercent = normalized.endsWith("%");
  const numeric = Number(isPercent ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(numeric)) return undefined;
  return isPercent ? numeric / 100 : numeric;
}

function parseItemNumber(value: string): number | undefined {
  const normalized = clean(value).replace(/[−–—]/g, "-");
  const exact = parseNumber(normalized);
  if (exact !== undefined) return exact;
  const token = normalized.match(/[-+]?\d[\d,]*(?:\.\d+)?%?/g)?.[0];
  return token ? parseNumber(token) : undefined;
}

function cellText(row: Row, minX: number, maxX: number): string {
  return row.items
    .filter((item) => item.x >= minX && item.x < maxX)
    .map((item) => item.str)
    .join("");
}

function matchField(label: string) {
  const normalized = clean(label).replace(/（元）/g, "").replace(/\(元\)/g, "");
  return FIELD_PATTERNS.find((field) =>
    field.patterns.some((pattern) => pattern.test(normalized)),
  );
}

function numericTokensForRow(row: Row, bounds: Bounds): number[] {
  return row.items
    .filter((item) => item.x >= bounds.labelMax)
    .sort((a, b) => a.x - b.x)
    .map((item) => parseItemNumber(item.str))
    .filter((value): value is number => value !== undefined);
}

function toMn(value: number): number {
  return value / 1_000_000;
}

export function parsePrimaryMetricsV05(
  rows: Row[],
  source: SourceMeta,
  bounds: Bounds,
): Partial<Record<MetricKey, MetricValue>> {
  const metrics: Partial<Record<MetricKey, MetricValue>> = {};
  const numericRows = rows.filter(
    (row) => numericTokensForRow(row, bounds).length > 0,
  );

  for (const row of numericRows) {
    const nearbyLabel = rows
      .filter((candidate) => {
        if (candidate.page !== row.page) return false;
        const left = clean(
          cellText(candidate, Number.NEGATIVE_INFINITY, bounds.labelMax),
        );
        if (!left) return false;
        if (Math.abs(candidate.y - row.y) > 22) return false;
        const nearest = numericRows
          .filter((numeric) => numeric.page === candidate.page)
          .reduce((best, numeric) => {
            const distance = Math.abs(candidate.y - numeric.y);
            return !best || distance < best.distance
              ? { row: numeric, distance }
              : best;
          }, undefined as { row: Row; distance: number } | undefined);
        return nearest?.row === row;
      })
      .sort((a, b) => b.y - a.y)
      .map((candidate) =>
        clean(cellText(candidate, Number.NEGATIVE_INFINITY, bounds.labelMax)),
      )
      .filter(Boolean)
      .join("");

    const field = matchField(nearbyLabel);
    if (!field) continue;

    const [current, comparison, disclosedChange] = numericTokensForRow(
      row,
      bounds,
    );
    let currentNormalized = current;
    let comparisonNormalized = comparison;
    if (field.unit === "CNY_mn") {
      if (current !== undefined) currentNormalized = toMn(current);
      if (comparison !== undefined) comparisonNormalized = toMn(comparison);
    }

    metrics[field.key] = {
      key: field.key,
      label: nearbyLabel,
      current: currentNormalized,
      comparison: comparisonNormalized,
      disclosedChange,
      unit: field.unit,
      sourceId: source.sourceId,
      page: row.page,
      confidence: 1,
    };
  }

  return metrics;
}

function relativeChange(current: number, comparison: number): number {
  return (current - comparison) / Math.abs(comparison);
}

function approxEqual(
  left: number,
  right: number,
  absoluteTolerance = 0.001,
  relativeTolerance = 1e-6,
): boolean {
  const difference = Math.abs(left - right);
  return (
    difference <= absoluteTolerance ||
    difference <= relativeTolerance * Math.max(1, Math.abs(left), Math.abs(right))
  );
}

function validateV05(
  metrics: Partial<Record<MetricKey, MetricValue>>,
): ParseIssueV05[] {
  const issues: ParseIssueV05[] = [];
  const required: MetricKey[] = [
    "attributable_np",
    "adjusted_np",
    "non_recurring_total",
  ];

  for (const key of required) {
    if (metrics[key]?.current === undefined) {
      issues.push({
        code: "REQUIRED_FIELD_MISSING",
        severity: "FAIL",
        field: key,
        message: `Required field ${key} is missing; F-02 and Graph Diff must be blocked.`,
      });
    }
  }

  for (const [key, metric] of Object.entries(metrics) as [MetricKey, MetricValue][]) {
    if (
      key !== "non_recurring_total" &&
      (metric.current === undefined ||
        metric.comparison === undefined ||
        metric.disclosedChange === undefined)
    ) {
      issues.push({
        code: "PRIMARY_ROW_INCOMPLETE",
        severity: "FAIL",
        field: key,
        page: metric.page,
        message: `${key}: primary-table row is missing current, comparison, or disclosed change; promotion must be blocked.`,
      });
      continue;
    }

    if (
      metric.current === undefined ||
      metric.comparison === undefined ||
      metric.disclosedChange === undefined
    ) {
      continue;
    }

    const recalculated =
      metric.unit === "ratio"
        ? metric.current - metric.comparison
        : relativeChange(metric.current, metric.comparison);
    if (Math.abs(recalculated - metric.disclosedChange) > 0.005) {
      issues.push({
        code: "YOY_RECONCILIATION_FAIL",
        severity: "FAIL",
        field: key,
        page: metric.page,
        message:
          metric.unit === "ratio"
            ? `${key}: recalculated delta ${(recalculated * 100).toFixed(2)}pp != disclosed ${(metric.disclosedChange * 100).toFixed(2)}pp.`
            : `${key}: recalculated change ${(recalculated * 100).toFixed(2)}% != disclosed ${(metric.disclosedChange * 100).toFixed(2)}%.`,
      });
    }
    if (metric.unit !== "ratio" && Math.abs(metric.disclosedChange) > 5) {
      issues.push({
        code: "EXTREME_DISCLOSED_CHANGE",
        severity: "WARN",
        field: key,
        page: metric.page,
        message: `${key}: disclosed change exceeds 500%; require explicit review even if arithmetic reconciles.`,
      });
    }
  }

  const attributable = metrics.attributable_np?.current;
  const adjusted = metrics.adjusted_np?.current;
  const nonRecurring = metrics.non_recurring_total?.current;
  if (
    attributable !== undefined &&
    adjusted !== undefined &&
    nonRecurring !== undefined
  ) {
    const bridged = attributable - nonRecurring;
    if (!approxEqual(bridged, adjusted)) {
      issues.push({
        code: "BRIDGE_RECONCILIATION_FAIL",
        severity: "FAIL",
        field: "adjusted_np",
        message: `F-02 bridge failed: attributable NP ${attributable} - non-recurring ${nonRecurring} = ${bridged}, expected adjusted NP ${adjusted}.`,
      });
    }
  }
  return issues;
}

export function parseFinancialReportV05(
  items: PdfTextItem[],
  source: SourceMeta,
): ParseResultV05 {
  const issues: ParseIssueV05[] = [];
  if (!source?.sourceId || !source?.period || !source?.url) {
    issues.push({
      code: "SOURCE_META_MISSING",
      severity: "FAIL",
      message:
        "sourceId/period/url must be injected by the import context; parser must never hard-code a source identifier.",
    });
  }

  const rows = groupRows(items);
  const detection = detectPrimaryTableColumns(rows);
  const metrics: Partial<Record<MetricKey, MetricValue>> = {};
  if (!detection) {
    issues.push({
      code: "TABLE_HEADER_NOT_FOUND",
      severity: "FAIL",
      message: "Primary financial table header was not found with usable geometry.",
    });
  } else {
    Object.assign(
      metrics,
      parsePrimaryMetricsV05(
        rows.filter((row) => row.page === detection.page),
        source,
        detection.bounds,
      ),
    );
  }

  const nonRecurring = parseNonRecurringTotal(rows, source);
  if (nonRecurring) {
    metrics.non_recurring_total = nonRecurring;
  } else {
    issues.push({
      code: "NON_RECURRING_TOTAL_NOT_FOUND",
      severity: "FAIL",
      field: "non_recurring_total",
      message:
        "Non-recurring P&L total was not found across the section/page boundary.",
    });
  }

  issues.push(...validateV05(metrics));
  const blockers = issues.filter((issue) => issue.severity === "FAIL");
  return {
    source,
    metrics,
    issues,
    blockers,
    canPromoteToEvidence: blockers.length === 0,
  };
}
