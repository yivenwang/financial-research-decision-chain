import type { SourceMeta } from "@/lib/parser-v04";

export type SourceRecord = SourceMeta & {
  name: string;
  useStatus: "development" | "regression-only";
  titlePattern: RegExp;
};

/**
 * Source records are the import-context authority. The parser only receives
 * the selected record's metadata and never owns this registry.
 */
export const sourceRecords: SourceRecord[] = [
  {
    sourceId: "S-05",
    period: "2026Q1",
    url: "https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF",
    name: "安克创新 2026 年第一季度报告",
    useStatus: "development",
    titlePattern: /2026\s*年\s*第一季度报告|2026\s*第一季度报告|2026\s*q1/i,
  },
  {
    sourceId: "S-06",
    period: "2026H1",
    url: "https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF",
    name: "安克创新 2026 年半年度报告",
    useStatus: "regression-only",
    titlePattern: /2026\s*年\s*半年度报告|2026\s*半年度报告|2026\s*h1/i,
  },
];

export function getSourceRecord(sourceId: string): SourceRecord | undefined {
  return sourceRecords.find((record) => record.sourceId === sourceId);
}

export function resolveSourceRecord(
  fileName: string,
  documentTitle: string,
): SourceRecord | undefined {
  const searchable = `${fileName} ${documentTitle}`.replace(/\s+/g, "");
  return sourceRecords.find((record) => record.titlePattern.test(searchable));
}
