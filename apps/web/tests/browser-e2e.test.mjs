import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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

const require = createRequire(import.meta.url);
const browserPackage = process.env.PLAYWRIGHT_PACKAGE_PATH;
assert.ok(browserPackage, "Set PLAYWRIGHT_PACKAGE_PATH to the installed playwright package directory.");
const { chromium } = await import(pathToFileURL(resolve(browserPackage, "index.mjs")).href);
const origin = "http://127.0.0.1:4322";
const artifacts = new URL("../artifacts-web/", import.meta.url);
const liveMemo = process.env.LIVE_MODEL_E2E === "1";
const liveProvider = process.env.MODEL_PROVIDER === "openai" ? "openai" : "deepseek";
const liveApiKey = liveProvider === "openai" ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
const liveModel = (liveProvider === "openai" ? process.env.OPENAI_MODEL : process.env.DEEPSEEK_MODEL) || (liveProvider === "openai" ? "gpt-5.6-sol" : "deepseek-v4-pro");
const accessCode = liveMemo ? randomBytes(24).toString("hex") : "ci-access-code-not-a-real-secret";
if (liveMemo) assert.ok(liveApiKey?.trim(), `Live ${liveProvider} acceptance requires its API key supplied by the runner.`);
const cases = [
  { id: "S-05", scope: "research", attr: 471.59418971, adj: 546.7588969, nr: -75.16470719, ay: -0.0487, jy: 0.2439, factor: 4 },
  { id: "S-06", scope: "regression", attr: 1702.03721539, adj: 1438.77516582, nr: 263.26204957, ay: 0.4586, jy: 0.4965, factor: 2 },
].filter((fixture) => !liveMemo || fixture.id === "S-05");
const pdfs = new Map();
let browser;
let server;
let exited;
let logs = "";
before(async () => {
  await mkdir(artifacts, { recursive: true });
  for (const fixture of cases) {
    const source = getSourceRecord(fixture.id);
    const response = await fetch(source.url, { headers: { "user-agent": "Mozilla/5.0 FinanceResearchRegression", accept: "application/pdf" }, signal: AbortSignal.timeout(90000) });
    assert.ok(response.ok, `Official PDF download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.ok(buffer.length > 10000);
    assert.ok(buffer.subarray(0, 5).toString().startsWith("%PDF-"));
    pdfs.set(fixture.id, { buffer, sha256: createHash("sha256").update(buffer).digest("hex") });
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
  await page.goto(origin, { waitUntil: "load" });
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
    supporting: [{ text: "扣非表现支持进一步核查核心经营改善。", citations: ["EV-S-05-C04-ADJ"] }],
    counter: [{ text: "归母利润下滑构成反证，不能忽略。", citations: ["EV-S-05-C04-ATTR"] }],
    alternatives: [{ text: "可能存在调整项性质影响利润比较的解释，仍待验证。", citations: ["EV-S-05-C04-NR", "A-03"] }],
    questions: [{ text: "需要核对调整项经常性并补充连续可比报告。", citations: ["A-03", "K-07"] }],
    gates: { eg01: "pending", eg02: "pending" },
  };
  await page.route("**/api/research-memo", async (route) => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { configured: true, provider: "deepseek", model: "deepseek-v4-pro" } }); return; }
    const run = await createMemoRun(route.request().postDataJSON(), { provider: "deepseek", apiKey: "ci-stub-not-real", accessToken: accessCode, model: "deepseek-v4-pro" }, { fetcher: async () => Response.json({ id: "resp_test_transport_not_live", model: "test-transport-not-live", status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] }) });
    await route.fulfill({ json: { run } });
  });
}

for (const fixture of cases) {
  test(`real ${fixture.id} upload → review → frozen chain → save → reload → rollback`, { timeout: 180000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
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
      await page.reload({ waitUntil: "load" });
      await page.getByRole("tab", { name: "版本历史" }).click();
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
          await page.getByRole("tab", { name: "版本历史" }).click();
        }
      }
      if (liveMemo || fixture.id === "S-05") {
        const prefix = liveMemo ? `S-05-live-${liveProvider}-model` : "S-05-stub-model-NOT-LIVE";
        const panel = page.getByTestId("memo-panel");
        await panel.getByLabel("演示访问码").fill(accessCode);
        assert.ok((await panel.innerText()).includes(liveMemo && liveProvider === "openai" ? "OpenAI" : "DeepSeek"));
        const [httpResponse] = await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).pathname === "/api/research-memo" && response.request().method() === "POST", { timeout: 110000 }),
          panel.getByRole("button", { name: "生成 AI 备忘录", exact: true }).click(),
        ]);
        const httpBody = await httpResponse.json().catch(() => ({ code: "NON_JSON_HTTP_RESPONSE" }));
        const diagnostic = { httpStatus: httpResponse.status(), code: httpBody.code ?? null, failureCode: httpBody.run?.audit?.failureCode ?? null, validation: httpBody.run?.audit?.validation ?? [], provider: httpBody.run?.audit?.provider ?? null, runId: httpBody.run?.runId ?? null };
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
        await page.getByRole("tab", { name: "版本历史" }).click();
        await page.getByTestId("memo-status").filter({ hasText: "人工已接受" }).waitFor();
        await page.screenshot({ path: new URL(`${prefix}-memo.png`, artifacts).pathname, fullPage: true });
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
      await writeFile(new URL(`${fixture.id}-browser-audit.json`, artifacts), JSON.stringify({ sourceUrl: getSourceRecord(fixture.id).url, pdfSha256: pdfs.get(fixture.id).sha256, snapshot, afterRollback: restored, errors }, null, 2));
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
