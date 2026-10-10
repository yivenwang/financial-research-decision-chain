import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { QUESTION_STORAGE_KEY } from "../lib/research-question-storage.ts";
import { storageKeys } from "../lib/research-versions.ts";
import { REVIEW_ACCESS_COOKIE, reviewSessionValue } from "../lib/reviewer-access.ts";
import { questionTestConfig, mainQuestion, planOutput, answerOutput, providerResponse } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Reliability acceptance is offline only");
const require = createRequire(import.meta.url);
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH, "index.mjs")).href);
const artifacts = new URL("../artifacts-web/question-reliability/", import.meta.url);
const legacy = JSON.parse(await readFile(new URL("./fixtures/question-live-38047109824/request-02.json", import.meta.url), "utf8")).record.run;

test("old output remains historical; new bad plan/causal answer block, export and recover at desktop/tablet/phone (NOT-LIVE)", { timeout: 180000 }, async t => {
  const origin = "http://127.0.0.1:4332";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4332", "-H", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1", RESEARCH_DEMO_TOKEN: questionTestConfig.accessToken, RESEARCH_APP_ORIGIN: origin },
  });
  let logs = "", browser; const exited = new Promise(r => server.once("close", r));
  server.stdout.on("data", d => logs += d); server.stderr.on("data", d => logs += d);
  t.after(async () => { await browser?.close(); server.kill("SIGTERM"); await Promise.race([exited, delay(3000)]); if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; } });
  for (let i = 0; i < 80; i++) { assert.equal(server.exitCode, null, logs); try { if ((await fetch(origin)).ok) break; } catch {} await delay(250); }
  browser = await chromium.launch(); await mkdir(artifacts, { recursive: true });
  const checks = [], externalRequests = [], errors = []; let syntheticCalls = 0;
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
    await context.addCookies([{ name: REVIEW_ACCESS_COOKIE, value: await reviewSessionValue(questionTestConfig.accessToken), url: origin, httpOnly: true, secure: false, sameSite: "Strict" }]);
    await context.route("**/*", async route => { if (new URL(route.request().url()).origin === origin) await route.continue(); else { externalRequests.push(route.request().url()); await route.abort(); } });
    let mode = "bad-plan";
    const handler = createQuestionHandler(() => ({ ...questionTestConfig, appOrigin: origin }), { runDirectory: await mkdtemp(join(tmpdir(), "beacon-reliability-mock-")), fetcher: async (_url, init) => {
      syntheticCalls++; const body = JSON.parse(init.body);
      return providerResponse(body.text.format.name.endsWith("plan") ? planOutput(mode === "bad-plan" ? { referenceIds: ["S-05"] } : {}) : mode === "bad-answer" ? legacy.answer.explanation : answerOutput());
    } });
    await context.route("**/api/research-question**", async route => {
      const request = route.request();
      const input = new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.method() === "POST" ? { body: request.postData() } : {}) });
      const response = request.method() === "POST" ? await handler.POST(input) : await handler.GET(input);
      await route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
    });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin + "/questions");
    await page.evaluate(({ keys, key, run }) => {
      localStorage.setItem(keys.versions, JSON.stringify([run.answer.evidence.snapshot])); localStorage.setItem(keys.active, run.answer.evidence.snapshot.versionId);
      localStorage.setItem(key, JSON.stringify({ runs: [run], reviews: [] }));
    }, { keys: storageKeys("research"), key: QUESTION_STORAGE_KEY, run: legacy });
    await page.reload(); await page.getByRole("heading", { name: "部分回答待审核", exact: true }).waitFor();
    await page.getByTestId("historical-validation-notice").waitFor();
    assert.ok((await page.getByTestId("review-context").innerText()).includes(legacy.runId));
    await page.getByLabel("研究问题", { exact: true }).fill(mainQuestion);
    await page.getByRole("button", { name: "生成研究任务", exact: true }).focus(); await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "已阻断", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "确认并执行", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "接受研究草稿", exact: true }).count(), 0);
    await page.screenshot({ path: new URL(`plan-blocked-${width}.png`, artifacts).pathname, fullPage: true });
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出阻断说明", exact: true }).click()]);
    await download.saveAs(new URL(`plan-blocked-${width}.md`, artifacts).pathname);
    assert.match(await readFile(new URL(`plan-blocked-${width}.md`, artifacts), "utf8"), /BLOCKED/);
    mode = "bad-answer";
    await page.getByRole("button", { name: "生成研究任务", exact: true }).click();
    await page.getByRole("button", { name: "确认并执行", exact: true }).click();
    await page.getByText("模型把本期勾稽当成同比原因，证据不足，草稿已阻断。", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "接受研究草稿", exact: true }).count(), 0);
    const [jsonDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出完整记录", exact: true }).click()]);
    await jsonDownload.saveAs(new URL(`causal-blocked-${width}.json`, artifacts).pathname);
    const exported = JSON.parse(await readFile(new URL(`causal-blocked-${width}.json`, artifacts), "utf8"));
    assert.equal(exported.run.answer, null); assert.equal(exported.run.calls[0].rawOutput, JSON.stringify(legacy.answer.explanation));
    assert.deepEqual(exported.run.reasons, ["UNSUPPORTED_YOY_ATTRIBUTION"]);
    mode = "safe-answer";
    await page.getByRole("button", { name: "生成研究任务", exact: true }).click();
    await page.getByRole("button", { name: "确认并执行", exact: true }).click();
    await page.getByRole("heading", { name: "研究草稿待审核", exact: true }).waitFor();
    await page.screenshot({ path: new URL(`safe-pending-${width}.png`, artifacts).pathname, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const ledger = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), QUESTION_STORAGE_KEY);
    assert.deepEqual(ledger.runs.find(r => r.runId === legacy.runId), legacy);
    assert.equal(ledger.reviews.length, 0); assert.equal(ledger.runs.at(-1).answer.verification.professional, "pending");
    const beforeHistory = syntheticCalls;
    await page.locator("button[aria-current]").locator("..").getByRole("button").last().click();
    await page.getByRole("heading", { name: "部分回答待审核", exact: true }).waitFor();
    assert.equal(syntheticCalls, beforeHistory); assert.ok((await page.getByTestId("review-context").innerText()).includes(legacy.runId));
    checks.push({ width, legacyBytesPreserved: true, badSourceIdBlocked: true, causalClaimBlocked: true, originalRawExported: true, professionalGatePending: true, keyboardEnter: true, noHorizontalOverflow: true });
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.equal(syntheticCalls, 15);
  await writeFile(new URL("acceptance.json", artifacts), JSON.stringify({ transport: "synthetic-NOT-LIVE", realModelCalls: 0, syntheticCalls, legacyRunId: legacy.runId, checks, errors, externalRequests }, null, 2));
});
