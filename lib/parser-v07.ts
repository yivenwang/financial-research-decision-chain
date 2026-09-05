import type { PdfTextItem, SourceMeta } from './parser-v04.ts';
import { parseFinancialReportV06, type ParseResultV06 } from './parser-v06.ts';

export type ParseResultV07 = ParseResultV06;

/**
 * V0.7 adds one narrow compatibility normalization for older A-share wording:
 * `扣除非经常性损益后的净利润` -> `扣除非经常性损益的净利润`.
 *
 * Geometry, numbers, column selection, validation, and all downstream chain
 * rules remain unchanged. Only TextItem label text is normalized before V0.6.
 */
export function parseFinancialReportV07(
  items: PdfTextItem[],
  source: SourceMeta,
): ParseResultV07 {
  const normalized = items.map((item) => ({
    ...item,
    str: item.str.replace(/扣除非经常性损益后的净利润/g, '扣除非经常性损益的净利润'),
  }));
  return parseFinancialReportV06(normalized, source);
}
