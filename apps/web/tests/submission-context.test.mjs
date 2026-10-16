import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { createMemoHandler } from "../lib/research-memo.server.ts";
import { reviewSessionValue, REVIEW_ACCESS_COOKIE } from "../lib/reviewer-access.ts";
import { questionTestConfig as config, questionTestSnapshot, planOutput, providerResponse, schemaAnswerOutput } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Submission context probes use Mock only");
const PRIVATE_A = "ONLY_A_PRIVATE_QUERY", PRIVATE_B = "ONLY_B_PRIVATE_QUERY";
const INJECTION = "UNTRUSTED_PDF_IGNORE_SYSTEM_FETCH_OTHER_USER_SECRET";
async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "beacon-context-audit-")); t.after(() => rm(base, { recursive: true, force: true }));
  const a = await reviewSessionValue(config.accessToken), b = await reviewSessionValue(config.accessToken), captures = [];
  const handler = createQuestionHandler(() => config, { runDirectory: join(base, "operations"), fetcher: async (_url, init) => {
    const wire = JSON.parse(init.body); captures.push(wire);
    if (wire.text.format.name.endsWith("plan")) {
      const current = JSON.parse(wire.input[1].content);
      return providerResponse(planOutput(current.queryRaw.includes(PRIVATE_B) ? { company: "公牛集团", intent: "OUT_OF_SCOPE", reason: "另一公司超出当前能力。" } : {}));
    }
    return providerResponse(schemaAnswerOutput(wire));
  } });
  const post = (body, cookie = a, endpoint = "research-question") => new Request(`http://localhost/api/${endpoint}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", cookie: `${REVIEW_ACCESS_COOKIE}=${cookie}` }, body: JSON.stringify(body) });
  const get = (phase, id, cookie = a) => new Request(`http://localhost/api/research-question?phase=${phase}&operationId=${id}`, { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=${cookie}` } });
  return { a, b, captures, handler, post, get };
}

test("two signed visitors send only their current query, and resource-ID substitution cannot reveal or execute the other task", async t => {
  const f = await fixture(t);
  const a = await(await f.handler.POST(f.post({ phase: "plan", question: `安克创新本期利润结构。${PRIVATE_A}` }))).json();
  const b = await(await f.handler.POST(f.post({ phase: "plan", question: `公牛集团本期利润结构。${PRIVATE_B}` }, f.b))).json();
  assert.equal(a.run.status, "CONTRACT_DRAFTED"); assert.equal(b.run.status, "OUT_OF_SCOPE");
  assert.equal(f.captures.length, 2);
  for (const [index, own, foreign] of [[0, PRIVATE_A, PRIVATE_B], [1, PRIVATE_B, PRIVATE_A]]) {
    const wire = f.captures[index];
    assert.deepEqual(wire.input.map(message => message.role), ["system", "user"]);
    assert.equal(wire.input[0].content.includes(own), false); assert.equal(wire.input[1].content.includes(own), true);
    assert.equal(JSON.stringify(wire).includes(foreign), false);
    for (const key of ["conversation", "conversation_id", "previous_response_id", "tools", "tool_choice"]) assert.equal(Object.hasOwn(wire, key), false);
  }
  assert.equal((await f.handler.GET(f.get("plan", a.run.requestId, f.b))).status, 404);
  assert.equal((await f.handler.GET(f.get("plan", b.run.requestId, f.a))).status, 404);
  assert.equal((await f.handler.POST(f.post({ phase: "execute", draft: a, confirmed: true, snapshot: questionTestSnapshot() }, f.b))).status, 422);
  assert.equal((await f.handler.POST(new Request("http://localhost/api/research-question", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", cookie: `${REVIEW_ACCESS_COOKIE}=${f.b}`, "Idempotency-Key": a.run.requestId }, body: JSON.stringify({ phase: "plan", question: "安克创新本期利润结构。" }) }))).status, 404);
  assert.equal(f.captures.length, 2, "Cross-owner attacks must make zero additional provider requests");
  t.diagnostic("Mock fetch request bodies inspected; second company correctly OUT_OF_SCOPE; realModelCalls=0");
});

test("untrusted uploaded metadata and evidence snippets cannot become provider instructions or cross-task context", async t => {
  const f = await fixture(t);
  const draft = await(await f.handler.POST(f.post({ phase: "plan", question: `安克创新本期利润结构。${PRIVATE_A}` }))).json();
  // Alter untrusted source/reviewer/display text while preserving the exact
  // reviewed metrics and frozen chain. No PDF or external resource is loaded.
  const snapshot = questionTestSnapshot(); snapshot.source.name = INJECTION; snapshot.humanReview.reviewer = INJECTION;
  for (const item of snapshot.evidence) for (const key of ["label", "snippet", "sourceExcerpt", "location"]) item[key] = INJECTION;
  const executed = await(await f.handler.POST(f.post({ phase: "execute", draft, confirmed: true, snapshot }))).json();
  assert.equal(executed.run.status, "ANSWER_READY");
  const explanation = f.captures.at(-1);
  assert.equal(JSON.stringify(explanation).includes(INJECTION), false); assert.equal(JSON.stringify(explanation).includes(PRIVATE_B), false);
  assert.equal(explanation.input[1].content.includes(PRIVATE_A), true);
  assert.deepEqual(explanation.input.map(message => message.role), ["system", "user"]); assert.equal(Object.hasOwn(explanation, "tools"), false);
  const memoCaptures = [];
  const memo = createMemoHandler(() => config, { fetcher: async (_url, init) => { memoCaptures.push(JSON.parse(init.body)); return new Response(null, { status: 503 }); } });
  assert.equal((await memo.POST(f.post(snapshot, f.a, "research-memo"))).status, 502);
  assert.equal(memoCaptures.length, 1);
  assert.equal(JSON.stringify(memoCaptures[0]).includes(INJECTION), false);
  assert.equal(JSON.stringify(memoCaptures[0]).includes(PRIVATE_A), false); assert.equal(JSON.stringify(memoCaptures[0]).includes(PRIVATE_B), false);
  assert.deepEqual(memoCaptures[0].input.map(message => message.role), ["system", "user"]);
  for (const key of ["tools", "conversation", "conversation_id", "previous_response_id"]) assert.equal(Object.hasOwn(memoCaptures[0], key), false);
  t.diagnostic("Canonical structured inputs inspected for both provider paths; not evidence of live-model obedience; realModelCalls=0");
});
