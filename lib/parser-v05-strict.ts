import {
  parseFinancialReportV05,
  type ParseIssueV05,
  type ParseResultV05,
} from "./parser-v05.ts";
import type { MetricKey, PdfTextItem, SourceMeta } from "./parser-v04.ts";

const PRIMARY_SCHEMA: Array<{ key: MetricKey; label: string }> = [
  { key: "revenue", label: "营业收入" },
  { key: "attributable_np", label: "归属于上市公司股东的净利润" },
  { key: "adjusted_np", label: "归属于上市公司股东的扣除非经常性损益的净利润" },
  { key: "operating_cash_flow", label: "经营活动产生的现金流量净额" },
  { key: "basic_eps", label: "基本每股收益" },
  { key: "diluted_eps", label: "稀释每股收益" },
  { key: "roe", label: "加权平均净资产收益率" },
  { key: "total_assets", label: "总资产" },
  { key: "attributable_equity", label: "归属于上市公司股东的权益" },
];

/**
 * Strict V0.5 promotion gate.
 *
 * V0.4/S-07 showed that validating only metrics that happened to be parsed can
 * still allow an entire expected row to disappear silently. This wrapper
 * freezes the expected primary-table schema and blocks promotion when any row
 * is absent. It also emits canonical labels so nearby explanatory prose cannot
 * leak into downstream Evidence descriptions.
 */
export function parseFinancialReportV05Strict(
  items: PdfTextItem[],
  source: SourceMeta,
): ParseResultV05 {
  const base = parseFinancialReportV05(items, source);
  const metrics = { ...base.metrics };
  const issues: ParseIssueV05[] = [...base.issues];

  for (const field of PRIMARY_SCHEMA) {
    const metric = metrics[field.key];
    if (!metric) {
      issues.push({
        code: "PRIMARY_ROW_INCOMPLETE",
        severity: "FAIL",
        field: field.key,
        message: `${field.key}: expected primary-table row was not parsed; promotion must be blocked.`,
      });
      continue;
    }

    metrics[field.key] = {
      ...metric,
      label: field.label,
    };
  }

  if (metrics.non_recurring_total) {
    metrics.non_recurring_total = {
      ...metrics.non_recurring_total,
      label: "非经常性损益合计",
    };
  }

  const blockers = issues.filter((issue) => issue.severity === "FAIL");
  return {
    source: base.source,
    metrics,
    issues,
    blockers,
    canPromoteToEvidence: blockers.length === 0,
  };
}

export const V05_PRIMARY_SCHEMA = PRIMARY_SCHEMA.map((field) => ({ ...field }));
