import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test, { before, after } from "node:test";
import { getSourceRecord } from "../lib/source-records.ts";
import { storageKeys } from "../lib/research-versions.ts";
import { memoStorageKey } from "../lib/research-memo-storage.ts";
import { createMemoRun } from "../lib/research-memo.server.ts";
import { memoRevisionStorageKey } from "../lib/research-memo-revisions.ts";

const require = createRequire(import.meta.url);
const browserPackage = process.env.PLAYWRIGHT_PACKAGE_PATH;
assert.ok(browserPackage, "Set PLAYWRIGHT_PACKAGE_PATH to the installed playwright package directory.");
const { chromium } = await import(pathToFileURL(resolve(browserPackage, "index.mjs")).href);
const origin = "http://127.0.0.1:4322";
const artifacts = process.env.MEMO_ARTIFACT_DIR ? pathToFileURL(resolve(process.env.MEMO_ARTIFACT_DIR) + "/") : new URL("../artifacts-web/", import.meta.url);
const liveMemo = process.env.LIVE_MODEL_E2E === "1";
const liveProvider = process.env.MODEL_PROVIDER === "openai" ? "openai" : "deepseek";
const liveApiKey = liveProvider === "openai" ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
const liveModel = (liveProvider === "openai" ? process.env.OPENAI_MODEL : process.env.DEEPSEEK_MODEL) || (liveProvider === "openai" ? "gpt-5.6-sol" : "deepseek-v4-pro");
const accessCode = liveMemo ? randomBytes(24).toString("hex") : "ci-access-code-not-a-real-secret";
if (liveMemo) assert.ok(liveApiKey?.trim(), `Live ${liveProvider} acceptance requires its API key supplied by the runner.`);
const cases = [
  {
    id: "S-05", scope: "research", attr: 471.59418971, adj: 546.7588969, nr: -75.16470719, ay: -0.0487, jy: 0.2439, factor: 4,
    expectedPdfSha256: "88d2ab7c603a94b7e0943ef07e219235ee59b9048e1dfa8e38bd6ebac99b6d03",
    verifiedMirrorUrl: "https://pdf.dfcfw.com/pdf/H2_AN202604291821773803_1.pdf",
  },
  {
    id: "S-06", scope: "regression", attr: 1702.03721539, adj: 1438.77516582, nr: 263.26204957, ay: 0.4586, jy: 0.4965, factor: 2,
    expectedPdfSha256: "ff81b9e7c2e8eb04bd450fce3c084b28f5b4be4c1e2638250160b7bb813ebac1",
    verifiedMirrorUrl: "https://pdf.dfcfw.com/pdf/H2_AN202608300006761478_1.pdf",
  },
].filter((fixture) => !liveMemo || fixture.id === "S-05");
const pdfs = new Map();
let browser;
let server;
let exited;
let logs = "";
async function downloadVerifiedPdf({ officialUrl, mirrorUrl, expectedSha256 }) {
  const outcomes = [];
  const candidates = [
    { label: "registered-cninfo", url: officialUrl, referer: "https://www.cninfo.com.cn/" },
    { label: "byte-identical-eastmoney", url: mirrorUrl, referer: "https://data.eastmoney.com/" },
  ];
  for (const candidate of candidates) {
    let response;
    try {
      response = await fetch(candidate.url, {
        headers: {
          accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          referer: candidate.referer,
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-site",
          "upgrade-insecure-requests": "1",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(90000),
      });
    } catch (error) {
      outcomes.push(`${candidate.label}:${error instanceof Error ? error.name : "network-error"}`);
      continue;
    }
    outcomes.push(`${candidate.label}:${response.status}`);
    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length <= 10000 || !buffer.subarray(0, 5).toString().startsWith("%PDF-")) {
      throw new Error(`${candidate.label} returned a non-PDF payload`);
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== expectedSha256) {
      throw new Error(`${candidate.label} PDF hash mismatch: expected ${expectedSha256}, received ${sha256}`);
    }
    return { buffer, sha256, retrieval: candidate.label, retrievalUrl: candidate.url };
  }
  throw new Error(`Verified PDF download failed after bounded sources: ${outcomes.join(", ")}`);
}
before(async () => {
  await mkdir(artifacts, { recursive: true });
  for (const fixture of cases) {
    const source = getSourceRecord(fixture.id);
    pdfs.set(fixture.id, await downloadVerifiedPdf({
      officialUrl: source.url,
      mirrorUrl: fixture.verifiedMirrorUrl,
      expectedSha256: fixture.expectedPdfSha256,
    }));
  }
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4322", "-H", "127.0.0.1"], { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, RESEARCH_DEMO_TOKEN: accessCode, RESEARCH_APP_ORIGIN: "", ...(!liveMemo ? { MODEL_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-v4-pro", OPENAI_API_KEY: "", DEEPSEEK_API_KEY: "" } : {}) } });
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  exited = new Promise((resolve) => server.once("close", resolve));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    assert.ifError(spawnError);
    assert.equal(server.exitCode, null, logs);
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, logs);
  if (liveMemo) {
    const response = await fetch(`${origin}/api/research-memo`);
    const status = await response.json();
    await writeFile(new URL("live-provider-configuration.json", artifacts), JSON.stringify({ httpStatus: response.status, ...status }, null, 2));
    assert.equal(response.status, 200);
    assert.deepEqual(status, { configured: true, provider: liveProvider, model: liveModel });
  }
  browser = await chromium.launch();
}, { timeout: 240000 });

after(async () => {
  if (browser) await browser.close();
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; }
  }
});

async function upload(page, id, selected = id) {
  await page.goto(`${origin}/changes`, { waitUntil: "load" });
  if (selected === "S-06") {
    await page.getByRole("combobox", { name: "选择已登记材料" }).click();
    await page.getByRole("option", { name: "S-06 · 2026H1 · 回归演示", exact: true }).click();
  }
  await page.getByLabel("选择财报 PDF").setInputFiles({ name: `official-${id}.pdf`, mimeType: "application/pdf", buffer: pdfs.get(id).buffer });
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const readLedger = (page, scope) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), storageKeys(scope).versions);

async function stubMemoTransport(page) {
  const output = {
    summary: { text: "扣非表现提供支持，归母利润反向变化仍须共同解释。", citations: ["EV-S-05-C04-ADJ", "EV-S-05-C04-ATTR"] },
    supporting: { text: "扣非表现支持进一步核查核心经营改善。", citations: ["EV-S-05-C04-ADJ"] },
    counter: { text: "归母利润下滑构成反证，不能忽略。", citations: ["EV-S-05-C04-ATTR"] },
    alternatives: { text: "可能存在调整项性质影响利润比较的解释，仍待验证。", citations: ["EV-S-05-C04-NR", "A-03"] },
    questions: { first: { text: "需要核对调整项经常性。", citations: ["A-03"] }, second: { text: "需要补充连续可比报告。", citations: ["K-07"] } },
    gates: { eg01: "pending", eg02: "pending" },
  };
  await page.route("**/api/research-memo", async (route) => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { configured: true, provider: "deepseek", model: "deepseek-v4-pro" } }); return; }
    const run = await createMemoRun(route.request().postDataJSON(), { provider: "deepseek", apiKey: "ci-stub-not-real", accessToken: accessCode, model: "deepseek-v4-pro" }, { fetcher: async () => Response.json({ id: "resp_test_transport_not_live", model: "test-transport-not-live", status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) });
    await route.fulfill({ json: { run } });
  });
}

async function exerciseMemoRevisions(page, modelRun, scope) {
  // Ordinary browser acceptance only. Synthetic prose remains explicitly labelled.
  const originalBytes = await page.evaluate(key => localStorage.getItem(key), memoStorageKey(scope));
  const revisions = page.getByTestId("memo-revisions");
  const firstText = modelRun.memo.summary.text + " 扣非代表性仍待专业复核。";
  await revisions.getByRole("button", { name: "创建人工修订稿", exact: true }).click();
  await revisions.getByLabel("摘要正文", { exact: true }).fill(firstText);
  const summary = revisions.getByTestId("revision-field-summary-0");
  await summary.getByText("选择本段引用并核对摘录", { exact: true }).click();
  await summary.getByRole("checkbox", { name: "摘要引用 A-03", exact: true }).check();
  await revisions.getByLabel("修订者（自行填写）", { exact: true }).fill("CI synthetic editor");
  await revisions.getByLabel("修改理由", { exact: true }).fill("合成回归：补会计前提及对应引用，不作专业签署。");
  await summary.screenshot({ path: new URL("S-05-human-revision-editor-NOT-LIVE.png", artifacts).pathname });
  await revisions.getByRole("button", { name: "保存人工修订", exact: true }).click();
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "修订稿待复核" }).waitFor();
  await page.reload({ waitUntil: "load" });
  await page.goto(`${origin}/versions`, { waitUntil: "load" });
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "修订稿待复核" }).waitFor();
  assert.ok((await revisions.innerText()).includes(firstText));
  await revisions.getByLabel("修订稿审核人（自行填写）", { exact: true }).fill("CI synthetic revision reviewer");
  await revisions.getByLabel("修订稿复核意见", { exact: true }).fill("合成交互与版本绑定验收，专业关卡保持待复核。");
  await revisions.getByRole("button", { name: "接受此修订稿", exact: true }).click();
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "人工已接受修订稿" }).waitFor();
  const [markdownDownload] = await Promise.all([page.waitForEvent("download"), revisions.getByRole("button", { name: "导出人工修订稿", exact: true }).click()]);
  const markdownPath = new URL("S-05-human-revision-NOT-LIVE.md", artifacts);
  await markdownDownload.saveAs(markdownPath.pathname);
  assert.match(await readFile(markdownPath, "utf8"), /状态：人工已接受修订稿/);
  const [auditDownload] = await Promise.all([page.waitForEvent("download"), revisions.getByRole("button", { name: "导出修订与原始记录", exact: true }).click()]);
  const auditPath = new URL("S-05-human-revision-NOT-LIVE-audit.json", artifacts);
  await auditDownload.saveAs(auditPath.pathname);
  const exported = JSON.parse(await readFile(auditPath, "utf8"));
  assert.deepEqual(exported.original.run, modelRun);
  assert.equal(exported.revisions.length, 1); assert.equal(exported.reviews.length, 1);
  const first = exported.revisions[0];
  assert.equal(first.memo.summary.text, firstText);
  assert.ok(first.memo.summary.citations.includes("A-03"));
  assert.equal(exported.reviews[0].revisionId, first.id);
  assert.equal(exported.reviews[0].contentSha256, first.contentSha256);
  await revisions.getByRole("button", { name: "继续修订", exact: true }).click();
  await revisions.getByLabel("下一步研究问题 · 第 2 段正文", { exact: true }).fill(first.memo.questions[1].text + " 请补充复核依据。");
  await revisions.getByLabel("修订者（自行填写）", { exact: true }).fill("CI synthetic editor");
  await revisions.getByLabel("修改理由", { exact: true }).fill("合成回归：继续补充待核对材料，产生独立版本。");
  await revisions.getByRole("button", { name: "保存人工修订", exact: true }).click();
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "修订稿待复核" }).waitFor();
  let stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), memoRevisionStorageKey(scope));
  assert.equal(stored.revisions.length, 2); assert.equal(stored.reviews.length, 1);
  assert.deepEqual(stored.revisions[0], first); assert.equal(stored.revisions[1].parentRevisionId, first.id);
  assert.equal(stored.reviews.some(item => item.revisionId === stored.revisions[1].id), false);
  await revisions.getByLabel("修订稿审核人（自行填写）", { exact: true }).fill("CI synthetic revision reviewer");
  await revisions.getByLabel("修订稿复核意见", { exact: true }).fill("合成回归：保留退回事件，不代替人工专业结论。");
  await revisions.getByRole("button", { name: "退回此修订稿", exact: true }).click();
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "修订稿已退回" }).waitFor();
  await revisions.getByLabel("选择人工修订版本", { exact: true }).selectOption(first.id);
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "人工已接受修订稿 · 历史版本" }).waitFor();
  assert.equal(await revisions.getByRole("button", { name: "继续修订", exact: true }).isDisabled(), true);
  assert.equal(await revisions.getByRole("button", { name: "接受此修订稿", exact: true }).count(), 0);
  await revisions.getByLabel("选择人工修订版本", { exact: true }).selectOption(stored.revisions[1].id);
  await page.reload({ waitUntil: "load" });
  await page.goto(`${origin}/versions`, { waitUntil: "load" });
  await revisions.getByTestId("memo-revision-status").filter({ hasText: "修订稿已退回" }).waitFor();
  await revisions.screenshot({ path: new URL("S-05-human-revision-history-NOT-LIVE.png", artifacts).pathname });
  stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), memoRevisionStorageKey(scope));
  assert.deepEqual(stored.reviews.map(item => item.status), ["accepted", "rejected"]);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), memoStorageKey(scope)), originalBytes);
  await writeFile(new URL("S-05-human-revision-history-NOT-LIVE.json", artifacts), JSON.stringify({ evaluation: "synthetic-browser-revision-flow-NOT-live-content-review", ...stored }, null, 2));
}

for (const fixture of cases) {
  test(`real ${fixture.id} upload → review → frozen chain → save → reload → rollback`, { timeout: liveMemo && liveProvider === "deepseek" ? 300000 : 180000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let modelRequests = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await upload(page, fixture.id);
      await page.getByTestId("candidate-adjusted_np").waitFor({ timeout: 60000 });
      for (const [key, expected] of [["attributable_np", fixture.attr], ["adjusted_np", fixture.adj], ["non_recurring_total", fixture.nr]]) {
        const card = page.getByTestId(`candidate-${key}`);
        close(Number(await card.getByRole("spinbutton").inputValue()), expected);
        await card.getByRole("button", { name: "接受证据", exact: true }).click();
      }
      await page.getByRole("button", { name: "生成 Graph Diff" }).click();
      await page.getByTestId("chain-result").waitFor();
      assert.equal(await page.getByRole("button", { name: "保存为新版本" }).isDisabled(), true);
      await page.getByLabel("证据审核人（自行填写）").fill("CI evidence reviewer");
      await page.screenshot({ path: new URL(`${fixture.id}-reviewed-chain.png`, artifacts).pathname, fullPage: true });
      await page.getByRole("button", { name: "保存为新版本" }).click();
      await page.getByRole("heading", { name: /V-02 已保存/ }).waitFor();
      const ledger = await readLedger(page, fixture.scope);
      assert.equal(ledger.length, 1);
      const snapshot = ledger[0];
      assert.equal(snapshot.source.sourceId, fixture.id);
      assert.equal(snapshot.source.mode, "pdf");
      assert.equal(snapshot.source.sha256, pdfs.get(fixture.id).sha256);
      assert.equal(snapshot.parser.version, "V0.6-strict");
      assert.deepEqual(snapshot.parser.blockers, []);
      assert.equal(Object.keys(snapshot.parser.originalMetrics).length, 10);
      close(snapshot.parser.originalMetrics.attributable_np.disclosedChange, fixture.ay);
      close(snapshot.parser.originalMetrics.adjusted_np.disclosedChange, fixture.jy);
      assert.equal(snapshot.chain.claim.systemSignal, "增强");
      assert.equal(snapshot.claim.after, "成立");
      assert.equal(snapshot.chain.valuation.annualizationFactor, fixture.factor);
      assert.equal(snapshot.chain.valuation.publishable, false);
      assert.equal(snapshot.chain.valuation.scenarios, null);
      assert.equal(snapshot.chain.decision.formalRecommendation, null);
      assert.deepEqual(snapshot.blockedGates, ["EG-01", "EG-02"]);
      assert.equal(snapshot.formula.consistent, true);
      assert.equal(snapshot.humanReview.reviewer, "CI evidence reviewer");
      assert.equal(snapshot.humanReview.scope, "evidence-only");
      const nrDirection = snapshot.chain.evidence.find((item) => item.metricKey === "non_recurring_total").direction;
      assert.equal(nrDirection, fixture.nr < 0 ? "支持" : "反证");
      assert.equal(snapshot.chain.evidence.find((item) => item.metricKey === "attributable_np").direction, fixture.ay < 0 ? "反证" : "中性");
      assert.deepEqual(snapshot.chain.graphDiff.unchangedNodeIds, ["C-01", "C-02", "C-03", "C-05", "C-06"]);
      assert.equal((await readLedger(page, fixture.scope === "research" ? "regression" : "research")).length, 0);
      if (fixture.scope === "research") {
        await page.goto(`${origin}/evidence`, { waitUntil: "load" });
        const contextBar = page.getByTestId("research-context");
        await contextBar.getByText(`当前版本 ${snapshot.versionId}`, { exact: true }).waitFor();
        assert.ok((await contextBar.innerText()).includes(`来源 ${fixture.id} · 2026Q1`));
        assert.ok((await contextBar.innerText()).includes("仅此浏览器"));
        const currentEvidence = page.getByTestId("current-evidence");
        await currentEvidence.getByText(snapshot.versionId, { exact: true }).waitFor();
        assert.ok((await currentEvidence.innerText()).includes(snapshot.evidence[0].label));
        assert.ok((await currentEvidence.innerText()).includes("EG-01 / EG-02"));
        assert.ok((await currentEvidence.innerText()).includes("同比：-4.87%"));
        assert.ok((await currentEvidence.innerText()).includes("同比：+24.39%") || (await currentEvidence.innerText()).includes("同比：24.39%"));
        await currentEvidence.screenshot({ path: new URL("S-05-current-evidence.png", artifacts).pathname });
      }
      await page.reload({ waitUntil: "load" });
      await page.goto(`${origin}/versions`, { waitUntil: "load" });
      if (fixture.scope === "regression") {
        await page.getByRole("combobox", { name: "选择版本库" }).click();
        await page.getByRole("option", { name: "回归演示版本库", exact: true }).click();
      }
      await page.getByTestId("chain-result").waitFor();
      if (!liveMemo) {
        await page.getByTestId("memo-unconfigured").waitFor();
        assert.equal(await page.getByRole("button", { name: "生成 AI 备忘录", exact: true }).isDisabled(), true);
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), memoStorageKey(fixture.scope)), null);
        if (fixture.id === "S-05") {
          await stubMemoTransport(page);
          await page.reload({ waitUntil: "load" });
          await page.goto(`${origin}/versions`, { waitUntil: "load" });
        }
      }
      if (liveMemo || fixture.id === "S-05") {
        // This guard also runs in ordinary CI before its labelled stub route.
        await page.route("**/api/research-memo", async (route) => {
          if (route.request().method() === "POST" && ++modelRequests > 1) { await route.abort(); return; }
          await route.fallback();
        });
        const prefix = liveMemo ? `S-05-live-${liveProvider}-model` : "S-05-stub-model-NOT-LIVE";
        const panel = page.getByTestId("memo-panel");
        await panel.getByLabel("演示访问码").fill(accessCode);
        assert.ok((await panel.innerText()).includes(liveMemo && liveProvider === "openai" ? "OpenAI" : "DeepSeek"));
        const [httpResponse] = await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).pathname === "/api/research-memo" && response.request().method() === "POST", { timeout: liveMemo && liveProvider === "deepseek" ? 170000 : 110000 }),
          panel.getByRole("button", { name: "生成 AI 备忘录", exact: true }).click(),
        ]);
        const httpBody = await httpResponse.json().catch(() => ({ code: "NON_JSON_HTTP_RESPONSE" }));
        const audit = httpBody.run?.audit;
        const diagnostic = { httpStatus: httpResponse.status(), code: httpBody.code ?? null, failureCode: audit?.failureCode ?? null, validation: audit?.validation ?? [], provider: audit?.provider ?? null, runId: httpBody.run?.runId ?? null, requestLimits: audit?.requestLimits ?? null, providerStatus: audit?.providerStatus ?? null, incompleteReason: audit?.incompleteReason ?? null, reasoningTokens: audit?.reasoningTokens ?? null };
        await writeFile(new URL(`${prefix}-http.json`, artifacts), JSON.stringify(diagnostic, null, 2));
        if (httpBody.run) {
          await writeFile(new URL(`${prefix}-call.json`, artifacts), JSON.stringify({ evaluation: liveMemo ? "live-provider-call" : "browser-UI-with-stubbed-provider-NOT-live-model-acceptance", run: httpBody.run }, null, 2));
        }
        assert.equal(httpResponse.status(), 200, JSON.stringify(diagnostic));
        await panel.getByTestId("memo-run").waitFor({ timeout: 10000 });
        const savedMemos = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), memoStorageKey(fixture.scope));
        assert.equal(savedMemos.runs.length, 1);
        const modelRun = savedMemos.runs[0];
        assert.deepEqual(modelRun, httpBody.run, "Saved memo must match the server response");
        await writeFile(new URL(`${prefix}-call.json`, artifacts), JSON.stringify({ evaluation: liveMemo ? "live-provider-call" : "browser-UI-with-stubbed-provider-NOT-live-model-acceptance", run: modelRun }, null, 2));
        assert.equal(modelRun.status, "completed", modelRun.audit.failureCode);
        assert.equal(modelRun.audit.provider, liveMemo ? liveProvider : "deepseek");
        assert.equal(modelRun.audit.requestedModel, liveMemo ? liveModel : "deepseek-v4-pro");
        assert.deepEqual(modelRun.audit.requestLimits, liveMemo && liveProvider === "openai" ? { maxOutputTokens: 4000, timeoutMs: 90000 } : { maxOutputTokens: 6000, timeoutMs: 150000 });
        assert.equal(modelRun.audit.providerStatus, "completed");
        assert.equal(typeof modelRun.audit.responseId, "string");
        assert.ok(modelRun.audit.responseId.trim().length > 0);
        if (liveMemo) { assert.notEqual(modelRun.audit.responseId, "resp_test_transport_not_live"); assert.ok(!/test|stub/i.test(modelRun.audit.returnedModel)); }
        else assert.equal(modelRun.audit.returnedModel, "test-transport-not-live");
        assert.ok(modelRun.audit.usage.inputTokens > 0);
        assert.ok(modelRun.audit.usage.outputTokens > 0);
        assert.equal(modelRun.context.source.mode, "pdf");
        assert.equal(modelRun.context.source.sha256, pdfs.get(fixture.id).sha256);
        assert.deepEqual(modelRun.memo.gates, { eg01: "pending", eg02: "pending" });
        assert.ok((await panel.innerText()).includes(modelRun.memo.summary.text));
        await panel.getByLabel("备忘录审核人（自行填写）").fill("CI memo reviewer");
        await panel.getByLabel("复核意见").fill("自动化仅核对交互、引用覆盖和版本绑定；模型推论仍须专业人员复核。");
        await panel.getByRole("button", { name: "接受备忘录", exact: true }).click();
        await panel.getByTestId("memo-status").filter({ hasText: "人工已接受" }).waitFor();
        const [memoDownload] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "导出备忘录", exact: true }).click()]);
        await memoDownload.saveAs(new URL(`${prefix}-memo.md`, artifacts).pathname);
        const [auditDownload] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "导出调用与审核记录", exact: true }).click()]);
        await auditDownload.saveAs(new URL(`${prefix}-audit.json`, artifacts).pathname);
        assert.deepEqual((await readLedger(page, fixture.scope))[0], snapshot);
        await page.reload({ waitUntil: "load" });
        await page.goto(`${origin}/versions`, { waitUntil: "load" });
        await page.getByTestId("memo-status").filter({ hasText: "人工已接受" }).waitFor();
        await page.screenshot({ path: new URL(`${prefix}-memo.png`, artifacts).pathname, fullPage: true });
        if (!liveMemo) await exerciseMemoRevisions(page, modelRun, fixture.scope);
      }
      await page.getByRole("button").filter({ hasText: "V-01" }).click();
      await page.getByRole("button", { name: "回滚到此版本" }).click();
      await page.getByRole("button", { name: "确认并创建回滚版本" }).click();
      let restored = await readLedger(page, fixture.scope);
      assert.equal(restored.length, 2);
      assert.equal(restored[1].restoredFrom, "V-01");
      assert.deepEqual(restored[0], snapshot);
      await page.getByRole("button").filter({ hasText: "V-02" }).click();
      await page.getByRole("button", { name: "回滚到此版本" }).click();
      await page.getByRole("button", { name: "确认并创建回滚版本" }).click();
      restored = await readLedger(page, fixture.scope);
      assert.equal(restored.length, 3);
      assert.deepEqual(restored[2].chain, snapshot.chain);
      assert.deepEqual(restored[0], snapshot);
      assert.deepEqual(errors, []);
      if (!liveMemo && fixture.id === "S-05") {
        assert.equal(await page.getByTestId("memo-revisions").count(), 0, "A new rollback snapshot must not inherit the previous memo or revision acceptance");
        const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), memoRevisionStorageKey(fixture.scope));
        assert.equal(history.revisions.length, 2); assert.equal(history.reviews.length, 2);
        assert.deepEqual((await readLedger(page, fixture.scope))[0], snapshot);
      }
      if (liveMemo || fixture.id === "S-05") assert.equal(modelRequests, 1, "Each independent sample may submit exactly one model request");
      if (liveMemo) {
        await writeFile(new URL("sample-completion.json", artifacts), JSON.stringify({ technicalFlow: "completed", contentReview: "pending", modelRequests }, null, 2));
      }
      await writeFile(new URL(`${fixture.id}-browser-audit.json`, artifacts), JSON.stringify({ sourceUrl: getSourceRecord(fixture.id).url, pdfRetrieval: pdfs.get(fixture.id).retrieval, pdfRetrievalUrl: pdfs.get(fixture.id).retrievalUrl, pdfSha256: pdfs.get(fixture.id).sha256, snapshot, afterRollback: restored, errors }, null, 2));
    } catch (error) {
      await page.screenshot({ path: new URL(`${fixture.id}-failure.png`, artifacts).pathname, fullPage: true }).catch(() => {});
      await writeFile(new URL(`${fixture.id}-failure.txt`, artifacts), `${error.stack}\n${errors.join("\n")}\n${await page.locator("body").innerText()}`);
      throw error;
    } finally { await context.close(); }
  });
}

test("real upload rejects source mismatch and missing/rejected/invalid reviewed values", { timeout: 180000, skip: liveMemo }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await upload(page, "S-06", "S-05");
    await page.getByText("PDF 内的公司或报告期间与所选材料记录不一致，已阻断导入。请核对原文及材料选择。", { exact: true }).waitFor({ timeout: 60000 });
    assert.equal((await readLedger(page, "research")).length, 0);
    await upload(page, "S-05");
    await page.getByTestId("candidate-adjusted_np").waitFor({ timeout: 60000 });
    const diff = page.getByRole("button", { name: "生成 Graph Diff" });
    assert.equal(await diff.isDisabled(), true);
    for (const key of ["attributable_np", "adjusted_np"]) await page.getByTestId(`candidate-${key}`).getByRole("button", { name: "接受证据", exact: true }).click();
    await page.getByTestId("candidate-non_recurring_total").getByRole("button", { name: "拒绝进入研究链" }).click();
    assert.equal(await diff.isDisabled(), true);
    const attr = page.getByTestId("candidate-attributable_np");
    await attr.getByRole("spinbutton").fill("");
    await attr.getByRole("button", { name: "接受证据", exact: true }).click();
    await page.getByTestId("candidate-non_recurring_total").getByRole("button", { name: "接受证据", exact: true }).click();
    assert.equal(await diff.isDisabled(), true);
    assert.equal((await readLedger(page, "research")).length, 0);
    assert.equal((await readLedger(page, "regression")).length, 0);
  } finally { await context.close(); }
});
