import { buildMemoContext, canonicalJson, validateMemo, type MemoRun, type MemoReview } from "./research-memo.ts";
import { readStoredVersions, type ResearchVersion, type WorkspaceScope } from "./research-versions.ts";

export const MEMO_UPDATED_EVENT = "research-memo-updated";
export const memoStorageKey = (scope: WorkspaceScope) => `financial-research-memos-v1-${scope}`;
type MemoLedger = { runs: MemoRun[]; reviews: MemoReview[] };
function validProviderAudit(run: MemoRun) {
  return Boolean(run?.audit && ["deepseek", "openai"].includes(run.audit.provider) && run.audit.api === "responses");
}
export function readMemoLedger(scope: WorkspaceScope): MemoLedger {
  if (typeof window === "undefined") return { runs: [], reviews: [] };
  const raw = JSON.parse(window.localStorage.getItem(memoStorageKey(scope)) ?? '{"runs":[],"reviews":[]}');
  if (!raw || !Array.isArray(raw.runs) || !Array.isArray(raw.reviews) || raw.runs.some((run: MemoRun) => !run?.runId || !run?.context?.snapshotSha256 || !validProviderAudit(run) || !["completed", "blocked", "failed"].includes(run.status)) || raw.reviews.some((review: MemoReview) => !review?.id || !review?.runId || !["accepted", "rejected"].includes(review.status))) throw new Error("备忘录记录无法读取，已停止写入以保护历史。");
  return raw;
}
function writeLedger(ledger: MemoLedger, scope: WorkspaceScope) {
  window.localStorage.setItem(memoStorageKey(scope), JSON.stringify(ledger));
  window.dispatchEvent(new Event(MEMO_UPDATED_EVENT));
}
export async function appendMemoRun(run: MemoRun, version: ResearchVersion, scope: WorkspaceScope) {
  if (!validProviderAudit(run)) throw new Error("备忘录提供方记录无效，已停止写入。");
  const stored = readStoredVersions(scope).find((item) => item.versionId === version.versionId);
  if (!stored) throw new Error("研究版本已不存在，调用记录未写入其他版本。");
  const context = await buildMemoContext(stored);
  if (scope !== context.workspace || canonicalJson(run.context) !== canonicalJson(context) || run.schemaVersion !== "research-memo-run.v1") throw new Error("备忘录与研究版本不匹配。");
  if (run.status === "completed" && (!run.audit.responseId || !run.audit.responseSha256 || !validateMemo(run.memo, context).memo)) throw new Error("备忘录输出未通过本地校验。");
  const ledger = readMemoLedger(scope);
  if (ledger.runs.some((item) => item.runId === run.runId)) throw new Error("该调用记录已存在。");
  writeLedger({ ...ledger, runs: [...ledger.runs, structuredClone(run)] }, scope);
}
export async function appendMemoReview(runId: string, status: MemoReview["status"], reviewer: string, note: string, scope: WorkspaceScope) {
  if (!reviewer.trim() || reviewer.length > 100 || note.length > 1000) throw new Error("请填写有效的备忘录审核人和意见。");
  const ledger = readMemoLedger(scope);
  const run = ledger.runs.find((item) => item.runId === runId);
  if (!run || run.status !== "completed" || !run.memo) throw new Error("只能审核已经通过校验的备忘录。");
  const version = readStoredVersions(scope).find((item) => item.versionId === run.context.versionId);
  if (!version || canonicalJson(await buildMemoContext(version)) !== canonicalJson(run.context) || !validateMemo(run.memo, run.context).memo) throw new Error("版本或备忘录已发生变化，已停止审核写入。");
  const review: MemoReview = { id: crypto.randomUUID(), runId, snapshotSha256: run.context.snapshotSha256, status, reviewer: reviewer.trim(), note: note.trim(), reviewedAt: new Date().toISOString(), scope: "memo-only", identityVerified: false };
  const latest = readMemoLedger(scope);
  writeLedger({ ...latest, reviews: [...latest.reviews, review] }, scope);
  return review;
}
