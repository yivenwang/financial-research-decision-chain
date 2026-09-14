import assert from "node:assert/strict";
import test from "node:test";
import { createMemoRun } from "../lib/research-memo.server.ts";
import { canonicalJson } from "../lib/research-memo.ts";
import { appendMemoRun, appendMemoReview, memoStorageKey } from "../lib/research-memo-storage.ts";
import { appendMemoRevision, appendMemoRevisionReview, exportMemoRevision, readBoundMemoRevisions, readMemoRevisionLedger, memoRevisionStorageKey } from "../lib/research-memo-revisions.ts";
import { parseResearchReport, extractCandidates, createResearchSnapshot } from "../lib/research-engine.ts";
import { verifiedSampleItems } from "../lib/sample-s05.ts";
import { getSourceRecord } from "../lib/source-records.ts";
import { appendVersion, createRollbackSnapshot, readStoredVersions, storageKeys } from "../lib/research-versions.ts";

// Existing synthetic memo prose and labelled transport stubs; no archived live answers.
const memo = () => ({
  summary: { text: "扣非表现提供支持，但归母利润的反向变化需要共同解释。", citations: ["EV-S-05-C04-ADJ", "EV-S-05-C04-ATTR"] },
  supporting: [{ text: "扣非表现支持继续核查核心经营改善的判断。", citations: ["EV-S-05-C04-ADJ"] }],
  counter: [{ text: "归母利润下滑构成反证，不能仅凭扣非指标概括整体表现。", citations: ["EV-S-05-C04-ATTR"] }],
  alternatives: [{ text: "可能存在调整项性质影响利润比较的解释，仍须专业复核。", citations: ["EV-S-05-C04-NR", "A-03"] }],
  questions: [{ text: "需要核对调整项是否具有经常性。", citations: ["A-03"] }, { text: "需要补充可比期间材料。", citations: ["K-07"] }],
  gates: { eg01: "pending", eg02: "pending" },
});
async function fixture(t) {
  const data = new Map();
  let queued = Promise.resolve();
  globalThis.window = {
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, dispatchEvent() {},
    navigator: { locks: { request: (_key, operation) => { const result = queued.then(operation); queued = result.catch(() => {}); return result; } } },
  };
  t.after(() => { delete globalThis.window; });
  const source = getSourceRecord("S-05"), result = parseResearchReport(verifiedSampleItems, source);
  const version = createResearchSnapshot({ versionId: "V-02", parentVersionId: "V-01", createdAt: "2026-09-05T00:00:00Z", reviewer: "Synthetic evidence reviewer", scope: "research", source: { name: "Synthetic sample", sourceId: source.sourceId, period: source.period, url: source.url, size: 0, pageCount: 14, mode: "sample" }, result, candidates: extractCandidates(result).map(item => ({ ...item, reviewStatus: "accepted" })) });
  appendVersion(version);
  const output = memo();
  const raw = { ...output, supporting: output.supporting[0], counter: output.counter[0], alternatives: output.alternatives[0], questions: { first: output.questions[0], second: output.questions[1] } };
  let calls = 0;
  const run = await createMemoRun(version, { provider: "deepseek", apiKey: "synthetic-not-a-real-key", accessToken: "synthetic-not-a-real-access-code", model: "deepseek-v4-pro" }, { fetcher: async () => {
    calls++; return Response.json({ id: "response_synthetic_revision_fixture", model: "test-transport-not-live", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(raw) }] }] });
  } });
  assert.equal(run.status, "completed");
  await appendMemoRun(run, version, "research");
  await appendMemoReview(run.runId, "accepted", "Synthetic original reviewer", "Interaction test only", "research");
  const originalBytes = data.get(memoStorageKey("research")), versionBytes = data.get(storageKeys().versions);
  const binding = { runId: run.runId, versionId: version.versionId, snapshotSha256: run.context.snapshotSha256 };
  const edit = (base = run.memo) => { const value = structuredClone(base); value.summary.text += " 仍须专业复核。"; value.summary.citations = [...new Set([...value.summary.citations, "A-03"])]; return value; };
  const input = (parentRevisionId = null, value = edit()) => ({ ...binding, parentRevisionId, memo: value, author: "Synthetic editor", reason: "Explicitly retain the pending accounting assumption" });
  const reviewInput = (revision, status = "accepted") => ({ ...binding, revisionId: revision.id, contentSha256: revision.contentSha256, status, reviewer: "Synthetic revision reviewer", note: "Interaction and binding test; no professional approval" });
  const unchanged = () => { assert.equal(data.get(memoStorageKey("research")), originalBytes); assert.equal(data.get(storageKeys().versions), versionBytes); assert.equal(calls, 1); };
  return { data, run, version, binding, input, edit, reviewInput, unchanged, originalBytes, versionBytes };
}

test("revision save, read, review and export retain original bytes and never inherit original acceptance", async t => {
  const f = await fixture(t);
  const revision = await appendMemoRevision(f.input(), "research");
  let ledger = await readBoundMemoRevisions(f.binding, "research");
  assert.deepEqual(ledger.revisions, [revision]); assert.deepEqual(ledger.reviews, []);
  assert.equal(revision.origin, "human"); assert.equal(revision.identityVerified, false);
  assert.deepEqual(revision.memo.gates, { eg01: "pending", eg02: "pending" });
  let result = await exportMemoRevision({ ...f.binding, revisionId: revision.id }, "research");
  assert.match(result.markdown, /状态：修订稿待复核/);
  assert.deepEqual(result.audit.original.run, f.run);
  assert.equal(result.audit.original.reviews[0].status, "accepted");
  assert.equal(result.audit.reviews.length, 0);
  const review = await appendMemoRevisionReview(f.reviewInput(revision), "research");
  result = await exportMemoRevision({ ...f.binding, revisionId: revision.id }, "research");
  assert.match(result.markdown, /状态：人工已接受修订稿/);
  assert.match(result.markdown, /正文由人工修订/); assert.match(result.markdown, /AI 原稿与原稿审核记录/);
  assert.ok(result.markdown.includes(f.run.memo.summary.text));
  assert.equal(review.revisionId, revision.id); assert.equal(review.contentSha256, revision.contentSha256);
  assert.deepEqual(result.audit.original.run, f.run);
  assert.deepEqual((await readMemoRevisionLedger("regression")).revisions, []);
  f.unchanged();
});

test("later edits are pending, previous acceptance is preserved, and stale revisions cannot be reviewed", async t => {
  const f = await fixture(t);
  const first = await appendMemoRevision(f.input(), "research");
  const accepted = await appendMemoRevisionReview(f.reviewInput(first), "research");
  const second = await appendMemoRevision(f.input(first.id, f.edit(first.memo)), "research");
  let result = await exportMemoRevision({ ...f.binding, revisionId: second.id }, "research");
  assert.match(result.markdown, /状态：修订稿待复核/);
  assert.deepEqual(result.audit.reviews, [accepted]);
  assert.equal(result.audit.reviews.some(item => item.revisionId === second.id), false);
  const bytes = f.data.get(memoRevisionStorageKey("research"));
  await assert.rejects(appendMemoRevision(f.input(null), "research"), /更新的修订稿/);
  await assert.rejects(appendMemoRevisionReview(f.reviewInput(first), "research"), /最新修订稿/);
  await assert.rejects(appendMemoRevisionReview({ ...f.reviewInput(second), contentSha256: first.contentSha256 }, "research"), /最新修订稿/);
  assert.equal(f.data.get(memoRevisionStorageKey("research")), bytes);
  result = await exportMemoRevision({ ...f.binding, revisionId: first.id }, "research");
  assert.match(result.markdown, /状态：人工已接受修订稿/); assert.match(result.markdown, /历史修订版/);
  await appendMemoRevisionReview(f.reviewInput(second, "rejected"), "research");
  const third = await appendMemoRevision(f.input(second.id, f.edit(second.memo)), "research");
  assert.equal(third.parentRevisionId, second.id);
  assert.equal((await readMemoRevisionLedger("research")).reviews.length, 2);
  f.unchanged();
});

test("invalid text, citations, gates, binding and empty/no-change edits leave all ledgers unchanged", async t => {
  const f = await fixture(t);
  for (const mutate of [
    value => { value.memo.counter[0].citations = ["EV-S-05-C04-ADJ"]; },
    value => { value.memo.summary.citations = ["invented-source"]; },
    value => { value.memo.summary.text = "目标价 200 元。"; },
    value => { value.memo.summary.text = "研".repeat(161); },
    value => { value.memo.questions.pop(); },
    value => { value.memo.gates.eg01 = "approved"; },
    value => { value.snapshotSha256 = "0".repeat(64); },
    value => { value.versionId = "V-03"; },
    value => { value.author = " "; },
    value => { value.reason = " "; },
    value => { value.memo = f.run.memo; },
  ]) { const input = f.input(); mutate(input); await assert.rejects(appendMemoRevision(input, "research")); }
  await assert.rejects(appendMemoRevision(f.input(), "regression"), /不匹配/);
  assert.equal(f.data.has(memoRevisionStorageKey("research")), false);
  f.unchanged();
});

test("changing a source run or research snapshot blocks read, write, review and export, including rollback rebinding", async t => {
  const f = await fixture(t);
  const revision = await appendMemoRevision(f.input(), "research");
  const calls = JSON.parse(f.originalBytes); calls.runs[0].audit.returnedModel = "changed-after-revision";
  f.data.set(memoStorageKey("research"), JSON.stringify(calls));
  await assert.rejects(readBoundMemoRevisions(f.binding, "research"));
  await assert.rejects(appendMemoRevision(f.input(revision.id, f.edit(revision.memo)), "research"));
  await assert.rejects(appendMemoRevisionReview(f.reviewInput(revision), "research"));
  await assert.rejects(exportMemoRevision({ ...f.binding, revisionId: revision.id }, "research"));
  f.data.set(memoStorageKey("research"), f.originalBytes);
  const versions = JSON.parse(f.versionBytes); versions[0].chain.claim.systemSignal = "削弱";
  f.data.set(storageKeys().versions, JSON.stringify(versions));
  await assert.rejects(appendMemoRevisionReview(f.reviewInput(revision), "research"));
  f.data.set(storageKeys().versions, f.versionBytes);
  const rollback = createRollbackSnapshot(f.version, readStoredVersions(), f.version.versionId, "research");
  appendVersion(rollback);
  await assert.rejects(appendMemoRevision({ ...f.input(), versionId: rollback.versionId }, "research"));
  assert.equal((await readBoundMemoRevisions(f.binding, "research")).revisions.length, 1);
  assert.equal(f.data.get(memoStorageKey("research")), f.originalBytes);
  assert.deepEqual(readStoredVersions()[0], f.version);
  assert.equal((await readMemoRevisionLedger("research")).reviews.length, 0);
});

test("malformed ledgers, changed content hashes and orphan/cross-revision reviews are never overwritten", async t => {
  const f = await fixture(t);
  const revision = await appendMemoRevision(f.input(), "research");
  await appendMemoRevisionReview(f.reviewInput(revision), "research");
  const original = f.data.get(memoRevisionStorageKey("research"));
  const corruptions = ["{", "null", JSON.stringify({ revisions: [], reviews: [] })];
  for (const mutate of [
    value => { value.revisions[0].memo.summary.text += "变更"; },
    value => { value.revisions[0].parentRevisionId = "missing-parent"; },
    value => { value.reviews[0].revisionId = "missing-revision"; },
    value => { value.reviews[0].contentSha256 = "0".repeat(64); },
    value => { value.reviews.push(structuredClone(value.reviews[0])); },
    value => { value.revisions[0].workspace = "regression"; },
  ]) { const value = JSON.parse(original); mutate(value); corruptions.push(JSON.stringify(value)); }
  for (const bytes of corruptions) {
    f.data.set(memoRevisionStorageKey("research"), bytes);
    await assert.rejects(readMemoRevisionLedger("research"));
    await assert.rejects(appendMemoRevision(f.input(revision.id, f.edit(revision.memo)), "research"));
    assert.equal(f.data.get(memoRevisionStorageKey("research")), bytes);
  }
  f.unchanged();
});

test("concurrent editors serialize saves and preserve review events without losing a record", async t => {
  const f = await fixture(t);
  const attempts = await Promise.allSettled([appendMemoRevision(f.input(), "research"), appendMemoRevision(f.input(), "research")]);
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(item => item.status === "rejected").length, 1);
  const revision = (await readMemoRevisionLedger("research")).revisions[0];
  await Promise.all([appendMemoRevisionReview(f.reviewInput(revision), "research"), appendMemoRevisionReview(f.reviewInput(revision, "rejected"), "research")]);
  const ledger = await readMemoRevisionLedger("research");
  assert.equal(ledger.revisions.length, 1); assert.deepEqual(ledger.reviews.map(item => item.status), ["accepted", "rejected"]);
  f.unchanged();
});

test("quota failure or unavailable cross-tab locks cannot silently discard original records", async t => {
  const f = await fixture(t);
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = (key, value) => { if (key === memoRevisionStorageKey("research")) throw new Error("quota exceeded"); setItem(key, value); };
  await assert.rejects(appendMemoRevision(f.input(), "research"), /quota/);
  assert.equal(f.data.has(memoRevisionStorageKey("research")), false);
  window.localStorage.setItem = setItem; delete window.navigator.locks;
  await assert.rejects(appendMemoRevision(f.input(), "research"), /浏览器/);
  f.unchanged();
});

test("legacy, failed, or altered raw/model records stay preserved and cannot become new compact revisions", async t => {
  const f = await fixture(t);
  for (const mutate of [
    run => { run.audit.promptVersion = "research-update-v2-judgement-3"; },
    run => { run.status = "failed"; run.memo = null; },
    run => { run.audit.rawOutput = "incomplete JSON"; },
    run => { run.memo.summary.text += " Changed independently from raw output"; },
  ]) {
    const ledger = JSON.parse(f.originalBytes); mutate(ledger.runs[0]);
    const bytes = JSON.stringify(ledger); f.data.set(memoStorageKey("research"), bytes);
    await assert.rejects(appendMemoRevision(f.input(), "research"));
    assert.equal(f.data.get(memoStorageKey("research")), bytes);
  }
  assert.equal(f.data.has(memoRevisionStorageKey("research")), false);
  assert.equal(f.data.get(storageKeys().versions), f.versionBytes);
});
