import { createHmac, timingSafeEqual } from "node:crypto";
import { memoConfig, configured, sameOrigin, readBoundedJson, parseMemoJson, finalOutput, type MemoConfig } from "./research-memo.server.ts";
import { reviewSessionOwner } from "./reviewer-access.ts";
import { canonicalJson, sha256Text } from "./research-memo.ts";
import { operationStore, validOperationId, claimModelSlot, type OperationRecord, type StoreOptions } from "./research-operation.server.ts";
import {
  QUESTION_SCHEMA_VERSION, QUESTION_CAPABILITY, QUESTION_PLAN_INSTRUCTIONS, QUESTION_PLAN_PROMPT_VERSION,
  QUESTION_ANSWER_INSTRUCTIONS, QUESTION_ANSWER_PROMPT_VERSION, questionSources, questionPlanSchema,
  validateQuestionPlan, validQuestion, makeResearchContract, resolveQuestionEvidence, questionExplanationSchema,
  validateQuestionExplanation, addQuestionEvent, type QuestionRun, type QuestionModelAudit, type SignedQuestionDraft,
} from "./research-question.ts";

type Dependencies = { fetcher?: typeof fetch; timeoutMs?: number; bodyTimeoutMs?: number; runDirectory?: string; storeOptions?: StoreOptions };
export const MAX_QUESTION_REQUEST_BYTES = 512 * 1024;
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
function sign(run: QuestionRun, config: MemoConfig, owner: string) {
  // Server-only provider key, not the browser's demo access code. Domain separated.
  return createHmac("sha256", config.apiKey).update("question-draft.v2\n" + owner + "\n" + canonicalJson(run)).digest("hex");
}
function validDraft(draft: SignedQuestionDraft, config: MemoConfig, owner: string) {
  if (!draft?.run || typeof draft.ticket !== "string" || !/^[a-f0-9]{64}$/.test(draft.ticket)) return false;
  const run = draft.run;
  const age = Date.now() - Date.parse(run.createdAt);
  return run.phase === "plan" && run.status === "CONTRACT_DRAFTED" && run.contract?.status === "CONTRACT_DRAFTED" &&
    Number.isFinite(age) && age >= 0 && age <= 60 * 60 * 1000 && timingSafeEqual(Buffer.from(draft.ticket), Buffer.from(sign(run, config, owner)));
}
function newRun(question: string, phase: QuestionRun["phase"], requestId = crypto.randomUUID()): QuestionRun {
  return { schemaVersion: QUESTION_SCHEMA_VERSION, runId: crypto.randomUUID(), requestId, phase, queryRaw: question,
    status: "BLOCKED", createdAt: new Date().toISOString(), contract: null, calls: [], events: [], answer: null, answerSha256: null, reasons: [] };
}

async function modelCall(run: QuestionRun, phase: QuestionModelAudit["phase"], input: unknown, schema: unknown, config: MemoConfig, dependencies: Dependencies): Promise<unknown> {
  const prompt = phase === "plan" ? QUESTION_PLAN_INSTRUCTIONS : QUESTION_ANSWER_INSTRUCTIONS;
  const deepseek = config.provider === "deepseek";
  const started = Date.now();
  const limits = { maxOutputTokens: deepseek ? 6000 : 4000, timeoutMs: dependencies.timeoutMs ?? (deepseek ? 150000 : 90000) };
  const body = JSON.stringify({ model: config.model, ...(deepseek ? {} : { store: false }), reasoning: { effort: "low" }, max_output_tokens: limits.maxOutputTokens,
    input: [{ role: "system", content: prompt }, { role: "user", content: canonicalJson(input) }],
    text: { format: { type: "json_schema", name: `research_question_${phase}`, strict: true, schema } } });
  const audit: QuestionModelAudit = { phase, provider: config.provider, requestedModel: config.model, returnedModel: null,
    promptVersion: phase === "plan" ? QUESTION_PLAN_PROMPT_VERSION : QUESTION_ANSWER_PROMPT_VERSION,
    promptSha256: await sha256Text(prompt), requestSha256: await sha256Text(body), responseSha256: null,
    responseId: null, startedAt: new Date(started).toISOString(), finishedAt: new Date(started).toISOString(), durationMs: 0,
    requestLimits: limits, usage: null, rawOutput: null, failureCode: null };
  run.calls.push(audit);
  await addQuestionEvent(run, "model_requested", { phase, promptVersion: audit.promptVersion, requestSha256: audit.requestSha256, requestLimits: limits });
  try {
    const providerSignal = AbortSignal.timeout(limits.timeoutMs);
    const response = await (dependencies.fetcher ?? fetch)(deepseek ? "https://api.deepseek.com/responses" : "https://api.openai.com/v1/responses", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` }, body,
      signal: providerSignal, redirect: "error",
    });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const data = await readBoundedJson(response, 256 * 1024, { signal: providerSignal, timeoutMs: Math.max(1, limits.timeoutMs - (Date.now() - started)) }) as Record<string, unknown>;
    audit.responseSha256 = await sha256Text(canonicalJson(data));
    audit.responseId = typeof data.id === "string" ? data.id.slice(0,200) : null;
    audit.returnedModel = typeof data.model === "string" ? data.model.slice(0,100) : null;
    const u = data.usage as Record<string, unknown> | undefined;
    if (u && [u.input_tokens, u.output_tokens, u.total_tokens].every(v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0)) audit.usage = { inputTokens: u.input_tokens as number, outputTokens: u.output_tokens as number, totalTokens: u.total_tokens as number };
    const output = finalOutput(data.output);
    if (!output.refused && output.parts.length === 1 && output.parts[0].length <= 24000) audit.rawOutput = output.parts[0];
    if (data.status !== "completed") throw new Error("PROVIDER_INCOMPLETE");
    if (output.refused) throw new Error("MODEL_REFUSAL");
    if (!audit.responseId || !audit.returnedModel || audit.rawOutput === null) throw new Error("PROVIDER_RESPONSE_INVALID");
    try { return parseMemoJson(audit.rawOutput); } catch { throw new Error("MODEL_JSON_INVALID"); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    audit.failureCode = error instanceof Error && /Timeout|Abort/.test(error.name) ? "PROVIDER_TIMEOUT" : /^(PROVIDER_HTTP_\d{3}|PROVIDER_INCOMPLETE|MODEL_REFUSAL|PROVIDER_RESPONSE_INVALID|MODEL_JSON_INVALID)$/.test(message) ? message : "PROVIDER_UNAVAILABLE";
    throw new Error(audit.failureCode);
  } finally {
    audit.finishedAt = new Date().toISOString(); audit.durationMs = Date.now() - started;
    await addQuestionEvent(run, "model_returned", { ...audit, rawOutput: undefined });
  }
}

export function createQuestionHandler(getConfig = memoConfig, dependencies: Dependencies = {}) {
  const store = operationStore(dependencies.runDirectory, dependencies.storeOptions);
  const replay = (record: OperationRecord) => record.state === "completed" ? json(record.response!.body, record.response!.status) :
    record.state === "uncertain" ? json({ code: "OPERATION_INTERRUPTED", error: "该任务已标记为计费或结果不确定，禁止重发。请联系维护者核查。" }, 409) :
    Date.now() - Date.parse(record.startedAt) > 180000 ? json({ code: "OPERATION_INTERRUPTED", error: "任务未留下完整结果，不能自动重发。请先核查运行记录；新任务可能产生新的调用费用。" }, 409) :
    json({ code: "OPERATION_RUNNING", error: "任务仍在处理，请读取状态，无需再次确认。" }, 202);
  const core = {
    GET: async (request?: Request) => {
      const config = getConfig();
      if (request && new URL(request.url).searchParams.has("operationId")) {
        const owner = await reviewSessionOwner(request, config.accessToken);
        if (!owner) return json({ code: "RESEARCH_SESSION_REQUIRED", error: "研究任务需要有效审验会话；共享访问码不能作为任务身份。请重新登录。" }, 401);
        const params = new URL(request.url).searchParams;
        const id = params.get("operationId"), phase = params.get("phase");
        if (!validOperationId(id) || !["plan", "execute"].includes(phase ?? "")) return json({ code: "OPERATION_ID_INVALID", error: "运行标识无效。" }, 400);
        try { const record = await store.read(phase as "plan" | "execute", id); return record && record.ownerSha256 === owner ? replay(record) : json({ code: "OPERATION_NOT_FOUND", error: "当前会话无可读取任务。重新登录不会接管旧会话任务；请保留本机记录和任务标识。" }, 404); }
        catch { return json({ code: "OPERATION_INTERRUPTED", error: "任务记录不完整，已阻止重复调用。请保留记录并联系维护者核查。" }, 409); }
      }
      return json({ configured: configured(config), provider: config.provider, model: config.model, capability: QUESTION_CAPABILITY,
        sources: questionSources().map(({ sourceId, period, name, url }) => ({ sourceId, period, name, url })) });
    },
    POST: async (request: Request) => {
      const config = getConfig();
      if (!configured(config)) return json({ code: "MODEL_NOT_CONFIGURED", error: "模型服务尚未配置。" }, 503);
      const owner = await reviewSessionOwner(request, config.accessToken);
      if (!owner) return json({ code: "RESEARCH_SESSION_REQUIRED", error: "请使用有效审验会话登录；共享 Bearer 不能创建或执行研究任务。" }, 401);
      if (!sameOrigin(request, config.appOrigin)) return json({ code: "ORIGIN_MISMATCH", error: "请求来源不匹配。" }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ code: "CONTENT_TYPE", error: "需要 JSON 请求。" }, 415);
      let input: Record<string, unknown>;
      try {
        const value = await readBoundedJson(request, MAX_QUESTION_REQUEST_BYTES, { timeoutMs: dependencies.bodyTimeoutMs });
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        input = value as Record<string, unknown>;
      } catch { return json({ code: "INVALID_BODY", error: "请求内容无效或超出大小限制。" }, 400); }
      if (input.phase === "plan") {
        if (Object.keys(input).sort().join(",") !== "phase,question" || !validQuestion(input.question)) return json({ code: "QUESTION_INVALID", error: "请输入一至一千字符的研究问题。" }, 400);
        const run = newRun(input.question, "plan", request.headers.get("Idempotency-Key") || crypto.randomUUID());
        await addQuestionEvent(run, "query_received", { queryRaw: run.queryRaw, capability: QUESTION_CAPABILITY, sourceRegistry: questionSources().map(({ sourceId, period, url }) => ({ sourceId, period, url })) });
        try {
          const output = await modelCall(run, "plan", { queryRaw: run.queryRaw, capability: QUESTION_CAPABILITY, sources: questionSources().map(({ sourceId, period }) => ({ sourceId, period })) }, questionPlanSchema, config, dependencies);
          const plan = validateQuestionPlan(output);
          run.contract = makeResearchContract(run.queryRaw, plan, run.requestId, run.createdAt);
          run.status = run.contract.status; run.reasons = [...run.contract.reasons];
          await addQuestionEvent(run, "scope_gate_result", run.contract);
        } catch (error) {
          const code = error instanceof Error ? error.message : "CONTRACT_FAILED";
          run.reasons = [code];
          await addQuestionEvent(run, "contract_failed", { code });
        }
        return json({ run, ticket: run.status === "CONTRACT_DRAFTED" ? sign(run, config, owner) : null });
      }
      if (input.phase !== "execute" || Object.keys(input).sort().join(",") !== "confirmed,draft,phase,snapshot" || input.confirmed !== true) return json({ code: "CONFIRMATION_REQUIRED", error: "请先确认研究任务。" }, 400);
      const draft = input.draft as SignedQuestionDraft;
      if (!validDraft(draft, config, owner)) return json({ code: "CONTRACT_INVALID", error: "草稿不属于当前会话、已过期或被修改。重新登录不能接管旧任务；请保留原记录并重新规划。" }, 422);
      const run = newRun(draft.run.queryRaw, "execute", draft.run.requestId);
      run.contract = structuredClone(draft.run.contract);
      await addQuestionEvent(run, "contract_confirmed", { planRunId: draft.run.runId, planSha256: await sha256Text(canonicalJson(draft.run)), contract: run.contract, identityVerified: false, sessionOwnershipVerified: true });
      // Preserve full planning provenance inside each standalone execution export.
      await addQuestionEvent(run, "plan_record", draft.run);
      await addQuestionEvent(run, "snapshot_supplied", input.snapshot);
      const resolved = await resolveQuestionEvidence(run.contract!, input.snapshot);
      if (resolved.status !== "READY") {
        run.status = resolved.status; run.reasons = resolved.reasons;
        await addQuestionEvent(run, "evidence_gate_result", { status: resolved.status, reasons: resolved.reasons, snapshotSha256: await sha256Text(canonicalJson(input.snapshot)) });
        return json({ run });
      }
      const evidence = resolved.evidence;
      await addQuestionEvent(run, "source_resolved", { ...evidence.context.source, snapshotSha256: evidence.context.snapshotSha256, versionId: evidence.context.versionId });
      await addQuestionEvent(run, "tools_completed", { tools: run.contract!.allowedTools, facts: evidence.facts, calculations: evidence.calculations, graphDiff: evidence.graphDiff });
      await addQuestionEvent(run, "verification_result", { evidence: "PASS", professional: "pending", formalRecommendation: null });
      try {
        const output = await modelCall(run, "explain", { contract: run.contract, evidence: evidence.context, facts: evidence.facts, calculations: evidence.calculations, graphDiff: evidence.graphDiff }, questionExplanationSchema(evidence.context), config, dependencies);
        const explanation = validateQuestionExplanation(output, evidence.context);
        run.answer = { answerStatus: explanation.sufficiency === "partial" ? "PARTIAL" : "PASS", explanation, evidence,
          verification: { evidence: "PASS", professional: "pending" }, recommendedHumanAction: "核对解释及引用后接受或退回研究草稿；会计、估值和最终投资判断仍待人工专业复核。", formalRecommendation: null };
        run.status = explanation.sufficiency === "partial" ? "PARTIAL" : "ANSWER_READY";
        run.answerSha256 = await sha256Text(canonicalJson(run.answer));
        await addQuestionEvent(run, "answer_generated", { answerSha256: run.answerSha256, status: run.status, snapshotSha256: evidence.context.snapshotSha256 });
      } catch (error) {
        run.status = "BLOCKED"; run.reasons = [error instanceof Error ? error.message : "EXPLANATION_FAILED"];
        await addQuestionEvent(run, "explanation_failed", { reasons: run.reasons, evidenceSha256: await sha256Text(canonicalJson(evidence)) });
      }
      return json({ run });
    },
  };
  return { GET: core.GET, POST: async (request: Request) => {
    const config = getConfig();
    // Authenticate before reading the body, operation IDs, or stored results.
    const owner = await reviewSessionOwner(request, config.accessToken);
    if (!configured(config) || !owner || !sameOrigin(request, config.appOrigin) || !request.headers.get("content-type")?.startsWith("application/json")) return core.POST(request);
    let input: Record<string, unknown>;
    try { input = await readBoundedJson(request, MAX_QUESTION_REQUEST_BYTES, { timeoutMs: dependencies.bodyTimeoutMs }) as Record<string, unknown>; }
    catch { return json({ code: "INVALID_BODY", error: "请求内容无效或超出大小限制。" }, 400); }
    const copy = () => new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(input) });
    if (!input || typeof input !== "object" || Array.isArray(input)) return core.POST(copy());
    const phase = input.phase;
    let id: string;
    if (phase === "plan" && Object.keys(input).sort().join(",") === "phase,question" && validQuestion(input.question)) {
      id = request.headers.get("Idempotency-Key") || crypto.randomUUID();
    } else if (phase === "execute" && Object.keys(input).sort().join(",") === "confirmed,draft,phase,snapshot" && input.confirmed === true && validDraft(input.draft as SignedQuestionDraft, config, owner)) {
      const draft = input.draft as SignedQuestionDraft;
      // Gate failures make zero provider requests and do not consume the signed task.
      if ((await resolveQuestionEvidence(draft.run.contract!, input.snapshot)).status !== "READY") return core.POST(copy());
      id = draft.run.requestId;
    } else return core.POST(copy());
    if (!validOperationId(id)) return json({ code: "OPERATION_ID_INVALID", error: "运行标识无效。" }, 400);
    const hash = await sha256Text(canonicalJson(input));
    let modelMayHaveStarted = false;
    try {
      const previous = await store.read(phase, id);
      if (previous && previous.ownerSha256 !== owner) return json({ code: "OPERATION_NOT_FOUND", error: "当前会话无权访问此任务。请保留旧会话的本机记录。" }, 404);
      if (previous) return previous.inputSha256 === hash ? replay(previous) : json({ code: "OPERATION_CONFLICT", error: "同一任务的输入已变化，请生成新的研究任务。" }, 409);
      const release = claimModelSlot();
      if (!release) return json({ code: "MODEL_BUSY", error: "已有模型请求正在处理，请稍后读取状态或手动重试。" }, 429);
      try {
        const record = await store.claim(phase, id, hash, owner);
        if (!record) { const existing = await store.read(phase, id); return existing && existing.ownerSha256 === owner && existing.inputSha256 === hash ? replay(existing) : json({ code: "OPERATION_CONFLICT", error: "任务记录已存在，请读取状态。" }, 409); }
        modelMayHaveStarted = true;
        const response = await core.POST(copy());
        await store.complete(phase, id, record, response);
        return response;
      } finally { release(); }
    } catch (error) {
      const storageCode = error instanceof Error && /^OPERATION_[A-Z_]+$/.test(error.message) ? error.message : "OPERATION_STORAGE_IO_FAILED";
      console.warn(JSON.stringify({ event: "question-storage-blocked", phase, operationId: id, storageCode, modelMayHaveStarted }));
      return json({ code: "OPERATION_STORAGE_FAILED", storageCode, error: "运行存储未就绪或记录需要核对，已阻止重发。请保留任务标识并联系维护者；缺少结果不代表没有计费。" }, 503);
    }
  } };
}
