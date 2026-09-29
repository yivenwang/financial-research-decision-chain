import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { storageKeys } from "../lib/research-versions.ts";

const require = createRequire(import.meta.url);
assert.ok(process.env.PLAYWRIGHT_PACKAGE_PATH, "Set PLAYWRIGHT_PACKAGE_PATH.");
assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "UI suite is exclusively offline / NOT-LIVE.");
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_PACKAGE_PATH, "index.mjs")).href);
const artifacts = new URL("../artifacts-web/ui-suite/", import.meta.url);
async function capture(page, name, fullPage = true) {
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: new URL(name, artifacts).pathname, fullPage, animations: "disabled" });
}

test("complete Beacon UI: navigation, landing question, evidence inspector, responsive states and preserved local data (NOT-LIVE)", { timeout: 180000 }, async () => {
  const origin = "http://127.0.0.1:4325";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4325", "-H", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "", RESEARCH_DEMO_TOKEN: "" },
  });
  let logs = ""; let spawnError; let browser;
  server.on("error", error => { spawnError = error; });
  server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
  const exited = new Promise(resolve => server.once("close", resolve));
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      assert.ifError(spawnError); assert.equal(server.exitCode, null, logs);
      try { ready = (await fetch(origin)).ok; } catch {}
      if (ready) break;
      await delay(250);
    }
    assert.ok(ready, logs);
    browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ["--no-sandbox"] } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = []; const modelPosts = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/research-*", async route => {
      if (route.request().method() === "POST") { modelPosts.push(route.request().url()); await route.abort(); }
      else await route.continue();
    });
    await mkdir(artifacts, { recursive: true });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /理解影响/ }).click();
    assert.ok((await page.getByRole("tabpanel").innerText()).includes("F-02"));
    await page.getByRole("tab", { name: /理解影响/ }).press("ArrowRight");
    assert.ok((await page.getByRole("tabpanel").innerText()).includes("EG-01 / EG-02"));
    await page.getByRole("tab", { name: /看见变化/ }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, "home-1440-full.png");
    await page.setViewportSize({ width: 1366, height: 768 });
    await capture(page, "home-1366.png", false);
    const query = "安克创新2026Q1归母净利润同比下降，应该核对哪些证据？";
    await page.getByLabel("研究问题", { exact: true }).fill(query);
    await page.getByRole("button", { name: "开始研究", exact: true }).click();
    await page.waitForURL("**/questions?q=*");
    assert.equal(await page.getByLabel("研究问题", { exact: true }).inputValue(), query);
    await page.getByText("模型服务尚未配置，请按运行说明配置服务端环境。", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "生成研究任务", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("link", { name: "补充材料", exact: true }).getAttribute("href"), "/changes");
    for (const width of [1440, 1366, 768, 390]) {
      await page.setViewportSize({ width, height: width === 1366 ? 768 : 1000 });
      for (const route of ["/", "/workspace", "/questions", "/changes", "/evidence", "/versions", "/help"]) {
        await page.goto(origin + route, { waitUntil: "networkidle" });
        assert.equal(await page.locator("h1").count(), 1, `One primary heading on ${route}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${route} overflows at ${width}`);
        if (route !== "/") {
          const active = page.getByRole("navigation", { name: "产品导航" }).locator('[aria-current="page"]');
          assert.equal(await active.count(), 1); assert.equal(await active.getAttribute("href"), route);
          assert.ok(await page.getByTestId("research-context").isVisible());
        }
        if (width === 1440 || width === 390) await capture(page, `${route.slice(1) || "home"}-empty-${width}.png`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + "/changes", { waitUntil: "networkidle" });
    await page.getByRole("combobox", { name: "选择已登记材料" }).click();
    await capture(page, "source-menu-1440.png", false);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "载入 S-05 已验证样例", exact: true }).click();
    for (const key of ["attributable_np", "adjusted_np", "non_recurring_total"]) await page.getByTestId(`candidate-${key}`).getByRole("button", { name: "接受证据", exact: true }).click();
    await capture(page, "changes-reviewed-1440.png");
    await page.getByRole("button", { name: "生成 Graph Diff" }).click();
    await page.getByLabel("证据审核人（自行填写）").fill("UI test NOT-LIVE");
    await page.getByRole("button", { name: "保存为新版本", exact: true }).click();
    await page.getByRole("heading", { name: /V-02 已保存/ }).waitFor();
    await page.goto(origin + "/workspace", { waitUntil: "networkidle" });
    assert.ok((await page.getByTestId("workspace-dashboard").innerText()).includes("教学合成样例"));
    await capture(page, "workspace-sample-1440.png");
    await page.goto(origin + "/evidence", { waitUntil: "networkidle" });
    const evidence = page.getByTestId("current-evidence");
    assert.ok((await evidence.innerText()).includes("-4.87%")); assert.ok((await evidence.innerText()).includes("24.39%"));
    await evidence.getByRole("button", { name: /扣非归母净利润/ }).click();
    await page.getByRole("complementary", { name: "所选证据详情" }).getByRole("heading", { name: "扣非归母净利润", exact: true }).waitFor();
    assert.equal(await evidence.locator('[aria-pressed="true"]').count(), 1);
    await capture(page, "evidence-selected-1440.png");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await capture(page, "evidence-selected-390.png");
    await page.getByText("查看固定 S-05 案例 · 非当前研究数据", { exact: true }).click();
    assert.ok(await page.getByText("E-105 · S-05 · P2 · 反证", { exact: true }).isVisible());
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + "/versions", { waitUntil: "networkidle" });
    await capture(page, "versions-sample-1440.png");
    const [snapshotDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出当前快照", exact: true }).click()]);
    const snapshotExportPath = new URL("version-current-export.json", artifacts).pathname;
    await snapshotDownload.saveAs(snapshotExportPath);
    const snapshotExport = JSON.parse(await readFile(snapshotExportPath, "utf8"));
    assert.equal(snapshotExport.schema, "beacon.research-version.v1");
    assert.equal(snapshotExport.version.versionId, "V-02");
    const [ledgerDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "导出完整版本库", exact: true }).click()]);
    const ledgerExportPath = new URL("version-ledger-export.json", artifacts).pathname;
    await ledgerDownload.saveAs(ledgerExportPath);
    const ledgerExport = JSON.parse(await readFile(ledgerExportPath, "utf8"));
    assert.equal(ledgerExport.schema, "beacon.research-version-ledger.v1");
    assert.equal(ledgerExport.activeVersionId, "V-02");
    assert.equal(ledgerExport.versions.length, 2);
    await page.getByRole("button").filter({ hasText: "V-01" }).click();
    await page.getByRole("button", { name: "回滚到此版本", exact: true }).click();
    await page.getByRole("alertdialog").waitFor();
    assert.equal(await page.getByRole("alertdialog").evaluate(dialog => getComputedStyle(dialog).animationName), "none", "Portalled dialog respects reduced motion");
    await capture(page, "rollback-dialog-1440.png", false);
    await page.keyboard.press("Escape");
    const keys = storageKeys("research");
    await page.evaluate(key => localStorage.setItem(key, "unreadable-ui-test"), keys.versions);
    await page.goto(origin + "/workspace", { waitUntil: "networkidle" });
    await page.getByTestId("workspace-dashboard").getByRole("alert").waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), keys.versions), "unreadable-ui-test");
    await capture(page, "workspace-unreadable-1440.png");
    assert.deepEqual(errors, []); assert.deepEqual(modelPosts, []);
    await writeFile(new URL("acceptance.json", artifacts), JSON.stringify({ mode: "synthetic-sample-UI-NOT-LIVE", widths: [1440, 1366, 768, 390], routes: 7, modelPosts, errors, checks: ["question handoff", "accessible case tabs", "7-route active navigation", "no horizontal overflow", "unconfigured provider", "sample boundary", "evidence selection", "PDF link", "version snapshot and ledger exports", "portal menus and rollback dialog", "unreadable data preserved"] }, null, 2));
  } finally {
    await browser?.close(); server.kill("SIGTERM"); await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; }
  }
});
