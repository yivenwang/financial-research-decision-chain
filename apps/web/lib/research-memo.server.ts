import { timingSafeEqual } from "node:crypto";
import { buildMemoContext, canonicalJson, memoSchema, MEMO_INSTRUCTIONS, MEMO_PROMPT_VERSION, sha256Text, validateMemo, type MemoRun } from "./research-memo.ts";

type Provider = "deepseek" | "openai";
type Config = { apiKey: string; model: string; accessToken: string; provider?: Provider; endpoint?: string };
type Dependencies = { fetcher?: typeof fetch; timeoutMs?: number };
export const MAX_MEMO_REQUEST_BYTES = 128 * 1024;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/responses";

export function memoConfig(): Config {
  const provider: Provider = process.env.MODEL_PROVIDER === "openai" ? "openai" : "deepseek";
  if (provider === "openai") {
    return {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
      accessToken: process.env.RESEARCH_DEMO_TOKEN ?? "",
      provider,
    };
  }
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
    accessToken: process.env.RESEARCH_DEMO_TOKEN ?? "",
    provider,
  };
}
function configured(config: Config) {
  return Boolean(config.apiKey.trim() && config.accessToken.length >= 16 && /^[a-zA-Z0-9._-]{1,100}$/.test(config.model));
}
export async function readBoundedJson(source: Request | Response, maxBytes: number): Promise<unknown> {
  const declared = source.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new Error("BODY_TOO_LARGE");
  const reader = source.body?.getReader();
  if (!reader) throw new Error("BODY_EMPTY");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function createMemoRun(version: unknown, config: Config, dependencies: Dependencies = {}): Promise<MemoRun> {
  const context = await buildMemoContext(version);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const provider: Provider = config.provider ?? "openai";
  const endpoint = config.endpoint ?? (provider === "deepseek" ? DEEPSEEK_ENDPOINT : OPENAI_ENDPOINT);
  const format = provider === "openai"
    ? { type: "json_schema", name: "research_update_memo", strict: true, schema: memoSchema(context) }
    : { type: "json_schema", name: "research_update_memo", schema: memoSchema(context) };
  const body = { model: config.model, store: false, reasoning: { effort: "low" }, max_output_tokens: 4000,
    input: [{ role: "system", content: MEMO_INSTRUCTIONS }, { role: "user", content: canonicalJson(context) }],
    text: { format },
  };
  const requestBody = JSON.stringify(body);
  const run: MemoRun = { schemaVersion: "research-memo-run.v1", runId: crypto.randomUUID(), status: "failed", context, memo: null,
    audit: {
      // MemoRun v1 was originally typed as OpenAI-only. The cast preserves the
      // historical schema while the serialized audit still records DeepSeek.
      provider: provider as "openai",
      api: "responses", promptVersion: MEMO_PROMPT_VERSION, promptSha256: await sha256Text(MEMO_INSTRUCTIONS), requestSha256: await sha256Text(requestBody), responseSha256: null, requestedModel: config.model, returnedModel: null, responseId: null, requestId: null, startedAt, finishedAt: startedAt, durationMs: 0, usage: null, rawOutput: null, failureCode: null, validation: [] },
  };
  try {
    const response = await (dependencies.fetcher ?? fetch)(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: requestBody, signal: AbortSignal.timeout(dependencies.timeoutMs ?? 90000), redirect: "error" });
    run.audit.requestId = response.headers.get("x-request-id")?.slice(0,200) ?? null;
    if (!response.ok) { run.audit.failureCode = `PROVIDER_HTTP_${response.status}`; return run; }
    const data = await readBoundedJson(response, 256 * 1024) as Record<string, unknown>;
    run.audit.responseSha256 = await sha256Text(canonicalJson(data));
    run.audit.responseId = typeof data.id === "string" ? data.id.slice(0,200) : null;
    run.audit.returnedModel = typeof data.model === "string" ? data.model.slice(0,100) : null;
    const usage = data.usage as Record<string, unknown> | undefined;
    if (usage && [usage.input_tokens, usage.output_tokens, usage.total_tokens].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0)) {
      run.audit.usage = { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number, totalTokens: usage.total_tokens as number };
    }
    if (data.status !== "completed") { run.audit.failureCode = "PROVIDER_INCOMPLETE"; return run; }
    if (!run.audit.responseId || !run.audit.returnedModel || !Array.isArray(data.output)) { run.audit.failureCode = "PROVIDER_RESPONSE_INVALID"; return run; }
    const parts: string[] = [];
    for (const item of data.output) {
      if (item?.type !== "message" || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (content?.type === "refusal") { run.status = "blocked"; run.audit.failureCode = "MODEL_REFUSAL"; return run; }
        if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      }
    }
    if (parts.length !== 1 || parts[0].length > 24000) { run.audit.failureCode = "MODEL_OUTPUT_INVALID"; return run; }
    run.audit.rawOutput = parts[0];
    let parsed: unknown;
    try { parsed = JSON.parse(parts[0]); } catch { run.status = "blocked"; run.audit.failureCode = "MODEL_JSON_INVALID"; return run; }
    const validation = validateMemo(parsed, context);
    run.audit.validation = validation.errors;
    if (!validation.memo) { run.status = "blocked"; run.audit.failureCode = "MEMO_VALIDATION_FAILED"; return run; }
    run.memo = validation.memo;
    run.status = "completed";
    return run;
  } catch (error) {
    run.audit.failureCode = error instanceof Error && /Timeout|Abort/.test(error.name) ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE";
    return run;
  } finally {
    run.audit.finishedAt = new Date().toISOString();
    run.audit.durationMs = Date.now() - started;
  }
}

const failureMessage = (run: MemoRun) => run.status === "blocked" ? "模型输出未通过引用或内容校验，已保留调用记录，请复核后重试。" : "模型服务暂未完成此次请求，已保留调用记录；没有生成备忘录。";
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
function authorized(request: Request, token: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function createMemoHandler(getConfig = memoConfig, dependencies: Dependencies = {}) {
  let inFlight = false;
  return {
    GET: async () => json({ configured: configured(getConfig()) }),
    POST: async (request: Request) => {
      const config = getConfig();
      if (!configured(config)) return json({ error: "模型服务尚未配置。", code: "MODEL_NOT_CONFIGURED" }, 503);
      if (!authorized(request, config.accessToken)) return json({ error: "演示访问码不正确。", code: "UNAUTHORIZED" }, 401);
      if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "请求来源不匹配。", code: "ORIGIN_MISMATCH" }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "请求格式错误。", code: "CONTENT_TYPE" }, 415);
      if (inFlight) return json({ error: "已有模型请求正在处理，请稍后重试。", code: "MODEL_BUSY" }, 429);
      inFlight = true;
      try {
        let input: unknown;
        try { input = await readBoundedJson(request, MAX_MEMO_REQUEST_BYTES); } catch { return json({ error: "请求内容无效或超出大小限制。", code: "INVALID_BODY" }, 400); }
        let run: MemoRun;
        try { run = await createMemoRun(input, config, dependencies); } catch { return json({ error: "该版本的来源、证据或冻结计算不一致，请重新导入并审核。", code: "SNAPSHOT_INVALID" }, 422); }
        // Do not log request bodies, names, access codes, keys, or raw model text.
        console.info(JSON.stringify({ event: "research-memo", runId: run.runId, provider: run.audit.provider, responseId: run.audit.responseId, status: run.status, failureCode: run.audit.failureCode }));
        return json({ run, ...(run.status === "completed" ? {} : { error: failureMessage(run) }) }, run.status === "completed" ? 200 : run.status === "blocked" ? 422 : 502);
      } finally { inFlight = false; }
    },
  };
}
