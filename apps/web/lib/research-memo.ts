import { extractCandidates, reviewAndRun, REQUIRED_METRICS, METRIC_CONFIG, type ParseResult } from "./research-engine.ts";
import { getSourceRecord } from "./source-records.ts";
import type { ResearchVersion, WorkspaceScope } from "./research-versions.ts";
import { V05_PRIMARY_SCHEMA } from "../../../lib/parser-v05-strict.ts";

import { MEMO_PROMPT_VERSION, MEMO_OUTPUT_CONTRACT, MEMO_SECTIONS, MEMO_TEXT_PATTERN, memoContractFor, memoSectionLabel } from "./research-memo-contract.ts";
export { MEMO_PROMPT_VERSION, MEMO_INSTRUCTIONS, MEMO_OUTPUT_CONTRACT, MEMO_SECTIONS, memoSectionLabel } from "./research-memo-contract.ts";
export type MemoProvider = "deepseek" | "openai";

export type MemoPoint = { text: string; citations: string[] };
export type ResearchMemo = {
  summary: MemoPoint;
  supporting: MemoPoint[];
  counter: MemoPoint[];
  alternatives: MemoPoint[];
  questions: MemoPoint[];
  gates: { eg01: "pending"; eg02: "pending" };
};
export type MemoReference = {
  id: string;
  kind: "source" | "derived" | "rule";
  label: string;
  excerpt: string;
  direction: "支持" | "反证" | "中性" | null;
  page: number | null;
  url: string | null;
};
export type MemoContext = {
  schemaVersion: "research-memo-input.v1";
  versionId: string;
  workspace: WorkspaceScope;
  snapshotSha256: string;
  source: { sourceId: string; period: string; url: string; mode: "pdf" | "sample"; sha256: string | null };
  references: MemoReference[];
  frozenState: { signal: string; humanFinalState: string; decision: string; blockedGates: string[] };
  limits: string[];
};
export type MemoRun = {
  schemaVersion: "research-memo-run.v1";
  runId: string;
  status: "completed" | "blocked" | "failed";
  context: MemoContext;
  memo: ResearchMemo | null;
  audit: {
    provider: MemoProvider;
    api: "responses";
    promptVersion: string;
    promptSha256: string;
    requestSha256: string;
    responseSha256: string | null;
    requestedModel: string;
    returnedModel: string | null;
    responseId: string | null;
    requestId: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
    rawOutput: string | null;
    failureCode: string | null;
    validation: string[];
    // Optional for pre-existing records; never backfill their missing diagnostics.
    requestLimits?: { maxOutputTokens: number; timeoutMs: number };
    providerStatus?: "completed" | "incomplete" | "failed" | "in_progress" | "queued" | "cancelled" | "unknown" | null;
    incompleteReason?: "max_output_tokens" | "content_filter" | "unknown" | null;
    reasoningTokens?: number | null;
  };
};
export type MemoReview = {
  id: string;
  runId: string;
  snapshotSha256: string;
  status: "accepted" | "rejected";
  reviewer: string;
  note: string;
  reviewedAt: string;
  scope: "memo-only";
  identityVerified: false;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
}
export async function sha256Text(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function same(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b); }
const money = (value: number | null | undefined) => value == null ? "未提供" : `${value.toFixed(8)} CNY mn`;
const percent = (value: number | null | undefined) => value == null ? "未提供" : `${(value * 100).toFixed(2)}%`;
const gateName: Record<string, string> = { "EG-01": "会计复核", "EG-02": "估值复核", VALUATION_SHARE_COUNT_MISSING: "本期股数", VALUATION_MULTIPLES_MISSING: "估值倍数", VALUATION_PERIOD_BASIS_MISSING: "年化口径", "F-02": "利润桥闭合" };

// This checks the browser snapshot and replays the frozen chain. It does not
// authenticate the PDF or the self-entered reviewer identity on the server.
export async function buildMemoContext(input: unknown): Promise<MemoContext> {
  requireValue(input && typeof input === "object", "研究版本缺失。");
  const version = input as ResearchVersion;
  requireValue(typeof version.versionId === "string" && /^V-\d{2,8}$/.test(version.versionId), "版本编号无效。");
  const source = version.source;
  const record = source?.sourceId ? getSourceRecord(source.sourceId) : undefined;
  requireValue(source && record && source.url === record.url && source.period === record.period, "材料不在已登记范围内。");
  requireValue(source.mode === "pdf" || source.mode === "sample", "请先保存一次已审核材料更新。");
  requireValue(source.mode !== "pdf" || (typeof source.sha256 === "string" && /^[a-f0-9]{64}$/.test(source.sha256)), "真实 PDF 的摘要缺失。");
  const workspace = record.useStatus === "regression-only" ? "regression" : "research";
  requireValue(version.workspace === workspace, "材料与版本库不匹配。");
  requireValue(version.parser?.version === "V0.6-strict" && version.chainVersion === "V0.1", "该历史版本尚不具备完整模型输入，请重新导入并保存。");
  requireValue(version.parser.canPromoteToEvidence && Array.isArray(version.parser.blockers) && version.parser.blockers.length === 0, "解析关卡未通过。");
  requireValue(version.humanReview?.scope === "evidence-only" && version.humanReview.reviewer?.trim(), "缺少证据审核记录。");
  requireValue(Array.isArray(version.evidence) && version.evidence.length === REQUIRED_METRICS.length, "证据数量无效。");
  const metrics = version.parser.originalMetrics;
  const metricKeys = [...V05_PRIMARY_SCHEMA.map((field) => field.key), "non_recurring_total"].sort();
  requireValue(metrics && same(Object.keys(metrics).sort(), metricKeys), "原始完整指标缺失。");
  for (const [key, metric] of Object.entries(metrics)) {
    requireValue(metric && metric.key === key && finite(metric.current) && metric.sourceId === record.sourceId && Number.isInteger(metric.page) && metric.page > 0, "原始指标或定位无效。");
    requireValue(key === "non_recurring_total" || (finite(metric.comparison) && finite(metric.disclosedChange)), "原始比较值缺失。");
    if (REQUIRED_METRICS.includes(key as (typeof REQUIRED_METRICS)[number])) requireValue(metric.unit === "CNY_mn", "财务证据单位不一致。");
  }
  const result: ParseResult = { source: { sourceId: record.sourceId, period: record.period, url: record.url }, metrics, issues: [], blockers: [], canPromoteToEvidence: true };
  const candidates = extractCandidates(result).map((canonical) => {
    const matches = version.evidence.filter((item) => item.metricKey === canonical.metricKey);
    const item = matches[0];
    requireValue(matches.length === 1 && item?.reviewStatus === "accepted" && item.id === canonical.id && item.claimId === "C-04", "必要证据尚未被接受。");
    requireValue(item.sourceId === canonical.sourceId && item.period === canonical.period && item.originalValueMn === canonical.originalValueMn && item.comparisonMn === canonical.comparisonMn && item.disclosedChange === canonical.disclosedChange, "证据的原始值或来源不一致。");
    return { ...canonical, valueMn: item.valueMn, reviewStatus: "accepted" as const };
  });
  requireValue(version.chain && typeof version.chain.runId === "string", "冻结链记录缺失。");
  const run = reviewAndRun(result, candidates, version.chain.runId);
  requireValue(run.canPromoteToEvidence && run.chain && same(run.chain, version.chain) && same(run.reviewedMetrics, version.parser.reviewedMetrics), "快照与冻结引擎复算结果不一致。");
  requireValue(same(run.formula, version.formula) && version.claim?.id === "C-04" && version.claim.after === run.chain.claim.humanFinalState && version.claim.systemSignal === run.chain.claim.systemSignal && version.decision === run.chain.decision.action && same(version.blockedGates, run.chain.decision.blockedGates), "快照的判断、计算或动作不一致。");
  const chain = run.chain;
  const references: MemoReference[] = chain.evidence.map((item) => {
    const key = item.metricKey as (typeof REQUIRED_METRICS)[number] | undefined;
    const fact = key ? run.reviewedMetrics[key] : undefined;
    const original = key ? metrics[key] : undefined;
    const excerpt = fact ? `${METRIC_CONFIG[key!].label}：审核值 ${money(fact.current)}；原始值 ${money(original?.current)}；比较值 ${money(fact.comparison)}；披露同比 ${percent(fact.disclosedChange)}；系统方向 ${item.direction}。`
      : `${item.description}：${item.value == null ? "未提供" : `${(item.value * 100).toFixed(2)} 个百分点`}；系统方向 ${item.direction}。由本版本已审核指标计算。`;
    return { id: item.id, kind: item.kind, label: item.description, excerpt, direction: item.direction, page: item.page ?? null, url: item.page ? `${record.url}#page=${item.page}` : null };
  });
  for (const [id, label, excerpt] of [
    ["A-03", "会计假设", `${chain.assumption.text} 状态：待专业复核。`],
    ["K-07", "失效条件", `${chain.killCriterion.text} 当前状态：${chain.killCriterion.currentState}；未提供连续可比期间序列；会计定性未知。`],
    ["F-02", "利润桥", `归母净利润 ${money(chain.formula?.attributable)} − 非经常性损益 ${money(chain.formula?.nonRecurring)} = 扣非净利润复算值 ${money(chain.formula?.calculatedAdjusted)}；披露值 ${money(chain.formula?.reportedAdjusted)}；差额 ${money(chain.formula?.difference)}；利润桥已闭合。`],
    ["Valuation-B5", "估值输入", `盈利口径：${chain.valuation.earningsBasis === "adjusted_np" ? "扣非归母净利润" : "归母净利润"}；本期 ${money(chain.valuation.periodEarnings)}；年化占位系数 ${chain.valuation.annualizationFactor ?? "未提供"}；年化占位输入 ${money(chain.valuation.annualizedEarnings)}。待补：${chain.valuation.blockedGates.map((gate) => gateName[gate] ?? gate).join("、")}。年化只是展示占位，不是盈利预测；尚无可发布估值。`],
  ]) references.push({ id, kind: "rule", label, excerpt, direction: null, page: null, url: null });
  return {
    schemaVersion: "research-memo-input.v1", versionId: version.versionId, workspace,
    snapshotSha256: await sha256Text(canonicalJson(version)),
    source: { sourceId: record.sourceId, period: record.period, url: record.url, mode: source.mode, sha256: source.sha256 ?? null },
    references,
    frozenState: { signal: chain.claim.systemSignal, humanFinalState: chain.claim.humanFinalState, decision: chain.decision.action, blockedGates: [...chain.decision.blockedGates] },
    limits: ["仅本次报告及 C-04 范围；不能据此概括其他公司或论点。", "证据与署名来自浏览器快照，服务端未重新鉴证 PDF 或审核人身份。", "引用存在不代表推论成立，备忘录仍须人工核对。", source.mode === "sample" ? "输入是教学合成坐标样例，不是真实 PDF 验收。" : "输入来自本机 PDF 解析及逐条证据审核。"],
  };
}

export function memoSchema(context: MemoContext) {
  const properties: Record<string, unknown> = {};
  for (const section of MEMO_SECTIONS) {
    const directed = section.direction ? context.references.filter((ref) => ref.direction === section.direction).map((ref) => ref.id) : [];
    const point = { type: "object", additionalProperties: false, properties: {
      text: { type: "string", pattern: MEMO_TEXT_PATTERN },
      citations: { type: "array", items: { type: "string", enum: context.references.map((ref) => ref.id) },
        description: `本段实际使用的引用，一至 ${MEMO_OUTPUT_CONTRACT.maxCitations} 个。${section.direction ? `同段陈述并引用至少一条${section.direction}事实：${directed.join("、")}。` : "覆盖全部事实与规则限制。"}` },
    }, required: ["text", "citations"] };
    // Fixed object slots avoid unverified array minItems/maxItems support.
    properties[section.key] = section.slots.length === 1 ? point : {
      type: "object", additionalProperties: false,
      properties: Object.fromEntries(section.slots.map((slot) => [slot, point])), required: [...section.slots],
    };
  }
  properties.gates = { type: "object", additionalProperties: false, properties: { eg01: { type: "string", enum: ["pending"] }, eg02: { type: "string", enum: ["pending"] } }, required: ["eg01", "eg02"] };
  return { type: "object", additionalProperties: false, properties, required: [...MEMO_SECTIONS.map((section) => section.key), "gates"] };
}

// Validate the new wire shape before losslessly mapping fixed slots to the
// existing display/storage arrays. Never repair text, citations or missing slots.
export function validateMemoOutput(value: unknown, context: MemoContext): { memo: ResearchMemo | null; errors: string[] } {
  const object = (item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item));
  if (!object(value) || Object.keys(value).sort().join(",") !== [...MEMO_SECTIONS.map((section) => section.key), "gates"].sort().join(",")) return { memo: null, errors: ["MEMO_SCHEMA"] };
  const mapped: Record<string, unknown> = { gates: value.gates };
  for (const section of MEMO_SECTIONS) {
    const item = value[section.key];
    if (!object(item)) return { memo: null, errors: ["MEMO_SECTION_SCHEMA"] };
    if (section.slots.length === 1) mapped[section.key] = section.key === "summary" ? item : [item];
    else {
      if (Object.keys(item).sort().join(",") !== [...section.slots].sort().join(",")) return { memo: null, errors: ["MEMO_SECTION_SCHEMA"] };
      mapped[section.key] = section.slots.map((slot) => item[slot]);
    }
  }
  return validateMemo(mapped, context);
}

export function validateMemo(value: unknown, context: MemoContext, promptVersion = MEMO_PROMPT_VERSION): { memo: ResearchMemo | null; errors: string[] } {
  const errors: string[] = [];
  const contract = memoContractFor(promptVersion);
  if (!contract) return { memo: null, errors: ["MEMO_CONTRACT_UNKNOWN"] };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { memo: null, errors: ["MEMO_SCHEMA"] };
  const memo = value as ResearchMemo;
  const keys = ["summary", "supporting", "counter", "alternatives", "questions", "gates"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) errors.push("MEMO_SCHEMA");
  const refs = new Map(context.references.map((ref) => [ref.id, ref]));
  const used = new Set<string>();
  const checkPoint = (point: MemoPoint, section: string) => {
    if (!point || typeof point !== "object" || Object.keys(point).sort().join(",") !== "citations,text" || typeof point.text !== "string" || !point.text.trim() || (contract === "compact" ? Array.from(point.text).length > MEMO_OUTPUT_CONTRACT.maxPointCharacters : point.text.length > 800) || !Array.isArray(point.citations) || !point.citations.length || point.citations.length > MEMO_OUTPUT_CONTRACT.maxCitations) { errors.push("MEMO_POINT_SCHEMA"); return; }
    if (/[0-9０-９%％]|https?:|javascript:|<\/?[a-z]/i.test(point.text)) errors.push("UNSUPPORTED_TEXT_LITERAL");
    for (const id of point.citations) { if (typeof id !== "string" || !refs.has(id)) errors.push("UNKNOWN_CITATION"); else used.add(id); }
    if (section === "supporting" && !point.citations.some((id) => refs.get(id)?.direction === "支持")) errors.push("SUPPORT_REFERENCE_MISSING");
    if (section === "counter" && !point.citations.some((id) => refs.get(id)?.direction === "反证")) errors.push("COUNTER_REFERENCE_MISSING");
    if (section === "alternatives" && !/可能|假设|待验证/.test(point.text)) errors.push("HYPOTHESIS_NOT_MARKED");
  };
  checkPoint(memo.summary, "summary");
  for (const section of MEMO_SECTIONS) {
    if (section.key === "summary") continue;
    const points = memo[section.key];
    if (!Array.isArray(points)) { errors.push("MEMO_SECTION_SCHEMA"); continue; }
    if (contract === "compact" ? points.length !== section.slots.length : points.length < 1 || points.length > 3) errors.push("MEMO_SECTION_SCHEMA");
    points.forEach((point) => checkPoint(point, section.key));
  }
  if (!same(memo.gates, { eg01: "pending", eg02: "pending" })) errors.push("REVIEW_GATE_CHANGED");
  for (const ref of context.references.filter((ref) => ref.kind === "source")) if (!used.has(ref.id)) errors.push("SOURCE_EVIDENCE_OMITTED");
  return { memo: errors.length ? null : structuredClone(memo), errors: [...new Set(errors)] };
}

export function memoMarkdown(run: MemoRun, review?: MemoReview): string {
  if (run.status !== "completed" || !run.memo) throw new Error("该调用没有可导出的有效备忘录。");
  const point = (item: MemoPoint) => `${item.text} ${item.citations.map((id) => `[${id}]`).join(" ")}`;
  const title = review?.status === "accepted" ? "人工已接受（备忘录内容）" : review?.status === "rejected" ? "已退回" : "待人工复核草稿";
  const lines = ["# 研究更新备忘录", "", `${run.context.source.sourceId} · ${run.context.source.period} · ${run.context.versionId} · ${run.context.workspace}`, "", `状态：${title}。专业关卡仍待复核。`, "", point(run.memo.summary)];
  for (const { key } of MEMO_SECTIONS) if (key !== "summary") lines.push("", `## ${memoSectionLabel(key, run.audit.promptVersion)}`, "", ...run.memo[key].map((item) => `- ${point(item)}`));
  lines.push("", "## 引用与固定事实", "", ...run.context.references.map((ref) => `- [${ref.id}] ${ref.label}：${ref.excerpt}${ref.url ? ` [原文](${ref.url})` : ""}`));
  lines.push("", "## 调用记录", "", `提供方：${run.audit.provider}；模型：${run.audit.returnedModel ?? run.audit.requestedModel}；Prompt：${run.audit.promptVersion}；Response：${run.audit.responseId}；调用：${run.runId}。`, `版本 SHA-256：${run.context.snapshotSha256}`, `PDF SHA-256：${run.context.source.sha256 ?? "教学样例"}`, `完成时间：${run.audit.finishedAt}；Token：${run.audit.usage?.totalTokens ?? "未返回"}。`, "", ...run.context.limits.map((limit) => `- ${limit}`));
  if (review) lines.push("", `备忘录审核人（自行填写）：${review.reviewer}；时间：${review.reviewedAt}；意见：${review.note || "未填写"}。签署范围仅限备忘录，不批准专业关卡或投资动作。`);
  return lines.join("\n") + "\n";
}
