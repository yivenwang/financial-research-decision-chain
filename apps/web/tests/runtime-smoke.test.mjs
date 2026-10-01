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
      RESEARCH_APP_ORIGIN: origin,
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

    const loginResponse = await fetch(`${origin}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ code: accessCode }),
      redirect: "manual",
    });
    assert.equal(loginResponse.status, 200);
    const setCookie = loginResponse.headers.get("set-cookie");
    assert.ok(setCookie?.includes("beacon_review_access="));
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
  } finally {
    server.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
  }
});
