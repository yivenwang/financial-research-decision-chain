import { timingSafeEqual } from "node:crypto";
import { buildMemoContext, canonicalJson, memoSchema, MEMO_INSTRUCTIONS, MEMO_PROMPT_VERSION, sha256Text, validateMemo, type MemoProvider, type MemoRun } from "./research-memo.ts";

export type MemoConfig = { provider: MemoProvider; apiKey: string; model: string; accessToken: string; appOrigin?: string };
type Dependencies = { fetcher?: typeof fetch; timeoutMs?: number };
export const MAX_MEMO_REQUEST_BYTES = 128 * 1024;
const PROVIDERS: Record<MemoProvider, { endpoint: string; defaultModel: string; maxOutputTokens: number; timeoutMs: number; accepts: (model: string) => boolean }> = {
  deepseek: { endpoint: "https://api.deepseek.com/responses", defaultModel: "deepseek-v4-pro", maxOutputTokens: 6000, timeoutMs: 150000, accepts: (model) => ["deepseek-v4-pro", "deepseek-v4-flash"].includes(model) },
  openai: { endpoint: "https://api.openai.com/v1/responses", defaultModel: "gpt-5.6-sol", maxOutputTokens: 4000, timeoutMs: 90000, accepts: (model) => /^[a-zA-Z0-9._-]{1,100}$/.test(model) },
};
function providerDefinition(provider: unknown) {
  return provider === "openai" || provider === "deepseek" ? PROVIDERS[provider] : undefined;
}
export function memoConfig(env: NodeJS.ProcessEnv = process.env): MemoConfig {
  const provider: MemoProvider = env.MODEL_PROVIDER === "openai" ? "openai" : "deepseek";
  const isDeepSeek = provider === "deepseek";
  return {
    provider,
    apiKey: (isDeepSeek ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY) ?? "",
    model: (isDeepSeek ? env.DEEPSEEK_MODEL : env.OPENAI_MODEL) || PROVIDERS[provider].defaultModel,
    accessToken: env.RESEARCH_DEMO_TOKEN ?? "",
    appOrigin: env.RESEARCH_APP_ORIGIN?.trim() || undefined,
  };
}
function configured(config: MemoConfig) {
  const definition = providerDefinition(config.provider);
  return Boolean(definition && config.apiKey.trim() && config.accessToken.length >= 16 && definition.accepts(config.model) && (!config.appOrigin || serializedOrigin(config.appOrigin)));
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

class DuplicateJsonKeyError extends SyntaxError {}
function parseMemoJson(raw: string): unknown {
  // Validate JSON syntax first, then inspect keys before using JSON.parse's result.
  // Otherwise duplicate keys silently discard earlier model content.
  const parsed: unknown = JSON.parse(raw);
  const stack: ({ keys: Set<string>; expectsKey: boolean } | null)[] = [];
  for (const match of raw.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],]/g)) {
    const token = match[0];
    if (token === "{") stack.push({ keys: new Set(), expectsKey: true });
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else {
      const frame = stack.at(-1);
      if (token === ",") { if (frame) frame.expectsKey = true; }
      else if (frame?.expectsKey) {
        const key: string = JSON.parse(token);
        if (frame.keys.has(key)) throw new DuplicateJsonKeyError("Duplicate JSON field");
        frame.keys.add(key);
        frame.expectsKey = false;
      }
    }
  }
  return parsed;
}

function diagnosticEnum<T extends string>(value: unknown, allowed: readonly T[]): T | "unknown" | null {
  if (value == null) return null;
  return typeof value === "string" && allowed.includes(value as T) ? value as T : "unknown";
}
function finalOutput(data: unknown) {
  const parts: string[] = [];
  let refused = false;
  if (Array.isArray(data)) for (const item of data) {
    // Retain only final message text, never reasoning or tool output.
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "refusal") refused = true;
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return { parts, refused };
}

export async function createMemoRun(version: unknown, config: MemoConfig, dependencies: Dependencies = {}): Promise<MemoRun> {
  const context = await buildMemoContext(version);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const definition = providerDefinition(config.provider);
  if (!definition || !definition.accepts(config.model)) throw new Error("MODEL_CONFIG_INVALID");
  const requestLimits = { maxOutputTokens: definition.maxOutputTokens, timeoutMs: dependencies.timeoutMs ?? definition.timeoutMs };
  // DeepSeek supports text.format; its stateless API ignores the store parameter.
  const body = { model: config.model, ...(config.provider === "openai" ? { store: false } : {}), reasoning: { effort: "low" }, max_output_tokens: requestLimits.maxOutputTokens,
    input: [{ role: "system", content: MEMO_INSTRUCTIONS }, { role: "user", content: canonicalJson(context) }],
    text: { format: { type: "json_schema", name: "research_update_memo", strict: true, schema: memoSchema(context) } },
  };
  const requestBody = JSON.stringify(body);
  const run: MemoRun = { schemaVersion: "research-memo-run.v1", runId: crypto.randomUUID(), status: "failed", context, memo: null,
    audit: {
      provider: config.provider, requestLimits, providerStatus: null, incompleteReason: null, reasoningTokens: null,
      api: "responses", promptVersion: MEMO_PROMPT_VERSION, promptSha256: await sha256Text(MEMO_INSTRUCTIONS), requestSha256: await sha256Text(requestBody), responseSha256: null, requestedModel: config.model, returnedModel: null, responseId: null, requestId: null, startedAt, finishedAt: startedAt, durationMs: 0, usage: null, rawOutput: null, failureCode: null, validation: [] },
  };
  try {
    const response = await (dependencies.fetcher ?? fetch)(definition.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: requestBody, signal: AbortSignal.timeout(requestLimits.timeoutMs), redirect: "error" });
    run.audit.requestId = response.headers.get("x-request-id")?.slice(0,200) ?? null;
    if (!response.ok) { run.audit.failureCode = `PROVIDER_HTTP_${response.status}`; return run; }
    const data = await readBoundedJson(response, 256 * 1024) as Record<string, unknown>;
    run.audit.responseSha256 = await sha256Text(canonicalJson(data));
    run.audit.responseId = typeof data.id === "string" ? data.id.slice(0,200) : null;
    run.audit.returnedModel = typeof data.model === "string" ? data.model.slice(0,100) : null;
    run.audit.providerStatus = diagnosticEnum(data.status, ["completed", "incomplete", "failed", "in_progress", "queued", "cancelled"] as const);
    const incomplete = data.incomplete_details;
    run.audit.incompleteReason = incomplete == null ? null : typeof incomplete === "object" && !Array.isArray(incomplete)
      ? diagnosticEnum((incomplete as Record<string, unknown>).reason, ["max_output_tokens", "content_filter"] as const) : "unknown";
    const usage = data.usage as Record<string, unknown> | undefined;
    if (usage && [usage.input_tokens, usage.output_tokens, usage.total_tokens].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0)) {
      run.audit.usage = { inputTokens: usage.input_tokens as number, outputTokens: usage.output_tokens as number, totalTokens: usage.total_tokens as number };
    }
    const reasoning = (usage?.output_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens;
    if (run.audit.usage && typeof reasoning === "number" && Number.isSafeInteger(reasoning) && reasoning >= 0 && reasoning <= run.audit.usage.outputTokens) run.audit.reasoningTokens = reasoning;
    if (data.status !== "completed") {
      const { parts, refused } = finalOutput(data.output);
      // This is diagnostic text only. Incomplete output never enters validation or review.
      if (!refused && parts.length === 1 && parts[0].length <= 24000) run.audit.rawOutput = parts[0];
      run.audit.failureCode = "PROVIDER_INCOMPLETE";
      return run;
    }
    if (!run.audit.responseId || !run.audit.returnedModel || !Array.isArray(data.output)) { run.audit.failureCode = "PROVIDER_RESPONSE_INVALID"; return run; }
    const { parts, refused } = finalOutput(data.output);
    if (refused) { run.status = "blocked"; run.audit.failureCode = "MODEL_REFUSAL"; return run; }
    if (parts.length !== 1 || parts[0].length > 24000) { run.audit.failureCode = "MODEL_OUTPUT_INVALID"; return run; }
    run.audit.rawOutput = parts[0];
    let parsed: unknown;
    try { parsed = parseMemoJson(parts[0]); } catch (error) {
      run.status = "blocked";
      run.audit.failureCode = error instanceof DuplicateJsonKeyError ? "MODEL_JSON_DUPLICATE_KEY" : "MODEL_JSON_INVALID";
      return run;
    }
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
function serializedOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  } catch { return false; }
}
function sameOrigin(request: Request, appOrigin?: string) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin || !serializedOrigin(rawOrigin)) return false;
  if (appOrigin) return serializedOrigin(appOrigin) && rawOrigin === appOrigin;
  try {
    const requestUrl = new URL(request.url);
    // Next.js may normalize request.url to localhost while Host remains 127.0.0.1.
    // Proxy deployments can set RESEARCH_APP_ORIGIN; forwarded headers are not trusted.
    const expected = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
    return serializedOrigin(expected) && rawOrigin === expected;
  } catch { return false; }
}
export function createMemoHandler(getConfig = memoConfig, dependencies: Dependencies = {}) {
  let inFlight = false;
  return {
    GET: async () => { const config = getConfig(); return json({ configured: configured(config), provider: config.provider, model: config.model }); },
    POST: async (request: Request) => {
      const config = getConfig();
      if (!configured(config)) return json({ error: "模型服务尚未配置。", code: "MODEL_NOT_CONFIGURED" }, 503);
      if (!authorized(request, config.accessToken)) return json({ error: "演示访问码不正确。", code: "UNAUTHORIZED" }, 401);
      if (!sameOrigin(request, config.appOrigin)) return json({ error: "请求来源不匹配。", code: "ORIGIN_MISMATCH" }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "请求格式错误。", code: "CONTENT_TYPE" }, 415);
      if (inFlight) return json({ error: "已有模型请求正在处理，请稍后重试。", code: "MODEL_BUSY" }, 429);
      inFlight = true;
      try {
        let input: unknown;
        try { input = await readBoundedJson(request, MAX_MEMO_REQUEST_BYTES); } catch { return json({ error: "请求内容无效或超出大小限制。", code: "INVALID_BODY" }, 400); }
        let run: MemoRun;
        try { run = await createMemoRun(input, config, dependencies); } catch { return json({ error: "该版本的来源、证据或冻结计算不一致，请重新导入并审核。", code: "SNAPSHOT_INVALID" }, 422); }
        // Do not log request bodies, names, access codes, keys, or raw model text.
        console.info(JSON.stringify({ event: "research-memo", runId: run.runId, provider: run.audit.provider, responseId: run.audit.responseId, status: run.status, failureCode: run.audit.failureCode, validation: run.audit.validation, requestLimits: run.audit.requestLimits, providerStatus: run.audit.providerStatus, incompleteReason: run.audit.incompleteReason, reasoningTokens: run.audit.reasoningTokens }));
        return json({ run, ...(run.status === "completed" ? {} : { error: failureMessage(run) }) }, run.status === "completed" ? 200 : run.status === "blocked" ? 422 : 502);
      } finally { inFlight = false; }
    },
  };
}
