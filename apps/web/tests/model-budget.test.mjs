import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MODEL_BUDGET_LIMITS, modelBudgetStore, modelInputBudget, reserveModelBudget } from "../lib/model-budget.server.ts";
import { createMemoHandler, createMemoRun } from "../lib/research-memo.server.ts";
import { createQuestionHandler } from "../lib/research-question.server.ts";
import { REVIEW_ACCESS_COOKIE, reviewSessionValue } from "../lib/reviewer-access.ts";
import { questionTestConfig as config, questionTestSnapshot, planOutput, mainQuestion, providerResponse } from "./question-test-helpers.mjs";

assert.notEqual(process.env.LIVE_MODEL_E2E, "1", "Budget tests must use Mock only");
const metadata = { ownerSha256: "a".repeat(64), provider: "deepseek", model: "deepseek-v4-pro", maxOutputTokens: 6000 };
const claim = { ...metadata, inputEstimate: 5000, wireSha256: "b".repeat(64) };
async function fixture(t, options = {}) {
  const base = await mkdtemp(join(tmpdir(), "beacon-model-budget-")); t.after(() => rm(base, { recursive: true, force: true }));
  const directory = join(base, "ledger"), store = modelBudgetStore(directory, options); await store.initialize();
  return { base, directory, store };
}
async function request(body, endpoint = "research-question", cookie) {
  cookie ??= await reviewSessionValue(config.accessToken);
  return new Request(`http://localhost/api/${endpoint}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", cookie: `${REVIEW_ACCESS_COOKIE}=${cookie}` }, body: JSON.stringify(body) });
}

test("wire budget counts UTF-8 bytes plus reserve and rejects before any reservation", async () => {
  assert.equal(modelInputBudget("中").estimatedInputTokens, 4099);
  assert.equal(modelInputBudget("x".repeat(28672)).estimatedInputTokens, 32768);
  let reservations = 0;
  await assert.rejects(reserveModelBudget("x".repeat(28673), metadata, { budgetStore: { reserve: async () => { reservations++; } } }), /INPUT_EXCEEDED/);
  assert.equal(reservations, 0);
  assert.deepEqual(MODEL_BUDGET_LIMITS, { attempts: 240, visitorPerHour: 24, globalPerMinute: 30, inputEstimate: 32768, framingReserve: 4096 });
});

test("all 240 attempts survive restart, failures and elapsed days; a new cookie cannot reset the allowance", async t => {
  let at = Date.now(); const { store, directory } = await fixture(t, { now: () => at });
  for (let index = 0; index < 240; index++) {
    const reservation = await store.reserve(claim); await reservation.finish(null, "PROVIDER_HTTP_503"); at += 3600001;
  }
  const restarted = modelBudgetStore(directory, { now: () => at });
  await assert.rejects(restarted.reserve({ ...claim, ownerSha256: "c".repeat(64) }), /EXHAUSTED/);
  const state = await restarted.inspect(); assert.equal(state.attemptsReserved, 240); assert.equal(state.attemptsRemaining, 0); assert.equal(state.usageUnknown, 240);
  await assert.rejects(restarted.initialize(), /ALREADY_INITIALIZED/);
});

test("visitor hourly and global minute limits include failed calls across sessions and reset no lifetime count", async t => {
  let at = Date.now(); const { store } = await fixture(t, { now: () => at });
  const complete = async input => { const reserved = await store.reserve(input); await reserved.finish(null, "PROVIDER_TIMEOUT"); };
  for (let i = 0; i < 24; i++) await complete(claim);
  await assert.rejects(store.reserve(claim), /RATE_LIMITED/);
  for (let i = 0; i < 6; i++) await complete({ ...claim, ownerSha256: "c".repeat(64) });
  await assert.rejects(store.reserve({ ...claim, ownerSha256: "d".repeat(64) }), /RATE_LIMITED/);
  at += 60001;
  await assert.rejects(store.reserve(claim), /RATE_LIMITED/);
  await complete({ ...claim, ownerSha256: "d".repeat(64) });
  at += 3600001; await complete(claim);
  assert.equal((await store.inspect()).attemptsReserved, 32);
});

test("independent processes atomically allow one in-flight request and preserve a crash as uncertain", async t => {
  const { directory, store } = await fixture(t);
  const moduleUrl = new URL("../lib/model-budget.server.ts", import.meta.url).href;
  const script = `import {modelBudgetStore} from ${JSON.stringify(moduleUrl)};try {await modelBudgetStore(process.argv[1]).reserve(${JSON.stringify(claim)});process.stdout.write('reserved');}catch(e){process.stdout.write(e.message);}`;
  const results = await Promise.all(Array.from({ length: 6 }, () => promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script, directory])));
  assert.deepEqual(results.map(value => value.stdout).sort(), ["MODEL_BUDGET_BUSY", "MODEL_BUDGET_BUSY", "MODEL_BUDGET_BUSY", "MODEL_BUDGET_BUSY", "MODEL_BUDGET_BUSY", "reserved"]);
  assert.equal((await store.inspect()).attemptsReserved, 1); assert.equal((await store.inspect()).inFlightOrUncertain, 1);
  await assert.rejects(modelBudgetStore(directory).reserve(claim), /BUSY/);
});

test("missing, corrupted and non-private ledgers fail closed without automatic initialization", async t => {
  const { directory, store } = await fixture(t);
  await assert.rejects(modelBudgetStore(join(directory, "missing")).reserve(claim), /RECOVERY_REQUIRED/);
  const reserved = await store.reserve(claim); await reserved.finish({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }, null);
  const attempt = (await readdir(directory)).find(name => name.startsWith("attempt-"));
  const original = await readFile(join(directory, attempt));
  await writeFile(join(directory, attempt), "{}"); await assert.rejects(store.reserve(claim), /RECORD_INVALID/);
  await writeFile(join(directory, attempt), original); await chmod(directory, 0o755); await assert.rejects(store.reserve(claim), /NOT_PRIVATE/); await chmod(directory, 0o700);
  const contents = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".json")).map(name => readFile(join(directory, name), "utf8")));
  assert.equal(contents.join("").includes(config.apiKey), false); assert.equal(contents.join("").includes(mainQuestion), false);
});

test("memo and question share persistent allowance, require signed visitors and do not refund 503", async t => {
  const limits = { attempts: 2 }; const { store, base } = await fixture(t, { limits }); let calls = 0;
  const cookieA = await reviewSessionValue(config.accessToken), cookieB = await reviewSessionValue(config.accessToken);
  const question = createQuestionHandler(() => config, { budgetStore: store, runDirectory: join(base, "operations"), fetcher: async () => { calls++; return providerResponse(planOutput()); } });
  const memo = createMemoHandler(() => config, { budgetStore: store, fetcher: async () => { calls++; return new Response(null, { status: 503 }); } });
  const bearer = new Request("http://localhost/api/research-memo", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", authorization: `Bearer ${config.accessToken}` }, body: JSON.stringify(questionTestSnapshot()) });
  assert.equal((await memo.POST(bearer)).status, 401); assert.equal(calls, 0);
  assert.equal((await question.POST(await request({ phase: "plan", question: mainQuestion }, "research-question", cookieA))).status, 200);
  assert.equal((await memo.POST(await request(questionTestSnapshot(), "research-memo", cookieA))).status, 502);
  assert.equal((await question.POST(await request({ phase: "plan", question: mainQuestion }, "research-question", cookieB))).status, 429);
  assert.equal(calls, 2); assert.equal((await store.inspect()).attemptsReserved, 2); assert.equal((await store.inspect()).usageUnknown, 1);
});

test("provider usage above input estimate is retained but cannot become accepted content", async t => {
  const { store, base } = await fixture(t); let calls = 0;
  const fetcher = async () => { calls++; return providerResponse(planOutput(), { usage: { input_tokens: 40000, output_tokens: 1, total_tokens: 40001 } }); };
  const question = createQuestionHandler(() => config, { budgetStore: store, runDirectory: join(base, "operations"), fetcher });
  const planned = await(await question.POST(await request({ phase: "plan", question: mainQuestion }))).json();
  assert.deepEqual(planned.run.reasons, ["PROVIDER_USAGE_INVALID"]); assert.equal(planned.ticket, null);
  const memo = await createMemoRun(questionTestSnapshot(), config, { budgetStore: store, budgetOwner: "a".repeat(64), fetcher });
  assert.equal(memo.audit.failureCode, "PROVIDER_USAGE_INVALID"); assert.equal(memo.memo, null); assert.equal(calls, 2);
  assert.equal((await store.inspect()).knownInputTokens, 80000); assert.equal((await store.inspect()).attemptsReserved, 2);
});

test("provider timeout settles unknown usage, releases in-flight admission and still consumes the attempt", async t => {
  const { store, base } = await fixture(t); let calls = 0;
  const question = createQuestionHandler(() => config, { budgetStore: store, runDirectory: join(base, "operations"), timeoutMs: 15, fetcher: async (_url, init) => {
    calls++; return new Promise((_resolve, reject) => { init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }); });
  } });
  // Keep the event loop live because AbortSignal.timeout uses an unref timer.
  const alive = setInterval(() => {}, 1000); t.after(() => clearInterval(alive));
  const first = await(await question.POST(await request({ phase: "plan", question: mainQuestion }))).json();
  assert.deepEqual(first.run.reasons, ["PROVIDER_TIMEOUT"]);
  const next = await store.reserve(claim); await next.finish(null, "PROVIDER_HTTP_429");
  assert.equal(calls, 1); assert.equal((await store.inspect()).attemptsReserved, 2); assert.equal((await store.inspect()).inFlightOrUncertain, 0);
});

test("failure to persist provider settlement cannot return a successful draft or permit another attempt", async t => {
  const { store, base, directory } = await fixture(t); let calls = 0;
  const question = createQuestionHandler(() => config, { budgetStore: store, runDirectory: join(base, "operations"), fetcher: async () => {
    calls++; await chmod(directory, 0o755); return providerResponse(planOutput());
  } });
  const response = await question.POST(await request({ phase: "plan", question: mainQuestion }));
  assert.equal(response.status, 503); const data = await response.json();
  assert.deepEqual(data.run.reasons, ["MODEL_BUDGET_RECOVERY_REQUIRED"]); assert.equal(data.ticket, null);
  assert.equal(data.run.events.filter(event => event.event === "model_returned").length, 1);
  await chmod(directory, 0o700);
  assert.equal((await store.inspect()).inFlightOrUncertain, 1);
  assert.equal((await question.POST(await request({ phase: "plan", question: mainQuestion }))).status, 429); assert.equal(calls, 1);
});

test("offline production CLI initializes and inspects one private ledger with no reset or provider credentials", async t => {
  const base = await mkdtemp(join(tmpdir(), "beacon-budget-cli-")); t.after(() => rm(base, { recursive: true, force: true }));
  const runDirectory = join(base, "receipts"), cli = new URL("../scripts/model-budget-store.mjs", import.meta.url).pathname;
  const run = args => promisify(execFile)(process.execPath, ["--experimental-strip-types", cli, ...args], { env: { ...process.env, NODE_ENV: "production", DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "" } });
  const first = JSON.parse((await run(["init", runDirectory])).stdout); assert.equal(first.attemptsRemaining, 240); assert.equal(first.modelRequests, 0);
  const inspected = JSON.parse((await run(["inspect", runDirectory])).stdout); assert.equal(inspected.attemptsReserved, 0);
  await assert.rejects(run(["init", runDirectory]), /ALREADY_INITIALIZED/); await assert.rejects(run(["reset", runDirectory]), /USAGE_INIT_OR_INSPECT/);
});

test("production cannot bypass absent ledger using an environment test flag", async () => {
  const script = `import {reserveModelBudget} from ${JSON.stringify(new URL("../lib/model-budget.server.ts", import.meta.url).href)};try{await reserveModelBudget('{}',${JSON.stringify(metadata)});process.exitCode=1;}catch(e){process.stdout.write(e.message);}`;
  const result = await promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { env: { ...process.env, NODE_ENV: "production", RESEARCH_RUN_DIRECTORY: "", QUESTION_ACCEPTANCE_BUDGET_MODE: "", LIVE_MODEL_E2E: "0" } });
  assert.equal(result.stdout, "MODEL_BUDGET_ABSOLUTE_DIRECTORY_REQUIRED");
});
