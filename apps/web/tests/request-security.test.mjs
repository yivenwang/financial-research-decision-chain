import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedJson } from "../lib/request-body.ts";
import { createAccessLimiter, publicReviewPath, reviewBearerPath, safeReviewReturnPath } from "../lib/review-security.ts";
import { researchBrowserIssue } from "../lib/research-browser.ts";
import { createMemoHandler } from "../lib/research-memo.server.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";

test("return paths cannot normalize backslashes or protocol-relative URLs into an external origin", () => {
  const origin = "https://research.example.test";
  assert.equal(safeReviewReturnPath("/versions?x=1#detail", origin), "/versions?x=1#detail");
  for (const path of [null, "//evil.example", "/\\evil.example", "https://evil.example", "/\u0009/evil.example"]) assert.equal(safeReviewReturnPath(path, origin), "/");
});

test("asset exemptions are explicit and bearer credentials only unlock the two model API routes", () => {
  for (const path of ["/access", "/api/access", "/_next/static/a.js", "/vendor/pdfjs/pdf.worker.min.mjs", "/assets/beacon/lighthouse-hero-v2.webp"]) assert.equal(publicReviewPath(path), true);
  for (const path of ["/api/private.json", "/versions.json", "/_next/data/research.json", "/_next/image", "/private.pdf"]) assert.equal(publicReviewPath(path), false);
  assert.equal(reviewBearerPath("/api/research-question"), true);
  assert.equal(reviewBearerPath("/api/research-memo"), true);
  assert.equal(reviewBearerPath("/workspace"), false);
  assert.equal(reviewBearerPath("/api/private.json"), false);
});

test("body limits apply to actual streamed bytes, invalid UTF-8 and slow bodies", async () => {
  assert.deepEqual(await readBoundedJson(Response.json({ valid: true }), 100), { valid: true });
  await assert.rejects(readBoundedJson(new Response(new Uint8Array(101)), 100), /BODY_TOO_LARGE/);
  await assert.rejects(readBoundedJson(new Response("{}", { headers: { "content-length": "101" } }), 100), /BODY_TOO_LARGE/);
  await assert.rejects(readBoundedJson(new Response(new Uint8Array([0xff])), 100), /encoded data/);
  let cancelled = false;
  const stalled = new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }));
  await assert.rejects(readBoundedJson(stalled, 100, { timeoutMs: 20 }), /BODY_TIMEOUT/);
  assert.equal(cancelled, true, "cancellation must not prevent the deadline from settling");
});

test("aborted body reads stop promptly", async () => {
  const controller = new AbortController();
  const response = new Response(new ReadableStream({}));
  const reading = readBoundedJson(response, 100, { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(reading, /BODY_ABORTED/);
  await assert.rejects(readBoundedJson(Response.json({}), 100, { signal: controller.signal }), /BODY_ABORTED/);
});

test("slow bodies release both handler locks without any provider request", async () => {
  const config = { provider: "deepseek", model: "deepseek-v4-pro", apiKey: "NOT_A_REAL_KEY", accessToken: "NOT_A_REAL_REVIEW_ACCESS_CODE" };
  for (const createHandler of [createMemoHandler, createQuestionHandler]) {
    let calls = 0;
    const handler = createHandler(() => config, { bodyTimeoutMs: 20, fetcher: async () => { calls++; assert.fail("No model call expected"); } });
    const headers = { origin: "http://localhost", "content-type": "application/json", authorization: `Bearer ${config.accessToken}` };
    const slow = new Request("http://localhost/api/research-question", { method: "POST", headers, body: new ReadableStream({}), duplex: "half" });
    assert.equal((await handler.POST(slow)).status, 400);
    const next = await handler.POST(new Request("http://localhost/api/research-question", { method: "POST", headers, body: "{}" }));
    assert.notEqual(next.status, 429);
    assert.equal(calls, 0);
  }
});

test("access limiter bounds attempts and resets without trusting spoofable IP headers", () => {
  const allow = createAccessLimiter(2, 1000);
  assert.equal(allow(1000), true); assert.equal(allow(1001), true); assert.equal(allow(1002), false);
  assert.equal(allow(2000), true);
});

test("HTTP and missing browser primitives block research generation before spending", () => {
  const ready = { secure: true, hashing: true, ids: true, locks: true };
  assert.equal(researchBrowserIssue(ready), null);
  for (const key of Object.keys(ready)) assert.match(researchBrowserIssue({ ...ready, [key]: false }), /本次未调用模型/);
});
