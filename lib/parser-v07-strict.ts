import type { PdfTextItem, SourceMeta } from './parser-v04.ts';
import { V05_PRIMARY_SCHEMA } from './parser-v05-strict.ts';
import { parseFinancialReportV07, type ParseResultV07 } from './parser-v07.ts';

export function parseFinancialReportV07Strict(
  items: PdfTextItem[],
  source: SourceMeta,
): ParseResultV07 {
  const base = parseFinancialReportV07(items, source);
  const metrics = { ...base.metrics };
  const issues = [...base.issues];

  for (const field of V05_PRIMARY_SCHEMA) {
    const metric = metrics[field.key];
    if (!metric) {
      issues.push({
        code: 'PRIMARY_ROW_INCOMPLETE',
        severity: 'FAIL',
        field: field.key,
        message: `${field.key}: expected primary-table row was not parsed; promotion must be blocked.`,
      });
      continue;
    }
    metrics[field.key] = { ...metric, label: field.label };
  }

  if (metrics.non_recurring_total) {
    metrics.non_recurring_total = { ...metrics.non_recurring_total, label: '非经常性损益合计' };
  }

  const blockers = issues.filter((issue) => issue.severity === 'FAIL');
  return {
    source: base.source,
    metrics,
    issues,
    blockers,
    canPromoteToEvidence: blockers.length === 0,
  };
}
