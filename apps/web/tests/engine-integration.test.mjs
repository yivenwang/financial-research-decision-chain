import assert from "node:assert/strict";
import test from "node:test";
import { parseResearchReport, extractCandidates, reviewAndRun, createResearchSnapshot } from "../lib/research-engine.ts";
import { verifiedSampleItems } from "../lib/sample-s05.ts";
import { getSourceRecord, resolveSourceRecord } from "../lib/source-records.ts";
import { baselineVersion, appendVersion, createRollbackSnapshot, readStoredVersions, storageKeys } from "../lib/research-versions.ts";

const source = getSourceRecord("S-05");
const parsed = () => parseResearchReport(verifiedSampleItems, source);
const accepted = (result) => extractCandidates(result).map((item) => ({ ...item, reviewStatus: "accepted" }));
const create = (result, candidates, overrides = {}) => createResearchSnapshot({
  versionId: "V-02", parentVersionId: "V-01", createdAt: "2026-09-05T00:00:00.000Z", reviewer: "Unit reviewer",
  source: { name: source.name, sourceId: source.sourceId, period: source.period, url: source.url, size: 0, pageCount: 14, mode: "sample" },
  result, candidates, scope: "research", ...overrides,
});

test("strict parser and frozen chain produce a reviewable, gated snapshot", () => {
  const result = parsed();
  assert.equal(Object.keys(result.metrics).length, 10);
  assert.deepEqual(result.blockers, []);
  const snapshot = create(result, accepted(result));
  assert.equal(snapshot.parser.version, "V0.6-strict");
  assert.equal(snapshot.claim.systemSignal, "增强");
  assert.equal(snapshot.claim.after, "成立");
  assert.equal(snapshot.chain.decision.formalRecommendation, null);
  assert.deepEqual(snapshot.blockedGates, ["EG-01", "EG-02"]);
  assert.equal(snapshot.chain.valuation.scenarios, null);
  assert.ok(snapshot.chain.valuation.blockedGates.includes("VALUATION_SHARE_COUNT_MISSING"));
  assert.deepEqual(snapshot.chain.graphDiff.unchangedNodeIds, ["C-01", "C-02", "C-03", "C-05", "C-06"]);
  assert.equal(snapshot.humanReview.scope, "evidence-only");
  assert.equal(snapshot.humanReview.identityVerified, false);
});

test("an absent primary row blocks promotion even when the profit bridge closes", () => {
  const result = parseResearchReport(verifiedSampleItems.filter((item) => item.y !== 665), source);
  assert.ok(result.blockers.some((item) => item.field === "revenue"));
  assert.equal(reviewAndRun(result, accepted(result), "missing-row").chain, null);
  assert.throws(() => create(result, accepted(result)));
});

test("pending, rejected, duplicate, non-finite, inconsistent and misattributed evidence is blocked", () => {
  const result = parsed();
  const cases = [
    extractCandidates(result),
    accepted(result).map((item, i) => i === 0 ? { ...item, reviewStatus: "rejected" } : item),
    [...accepted(result), accepted(result)[0]],
    accepted(result).map((item, i) => i === 0 ? { ...item, valueMn: Number.NaN } : item),
    accepted(result).map((item, i) => i === 0 ? { ...item, valueMn: 1 } : item),
    accepted(result).map((item, i) => i === 0 ? { ...item, sourceId: "different-source" } : item),
    accepted(result).map((item, i) => i === 0 ? { ...item, comparisonMn: 1 } : item),
  ];
  for (const candidates of cases) assert.throws(() => create(result, candidates));
  const unclosed = accepted(result).map((item) => item.metricKey === "non_recurring_total" ? { ...item, valueMn: 0 } : item);
  assert.equal(reviewAndRun(result, unclosed, "unclosed").chain, null);
});

test("review annotations cannot overwrite rule-derived directions or erase original values", () => {
  const result = parsed();
  const candidates = accepted(result).map((item) => ({ ...item, direction: "反证", label: "人工注释" }));
  const snapshot = create(result, candidates);
  assert.equal(snapshot.claim.systemSignal, "增强");
  assert.equal(snapshot.chain.evidence.find((item) => item.metricKey === "adjusted_np").direction, "支持");
  assert.equal(snapshot.evidence[1].direction, "反证");
  assert.equal(snapshot.parser.originalMetrics.adjusted_np.current, result.metrics.adjusted_np.current);
  assert.throws(() => create(result, candidates, { reviewer: " " }));
});

test("company and period are resolved from PDF text, not a renamed filename", () => {
  assert.equal(resolveSourceRecord("安克创新2026第一季度报告.pdf", "另一家公司 2026 年第一季度报告"), undefined);
  assert.equal(resolveSourceRecord("renamed.pdf", "安克创新科技股份有限公司 2026 年第一季度报告").sourceId, "S-05");
  assert.equal(resolveSourceRecord("2026Q1.pdf", "安克创新科技股份有限公司 2026 年半年度报告").sourceId, "S-06");
});

test("append and rollback preserve prior snapshots, isolate regression, and protect unreadable history", () => {
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, dispatchEvent() {} };
  try {
    const result = parsed();
    const snapshot = create(result, accepted(result));
    appendVersion(snapshot);
    const original = data.get(storageKeys().versions);
    const regression = { ...structuredClone(snapshot), workspace: "regression", source: { ...snapshot.source, sourceId: "S-06", period: "2026H1" } };
    assert.throws(() => appendVersion(regression, "research"));
    appendVersion(regression, "regression");
    assert.equal(data.get(storageKeys().versions), original);
    assert.equal(readStoredVersions("regression").length, 1);
    const rollback = createRollbackSnapshot(baselineVersion, readStoredVersions(), "V-02", "research");
    appendVersion(rollback);
    assert.deepEqual(readStoredVersions()[0], snapshot);
    const restored = createRollbackSnapshot(snapshot, readStoredVersions(), rollback.versionId, "research");
    appendVersion(restored);
    assert.deepEqual(readStoredVersions().at(-1).chain, snapshot.chain);
    assert.equal(readStoredVersions().length, 3);
    assert.equal(readStoredVersions("regression").length, 1);
    data.set(storageKeys().versions, "corrupt-history");
    assert.throws(() => appendVersion({ ...snapshot, versionId: "V-99" }));
    assert.equal(data.get(storageKeys().versions), "corrupt-history");
  } finally { delete globalThis.window; }
});
