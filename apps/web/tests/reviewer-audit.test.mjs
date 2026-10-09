import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { createMemoHandler } from "../lib/research-memo.server.ts";
import { makeResearchContract, questionMarkdown, questionExplanationSchema, validateQuestionExplanation, resolveQuestionEvidence } from "../lib/research-question.ts";
import { writeStoredVersions, appendVersion, storageKeys, createRollbackSnapshot, withVersionWriteLock, readStoredVersions, nextVersionId } from "../lib/research-versions.ts";
import { formatMoneyMn, questionReason } from "../lib/question-presentation.ts";
import { PDF_LIMITS, validatePdfFile, validatePdfHeader, validatePdfResources } from "../lib/pdf-import.ts";
import { extractCandidates, parseResearchReport } from "../lib/research-engine.ts";
import { verifiedSampleItems } from "../lib/sample-s05.ts";
import { getSourceRecord } from "../lib/source-records.ts";
import { questionTestConfig as config, mainQuestion, planOutput, answerOutput, questionTestSnapshot, providerResponse, questionRequest as req } from "./question-test-helpers.mjs";

async function harness(t, answer = answerOutput()) {
  const directory = await mkdtemp(join(tmpdir(), "beacon-audit-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const handler = () => createQuestionHandler(() => config, { runDirectory: directory, fetcher: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body.text.format.name);
    return providerResponse(body.text.format.name.endsWith("plan") ? planOutput() : answer);
  } });
  const first = handler();
  const draft = await (await first.POST(req({ phase: "plan", question: mainQuestion }))).json();
  const body = { phase: "execute", draft, snapshot: questionTestSnapshot(), confirmed: true };
  const get = (phase, id, headers = {}) => new Request(`http://localhost/api/research-question?phase=${phase}&operationId=${id}`, { headers: { authorization: `Bearer ${config.accessToken}`, ...headers } });
  return { directory, calls, first, handler, draft, body, get };
}

test("identical confirmation replays exact completed run across handler restart; changed input is a conflict", async t => {
  const h = await harness(t);
  const a = await (await h.first.POST(req(h.body))).json();
  const b = await (await h.handler().POST(req(h.body))).json();
  assert.deepEqual(b, a); assert.equal(h.calls.length, 2);
  const different = structuredClone(h.body); different.snapshot.createdAt = "2026-09-17T00:00:00Z";
  const conflict = await h.handler().POST(req(different)); assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "OPERATION_CONFLICT"); assert.equal(h.calls.length, 2);
  assert.deepEqual(await (await h.handler().GET(h.get("execute", h.draft.run.requestId))).json(), a);
});

test("planning idempotency replays the signed draft and rejects changing the question with the same key", async t => {
  const h = await harness(t); const id = crypto.randomUUID();
  const request = () => req({ phase: "plan", question: mainQuestion }, { "Idempotency-Key": id });
  const a = await (await h.first.POST(request())).json();
  assert.deepEqual(await (await h.handler().POST(request())).json(), a);
  assert.equal(h.calls.length, 2);
  assert.equal((await h.first.POST(req({ phase: "plan", question: "核对证据来源" }, { "Idempotency-Key": id }))).status, 409);
  assert.equal((await h.first.POST(req({ phase: "plan", question: mainQuestion }, { "Idempotency-Key": "../../bad" }))).status, 400);
});

test("duplicate confirmation during processing reads running state without a second billable call", async t => {
  const h = await harness(t); let release, entered;
  const waiting = new Promise(r => release = r), started = new Promise(r => entered = r);
  const slow = createQuestionHandler(() => config, { runDirectory: h.directory, fetcher: async () => { h.calls.push("slow"); entered(); await waiting; return providerResponse(answerOutput()); } });
  const a = slow.POST(req(h.body)); await started;
  assert.equal((await h.handler().POST(req(h.body))).status, 202);
  assert.equal((await h.handler().GET(h.get("execute", h.draft.run.requestId))).status, 202);
  assert.equal(h.calls.length, 2); release(); assert.equal((await a).status, 200);
});

test("interrupted persisted claim never permits automatic re-execution; unauthorized reads reveal no result", async t => {
  const h = await harness(t); await h.first.POST(req(h.body));
  const file = join(h.directory, `execute-${h.draft.run.requestId}`, "record.json");
  const record = JSON.parse(await readFile(file, "utf8"));
  record.state = "running"; record.startedAt = "2020-01-01T00:00:00Z"; delete record.response;
  await writeFile(file, JSON.stringify(record));
  assert.equal((await h.handler().POST(req(h.body))).status, 409); assert.equal(h.calls.length, 2);
  assert.equal((await h.handler().GET(h.get("execute", h.draft.run.requestId, { authorization: "invalid" }))).status, 401);
  assert.equal((await h.handler().GET(h.get("execute", "../../bad"))).status, 400);
  const id = crypto.randomUUID(); await mkdir(join(h.directory, `plan-${id}`));
  assert.equal((await h.handler().GET(h.get("plan", id))).status, 409);
});

test("storage failure blocks before provider execution; missing lookup creates no task", async t => {
  const h = await harness(t); const file = join(h.directory, "not-a-directory"); await writeFile(file, "fixture"); let calls = 0;
  const bad = createQuestionHandler(() => config, { runDirectory: file, fetcher: async () => { calls++; assert.fail(); } });
  assert.equal((await bad.POST(req({ phase: "plan", question: mainQuestion }))).status, 503); assert.equal(calls, 0);
  assert.equal((await h.first.GET(h.get("plan", crypto.randomUUID()))).status, 404);
});

test("atomic billing claim is unique across independent Node processes sharing the same directory", async t => {
  const h = await harness(t); const id = crypto.randomUUID();
  const program = `import { operationStore } from ${JSON.stringify(new URL("../lib/research-operation.server.ts", import.meta.url).href)}; const result = await operationStore(process.argv[1]).claim("plan", process.argv[2], "a".repeat(64)); process.stdout.write(result ? "claimed" : "exists");`;
  const outcomes = await Promise.all([1, 2].map(() => promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program, h.directory, id])));
  assert.deepEqual(outcomes.map(x => x.stdout).sort(), ["claimed", "exists"]);
});

test("production must configure an absolute persistent directory before spending", async t => {
  const h = await harness(t);
  const program = `import { operationStore } from ${JSON.stringify(new URL("../lib/research-operation.server.ts", import.meta.url).href)}; process.env.NODE_ENV="production"; delete process.env.RESEARCH_RUN_DIRECTORY; try { await operationStore().claim("plan", process.argv[1], "a".repeat(64)); process.stdout.write("UNSAFE"); } catch(e) { process.stdout.write(e.message); }`;
  const { stdout } = await promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", program, crypto.randomUUID()]);
  assert.equal(stdout, "PERSISTENT_RUN_DIRECTORY_REQUIRED"); assert.equal(h.calls.length, 1);
});

test("model-invalid output remains blocked and the raw first failure is replayed without repair", async t => {
  const output = answerOutput(); output.inference.text = "已证明经营改善";
  const h = await harness(t, output); const a = await (await h.first.POST(req(h.body))).json();
  assert.equal(a.run.status, "BLOCKED"); assert.equal(a.run.answer, null); assert.deepEqual(a.run.reasons, ["INFERENCE_NOT_MARKED"]);
  assert.equal(a.run.calls[0].rawOutput, JSON.stringify(output));
  assert.deepEqual(await (await h.handler().POST(req(h.body))).json(), a); assert.equal(h.calls.length, 2);
});

test("question and memo HTTP endpoints share the model slot", async t => {
  const h = await harness(t); let release, entered;
  const waiting = new Promise(r => release = r), started = new Promise(r => entered = r);
  const slow = createQuestionHandler(() => config, { runDirectory: h.directory, fetcher: async () => { entered(); await waiting; return providerResponse(answerOutput()); } });
  const a = slow.POST(req(h.body)); await started;
  const memo = createMemoHandler(() => config, { fetcher: async () => assert.fail("Concurrent memo must not reach provider") });
  assert.equal((await memo.POST(new Request("http://localhost/api/research-memo", { method: "POST", headers: { authorization: `Bearer ${config.accessToken}`, origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(questionTestSnapshot()) }))).status, 429);
  release(); await a;
});

test("identifier normalization accepts whitespace and case without broadening company, period or protected source scope", () => {
  const contract = p => makeResearchContract(mainQuestion, planOutput(p), crypto.randomUUID(), new Date().toISOString());
  assert.equal(contract({ company: " Anker Innovations ", period: " 2026q1 ", comparisonPeriod: " 2025q1 " }).status, "CONTRACT_DRAFTED");
  for (const p of [{ company: "公牛集团" }, { period: "2026H1" }, { comparisonPeriod: "2025FY" }, { referenceIds: ["EV-S-07-C04-ATTR"] }]) assert.equal(contract(p).status, "OUT_OF_SCOPE");
  for (const q of ["请解释本季归母与扣非方向为何相反", "这些利润证据对应原报告何处", "材料更新后哪些论点与假设需要人复核"]) assert.equal(makeResearchContract(q, planOutput(), crypto.randomUUID(), new Date().toISOString()).status, "CONTRACT_DRAFTED");
});

test("wire schema matches local paragraph/citation bounds; evidence and inference checks remain mandatory", async t => {
  const h = await harness(t); const resolved = await resolveQuestionEvidence(h.draft.run.contract, questionTestSnapshot());
  const schema = questionExplanationSchema(resolved.evidence.context);
  assert.equal(schema.properties.inference.properties.text.maxLength, 160);
  assert.equal(schema.properties.directAnswer.properties.citations.minItems, 1);
  const conditional = answerOutput(); conditional.inference.text = "如果扣非口径能代表核心经营，则仍需会计复核。";
  assert.deepEqual(validateQuestionExplanation(conditional, resolved.evidence.context), conditional);
  for (const mutate of [a => a.directAnswer.citations = [], a => a.inference.text = "已确认", a => a.directAnswer.text = "原文利润471元"]) {
    const a = answerOutput(); mutate(a); assert.throws(() => validateQuestionExplanation(a, resolved.evidence.context));
  }
  assert.match(questionReason("INFERENCE_NOT_MARKED"), /推论/); assert.match(questionReason("ANSWER_CITATION_OR_TEXT_INVALID"), /引用/);
});

test("five financial values retain cent precision in normalized display; Markdown never renders the binary tail", async t => {
  const s = questionTestSnapshot();
  for (const [key, expected] of [["revenue", "7607.64554567"], ["attributable_np", "471.59418971"], ["adjusted_np", "546.75889690"], ["operating_cash_flow", "-450.63180874"], ["non_recurring_total", "-75.16470719"]]) assert.equal(formatMoneyMn(s.parser.originalMetrics[key].current), expected);
  const h = await harness(t); const { run } = await (await h.first.POST(req(h.body))).json();
  assert.match(questionMarkdown(run), /471\.59418971 \|/); assert.doesNotMatch(questionMarkdown(run).split("## 计算与影响")[0], /471\.59418970999997/);
  const candidates = extractCandidates(parseResearchReport(verifiedSampleItems, getSourceRecord("S-05")), verifiedSampleItems);
  assert.match(candidates[0].sourceExcerpt, /471,594,189\.71/); assert.match(candidates[1].sourceExcerpt, /546,758,896\.90/);
});

test("exact decimal-cent F-02 and comparable-quarter arithmetic attribution are not economic causation", () => {
  const cents = s => BigInt(s.replace(".", ""));
  const attr25 = cents("495761205.29"), adj25 = cents("439558407.22"), attr26 = cents("471594189.71"), adj26 = cents("546758896.90");
  const nr25 = attr25 - adj25, nr26 = attr26 - adj26;
  assert.equal(nr25, 5620279807n); assert.equal(nr26, -7516470719n);
  assert.equal(attr26 - nr26, adj26); assert.equal(attr25 - nr25, adj25);
  assert.equal(attr26 - attr25, -2416701558n); assert.equal(adj26 - adj25, 10720048968n); assert.equal(nr26 - nr25, -13136750526n);
  assert.equal((adj26 - adj25) + (nr26 - nr25), attr26 - attr25);
});

test("PDF type, content, size and resource bounds accept valid imports while retaining protected-material exclusion", () => {
  validatePdfFile({ name: "report.PDF", type: "", size: 100 }); validatePdfFile({ name: "report", type: "application/pdf", size: 100 });
  validatePdfHeader(new TextEncoder().encode("%PDF-1.7\n")); validatePdfResources(14, 10000, 100000);
  for (const file of [{ name: "x.txt", type: "text/plain", size: 100 }, { name: "x.pdf", type: "application/pdf", size: 0 }, { name: "x.pdf", type: "application/pdf", size: PDF_LIMITS.bytes + 1 }, { name: "S-07.pdf", type: "application/pdf", size: 100 }]) assert.throws(() => validatePdfFile(file));
  assert.throws(() => validatePdfHeader(new TextEncoder().encode("fake.pdf")));
  for (const [pages, items, chars] of [[501, 0, 0], [1, 250001, 0], [1, 1, 4000001]]) assert.throws(() => validatePdfResources(pages, items, chars));
});

test("version writes cannot silently replace, delete or reorder existing history; rollback is a new record", t => {
  const old = globalThis.window; const data = new Map();
  globalThis.window = { isSecureContext: true, crypto, navigator: { locks: { request: async (_key, fn) => fn() } }, localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }, dispatchEvent() {} };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  const version = questionTestSnapshot(); appendVersion(version); const key = storageKeys().versions, before = data.get(key);
  assert.throws(() => writeStoredVersions([]));
  const changed = structuredClone(version); changed.evidence[0].snippet = "changed history"; assert.throws(() => writeStoredVersions([changed]));
  assert.equal(data.get(key), before);
  const rollback = createRollbackSnapshot(version, [version], version.versionId, "research"); appendVersion(rollback);
  assert.equal(JSON.stringify(JSON.parse(data.get(key))[0]), before.slice(1, -1));
  assert.throws(() => writeStoredVersions([rollback, version]));
});

test("version product write lock serializes complete ID allocation and append", async t => {
  const old = globalThis.window; const data = new Map(); let tail = Promise.resolve(); const acquired = [];
  globalThis.window = { isSecureContext: true, crypto, navigator: { locks: { request: (key, fn) => { const result = tail.then(() => { acquired.push(key); return fn(); }); tail = result.catch(() => {}); return result; } } }, localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }, dispatchEvent() {} };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  const original = questionTestSnapshot(); appendVersion(original);
  await Promise.all([1, 2].map(() => withVersionWriteLock("research", () => {
    const current = readStoredVersions(); appendVersion({ ...structuredClone(original), versionId: nextVersionId(current) });
  })));
  assert.deepEqual(readStoredVersions().map(v => v.versionId), ["V-02", "V-03", "V-04"]);
  assert.deepEqual(readStoredVersions()[0], original); assert.deepEqual(acquired, [storageKeys().versions, storageKeys().versions]);
});
