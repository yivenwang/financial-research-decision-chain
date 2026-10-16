import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { storageKeys } from "../lib/research-versions.ts";
import { REVIEW_ACCESS_COOKIE } from "../lib/reviewer-access.ts";
import { getSourceRecord } from "../lib/source-records.ts";

// Submission audit: isolated local production server; provider keys blank.
// Synthetic secrets only. Never run this as production traffic or live acceptance.
assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "This audit is zero-live-call only");
const require = createRequire(import.meta.url);
assert.ok(process.env.PLAYWRIGHT_PACKAGE_PATH, "PLAYWRIGHT_PACKAGE_PATH is required");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH, "index.mjs")).href);
const origin = "http://127.0.0.1:4339";
const artifacts = new URL("../artifacts-web/submission-audit/", import.meta.url);
const paths = ["/", "/workspace", "/questions", "/changes", "/evidence", "/versions", "/help"];
const fixtures = [
  { id: "S-05", scope: "research", file: process.env.AUDIT_S05_PDF, mirror: "https://pdf.dfcfw.com/pdf/H2_AN202604291821773803_1.pdf", sha256: "88d2ab7c603a94b7e0943ef07e219235ee59b9048e1dfa8e38bd6ebac99b6d03", period: "2026Q1", adjusted: 546.7588969 },
  { id: "S-06", scope: "regression", file: process.env.AUDIT_S06_PDF, mirror: "https://pdf.dfcfw.com/pdf/H2_AN202608300006761478_1.pdf", sha256: "ff81b9e7c2e8eb04bd450fce3c084b28f5b4be4c1e2638250160b7bb813ebac1", period: "2026H1", adjusted: 1438.77516582 },
];
const observation = { environment: "isolated local Next production server / Chromium / open guest mode / provider keys blank", realModelCalls: 0, admission: [], isolation: {}, concurrency: [], limitations: ["The product formally supports Anker only; S-05 and S-06 are distinct periods, not distinct companies. No claim of a two-company complete research workflow.", "Concurrency uses a public verified sample, local deterministic parsing/engine, storage and status GETs, not provider load or production load.", "Same-origin tabs in one browser profile intentionally share the local research ledger and guest cookie; they are not independent user identities.", "This file supplements existing provider, operation authorization and full mocked research E2E suites."] };
const errors = [], consoleErrors = [], externalRequests = [], badHttp = [];
let server, browser, exited, serverLog = "";
const digest = value => createHash("sha256").update(value).digest("hex");
const rssKiB = () => { try { return Number(execFileSync("ps", ["-o", "rss=", "-p", String(server.pid)], { encoding: "utf8" }).trim()); } catch { return null; } };

async function pdfBytes(fixture) {
  if (fixture.file) return readFile(fixture.file);
  const attempts = [];
  for (const url of [getSourceRecord(fixture.id).url, fixture.mirror]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { "user-agent": "Mozilla/5.0", referer: "https://www.cninfo.com.cn/" } });
      if (!response.ok) { attempts.push(response.status); await response.body?.cancel(); continue; }
      const buffer = Buffer.from(await response.arrayBuffer());
      assert.equal(digest(buffer), fixture.sha256, "Official or verified mirror bytes must match the registered original");
      assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
      return buffer;
    } catch (error) { if (error.code === "ERR_ASSERTION") throw error; attempts.push(error.name); }
  }
  throw new Error(`${fixture.id} official PDF unavailable: ${attempts.join(", ")}; set AUDIT_${fixture.id.replace("-", "")}_PDF to verified local bytes`);
}

before(async () => {
  await mkdir(artifacts, { recursive: true });
  await readFile(new URL("../.next/BUILD_ID", import.meta.url));
  for (const fixture of fixtures) {
    fixture.buffer = await pdfBytes(fixture);
    assert.equal(digest(fixture.buffer), fixture.sha256);
  }
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4339", "-H", "127.0.0.1"], { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, REVIEW_ACCESS_MODE: "open", REVIEW_ACCESS_DEADLINE: "2099-01-01T00:00:00Z", REVIEW_SESSION_SECRET: "NOT_A_REAL_SESSION_SECRET_SUBMISSION_AUDIT_ONLY", RESEARCH_DEMO_TOKEN: "NOT_A_REAL_ADMISSION_TOKEN_SUBMISSION_AUDIT", RESEARCH_APP_ORIGIN: origin, MODEL_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" } });
  server.stdout.on("data", data => serverLog += data);
  server.stderr.on("data", data => serverLog += data);
  exited = new Promise(done => server.once("close", done));
  let ready = false;
  for (let i = 0; i < 80; i++) {
    assert.equal(server.exitCode, null, serverLog);
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, serverLog);
  browser = await chromium.launch();
}, { timeout: 240000 });

after(async () => {
  observation.pageErrors = errors; observation.consoleErrors = consoleErrors; observation.externalRequests = externalRequests; observation.badHttp = badHttp;
  await writeFile(new URL("observations.json", artifacts), JSON.stringify(observation, null, 2));
  await writeFile(new URL("server.log", artifacts), serverLog);
  await browser?.close();
  if (server) {
    server.kill("SIGTERM"); await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; }
  }
});

async function visitor(label, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
  await context.route("**/*", async route => {
    if (new URL(route.request().url()).origin !== origin) { externalRequests.push({ label, url: route.request().url() }); await route.abort(); }
    else await route.continue();
  });
  context.on("page", page => {
    page.on("pageerror", error => errors.push({ label, message: error.message }));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push({ label, text: message.text() }); });
    page.on("response", response => { if (new URL(response.url()).origin === origin && response.status() >= 400) badHttp.push({ label, status: response.status(), path: new URL(response.url()).pathname }); });
  });
  return { context, page: await context.newPage(), label };
}

async function admit(v) {
  const response = await v.page.goto(origin);
  assert.equal(response.status(), 200);
  assert.equal(new URL(v.page.url()).pathname, "/");
  await v.page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await v.page.locator('input[type="password"]').count(), 0);
  const cookie = (await v.context.cookies()).find(row => row.name === REVIEW_ACCESS_COOKIE);
  assert.ok(cookie); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "Strict");
  assert.match(cookie.value, /^v2\.[0-9]{13}\.[0-9]{13}\.[a-f0-9]{48}\.[a-f0-9]{64}$/);
  const access = await v.context.request.get(origin + "/api/access");
  assert.equal(access.status(), 200); assert.equal((await access.json()).session, true);
  observation.admission.push({ label: v.label, directHomeStatus: response.status(), loginRequired: false, signedCookieSha256: digest(cookie.value), httpOnly: cookie.httpOnly, sameSite: cookie.sameSite });
  return cookie.value;
}

async function saveMaterial(v, fixture, sample = false) {
  await v.page.goto(origin + "/changes");
  if (fixture.id === "S-06") {
    await v.page.getByRole("combobox", { name: "选择已登记材料" }).click();
    await v.page.getByRole("option", { name: "S-06 · 2026H1 · 回归演示", exact: true }).click();
  }
  if (sample) await v.page.getByRole("button", { name: "载入 S-05 已验证样例", exact: true }).click();
  else await v.page.getByLabel("选择财报 PDF").setInputFiles({ name: "same-name-report.pdf", mimeType: "application/pdf", buffer: fixture.buffer });
  await v.page.getByTestId("candidate-adjusted_np").waitFor({ timeout: 90000 });
  assert.ok(Math.abs(Number(await v.page.getByTestId("candidate-adjusted_np").getByRole("spinbutton").inputValue()) - fixture.adjusted) < 1e-8);
  for (const key of ["attributable_np", "adjusted_np", "non_recurring_total"]) await v.page.getByTestId(`candidate-${key}`).getByRole("button", { name: "接受证据", exact: true }).click();
  await v.page.getByRole("button", { name: "预览研究影响", exact: true }).click();
  const chain = v.page.getByTestId("chain-result"); await chain.waitFor();
  assert.match(await chain.innerText(), /估值输入与待补条件/);
  await v.page.getByLabel("证据审核人（自行填写）").fill(`Submission synthetic evidence reviewer ${v.label}`);
  await v.page.getByRole("button", { name: "保存为新版本", exact: true }).click();
  await v.page.getByRole("heading", { name: /V-02 已保存/ }).waitFor();
  const ledger = await v.page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "[]"), storageKeys(fixture.scope).versions);
  assert.equal(ledger.length, 1);
  const snapshot = ledger[0]; assert.equal(snapshot.source.sourceId, fixture.id); assert.equal(snapshot.source.period, fixture.period);
  if (!sample) assert.equal(snapshot.source.sha256, fixture.sha256);
  assert.equal(snapshot.chain.valuation.publishable, false); assert.equal(snapshot.chain.decision.formalRecommendation, null);
  assert.deepEqual(snapshot.blockedGates, ["EG-01", "EG-02"]);
  return snapshot;
}

test("open guests: same-name real S-05/S-06 uploads, separate ledgers, refresh, reopen and same-profile sharing", { timeout: 240000 }, async () => {
  const visitors = await Promise.all([visitor("A-S05"), visitor("B-S06")]);
  try {
    const cookies = await Promise.all(visitors.map(admit)); assert.notEqual(cookies[0], cookies[1]);
    const snapshots = await Promise.all(visitors.map((v, i) => saveMaterial(v, fixtures[i])));
    await Promise.all(visitors.map(async (v, i) => {
      const own = fixtures[i], other = fixtures[1 - i];
      await v.page.evaluate(label => { localStorage.setItem("submission-audit-synthetic-marker", label); sessionStorage.setItem("submission-audit-session-marker", label); }, v.label);
      assert.equal(await v.page.evaluate(key => localStorage.getItem(key), storageKeys(other.scope).versions), null);
      await v.page.reload();
      assert.equal(await v.page.evaluate(() => localStorage.getItem("submission-audit-synthetic-marker")), v.label);
      assert.equal(await v.page.evaluate(() => sessionStorage.getItem("submission-audit-session-marker")), v.label);
      assert.deepEqual(await v.page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKeys(own.scope).versions), [snapshots[i]]);
      const second = await v.context.newPage(); await second.goto(origin + "/versions");
      assert.equal(await second.evaluate(() => localStorage.getItem("submission-audit-synthetic-marker")), v.label);
      assert.equal(await second.evaluate(() => sessionStorage.getItem("submission-audit-session-marker")), null);
      assert.deepEqual(await second.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKeys(own.scope).versions), [snapshots[i]]);
      assert.equal((await v.context.cookies()).find(row => row.name === REVIEW_ACCESS_COOKIE).value, cookies[i]);
      await v.page.close(); v.page = await v.context.newPage(); await v.page.goto(origin + "/changes");
      // Interrupt an unsaved parse workflow; reopening must preserve the saved ledger.
      await v.page.getByRole("button", { name: "载入 S-05 已验证样例", exact: true }).click();
      await v.page.getByTestId("candidate-adjusted_np").waitFor(); await v.page.close();
      v.page = await v.context.newPage(); await v.page.goto(origin + "/versions");
      assert.deepEqual(await v.page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKeys(own.scope).versions), [snapshots[i]]);
      assert.equal(await v.page.evaluate(() => localStorage.getItem("submission-audit-synthetic-marker")), v.label);
      if (own.scope === "regression") { await v.page.getByRole("combobox", { name: "选择版本库" }).click(); await v.page.getByRole("option", { name: "回归演示版本库", exact: true }).click(); }
      await v.page.getByTestId("chain-result").waitFor();
      await v.page.screenshot({ path: new URL(`${v.label}-private-snapshot.png`, artifacts).pathname, fullPage: true });
      await writeFile(new URL(`${v.label}-snapshot.json`, artifacts), JSON.stringify(snapshots[i], null, 2));
      await second.close();
    }));
    observation.isolation = { realPdfUploads: 2, uploadFileName: "same-name-report.pdf", distinctPdfSha256: snapshots.map(s => s.source.sha256), privateSnapshotReviewers: snapshots.map(s => s.humanReview.reviewer), cookieUnique: true, oppositeLedgerAbsent: true, refreshRetainsOwn: true, reopenedPageRetainsOwn: true, interruptedUnsavedWorkPreservesSavedLedger: true, sameProfileTabsShareLocalStorage: true, sameProfileNewTabHasSeparateSessionStorage: true };
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  } finally { await Promise.all(visitors.map(v => v.context.close())); }
});

test("isolated no-fee 2 / 5 / 10 simultaneous guest navigation and deterministic workflow", { timeout: 360000 }, async () => {
  for (const count of [2, 5, 10]) {
    const batchStart = performance.now(), beforeRssKiB = rssKiB();
    const visitors = await Promise.all(Array.from({ length: count }, (_, index) => visitor(`C${count}-${index}`)));
    try {
      const cookies = await Promise.all(visitors.map(admit)); assert.equal(new Set(cookies).size, count);
      const workloads = await Promise.all(visitors.map(async v => {
        const start = performance.now(), navigation = [];
        for (const path of paths) {
          const navStart = performance.now(); const response = await v.page.goto(origin + path, { waitUntil: "load", timeout: 30000 });
          assert.equal(response.status(), 200); assert.equal(new URL(v.page.url()).pathname, path);
          await v.page.getByRole("heading", { level: 1 }).waitFor();
          navigation.push({ path, httpStatus: response.status(), elapsedMs: Math.round(performance.now() - navStart) });
        }
        const snapshot = await saveMaterial(v, fixtures[0], true);
        await v.page.goto(origin + "/evidence"); await v.page.getByTestId("current-evidence").getByText("V-02", { exact: true }).waitFor();
        await v.page.goto(origin + "/versions"); await v.page.getByTestId("chain-result").waitFor();
        assert.deepEqual(await v.page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKeys().versions), [snapshot]);
        const metadata = await v.context.request.get(origin + "/api/research-question");
        assert.equal(metadata.status(), 200); assert.equal((await metadata.json()).configured, false);
        assert.equal(snapshot.humanReview.reviewer, `Submission synthetic evidence reviewer ${v.label}`);
        return { visitor: v.label, elapsedMs: Math.round(performance.now() - start), navigation, versionCount: 1, independentReviewedLedger: true, providerStatusHttp: metadata.status() };
      }));
      const timings = workloads.flatMap(w => w.navigation.map(n => n.elapsedMs)).sort((a, b) => a - b);
      observation.concurrency.push({ visitors: count, elapsedMs: Math.round(performance.now() - batchStart), navigationCount: timings.length, navigationP50Ms: timings[Math.floor(timings.length * .5)], navigationP95Ms: timings[Math.min(timings.length - 1, Math.floor(timings.length * .95))], navigationMaxMs: timings.at(-1), serverRssKiBBefore: beforeRssKiB, serverRssKiBAfter: rssKiB(), workloads });
      await writeFile(new URL("observations.json", artifacts), JSON.stringify(observation, null, 2));
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(badHttp, []); assert.deepEqual(externalRequests, []);
      assert.equal(server.exitCode, null, serverLog);
    } finally { await Promise.all(visitors.map(v => v.context.close())); }
  }
});

test("same-profile tabs cannot overwrite an in-flight question recovery pointer", { timeout: 60000 }, async () => {
  const v = await visitor("pending-race");
  const posts = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await admit(v);
    await v.context.route("**/api/research-question**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "GET") {
        await route.fulfill({ status: url.searchParams.has("operationId") ? 202 : 200, json: url.searchParams.has("operationId") ? { code: "OPERATION_RUNNING", error: "Synthetic pending; no provider request" } : { configured: true, provider: "deepseek", model: "SUBMISSION-SYNTHETIC-NOT-LIVE" } });
        return;
      }
      posts.push({ id: request.headers()["idempotency-key"], body: request.postDataJSON() });
      await gate;
      await route.fulfill({ status: 202, json: { code: "OPERATION_RUNNING", error: "Synthetic pending; no provider request" } });
    });
    const b = await v.context.newPage();
    await Promise.all([v.page.goto(origin + "/questions"), b.goto(origin + "/questions")]);
    await Promise.all([v.page.getByRole("button", { name: "生成研究任务", exact: true }).waitFor(), b.getByRole("button", { name: "生成研究任务", exact: true }).waitFor()]);
    await v.page.getByLabel("研究问题", { exact: true }).fill("Synthetic tab A original task");
    await b.getByLabel("研究问题", { exact: true }).fill("Synthetic tab B must not replace original task");
    await v.page.getByRole("button", { name: "生成研究任务", exact: true }).click();
    for (let i = 0; i < 100 && posts.length === 0; i++) await delay(20);
    assert.equal(posts.length, 1);
    const firstPending = await v.page.evaluate(() => localStorage.getItem("beacon-question-pending-v1"));
    assert.equal(JSON.parse(firstPending).id, posts[0].id);
    await b.getByRole("button", { name: "生成研究任务", exact: true }).click();
    await b.waitForFunction(original => document.body.innerText.includes("其他标签页仍有待确认任务") || localStorage.getItem("beacon-question-pending-v1") !== original, firstPending);
    const pendingAfterSecondClick = await b.evaluate(() => localStorage.getItem("beacon-question-pending-v1"));
    const raceEvidence = { transport: "browser route synthetic only", realModelCalls: 0, postCount: posts.length, originalId: JSON.parse(firstPending).id, currentId: JSON.parse(pendingAfterSecondClick).id, originalPendingPreserved: pendingAfterSecondClick === firstPending };
    await writeFile(new URL(`pending-race-${raceEvidence.originalPendingPreserved ? "after" : "before"}-fix.json`, artifacts), JSON.stringify(raceEvidence, null, 2));
    assert.equal(posts.length, 1, "The second tab must not send another provider-bearing request");
    await b.getByText("其他标签页仍有待确认任务。请刷新并检查原任务状态，再开始新任务。", { exact: true }).waitFor({ timeout: 5000 });
    assert.equal(await b.evaluate(() => localStorage.getItem("beacon-question-pending-v1")), firstPending);
    release();
    await v.page.getByTestId("pending-request").getByRole("button", { name: "检查任务状态", exact: true }).waitFor();
    await b.reload();
    await b.getByTestId("pending-request").getByRole("button", { name: "检查任务状态", exact: true }).waitFor();
    assert.equal(posts.length, 1, "Reload recovers by GET and must not start another request");
    assert.equal(await b.evaluate(() => localStorage.getItem("beacon-question-pending-v1")), firstPending);
    observation.sameProfilePendingRace = { postCount: posts.length, originalPendingPreserved: true, secondTabBlocked: true, refreshRecoversOriginalByGet: true, transport: "browser route synthetic only", realModelCalls: 0 };
  } finally { release(); await v.context.close(); }
});
