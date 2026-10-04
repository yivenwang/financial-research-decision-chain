import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const accessCode = "NOT_A_REAL_ACCESS_CODE_RUNTIME_TEST_ONLY";

test("production app serves the access gate, Beacon workspace, CSS and matching PDF worker", { timeout: 60000 }, async () => {
  const port = 4321;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      RESEARCH_DEMO_TOKEN: accessCode,
      REVIEW_SESSION_SECRET: "NOT_A_REAL_SESSION_SECRET_RUNTIME_TEST_ONLY",
      DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "",
      RESEARCH_APP_ORIGIN: origin,
      REVIEW_ACCESS_DEADLINE: "2099-01-01T00:00:00Z",
    },
  });
  let logs = "";
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  const exited = new Promise((resolve) => server.once("close", resolve));

  try {
    let accessResponse;
    for (let i = 0; i < 80; i++) {
      assert.ifError(spawnError);
      assert.equal(server.exitCode, null, logs);
      try { accessResponse = await fetch(`${origin}/access`, { signal: AbortSignal.timeout(1000) }); } catch {}
      if (accessResponse?.ok) break;
      await delay(250);
    }
    assert.ok(accessResponse?.ok, logs);
    const accessHtml = await accessResponse.text();
    assert.match(accessHtml, /内部审验入口/);
    assert.equal(accessResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(accessResponse.headers.get("x-frame-options"), "DENY");
    assert.match(accessResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    for (const path of ["/api/private.json", "/_next/data/private.json", "/_next/image"]) {
      const guarded = await fetch(`${origin}${path}`, { redirect: "manual" });
      assert.equal(guarded.status, path === "/_next/image" ? 404 : path.startsWith("/api/") ? 401 : 307, `${path} must not bypass access`);
      // Next's data requests encode redirects differently from HTML navigation.
      if (guarded.status === 307 && !path.startsWith("/_next/data/")) assert.match(guarded.headers.get("location") ?? "", /\/access\?/);
    }
    for (const path of ["/api/research-question", "/api/research-memo"]) {
      assert.equal((await fetch(`${origin}${path}`)).status, 401);
      const status = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${accessCode}` } });
      assert.equal(status.status, 200, "manual batch readiness must pass the production proxy");
      assert.equal((await status.json()).configured, false, "runtime smoke never configures a provider key");
    }
    assert.equal((await fetch(`${origin}/workspace`, { headers: { Authorization: `Bearer ${accessCode}` }, redirect: "manual" })).status, 307);

    const loginResponse = await fetch(`${origin}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ code: accessCode }),
      redirect: "manual",
    });
    assert.equal(loginResponse.status, 200);
    const setCookie = loginResponse.headers.get("set-cookie");
    assert.ok(setCookie?.includes("beacon_review_access="));
    assert.match(setCookie, /beacon_review_access=v2\./);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=strict/i);
    assert.ok(!setCookie?.toLowerCase().includes("secure"), "HTTP runtime test must not force a Secure cookie");
    const cookie = setCookie.split(";")[0];

    const authedFetch = (path) => fetch(`${origin}${path}`, { headers: { Cookie: cookie } });

    const response = await authedFetch("/");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Beacon/);
    assert.ok(html.includes("研灯"), "研灯");
    for (const label of ["Insight Today", "A Brighter Tomorrow", "让变化被看见", "研究方法", "案例解读", "能力边界", "开始研究", "进入工作台"]) {
      assert.ok(html.includes(label), label);
    }

    for (const route of ["/workspace", "/questions", "/changes", "/evidence", "/versions", "/help"]) {
      const routeResponse = await authedFetch(route);
      assert.equal(routeResponse.status, 200, route);
      const routeHtml = await routeResponse.text();
      assert.match(routeHtml, /产品导航/, `${route} must expose the task navigation on narrow screens too`);
      assert.match(routeHtml, /aria-current="page"/, `${route} must identify the current task`);
    }

    const cssUrls = [...html.matchAll(/href="([^"\s]+\.css(?:\?[^"\s]*)?)"/g)].map((match) => match[1]);
    assert.ok(cssUrls.length > 0, "Page must load compiled styles");
    for (const url of cssUrls) {
      const css = await fetch(new URL(url.replaceAll("&amp;", "&"), origin));
      assert.equal(css.status, 200);
      assert.match(css.headers.get("content-type") ?? "", /text\/css/);
    }
    const worker = await fetch(`${origin}/vendor/pdfjs/pdf.worker.min.mjs`);
    assert.equal(worker.status, 200);
    assert.match(worker.headers.get("content-type") ?? "", /javascript/);
    assert.deepEqual(Buffer.from(await worker.arrayBuffer()), await readFile(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")));
    const badOrigin = await fetch(`${origin}/api/access`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://untrusted.test" }, body: JSON.stringify({ code: accessCode }) });
    assert.equal(badOrigin.status, 403);
    const oversized = await fetch(`${origin}/api/access`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ code: "x".repeat(4096) }) });
    assert.equal(oversized.status, 413);
    let limited;
    for (let i = 0; i < 25; i++) {
      limited = await fetch(`${origin}/api/access`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ code: "wrong" }) });
      if (limited.status === 429) break;
      assert.equal(limited.status, 401);
    }
    assert.equal(limited.status, 429, "actual login route must limit attempts");
    assert.equal(limited.headers.get("retry-after"), "60");
  } finally {
    server.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
  }
});
