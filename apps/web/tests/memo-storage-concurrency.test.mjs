import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import test from "node:test";
import { createMemoRun } from "../lib/research-memo.server.ts";
import { appendMemoRun, appendMemoReview, memoStorageKey } from "../lib/research-memo-storage.ts";
import { parseResearchReport, extractCandidates, createResearchSnapshot } from "../lib/research-engine.ts";
import { verifiedSampleItems } from "../lib/sample-s05.ts";
import { getSourceRecord } from "../lib/source-records.ts";
import { appendVersion } from "../lib/research-versions.ts";

const output = {
  summary: { text: "扣非表现提供支持，但归母利润的反向变化需要共同解释。", citations: ["EV-S-05-C04-ADJ", "EV-S-05-C04-ATTR"] },
  supporting: [{ text: "扣非表现支持继续核查核心经营改善的判断。", citations: ["EV-S-05-C04-ADJ"] }],
  counter: [{ text: "归母利润下滑构成反证，不能仅凭扣非指标概括整体表现。", citations: ["EV-S-05-C04-ATTR"] }],
  alternatives: [{ text: "可能存在调整项性质影响利润比较的解释，仍须专业复核。", citations: ["EV-S-05-C04-NR", "A-03"] }],
  questions: [{ text: "需要核对调整项是否具有经常性。", citations: ["A-03"] }, { text: "需要补充可比期间材料。", citations: ["K-07"] }],
  gates: { eg01: "pending", eg02: "pending" },
};
const wire = { ...output, supporting: output.supporting[0], counter: output.counter[0], alternatives: output.alternatives[0], questions: { first: output.questions[0], second: output.questions[1] } };
const config = { provider: "deepseek", apiKey: "synthetic-not-a-real-key", accessToken: "synthetic-not-a-real-access-code", model: "deepseek-v4-pro" };

function versionFixture() {
  const source = getSourceRecord("S-05");
  const result = parseResearchReport(verifiedSampleItems, source);
  return createResearchSnapshot({ versionId: "V-02", parentVersionId: "V-01", createdAt: "2026-09-05T00:00:00Z", reviewer: "Synthetic evidence reviewer", scope: "research",
    source: { name: "Synthetic sample", sourceId: source.sourceId, period: source.period, url: source.url, size: 0, pageCount: 14, mode: "sample" }, result,
    candidates: extractCandidates(result).map(item => ({ ...item, reviewStatus: "accepted" })) });
}
async function runFixture(label) {
  return createMemoRun(versionFixture(), config, { fetcher: async () => Response.json({ id: `response_${label}`, model: "test-transport-not-live", status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(wire) }] }] }) });
}

function browserContexts(t) {
  const context = new AsyncLocalStorage();
  const data = new Map();
  const queues = new Map();
  const acquired = [];
  let failWriteFor = null;
  const locks = { request(key, operation) {
    const tab = context.getStore();
    assert.ok(tab, "lock request must retain its browser execution context");
    const prior = queues.get(key) ?? Promise.resolve();
    const result = prior.then(async () => {
      acquired.push(tab.id);
      tab.holds.add(key);
      try { return await operation(); } finally { tab.holds.delete(key); }
    });
    queues.set(key, result.catch(() => {}));
    return result;
  } };
  const tabs = ["tab-a", "tab-b"].map(id => {
    const tab = { id, holds: new Set(), isSecureContext: true, crypto: globalThis.crypto };
    tab.localStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => {
        if (key === memoStorageKey("research")) {
          assert.equal(tab.holds.has(key), true, "memo ledger writes must hold the cross-tab lock");
          if (failWriteFor === id) { failWriteFor = null; throw new Error("quota exceeded"); }
        }
        data.set(key, value);
      },
    };
    tab.navigator = { locks };
    tab.dispatchEvent = () => {};
    return tab;
  });
  const previousWindow = globalThis.window;
  globalThis.window = new Proxy({}, { get: (_target, property) => context.getStore()?.[property] });
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  return {
    tabs, data, acquired,
    run: (tab, operation) => context.run(tab, operation),
    failNextWrite: tab => { failWriteFor = tab.id; },
    ledger: () => JSON.parse(data.get(memoStorageKey("research")) ?? '{"runs":[],"reviews":[]}'),
  };
}

test("separate tabs serialize concurrent memo run and review appends without loss or reordering", async t => {
  const browser = browserContexts(t);
  const version = versionFixture();
  browser.run(browser.tabs[0], () => appendVersion(version));
  const [first, second] = await Promise.all([runFixture("first"), runFixture("second")]);

  await Promise.all([
    browser.run(browser.tabs[0], () => appendMemoRun(first, version, "research")),
    browser.run(browser.tabs[1], () => appendMemoRun(second, version, "research")),
  ]);
  assert.deepEqual(browser.ledger().runs.map(run => run.runId), [first.runId, second.runId]);
  assert.deepEqual(browser.acquired, ["tab-a", "tab-b"]);

  browser.acquired.length = 0;
  await Promise.all([
    browser.run(browser.tabs[0], () => appendMemoReview(first.runId, "accepted", "Reviewer A", "first review", "research")),
    browser.run(browser.tabs[1], () => appendMemoReview(first.runId, "rejected", "Reviewer B", "second review", "research")),
  ]);
  const ledger = browser.ledger();
  assert.equal(ledger.runs.length, 2);
  assert.deepEqual(ledger.reviews.map(review => review.status), ["accepted", "rejected"]);
  assert.deepEqual(browser.acquired, ["tab-a", "tab-b"]);
});

test("quota failure leaves memo history byte-identical, releases the lock, and cannot create duplicates", async t => {
  const browser = browserContexts(t);
  const version = versionFixture();
  browser.run(browser.tabs[0], () => appendVersion(version));
  const [first, second] = await Promise.all([runFixture("quota_first"), runFixture("quota_second")]);
  await browser.run(browser.tabs[0], () => appendMemoRun(first, version, "research"));
  const before = browser.data.get(memoStorageKey("research"));

  browser.failNextWrite(browser.tabs[1]);
  await assert.rejects(browser.run(browser.tabs[1], () => appendMemoRun(second, version, "research")), /quota/);
  assert.equal(browser.data.get(memoStorageKey("research")), before);
  await browser.run(browser.tabs[0], () => appendMemoRun(second, version, "research"));
  await assert.rejects(browser.run(browser.tabs[1], () => appendMemoRun(second, version, "research")), /已存在/);
  assert.deepEqual(browser.ledger().runs.map(run => run.runId), [first.runId, second.runId]);
  assert.equal(new Set(browser.ledger().runs.map(run => run.runId)).size, 2);
});
