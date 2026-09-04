/**
 * Finance Competition MVP V0.4 — geometry-preserving PDF table parser.
 *
 * The parser receives source metadata from the import context and keeps the
 * x/y/page geometry emitted by pdf.js. Numeric values are read inside the
 * detected table cells; no document-wide text/regex window is used.
 */

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  page: number;
  width?: number;
};

export type SourceMeta = {
  sourceId: string;
  period: string;
  url: string;
};

export type MetricKey =
  | "revenue"
  | "attributable_np"
  | "adjusted_np"
  | "operating_cash_flow"
  | "basic_eps"
  | "diluted_eps"
  | "roe"
  | "total_assets"
  | "attributable_equity"
  | "non_recurring_total";

export type MetricValue = {
  key: MetricKey;
  label: string;
  current?: number;
  comparison?: number;
  disclosedChange?: number;
  unit: "CNY_mn" | "CNY_share" | "ratio";
  sourceId: string;
  page: number;
  confidence: number;
};

export type ParseIssue = {
  code:
    | "SOURCE_META_MISSING"
    | "TABLE_HEADER_NOT_FOUND"
    | "AMBIGUOUS_COLUMNS"
    | "REQUIRED_FIELD_MISSING"
    | "YOY_RECONCILIATION_FAIL"
    | "BRIDGE_RECONCILIATION_FAIL"
    | "EXTREME_DISCLOSED_CHANGE"
    | "NON_RECURRING_TOTAL_NOT_FOUND";
  severity: "FAIL" | "WARN";
  message: string;
  page?: number;
  field?: MetricKey;
};

export type ParseResult = {
  source: SourceMeta;
  metrics: Partial<Record<MetricKey, MetricValue>>;
  issues: ParseIssue[];
  blockers: ParseIssue[];
  canPromoteToEvidence: boolean;
};

type Row = {
  page: number;
  y: number;
  items: PdfTextItem[];
  text: string;
};

type ColBounds = {
  labelMax: number;
  currentMax: number;
  comparisonMax: number;
  changeMax: number;
};

type TableDetection = {
  page: number;
  y: number;
  bounds: ColBounds;
};

const Y_TOL = 3;
const HEADER_Y_TOL = 28;

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

function parseCellNumber(value: string): number | undefined {
  const normalized = clean(value).replace(/[−–—]/g, "-");
  const exact = parseNumber(normalized);
  if (exact !== undefined) return exact;

  const token = normalized.match(/[-+]?\d[\d,]*(?:\.\d+)?%?/g)?.[0];
  return token ? parseNumber(token) : undefined;
}

function toMn(value: number): number {
  return value / 1_000_000;
}

export function groupRows(items: PdfTextItem[]): Row[] {
  const sorted = [...items].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x,
  );
  const rows: Row[] = [];

  for (const item of sorted) {
    let row = rows.find(
      (candidate) =>
        candidate.page === item.page && Math.abs(candidate.y - item.y) <= Y_TOL,
    );
    if (!row) {
      row = { page: item.page, y: item.y, items: [], text: "" };
      rows.push(row);
    }
    row.items.push(item);
  }

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map((item) => item.str).join("");
  }

  rows.sort((a, b) => a.page - b.page || b.y - a.y);
  return rows;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : Number.NaN;
}

export function detectPrimaryTableColumns(
  rows: Row[],
): TableDetection | undefined {
  for (const row of rows) {
    const nearbyRows = rows.filter(
      (candidate) =>
        candidate.page === row.page &&
        Math.abs(candidate.y - row.y) <= HEADER_Y_TOL,
    );
    const joined = clean(nearbyRows.map((candidate) => candidate.text).join(""));
    const hasCurrent = joined.includes("本报告期");
    const hasComparison =
      joined.includes("上年同期") || joined.includes("上年度末");
    const hasChange = joined.includes("增减") || joined.includes("同比");
    if (!(hasCurrent && hasComparison && hasChange)) continue;

    const currentOnRow = row.items
      .filter((item) => /^(本报告期|本报告期末)$/.test(clean(item.str)))
      .map((item) => item.x);
    const comparisonOnRow = row.items
      .filter((item) => /^(上年同期|上年度末)$/.test(clean(item.str)))
      .map((item) => item.x);
    const changeOnRow = row.items
      .filter(
        (item) =>
          /增减|同比/.test(clean(item.str)) &&
          !/^(本报告期|本报告期末|上年同期|上年度末)$/.test(
            clean(item.str),
          ),
      )
      .map((item) => item.x);
    const currentXs = currentOnRow.length
      ? currentOnRow
      : nearbyRows.flatMap((candidate) =>
          candidate.items
            .filter((item) => /^(本报告期|本报告期末)$/.test(clean(item.str)))
            .map((item) => item.x),
        );
    const comparisonXs = comparisonOnRow.length
      ? comparisonOnRow
      : nearbyRows.flatMap((candidate) =>
          candidate.items
            .filter((item) => /^(上年同期|上年度末)$/.test(clean(item.str)))
            .map((item) => item.x),
        );
    const changeXs = changeOnRow.length
      ? changeOnRow
      : nearbyRows.flatMap((candidate) =>
          candidate.items
            .filter(
              (item) =>
                /增减|同比/.test(clean(item.str)) &&
                !/^(本报告期|本报告期末|上年同期|上年度末)$/.test(
                  clean(item.str),
                ),
            )
            .map((item) => item.x),
        );

    if (!currentXs.length || !comparisonXs.length || !changeXs.length) {
      continue;
    }

    const current = median(currentXs);
    const comparison = median(comparisonXs);
    const change = Math.min(...changeXs);
    if (!(current < comparison && comparison < change)) continue;

    return {
      page: row.page,
      y: row.y,
      bounds: {
        labelMax: current - (comparison - current) / 2,
        currentMax: (current + comparison) / 2,
        comparisonMax: (comparison + change) / 2,
        changeMax: Number.POSITIVE_INFINITY,
      },
    };
  }
  return undefined;
}

function cellText(row: Row, minX: number, maxX: number): string {
  return row.items
    .filter((item) => item.x >= minX && item.x < maxX)
    .map((item) => item.str)
    .join("");
}

function extractCells(row: Row, bounds: ColBounds) {
  return {
    label: clean(cellText(row, Number.NEGATIVE_INFINITY, bounds.labelMax)),
    currentRaw: clean(cellText(row, bounds.labelMax, bounds.currentMax)),
    comparisonRaw: clean(
      cellText(row, bounds.currentMax, bounds.comparisonMax),
    ),
    changeRaw: clean(cellText(row, bounds.comparisonMax, bounds.changeMax)),
  };
}

function matchField(label: string) {
  const normalized = clean(label).replace(/（元）/g, "").replace(/\(元\)/g, "");
  return FIELD_PATTERNS.find((field) =>
    field.patterns.some((pattern) => pattern.test(normalized)),
  );
}

function hasNumericCell(value: string): boolean {
  return parseCellNumber(value) !== undefined;
}

export function parsePrimaryMetrics(
  rows: Row[],
  source: SourceMeta,
  bounds: ColBounds,
): Partial<Record<MetricKey, MetricValue>> {
  const metrics: Partial<Record<MetricKey, MetricValue>> = {};
  const numericRows = rows.filter((row) => {
    const cells = extractCells(row, bounds);
    return [cells.currentRaw, cells.comparisonRaw, cells.changeRaw].some(
      hasNumericCell,
    );
  });

  for (const row of numericRows) {
    const cells = extractCells(row, bounds);
    const nearbyLabel = rows
      .filter((candidate) => {
        if (candidate.page !== row.page) return false;
        const left = clean(
          cellText(candidate, Number.NEGATIVE_INFINITY, bounds.labelMax),
        );
        if (!left) return false;
        const distance = Math.abs(candidate.y - row.y);
        if (distance > 22) return false;
        const nearest = numericRows
          .filter((numeric) => numeric.page === candidate.page)
          .reduce((best, numeric) => {
            const d = Math.abs(candidate.y - numeric.y);
            return !best || d < best.distance
              ? { row: numeric, distance: d }
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

    const current = parseCellNumber(cells.currentRaw);
    const comparison = parseCellNumber(cells.comparisonRaw);
    const disclosedChange = parseCellNumber(cells.changeRaw);
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

export function parseNonRecurringTotal(
  rows: Row[],
  source: SourceMeta,
): MetricValue | undefined {
  let inSection = false;

  for (const row of rows) {
    const text = clean(row.text);
    if (/非经常性损益项目(?:及|和)金额/.test(text)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;

    if (/管理层讨论与分析|股东信息|主要会计数据和财务指标发生变动/.test(text)) {
      inSection = false;
      continue;
    }

    const numericItems = row.items
      .map((item) => ({ item, value: parseCellNumber(item.str) }))
      .filter(
        (candidate): candidate is { item: PdfTextItem; value: number } =>
          candidate.value !== undefined,
      )
      .sort((a, b) => a.item.x - b.item.x);
    const firstNumeric = numericItems[0];
    if (!firstNumeric) continue;

    const leftLabel = clean(
      row.items
        .filter((item) => item.x < firstNumeric.item.x)
        .map((item) => item.str)
        .join(""),
    );
    if (!/^合计/.test(leftLabel)) continue;

    return {
      key: "non_recurring_total",
      label: "非经常性损益合计",
      current: toMn(firstNumeric.value),
      unit: "CNY_mn",
      sourceId: source.sourceId,
      page: row.page,
      confidence: 1,
    };
  }

  return undefined;
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

function calculateChange(current: number, comparison: number): number {
  return (current - comparison) / Math.abs(comparison);
}

function validate(
  metrics: Partial<Record<MetricKey, MetricValue>>,
): ParseIssue[] {
  const issues: ParseIssue[] = [];
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

  for (const [key, metric] of Object.entries(metrics) as [
    MetricKey,
    MetricValue,
  ][]) {
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
        : calculateChange(metric.current, metric.comparison);
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

export function parseFinancialReport(
  items: PdfTextItem[],
  source: SourceMeta,
): ParseResult {
  const issues: ParseIssue[] = [];
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
      parsePrimaryMetrics(
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

  issues.push(...validate(metrics));
  const blockers = issues.filter((issue) => issue.severity === "FAIL");
  return {
    source,
    metrics,
    issues,
    blockers,
    canPromoteToEvidence: blockers.length === 0,
  };
}
