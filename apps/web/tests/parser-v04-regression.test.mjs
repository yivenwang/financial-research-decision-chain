import assert from "node:assert/strict";
import test from "node:test";
const parser = await import(new URL("../lib/parser-v04.ts", import.meta.url));

const X = { label: 80, current: 390, comparison: 550, change: 710 };
const item = (str, x, y, page) => ({ str, x, y, page });
const header = (page, y = 700) => [
  item("项目", X.label, y, page),
  item("本报告期", X.current, y, page),
  item("上年同期", X.comparison, y, page),
  item("本报告期比上年同期增减（%）", X.change, y, page),
];
const wrappedHeader = (page) => [
  item("项目", X.label, 700, page),
  item("本报告期", X.current, 700, page),
  item("上年同期", X.comparison, 700, page),
  item("本报告期比上年同期增减", X.change, 680, page),
  item("（%）", X.change, 670, page),
];
const row = (label, current, comparison, change, y, page) => [
  item(label, X.label, y, page),
  item(current, X.current, y, page),
  item(comparison, X.comparison, y, page),
  item(change, X.change, y, page),
];

const S05 = {
  sourceId: "S-05",
  period: "2026Q1",
  url: "https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF",
};
const s05Items = [
  ...header(2),
  item("归属于上市公司股东的净利", X.label, 660, 2),
  ...row("润（元）", "471,594,189.71", "495,761,205.29", "-4.87%", 650, 2),
  item("归属于上市公司股东的扣除", X.label, 620, 2),
  item("非经常性损益的净利润", X.label, 610, 2),
  ...row("（元）", "546,758,896.90", "439,558,407.22", "24.39%", 600, 2),
  item("（二）非经常性损益项目和金额", X.label, 500, 2),
  item("合计", X.label, 700, 3),
  item("-75,164,707.19", 420, 700, 3),
];

const S06 = {
  sourceId: "S-06",
  period: "2026H1",
  url: "https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF",
};
const s06Items = [
  ...wrappedHeader(7),
  ...row(
    "归属于上市公司股东的净利润（元）",
    "1,702,037,215.39",
    "1,166,916,872.80",
    "45.86%",
    660,
    7,
  ),
  item("归属于上市公司股东的扣除非经常性损", X.label, 630, 7),
  ...row("益的净利润（元）", "1,438,775,165.82", "961,405,802.59", "49.65%", 620, 7),
  item("六、非经常性损益项目及金额", X.label, 400, 7),
  item("合计", X.label, 650, 8),
  item("263,262,049.57", 420, 650, 8),
];

function assertClose(actual, expected) {
  assert.ok(actual !== undefined);
  assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} !== ${expected}`);
}

test("V0.4 regression S-05 closes F-02", () => {
  const result = parser.parseFinancialReport(s05Items, S05);
  assert.equal(result.canPromoteToEvidence, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.metrics.attributable_np.sourceId, "S-05");
  assertClose(result.metrics.attributable_np.current, 471.59418971);
  assertClose(result.metrics.attributable_np.disclosedChange, -0.0487);
  assertClose(result.metrics.adjusted_np.current, 546.7588969);
  assertClose(result.metrics.adjusted_np.disclosedChange, 0.2439);
  assertClose(result.metrics.non_recurring_total.current, -75.16470719);
});

test("V0.4 regression S-06 inherits metadata and closes F-02", () => {
  const result = parser.parseFinancialReport(s06Items, S06);
  assert.equal(result.canPromoteToEvidence, true);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.metrics.attributable_np.sourceId, "S-06");
  assertClose(result.metrics.attributable_np.current, 1702.03721539);
  assertClose(result.metrics.attributable_np.disclosedChange, 0.4586);
  assertClose(result.metrics.adjusted_np.current, 1438.77516582);
  assertClose(result.metrics.adjusted_np.disclosedChange, 0.4965);
  assertClose(result.metrics.non_recurring_total.current, 263.26204957);
  assertClose(
    result.metrics.attributable_np.current -
      result.metrics.non_recurring_total.current,
    result.metrics.adjusted_np.current,
  );
  assert.notEqual(result.metrics.attributable_np.disclosedChange, 80.4586);
  assert.notEqual(result.metrics.adjusted_np.disclosedChange, 59.4965);
});

test("V0.4 blocks incomplete or inconsistent candidates", () => {
  const withoutTotal = parser.parseFinancialReport(
    s06Items.filter((candidate) => candidate.str !== "合计"),
    S06,
  );
  assert.equal(withoutTotal.canPromoteToEvidence, false);
  assert.ok(
    withoutTotal.blockers.some(
      (issue) => issue.code === "REQUIRED_FIELD_MISSING",
    ),
  );
  assert.ok(
    withoutTotal.blockers.some(
      (issue) => issue.code === "NON_RECURRING_TOTAL_NOT_FOUND",
    ),
  );

  const wrongYoY = s06Items.map((candidate) =>
    candidate.str === "45.86%"
      ? { ...candidate, str: "8045.86%" }
      : candidate,
  );
  const inconsistent = parser.parseFinancialReport(wrongYoY, S06);
  assert.equal(inconsistent.canPromoteToEvidence, false);
  assert.ok(
    inconsistent.blockers.some(
      (issue) => issue.code === "YOY_RECONCILIATION_FAIL",
    ),
  );
});
