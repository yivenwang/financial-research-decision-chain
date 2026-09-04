import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { parseFinancialReportV05 } from "../lib/parser-v05.ts";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const CASES = [
  {
    source: {
      sourceId: "S-05",
      period: "2026Q1",
      url: "https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF",
    },
    expected: {
      revenue: [7607.64554567, 5993.38110611, 0.2693],
      attributable_np: [471.59418971, 495.76120529, -0.0487],
      adjusted_np: [546.7588969, 439.55840722, 0.2439],
      operating_cash_flow: [-450.63180874, -287.6569709, -0.5666],
      basic_eps: [0.8796, 0.9329, -0.0571],
      diluted_eps: [0.8714, 0.9312, -0.0642],
      roe: [0.0435, 0.0541, -0.0106],
      total_assets: [20228.35775174, 20066.89245386, 0.008],
      attributable_equity: [11170.90998281, 10527.60326538, 0.0611],
      non_recurring_total: [-75.16470719, null, null],
    },
  },
  {
    source: {
      sourceId: "S-06",
      period: "2026H1",
      url: "https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF",
    },
    expected: {
      revenue: [16605.00875342, 12866.76277948, 0.2905],
      attributable_np: [1702.03721539, 1166.9168728, 0.4586],
      adjusted_np: [1438.77516582, 961.40580259, 0.4965],
      operating_cash_flow: [722.52939501, -1132.22095062, 1.6382],
      basic_eps: [3.1743, 2.1958, 0.4456],
      diluted_eps: [3.127, 2.1771, 0.4363],
      roe: [0.1511, 0.1259, 0.0252],
      total_assets: [22420.15572709, 20066.89245386, 0.1173],
      attributable_equity: [11591.72441395, 10527.60326538, 0.1011],
      non_recurring_total: [263.26204957, null, null],
    },
  },
  {
    source: {
      sourceId: "S-07",
      period: "2025H1",
      url: "https://static.cninfo.com.cn/finalpage/2025-08-29/1224614835.PDF",
    },
    expected: {
      revenue: [12866.76277948, 9648.32722181, 0.3336],
      attributable_np: [1166.9168728, 872.12618617, 0.338],
      adjusted_np: [961.40580259, 765.76531177, 0.2555],
      operating_cash_flow: [-1132.22095062, 841.30128092, -2.3458],
      basic_eps: [2.1958, 1.6505, 0.3304],
      diluted_eps: [2.1771, 1.6397, 0.3277],
      roe: [0.1259, 0.1044, 0.0215],
      total_assets: [18672.2079713, 16603.70726271, 0.1246],
      attributable_equity: [9137.00692623, 8958.04337063, 0.02],
      non_recurring_total: [205.51107021, null, null],
    },
  },
];

async function fetchItems(source) {
  const response = await fetch(source.url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; FinanceCompetitionRegression/0.5; +https://github.com/yivenwang/financial-research-decision-chain)",
      accept: "application/pdf,*/*;q=0.8",
    },
  });
  assert.equal(response.ok, true, `PDF fetch failed ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  assert.ok(data.byteLength > 10_000);
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

function close(actual, expected, eps = 1e-7) {
  assert.notEqual(actual, undefined);
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);
}

for (const c of CASES) {
  test(`V0.5 real PDF regression ${c.source.sourceId}`, async () => {
    const items = await fetchItems(c.source);
    const result = parseFinancialReportV05(items, c.source);
    await mkdir("artifacts-v05", { recursive: true });
    await writeFile(
      `artifacts-v05/${c.source.sourceId}.json`,
      JSON.stringify(result, null, 2),
    );

    assert.equal(result.source.sourceId, c.source.sourceId);
    assert.deepEqual(result.blockers, [], JSON.stringify(result.blockers));
    assert.equal(result.canPromoteToEvidence, true);

    for (const [key, expected] of Object.entries(c.expected)) {
      const metric = result.metrics[key];
      assert.ok(metric, `${c.source.sourceId} missing ${key}`);
      close(metric.current, expected[0]);
      if (expected[1] !== null) close(metric.comparison, expected[1]);
      if (expected[2] !== null) close(metric.disclosedChange, expected[2]);
    }

    close(
      result.metrics.attributable_np.current -
        result.metrics.non_recurring_total.current,
      result.metrics.adjusted_np.current,
    );
  });
}
