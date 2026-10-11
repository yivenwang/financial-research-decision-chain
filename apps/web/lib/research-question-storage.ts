import { canonicalJson, sha256Text } from "./research-memo.ts";
import { requireResearchBrowserCapabilities } from "./research-browser.ts";
import { readActiveVersionId, readStoredVersions } from "./research-versions.ts";
import { QUESTION_SCHEMA_VERSION, resolveQuestionEvidence, validateQuestionExplanation, validateQuestionPlan, makeResearchContract,
  questionPromptInstructions, type QuestionRun } from "./research-question.ts";
import { parseMemoJson } from "./model-json.ts";

export const QUESTION_STORAGE_KEY = "financial-research-questions-v1";
export type QuestionReview = { id: string; runId: string; answerSha256: string; snapshotSha256: string;
  status: "accepted" | "rejected"; reviewer: string; note: string; reviewedAt: string;
  scope: "question-draft-only"; identityVerified: false };
export type QuestionLedger = { runs: QuestionRun[]; reviews: QuestionReview[] };
export function readQuestionLedger(): QuestionLedger {
  if (typeof window === "undefined") return { runs: [], reviews: [] };
  const value = JSON.parse(window.localStorage.getItem(QUESTION_STORAGE_KEY) ?? '{"runs":[],"reviews":[]}');
  if (!value || !Array.isArray(value.runs) || !Array.isArray(value.reviews) ||
    value.runs.some((r: QuestionRun) => r?.schemaVersion !== QUESTION_SCHEMA_VERSION || !r.runId || !Array.isArray(r.events)) ||
    value.reviews.some((r: QuestionReview) => !r?.id || !r.runId || !["accepted", "rejected"].includes(r.status))) throw new Error("研究问题记录损坏，已停止写入以保留历史。");
  return value;
}
export async function validateQuestionRun(run: QuestionRun) {
  if (run?.schemaVersion !== QUESTION_SCHEMA_VERSION || !run.runId || !run.requestId || !Array.isArray(run.events) || !run.events.length || !["CONTRACT_DRAFTED", "MATERIALS_REQUIRED", "OUT_OF_SCOPE", "BLOCKED", "ANSWER_READY", "PARTIAL"].includes(run.status)) throw new Error("研究运行记录无效。");
  for (let i = 0; i < run.events.length; i++) {
    const e = run.events[i];
    if (e.sequence !== i + 1 || await sha256Text(canonicalJson(e.details)) !== e.detailsSha256) throw new Error("运行日志校验失败。");
  }
  if (!["plan", "execute"].includes(run.phase) || !Array.isArray(run.calls) || run.calls.length > 1) throw new Error("研究调用记录无效。");
  for (const call of run.calls) {
    const family = run.phase === "plan" ? "question-contract." : "question-explanation.";
    if (typeof call.promptVersion !== "string" || !call.promptVersion.startsWith(family) ||
      call.promptSha256 !== await sha256Text(questionPromptInstructions(call.promptVersion)) ||
      call.phase !== (run.phase === "plan" ? "plan" : "explain")) throw new Error("问题指令版本或摘要不一致。");
    const requested = run.events.filter(e => e.event === "model_requested");
    const returned = run.events.filter(e => e.event === "model_returned");
    if (requested.length !== 1 || returned.length !== 1 ||
      canonicalJson(returned[0].details) !== canonicalJson({ ...call, rawOutput: undefined })) throw new Error("模型调用与日志不一致。");
    const details = requested[0].details as Record<string, unknown>;
    if (details.promptVersion !== call.promptVersion || details.requestSha256 !== call.requestSha256 ||
      canonicalJson(details.requestLimits) !== canonicalJson(call.requestLimits)) throw new Error("模型请求与日志不一致。");
  }
  if (run.phase === "plan" && run.contract) {
    const call = run.calls[0];
    if (!call?.rawOutput || call.failureCode) throw new Error("规划原文缺失。");
    const plan = validateQuestionPlan(parseMemoJson(call.rawOutput), call.promptVersion);
    if (canonicalJson(makeResearchContract(run.queryRaw, plan, run.requestId, run.createdAt)) !== canonicalJson(run.contract) || run.status !== run.contract.status)
      throw new Error("规划合同与原文不一致。");
  }
  if (run.phase === "execute") {
    const originals = run.events.filter(e => e.event === "plan_record");
    const confirmations = run.events.filter(e => e.event === "contract_confirmed");
    if (originals.length !== 1 || confirmations.length !== 1) throw new Error("规划绑定记录缺失。");
    const original = originals[0].details as QuestionRun;
    await validateQuestionRun(original);
    const confirmed = confirmations[0].details as Record<string, unknown>;
    if (original.phase !== "plan" || original.status !== "CONTRACT_DRAFTED" || original.requestId !== run.requestId || original.queryRaw !== run.queryRaw ||
      canonicalJson(original.contract) !== canonicalJson(run.contract) || confirmed.planRunId !== original.runId ||
      confirmed.planSha256 !== await sha256Text(canonicalJson(original)) || canonicalJson(confirmed.contract) !== canonicalJson(run.contract)) throw new Error("规划与执行绑定不一致。");
  }
  if (run.answer) {
    if (!run.contract || !["ANSWER_READY", "PARTIAL"].includes(run.status) || await sha256Text(canonicalJson(run.answer)) !== run.answerSha256) throw new Error("结果摘要不一致。");
    const resolved = await resolveQuestionEvidence(run.contract, run.answer.evidence.snapshot);
    if (resolved.status !== "READY" || canonicalJson(resolved.evidence) !== canonicalJson(run.answer.evidence)) throw new Error("结果证据与冻结计算不一致。");
    const call = run.calls[0];
    if (!call?.rawOutput || call.failureCode) throw new Error("解释原文缺失。");
    // Historical versions keep their own original validation, without changing their reviews.
    const explanation = validateQuestionExplanation(parseMemoJson(call.rawOutput), resolved.evidence.context, call.promptVersion);
    if (canonicalJson(explanation) !== canonicalJson(run.answer.explanation) ||
      run.status !== (explanation.sufficiency === "partial" ? "PARTIAL" : "ANSWER_READY") ||
      run.answer.answerStatus !== (explanation.sufficiency === "partial" ? "PARTIAL" : "PASS")) throw new Error("解释与原始输出或状态不一致。");
    if (run.answer.formalRecommendation !== null || run.answer.verification.professional !== "pending" || run.answer.verification.evidence !== "PASS") throw new Error("专业边界被修改。");
  } else if (["ANSWER_READY", "PARTIAL"].includes(run.status)) throw new Error("有效结果缺失。");
}
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  requireResearchBrowserCapabilities();
  return navigator.locks.request(QUESTION_STORAGE_KEY, fn);
}
export async function appendQuestionRun(run: QuestionRun) {
  requireResearchBrowserCapabilities();
  await validateQuestionRun(run);
  return locked(async () => {
    const ledger = readQuestionLedger();
    const existing = ledger.runs.find(r => r.runId === run.runId);
    if (existing) { if (canonicalJson(existing) === canonicalJson(run)) return; throw new Error("该运行记录已经保存且内容不同，禁止覆盖。"); }
    window.localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify({ ...ledger, runs: [...ledger.runs, run] }));
  });
}
export async function appendQuestionReview(runId: string, status: QuestionReview["status"], reviewer: string, note: string) {
  requireResearchBrowserCapabilities();
  if (!["accepted", "rejected"].includes(status) || !reviewer.trim() || reviewer.length > 100 || note.length > 1000) throw new Error("请填写有效审核人和意见。");
  return locked(async () => {
    const ledger = readQuestionLedger();
    const run = ledger.runs.find(r => r.runId === runId);
    if (!run?.answer || !run.answerSha256) throw new Error("只能审核已生成的草稿。");
    await validateQuestionRun(run);
    const versions = readStoredVersions("research");
    const current = versions.find(v => v.versionId === readActiveVersionId(versions, "research"));
    if (!current || await sha256Text(canonicalJson(current)) !== run.answer.evidence.context.snapshotSha256) throw new Error("当前研究版本已变化；历史答案仅供查看，请重新运行后审核。");
    const review: QuestionReview = { id: crypto.randomUUID(), runId, answerSha256: run.answerSha256,
      snapshotSha256: run.answer.evidence.context.snapshotSha256, status, reviewer: reviewer.trim(), note: note.trim(),
      reviewedAt: new Date().toISOString(), scope: "question-draft-only", identityVerified: false };
    window.localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify({ ...ledger, reviews: [...ledger.reviews, review] }));
    return review;
  });
}
