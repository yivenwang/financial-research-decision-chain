import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const require = createRequire(import.meta.url);

test("production app serves the Beacon workspace, CSS and matching PDF worker", { timeout: 60000 }, async () => {
  const port = 4321;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  let logs = "";
  let spawnError;
  server.on("error", (error) => { spawnError = error; });
  server.stdout.on("data", (chunk) => { logs += chunk; });
  server.stderr.on("data", (chunk) => { logs += chunk; });
  const exited = new Promise((resolve) => server.once("close", resolve));

  try {
    let response;
    for (let i = 0; i < 80; i++) {
      assert.ifError(spawnError);
      assert.equal(server.exitCode, null, logs);
      try { response = await fetch(origin, { signal: AbortSignal.timeout(1000) }); } catch {}
      if (response?.ok) break;
      await delay(250);
    }
    assert.ok(response?.ok, logs);
    const html = await response.text();
    assert.match(html, /BEACON/);\n    assert.ok(html.includes("研灯"), "研灯");
    for (const label of ["From change", "to conviction.", "Workspace", "Ask", "Evidence", "Versions", "你想弄清什么？"]) {
      assert.ok(html.includes(label), label);
    }

    for (const route of ["/questions", "/changes", "/evidence", "/versions"]) {
      const routeResponse = await fetch(`${origin}${route}`);
      assert.equal(routeResponse.status, 200, route);
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
