import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createMemoRun } from "../lib/research-memo.server.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { validateQuestionRun } from "../lib/research-question-storage.ts";
import { questionTestConfig as config, questionTestSnapshot, questionRequest, providerResponse, planOutput, mainQuestion } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Provider boundary tests use mock/local HTTP only");

test("both model paths classify malformed/empty/oversized provider responses without losing the single attempt", async () => {
  for (const responseOf of [() => Response.json(null), () => Response.json([]), () => new Response("not JSON"),
    () => new Response(new Uint8Array([0xff])), () => new Response(null),
    () => new Response("{}", { headers: { "content-length": "262145" } })]) {
    for (const phase of ["question", "memo"]) {
      let calls = 0;
      const fetcher = async () => { calls++; return responseOf(); };
      if (phase === "question") {
        const handler = createQuestionHandler(() => config, { fetcher });
        const { run } = await (await handler.POST(questionRequest({ phase: "plan", question: mainQuestion }))).json();
        assert.deepEqual(run.reasons, ["PROVIDER_RESPONSE_INVALID"]); assert.equal(run.answer, null); await validateQuestionRun(run);
      } else {
        const run = await createMemoRun(questionTestSnapshot(), config, { fetcher });
        assert.equal(run.audit.failureCode, "PROVIDER_RESPONSE_INVALID"); assert.equal(run.memo, null);
      }
      assert.equal(calls, 1);
    }
  }
});

test("HTTP errors cancel unconsumed bodies without waiting for a stuck cancellation hook", async () => {
  for (const phase of ["question", "memo"]) {
    let calls = 0, cancelled = 0;
    const fetcher = async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }), { status: 503 }); };
    if (phase === "question") {
      const handler = createQuestionHandler(() => config, { fetcher });
      const { run } = await (await handler.POST(questionRequest({ phase: "plan", question: mainQuestion }))).json();
      assert.deepEqual(run.reasons, ["PROVIDER_HTTP_503"]); await validateQuestionRun(run);
    } else assert.equal((await createMemoRun(questionTestSnapshot(), config, { fetcher })).audit.failureCode, "PROVIDER_HTTP_503");
    assert.equal(calls, 1); assert.equal(cancelled, 1);
  }
});

test("memo rejects wrong provider model and invalid usage before accepting any content", async () => {
  for (const [patch, expected] of [
    [{ model: "unrelated-model" }, "PROVIDER_MODEL_MISMATCH"],
    [{ usage: null }, "PROVIDER_USAGE_INVALID"],
    [{ usage: { input_tokens: 1, output_tokens: 6001, total_tokens: 6002 } }, "PROVIDER_USAGE_INVALID"],
    [{ usage: { input_tokens: 1, output_tokens: 1, total_tokens: 3 } }, "PROVIDER_USAGE_INVALID"],
    [{ usage: { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 1, total_tokens: Number.MAX_SAFE_INTEGER + 2 } }, "PROVIDER_USAGE_INVALID"],
  ]) {
    let calls = 0;
    const memo = {
      summary: { text: "扣非提供支持，归母下降仍是反证。", citations: ["EV-S-05-C04-ADJ", "EV-S-05-C04-ATTR"] },
      supporting: { text: "扣非表现支持继续核验。", citations: ["EV-S-05-C04-ADJ"] },
      counter: { text: "归母下降不能忽略。", citations: ["EV-S-05-C04-ATTR"] },
      alternatives: { text: "调整项性质可能影响解读，仍待专业复核。", citations: ["EV-S-05-C04-NR", "A-03"] },
      questions: { first: { text: "需复核扣非代表核心经营的假设。", citations: ["A-03"] }, second: { text: "需核对连续可比期间。", citations: ["K-07"] } },
      gates: { eg01: "pending", eg02: "pending" },
    };
    const run = await createMemoRun(questionTestSnapshot(), config, { fetcher: async () => { calls++; return providerResponse(memo, patch); } });
    assert.equal(run.status, "failed"); assert.equal(run.memo, null); assert.equal(run.audit.failureCode, expected); assert.equal(calls, 1);
  }
});

test("reasoning items and null output entries never become the final JSON answer", async () => {
  const raw = JSON.stringify(planOutput()); let calls = 0;
  const handler = createQuestionHandler(() => config, { fetcher: async () => {
    calls++; return providerResponse({}, { output: [null, { type: "reasoning", content: [{ type: "reasoning_text", text: "not the answer" }] },
      { type: "message", content: [null, { type: "output_text", text: raw }] }] });
  } });
  const { run } = await (await handler.POST(questionRequest({ phase: "plan", question: mainQuestion }))).json();
  assert.equal(run.status, "CONTRACT_DRAFTED"); assert.equal(run.calls[0].rawOutput, raw); assert.equal(calls, 1); await validateQuestionRun(run);
});

test("native fetch timeouts before headers and during the body settle with one local request and no retry", { timeout: 10000 }, async t => {
  let received = 0;
  const server = createServer((request, response) => {
    received++; request.resume();
    if (request.url === "/body") { response.writeHead(200, { "content-type": "application/json" }); response.write('{"id":'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/headers", "/body"]) {
    let calls = 0;
    const handler = createQuestionHandler(() => config, { timeoutMs: 150, fetcher: (_url, init) => { calls++; return fetch(origin + path, init); } });
    const { run } = await (await handler.POST(questionRequest({ phase: "plan", question: mainQuestion }))).json();
    assert.deepEqual(run.reasons, ["PROVIDER_TIMEOUT"]); assert.equal(run.answer, null); assert.equal(calls, 1); await validateQuestionRun(run);
  }
  assert.equal(received, 2);
  t.diagnostic("mock-local-http; realModelCalls=0; nativeRequests=2; automaticRetries=0");
});
