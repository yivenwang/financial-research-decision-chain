import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

const parser = await import(new URL("../lib/parser-v04.ts", import.meta.url));
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const CASES = [
  {
    source: {
      sourceId: "S-05",
      period: "2026Q1",
      url: "https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF",
    },
    expected: {
      attributable_np: 471.59418971,
      attributable_yoy: -0.0487,
      adjusted_np: 546.7588969,
      adjusted_yoy: 0.2439,
      non_recurring_total: -75.16470719,
    },
  },
  {
    source: {
      sourceId: "S-06",
      period: "2026H1",
      url: "https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF",
    },
    expected: {
      attributable_np: 1702.03721539,
      attributable_yoy: 0.4586,
      adjusted_np: 1438.77516582,
      adjusted_yoy: 0.4965,
      non_recurring_total: 263.26204957,
    },
  },
];

async function fetchPdf(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; FinanceCompetitionRegression/0.4; +https://github.com/yivenwang/financial-research-decision-chain)",
      accept: "application/pdf,*/*;q=0.8",
    },
  });
  assert.equal(response.ok, true, `PDF fetch failed ${response.status} ${url}`);
  const data = new Uint8Array(await response.arrayBuffer());
  assert.ok(data.byteLength > 10_000, `PDF unexpectedly small: ${data.byteLength}`);
  return data;
}

async function extractPdfItems(data) {
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
      items.push({
        str: raw.str,
        x,
        y,
        page: pageNumber,
        width: typeof raw.width === "number" ? raw.width : undefined,
      });
    }
  }
  return { items, pageCount: document.numPages };
}

function assertClose(actual, expected, eps = 1e-8) {
  assert.ok(actual !== undefined, `Expected ${expected}, got undefined`);
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} !== ${expected}`);
}

async function saveAudit(caseId, extraction, result) {
  await mkdir("artifacts", { recursive: true });
  const compactItems = extraction.items.filter(
    (item) => [2, 3, 7, 8].includes(item.page),
  );
  await writeFile(
    `artifacts/${caseId.toLowerCase()}-e2e.json`,
    JSON.stringify(
      {
        source: result.source,
        pageCount: extraction.pageCount,
        metrics: result.metrics,
        issues: result.issues,
        blockers: result.blockers,
        canPromoteToEvidence: result.canPromoteToEvidence,
        relevantTextItems: compactItems,
      },
      null,
      2,
    ),
  );
}

for (const regressionCase of CASES) {
  test(`V0.4 real PDF.js E2E ${regressionCase.source.sourceId}`, async () => {
    const data = await fetchPdf(regressionCase.source.url);
    const extraction = await extractPdfItems(data);
    const result = parser.parseFinancialReport(extraction.items, regressionCase.source);
    await saveAudit(regressionCase.source.sourceId, extraction, result);

    assert.equal(result.source.sourceId, regressionCase.source.sourceId);
    assert.equal(result.blockers.length, 0, JSON.stringify(result.blockers));
    assert.equal(result.canPromoteToEvidence, true);

    assertClose(
      result.metrics.attributable_np?.current,
      regressionCase.expected.attributable_np,
    );
    assertClose(
      result.metrics.attributable_np?.disclosedChange,
      regressionCase.expected.attributable_yoy,
    );
    assertClose(
      result.metrics.adjusted_np?.current,
      regressionCase.expected.adjusted_np,
    );
    assertClose(
      result.metrics.adjusted_np?.disclosedChange,
      regressionCase.expected.adjusted_yoy,
    );
    assertClose(
      result.metrics.non_recurring_total?.current,
      regressionCase.expected.non_recurring_total,
    );

    const bridge =
      result.metrics.attributable_np.current -
      result.metrics.non_recurring_total.current;
    assertClose(bridge, result.metrics.adjusted_np.current);

    if (regressionCase.source.sourceId === "S-06") {
      assert.notEqual(result.metrics.attributable_np.disclosedChange, 80.4586);
      assert.notEqual(result.metrics.adjusted_np.disclosedChange, 59.4965);
    }
  });
}
