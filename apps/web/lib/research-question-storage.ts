import { canonicalJson, sha256Text } from "./research-memo.ts";
import { readActiveVersionId, readStoredVersions } from "./research-versions.ts";
import { QUESTION_SCHEMA_VERSION, resolveQuestionEvidence, validateQuestionExplanation, type QuestionRun } from "./research-question.ts";

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
  if (run.answer) {
    if (!run.contract || !["ANSWER_READY", "PARTIAL"].includes(run.status) || await sha256Text(canonicalJson(run.answer)) !== run.answerSha256) throw new Error("结果摘要不一致。");
    const resolved = await resolveQuestionEvidence(run.contract, run.answer.evidence.snapshot);
    if (resolved.status !== "READY" || canonicalJson(resolved.evidence) !== canonicalJson(run.answer.evidence)) throw new Error("结果证据与冻结计算不一致。");
    validateQuestionExplanation(run.answer.explanation, resolved.evidence.context);
    if (run.answer.formalRecommendation !== null || run.answer.verification.professional !== "pending") throw new Error("专业边界被修改。");
  } else if (["ANSWER_READY", "PARTIAL"].includes(run.status)) throw new Error("有效结果缺失。");
}
async function locked<T>(fn: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error("当前浏览器不支持可靠追加保存，请使用 HTTPS 或 localhost 下的现代浏览器。");
  return navigator.locks.request(QUESTION_STORAGE_KEY, fn);
}
export async function appendQuestionRun(run: QuestionRun) {
  await validateQuestionRun(run);
  return locked(async () => {
    const ledger = readQuestionLedger();
    if (ledger.runs.some(r => r.runId === run.runId)) throw new Error("该运行记录已经保存。");
    window.localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify({ ...ledger, runs: [...ledger.runs, run] }));
  });
}
export async function appendQuestionReview(runId: string, status: QuestionReview["status"], reviewer: string, note: string) {
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
