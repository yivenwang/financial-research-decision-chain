import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { canonicalJson, buildMemoContext } from "../lib/research-memo.ts";
import { parseMemoJson } from "../lib/research-memo.server.ts";
import {
  QUESTION_PLAN_INSTRUCTIONS, QUESTION_PLAN_PROMPT_VERSION, QUESTION_ANSWER_INSTRUCTIONS, QUESTION_ANSWER_PROMPT_VERSION,
  validateQuestionPlan, makeResearchContract, resolveQuestionEvidence, validateQuestionExplanation, questionMarkdown,
} from "../lib/research-question.ts";

export const QUESTION_BATCH_AUTHORIZATION = "question-acceptance-2026-09-20";
export const QUESTION_LIVE_CASES = Object.freeze([
  { id: "Q-LIVE-01", intent: "CHANGE_EXPLAIN", question: "请解释安克创新2026年第一季度归母净利润同比下降、扣非归母净利润同比上升这一现象；哪些原因仍需要进一步核验？" },
  { id: "Q-LIVE-02", intent: "EVIDENCE_AUDIT", question: "请核验安克创新2026年第一季度的归母净利润、扣非归母净利润和非经常性损益：原文依据在哪里，三个数之间是否一致？" },
  { id: "Q-LIVE-03", intent: "DECISION_IMPACT", question: "安克创新2026年第一季度这次利润更新，对现有C-04研究判断及相关假设、规则和人工复核事项有什么影响？" },
]);
const digest = value => createHash("sha256").update(value).digest("hex");
const check = (condition, code) => { if (!condition) throw new Error(code); };

export function assertQuestionBatchEnvironment(env) {
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch", "Only an explicit manual dispatch may spend this batch");
  assert.equal(env.GITHUB_RUN_ATTEMPT, "1", "Do not rerun a paid batch; preserve its first attempt");
  assert.equal(env.QUESTION_ACCEPTANCE_APPROVAL, QUESTION_BATCH_AUTHORIZATION);
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/);
  assert.equal(env.EXPECTED_COMMIT_SHA, env.GITHUB_SHA, "Selected branch must match the approved fixed commit");
  assert.equal(env.MODEL_PROVIDER, "deepseek");
  assert.equal(env.DEEPSEEK_MODEL, "deepseek-v4-pro");
  assert.ok(env.DEEPSEEK_API_KEY?.trim(), "Repository server credential is required");
}

// Reserve every possible provider request before sending it. A missing response
// is not evidence that no tokens were billed. Failure ends the entire batch.
export async function runBoundedQuestionBatch({ commitSha, executePhase, persist, archive }) {
  assert.match(commitSha, /^[a-f0-9]{40}$/);
  const manifest = {
    schemaVersion: "question-live-batch.v1", authorization: QUESTION_BATCH_AUTHORIZATION, commitSha,
    evaluation: "live-provider-http", model: "deepseek-v4-pro", maxRequests: 6,
    maxOutputTokensPerRequest: 6000, maxPossibleOutputTokens: 36000, timeoutMsPerRequest: 150000,
    reasoningEffort: "low", startedAt: new Date().toISOString(), status: "running", contentReview: "pending",
    cases: [], requests: [], knownInputTokens: 0, knownOutputTokens: 0, requestsWithoutUsage: 0,
  };
  await persist(structuredClone(manifest));
  for (const spec of QUESTION_LIVE_CASES) {
    const item = { ...spec, status: "running", requestIndexes: [] };
    manifest.cases.push(item);
    let draft;
    for (const phase of ["plan", "execute"]) {
      check(manifest.requests.length < manifest.maxRequests, "BATCH_BUDGET_EXHAUSTED");
      const record = { index: manifest.requests.length + 1, caseId: spec.id, phase, status: "reserved", startedAt: new Date().toISOString(), usage: null };
      manifest.requests.push(record); item.requestIndexes.push(record.index);
      await persist(structuredClone(manifest)); // If persistence fails, do not call the provider.
      let outcome;
      try { outcome = await executePhase({ spec, phase, draft, index: record.index }); }
      catch { outcome = { ok: false, failureCode: "REQUEST_OR_VALIDATION_FAILED", record: null }; }
      // Archive first. An archive failure aborts rather than spending another request.
      await archive(record.index, { caseId: spec.id, phase, record: outcome.record ?? null });
      Object.assign(record, { status: outcome.ok === true ? "technical-completed" : "failed", finishedAt: new Date().toISOString(),
        failureCode: outcome.ok === true ? null : outcome.failureCode ?? "REQUEST_FAILED", audit: outcome.audit ?? null,
        usage: outcome.audit?.usage ?? null });
      manifest.knownInputTokens = manifest.requests.reduce((n, r) => n + (r.usage?.inputTokens ?? 0), 0);
      manifest.knownOutputTokens = manifest.requests.reduce((n, r) => n + (r.usage?.outputTokens ?? 0), 0);
      manifest.requestsWithoutUsage = manifest.requests.filter(r => !r.usage).length;
      if (outcome.ok !== true) { item.status = "failed"; manifest.status = "stopped-after-failure"; }
      else if (phase === "plan") draft = outcome.data;
      else item.status = "technical-completed-content-pending";
      await persist(structuredClone(manifest));
      if (outcome.ok !== true) break;
    }
    if (manifest.status === "stopped-after-failure") break;
  }
  if (manifest.status === "running") manifest.status = "technical-completed-awaiting-content-review";
  manifest.finishedAt = new Date().toISOString();
  await persist(structuredClone(manifest));
  return manifest;
}

export async function verifyLiveQuestionPhase({ phase, spec, response, snapshot, draft }) {
  check(response.httpStatus === 200, `HTTP_${response.httpStatus}`);
  const run = response.data?.run;
  check(run && run.phase === phase && run.queryRaw === spec.question, "RUN_IDENTITY_MISMATCH");
  check(run.calls?.length === 1, "MODEL_CALL_COUNT_MISMATCH");
  const a = run.calls[0];
  check(!a.failureCode, a.failureCode ?? "PROVIDER_FAILURE");
  check(a.phase === (phase === "plan" ? "plan" : "explain"), "MODEL_PHASE_MISMATCH");
  check(a.provider === "deepseek" && a.requestedModel === "deepseek-v4-pro"
    && /^deepseek-v4-pro(?:-|$)/.test(a.returnedModel ?? ""), "PROVIDER_OR_MODEL_MISMATCH");
  check(a.requestLimits?.maxOutputTokens === 6000 && a.requestLimits?.timeoutMs === 150000, "REQUEST_LIMIT_MISMATCH");
  check(a.usage?.outputTokens > 0 && a.usage.outputTokens <= 6000 && a.responseId && a.responseSha256 && a.requestSha256, "MODEL_AUDIT_INCOMPLETE");
  const prompt = phase === "plan" ? QUESTION_PLAN_INSTRUCTIONS : QUESTION_ANSWER_INSTRUCTIONS;
  check(a.promptSha256 === digest(prompt) && a.promptVersion === (phase === "plan" ? QUESTION_PLAN_PROMPT_VERSION : QUESTION_ANSWER_PROMPT_VERSION), "PROMPT_MISMATCH");
  check(Array.isArray(run.events) && run.events.length > 0, "EVENTS_MISSING");
  for (const [i, event] of run.events.entries()) {
    check(event.sequence === i + 1 && event.detailsSha256 === digest(canonicalJson(event.details)), "EVENT_DIGEST_MISMATCH");
  }
  if (phase === "plan") {
    check(run.status === "CONTRACT_DRAFTED" && typeof response.data.ticket === "string", "CONTRACT_NOT_READY");
    const plan = validateQuestionPlan(parseMemoJson(a.rawOutput));
    check(plan.intent === spec.intent, "INTENT_MISMATCH");
    check(plan.period === "2026Q1", "PERIOD_MISMATCH");
    check(canonicalJson(makeResearchContract(spec.question, plan, run.requestId, run.createdAt)) === canonicalJson(run.contract), "CONTRACT_REPLAY_MISMATCH");
  } else {
    check(["ANSWER_READY", "PARTIAL"].includes(run.status) && run.answer, "ANSWER_NOT_READY");
    check(run.requestId === draft.run.requestId && canonicalJson(run.contract) === canonicalJson(draft.run.contract), "PLAN_BINDING_MISMATCH");
    const expected = await resolveQuestionEvidence(run.contract, snapshot);
    check(expected.status === "READY" && canonicalJson(run.answer.evidence) === canonicalJson(expected.evidence), "EVIDENCE_REPLAY_MISMATCH");
    const explanation = validateQuestionExplanation(parseMemoJson(a.rawOutput), expected.evidence.context);
    check(canonicalJson(explanation) === canonicalJson(run.answer.explanation), "EXPLANATION_REPLAY_MISMATCH");
    check(run.answer.formalRecommendation === null && run.answer.verification.professional === "pending", "PROFESSIONAL_BOUNDARY_MISMATCH");
    check(run.answerSha256 === digest(canonicalJson(run.answer)), "ANSWER_DIGEST_MISMATCH");
  }
  return { ...a, rawOutput: undefined };
}

async function main() {
  assertQuestionBatchEnvironment(process.env);
  const appRoot = fileURLToPath(new URL("../", import.meta.url));
  const out = resolve(appRoot, "artifacts-question-live");
  await mkdir(out); // Refuse overwriting evidence from an earlier attempt.
  await mkdir(resolve(out, "checkpoints"));
  const prior = JSON.parse(await readFile(resolve(appRoot, "artifacts-web/S-05-browser-audit.json"), "utf8"));
  check(prior.snapshot?.source?.mode === "pdf", "REAL_PDF_SNAPSHOT_REQUIRED");
  check(prior.pdfSha256 === "88d2ab7c603a94b7e0943ef07e219235ee59b9048e1dfa8e38bd6ebac99b6d03"
    && prior.snapshot.source.sha256 === prior.pdfSha256, "SOURCE_DIGEST_MISMATCH");
  await buildMemoContext(prior.snapshot);
  await writeFile(resolve(out, "input-snapshot.json"), JSON.stringify(prior, null, 2), { flag: "wx" });
  const token = randomBytes(24).toString("hex");
  const origin = "http://127.0.0.1:4324";
  const require = createRequire(import.meta.url);
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "4324", "-H", "127.0.0.1"], {
    cwd: appRoot, stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, RESEARCH_DEMO_TOKEN: token, RESEARCH_APP_ORIGIN: origin },
  });
  const exited = new Promise(resolveExit => server.once("close", resolveExit));
  let spawnFailed = false; server.once("error", () => { spawnFailed = true; });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      check(!spawnFailed && server.exitCode === null, "SERVER_START_FAILED");
      try {
        const response = await fetch(`${origin}/api/research-question`, { signal: AbortSignal.timeout(1000) });
        const config = await response.json();
        ready = response.ok && config.configured && config.provider === "deepseek" && config.model === "deepseek-v4-pro";
        if (ready) break;
      } catch { /* Configuration GET cannot call the model. */ }
      await delay(250);
    }
    check(ready, "SERVER_NOT_READY");
    let checkpoint = 0;
    const result = await runBoundedQuestionBatch({ commitSha: process.env.GITHUB_SHA,
      persist: async manifest => {
        const text = JSON.stringify(manifest, null, 2);
        await writeFile(resolve(out, "checkpoints", `${String(++checkpoint).padStart(2, "0")}.json`), text, { flag: "wx" });
        await writeFile(resolve(out, "manifest.json"), text);
      },
      archive: async (index, data) => {
        await writeFile(resolve(out, `request-${String(index).padStart(2, "0")}.json`), JSON.stringify(data, null, 2), { flag: "wx" });
        if (data.record?.run?.answer) await writeFile(resolve(out, `${data.caseId}.md`), questionMarkdown(data.record.run), { flag: "wx" });
      },
      executePhase: async ({ spec, phase, draft }) => {
        const body = phase === "plan" ? { phase, question: spec.question } : { phase, draft, confirmed: true, snapshot: prior.snapshot };
        const response = await fetch(`${origin}/api/research-question`, { method: "POST", headers: { origin, "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body), signal: AbortSignal.timeout(175000), redirect: "error" });
        const data = await response.json();
        // Do not archive the transient signed execution ticket or access token.
        const record = { httpStatus: response.status, run: data.run ?? null, code: data.code ?? null };
        try {
          const audit = await verifyLiveQuestionPhase({ phase, spec, response: { httpStatus: response.status, data }, snapshot: prior.snapshot, draft });
          return { ok: true, data, record, audit };
        } catch (error) {
          return { ok: false, record, audit: data.run?.calls?.[0] ? { ...data.run.calls[0], rawOutput: undefined } : null,
            failureCode: /^[A-Z_0-9]+$/.test(error.message) ? error.message : "AUDIT_FAILED" };
        }
      },
    });
    console.log(JSON.stringify({ status: result.status, requestsReserved: result.requests.length, knownOutputTokens: result.knownOutputTokens, contentReview: "pending" }));
    if (result.status !== "technical-completed-awaiting-content-review") process.exitCode = 1;
  } finally {
    server.kill("SIGTERM"); await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGKILL"); await exited; }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
