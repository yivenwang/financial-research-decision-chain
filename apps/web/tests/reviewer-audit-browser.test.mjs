import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { QUESTION_STORAGE_KEY } from "../lib/research-question-storage.ts";
import { storageKeys } from "../lib/research-versions.ts";
import { REVIEW_ACCESS_COOKIE, reviewSessionValue } from "../lib/reviewer-access.ts";
import { questionTestConfig, planOutput, answerOutput, providerResponse } from "./question-test-helpers.mjs";

process.env.REVIEW_SESSION_SECRET = "NOT_A_REAL_SESSION_SECRET_BROWSER_TEST_ONLY";
assert.notEqual(process.env.LIVE_MODEL_E2E, "1");
const require = createRequire(import.meta.url);
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH, "index.mjs")).href);

test("refresh and two tabs recover one persisted execution; safe replay, historical reviews and search preserve bytes (NOT-LIVE)", { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "beacon-refresh-browser-"));
  const prior = JSON.parse(await readFile(new URL("../artifacts-web/S-05-browser-audit.json", import.meta.url), "utf8"));
  const snapshot = prior.snapshot; assert.equal(snapshot.source.mode, "pdf");
  assert.match(snapshot.evidence.find(e => e.metricKey === "attributable_np").sourceExcerpt, /471,594,189\.71/);
  assert.match(snapshot.evidence.find(e => e.metricKey === "adjusted_np").sourceExcerpt, /546,758,896\.90/);
  for (const [key, expected] of [["revenue", "7607.64554567"], ["attributable_np", "471.59418971"], ["adjusted_np", "546.75889690"], ["operating_cash_flow", "-450.63180874"], ["non_recurring_total", "-75.16470719"]]) assert.equal(snapshot.parser.originalMetrics[key].current.toFixed(8), expected);
  const origin = "http://127.0.0.1:4327";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4327", "-H", "127.0.0.1"], { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "", RESEARCH_DEMO_TOKEN: questionTestConfig.accessToken, RESEARCH_APP_ORIGIN: origin } });
  let logs = ""; server.stdout.on("data", d => logs += d); server.stderr.on("data", d => logs += d);
  const exited = new Promise(r => server.once("close", r)); let browser, releaseExplain;
  t.after(async () => { releaseExplain?.(); await browser?.close(); server.kill("SIGTERM"); await Promise.race([exited, delay(3000)]); if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; } await rm(root, { recursive: true, force: true }); });
  for (let i = 0; i < 80; i++) { assert.equal(server.exitCode, null, logs); try { if ((await fetch(origin)).ok) break; } catch {} await delay(250); }
  for (const method of ["GET", "POST"]) {
    const response = await fetch(origin + "/api/research-question" + (method === "GET" ? `?phase=plan&operationId=${crypto.randomUUID()}` : ""), { method, headers: { authorization: `Bearer ${questionTestConfig.accessToken}`, origin, "content-type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ phase: "plan", question: "NOT-LIVE blocked request" }) } : {}) });
    assert.equal(response.status, 401, "production proxy must reject shared Bearer for private operations");
  }
  let calls = 0, enteredExplain;
  const entered = new Promise(r => enteredExplain = r), wait = new Promise(r => releaseExplain = r);
  const handler = createQuestionHandler(() => ({ ...questionTestConfig, appOrigin: origin }), { runDirectory: root, fetcher: async (_url, init) => {
    calls++; const body = JSON.parse(init.body);
    if (body.text.format.name.endsWith("plan")) return providerResponse(planOutput());
    enteredExplain(); await wait; return providerResponse(answerOutput());
  } });
  browser = await chromium.launch(); const context = await browser.newContext();
  const session = await reviewSessionValue(questionTestConfig.accessToken);
  await context.addCookies([{ name: REVIEW_ACCESS_COOKIE, value: session, url: origin, httpOnly: true, secure: false, sameSite: "Strict" }]);
  const intercept = async route => {
    const request = route.request(); const headers = request.headers();
    const input = new Request(request.url(), { method: request.method(), headers, ...(request.method() === "POST" ? { body: request.postData() } : {}) });
    const response = request.method() === "GET" ? await handler.GET(input) : await handler.POST(input);
    try { await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() }); } catch { /* The first POST connection is intentionally interrupted by refresh. */ }
  };
  await context.route("**/api/research-question**", intercept);
  const foreign = await browser.newContext();
  await foreign.addCookies([{ name: REVIEW_ACCESS_COOKIE, value: await reviewSessionValue(questionTestConfig.accessToken), url: origin, httpOnly: true, sameSite: "Strict" }]);
  await foreign.route("**/api/research-question**", intercept);
  const attacker = await foreign.newPage(); await attacker.goto(origin + "/questions");
  const page = await context.newPage(), errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin + "/questions"); const keys = storageKeys();
  await page.evaluate(({ keys, snapshot }) => { localStorage.setItem(keys.versions, JSON.stringify([snapshot])); localStorage.setItem(keys.active, snapshot.versionId); window.dispatchEvent(new Event("anker-research-version-updated")); }, { keys, snapshot });
  await page.getByRole("button", { name: "生成研究任务", exact: true }).click();
  await page.getByRole("button", { name: "确认并执行", exact: true }).waitFor();
  const planned = await page.evaluate(() => JSON.parse(localStorage.getItem("beacon-question-draft-v1")));
  assert.ok(planned);
  const attack = await attacker.evaluate(async draft => {
    const query = await fetch(`/api/research-question?operationId=${draft.run.requestId}&phase=plan`);
    const confirm = await fetch("/api/research-question", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase: "execute", draft, confirmed: true, snapshot: null }) });
    return [query.status, confirm.status];
  }, planned);
  assert.deepEqual(attack, [404, 422]); assert.equal(calls, 1);
  await page.getByRole("button", { name: "确认并执行", exact: true }).click(); await entered;
  assert.equal(calls, 2);
  await page.reload(); await page.getByRole("button", { name: "检查任务状态", exact: true }).waitFor();
  const second = await context.newPage(); second.on("pageerror", e => errors.push(e.message)); await second.goto(origin + "/questions");
  await second.getByRole("button", { name: "检查任务状态", exact: true }).waitFor();
  assert.equal(calls, 2); releaseExplain();
  for (const tab of [page, second]) {await tab.getByRole("button", {name:"检查任务状态",exact:true}).click();}
  for (const tab of [page, second]) await tab.getByRole("heading", { name: "研究草稿待审核", exact: true }).waitFor();
  const ledger = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), QUESTION_STORAGE_KEY);
  assert.equal(ledger.runs.length, 2); assert.equal(calls, 2);
  const run = ledger.runs.at(-1), original = JSON.stringify(run);
  const replay = await handler.GET(new Request(`${origin}/api/research-question?operationId=${run.requestId}&phase=execute`, { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=${session}` } }));
  assert.equal(JSON.stringify((await replay.json()).run), original);
  await page.getByLabel("问题审核人", { exact: true }).fill("Synthetic human reviewer");
  await page.getByRole("button", { name: "退回研究草稿", exact: true }).click(); await page.getByText("研究草稿已退回", { exact: true }).waitFor();
  await page.getByLabel("问题审核人", { exact: true }).fill("Synthetic human reviewer");
  await page.getByRole("button", { name: "接受研究草稿", exact: true }).click(); await page.getByText("人工已接受研究草稿", { exact: true }).waitFor();
  const after = await second.evaluate(key => JSON.parse(localStorage.getItem(key)), QUESTION_STORAGE_KEY);
  assert.deepEqual(after.reviews.map(r => r.status), ["rejected", "accepted"]); assert.equal(JSON.stringify(after.runs.at(-1)), original);
  await page.getByLabel("查找研究问题历史").fill("no-result-query"); assert.equal(await page.locator('button[aria-current]').count(), 0);
  await page.getByLabel("查找研究问题历史").fill(run.requestId); await page.getByLabel("筛选研究问题状态").selectOption("ANSWER_READY"); assert.equal(await page.locator('button[aria-current]').count(), 1);
  await page.goto(origin + "/changes");
  await page.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
  await page.getByText("文件内容不是有效 PDF，修改扩展名无法导入。", { exact: true }).waitFor();
  await page.locator('input[type="file"]').setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
  await page.getByText("PDF 文件为空，请重新选择原件。", { exact: true }).waitFor();
  assert.equal(calls, 2); assert.deepEqual(errors, []);
});
