import assert from "node:assert/strict";
import test from "node:test";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  parseFinancialReportV05Strict,
  V05_PRIMARY_SCHEMA,
} from "../lib/parser-v05-strict.ts";

const SOURCES = [
  {
    sourceId: "S-05",
    period: "2026Q1",
    url: "https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF",
  },
  {
    sourceId: "S-06",
    period: "2026H1",
    url: "https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF",
  },
  {
    sourceId: "S-07",
    period: "2025H1",
    url: "https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF",
  },
];

async function extract(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; FinanceCompetitionRegression/0.5-strict)",
      accept: "application/pdf,*/*;q=0.8",
    },
  });
  assert.equal(response.ok, true);
  const data = new Uint8Array(await response.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const items = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      if (typeof raw?.str !== "string" || !Array.isArray(raw?.transform)) continue;
      const x = Number(raw.transform[4]);
      const y = Number(raw.transform[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      items.push({ str: raw.str, x, y, page: pageNumber, width: raw.width });
    }
  }
  return items;
}

for (const source of SOURCES) {
  test(`V0.5 strict schema ${source.sourceId}`, async () => {
    const result = parseFinancialReportV05Strict(await extract(source.url), source);
    assert.deepEqual(result.blockers, [], JSON.stringify(result.blockers));
    assert.equal(result.canPromoteToEvidence, true);

    for (const field of V05_PRIMARY_SCHEMA) {
      const metric = result.metrics[field.key];
      assert.ok(metric, `${source.sourceId}: missing ${field.key}`);
      assert.equal(metric.label, field.label);
      assert.notEqual(metric.current, undefined);
      assert.notEqual(metric.comparison, undefined);
      assert.notEqual(metric.disclosedChange, undefined);
    }

    assert.ok(result.metrics.non_recurring_total);
    assert.equal(result.metrics.non_recurring_total.label, "非经常性损益合计");
  });
}

test("V0.5 strict gate blocks an entirely missing primary row", async () => {
  // Deliberately provide no primary table at all. The base parser will report
  // header failure; the strict wrapper must additionally make the frozen
  // expected schema explicit instead of silently accepting absent rows.
  const source = { sourceId: "TEST", period: "TEST", url: "https://example.invalid/test.pdf" };
  const result = parseFinancialReportV05Strict([], source);
  assert.equal(result.canPromoteToEvidence, false);
  const missingFields = new Set(
    result.blockers
      .filter((issue) => issue.code === "PRIMARY_ROW_INCOMPLETE")
      .map((issue) => issue.field),
  );
  for (const field of V05_PRIMARY_SCHEMA) {
    assert.equal(missingFields.has(field.key), true, `missing gate for ${field.key}`);
  }
});
