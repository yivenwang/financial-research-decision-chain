import { buildMemoContext, canonicalJson, memoMarkdown, MEMO_PROMPT_VERSION, MEMO_SECTIONS, memoSectionLabel, sha256Text, validateMemo, validateMemoOutput, type MemoPoint, type MemoRun, type ResearchMemo } from "./research-memo.ts";
import { readMemoLedger, memoStorageKey } from "./research-memo-storage.ts";
import { readStoredVersions, storageKeys, type WorkspaceScope } from "./research-versions.ts";

export const MEMO_REVISIONS_UPDATED_EVENT = "research-memo-revisions-updated";
export const memoRevisionStorageKey = (scope: WorkspaceScope) => `financial-research-memo-revisions-v1-${scope}`;
type Binding = { runId: string; versionId: string; snapshotSha256: string };
export type MemoRevision = Binding & {
  schemaVersion: "research-memo-revision.v1";
  id: string;
  workspace: WorkspaceScope;
  sourceRunSha256: string;
  parentRevisionId: string | null;
  contentSha256: string;
  author: string;
  reason: string;
  createdAt: string;
  origin: "human";
  scope: "memo-only";
  identityVerified: false;
  memo: ResearchMemo;
};
export type MemoRevisionReview = {
  schemaVersion: "research-memo-revision-review.v1";
  id: string;
  revisionId: string;
  runId: string;
  snapshotSha256: string;
  contentSha256: string;
  status: "accepted" | "rejected";
  reviewer: string;
  note: string;
  reviewedAt: string;
  scope: "memo-only";
  identityVerified: false;
};
export type MemoRevisionLedger = {
  schemaVersion: "research-memo-revision-ledger.v1";
  revisions: MemoRevision[];
  reviews: MemoRevisionReview[];
};
type RevisionInput = Binding & { parentRevisionId: string | null; memo: ResearchMemo; author: string; reason: string };
type ReviewInput = Binding & { revisionId: string; contentSha256: string; status: MemoRevisionReview["status"]; reviewer: string; note: string };

function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const digest = (value: unknown) => sha256Text(canonicalJson(value));
const hashValue = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(value);
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const textValue = (value: unknown, max: number) => typeof value === "string" && !!value.trim() && value.length <= max;
function exactKeys(value: unknown, keys: string[]): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys.sort().join(",");
}
const revisionKeys = ["schemaVersion", "id", "runId", "versionId", "snapshotSha256", "workspace", "sourceRunSha256", "parentRevisionId", "contentSha256", "author", "reason", "createdAt", "origin", "scope", "identityVerified", "memo"];
const reviewKeys = ["schemaVersion", "id", "revisionId", "runId", "snapshotSha256", "contentSha256", "status", "reviewer", "note", "reviewedAt", "scope", "identityVerified"];
const damaged = "人工修订记录不完整或已改变，已停止写入；请保留现有记录并核对导出备份。";

// Separate append-only ledger: never rewrite the original model or research keys.
export async function readMemoRevisionLedger(scope: WorkspaceScope): Promise<MemoRevisionLedger> {
  const empty: MemoRevisionLedger = { schemaVersion: "research-memo-revision-ledger.v1", revisions: [], reviews: [] };
  if (typeof window === "undefined") return empty;
  const bytes = window.localStorage.getItem(memoRevisionStorageKey(scope));
  if (bytes === null) return empty;
  let value: MemoRevisionLedger;
  try { value = JSON.parse(bytes); } catch { throw new Error(damaged); }
  requireValue(exactKeys(value, ["schemaVersion", "revisions", "reviews"]) && value.schemaVersion === empty.schemaVersion && Array.isArray(value.revisions) && Array.isArray(value.reviews), damaged);
  const revisions = new Map<string, MemoRevision>();
  const latest = new Map<string, string>();
  for (const revision of value.revisions) {
    requireValue(exactKeys(revision, [...revisionKeys]) && revision.schemaVersion === "research-memo-revision.v1"
      && identifier(revision.id) && !revisions.has(revision.id) && identifier(revision.runId)
      && typeof revision.versionId === "string" && /^V-\d{2,8}$/.test(revision.versionId)
      && revision.workspace === scope && hashValue(revision.snapshotSha256) && hashValue(revision.sourceRunSha256)
      && hashValue(revision.contentSha256) && textValue(revision.author, 100) && textValue(revision.reason, 1000)
      && timestamp(revision.createdAt) && revision.origin === "human" && revision.scope === "memo-only" && revision.identityVerified === false, damaged);
    requireValue(revision.parentRevisionId === (latest.get(revision.runId) ?? null), damaged);
    if (revision.parentRevisionId !== null) {
      const parent = revisions.get(revision.parentRevisionId)!;
      requireValue(parent.snapshotSha256 === revision.snapshotSha256 && parent.versionId === revision.versionId && parent.sourceRunSha256 === revision.sourceRunSha256, damaged);
    }
    requireValue(await digest(revision.memo) === revision.contentSha256, damaged);
    revisions.set(revision.id, revision); latest.set(revision.runId, revision.id);
  }
  const reviewIds = new Set<string>();
  for (const review of value.reviews) {
    const revision = revisions.get(review?.revisionId);
    requireValue(exactKeys(review, [...reviewKeys]) && review.schemaVersion === "research-memo-revision-review.v1"
      && identifier(review.id) && !reviewIds.has(review.id) && revision && review.runId === revision.runId
      && review.snapshotSha256 === revision.snapshotSha256 && review.contentSha256 === revision.contentSha256
      && ["accepted", "rejected"].includes(review.status) && textValue(review.reviewer, 100) && textValue(review.note, 1000)
      && timestamp(review.reviewedAt) && review.scope === "memo-only" && review.identityVerified === false, damaged);
    reviewIds.add(review.id);
  }
  return value;
}

function requireCompactRun(run: MemoRun) {
  requireValue(run.status === "completed" && run.memo && run.audit.promptVersion === MEMO_PROMPT_VERSION
    && run.audit.responseId && run.audit.responseSha256 && validateMemo(run.memo, run.context, run.audit.promptVersion).memo,
  "只能为完整且通过校验的当前六段 AI 原稿建立人工修订。旧稿和失败记录继续保留。");
  let output;
  try { output = validateMemoOutput(JSON.parse(run.audit.rawOutput ?? ""), run.context).memo; } catch { throw new Error(damaged); }
  requireValue(output && canonicalJson(output) === canonicalJson(run.memo), "AI 原稿与保存的模型最终文本不一致，已停止修订。");
}
async function boundRun(binding: Binding, scope: WorkspaceScope) {
  const run = readMemoLedger(scope).runs.find((item) => item.runId === binding.runId);
  requireValue(run && run.context.workspace === scope && run.context.versionId === binding.versionId
    && run.context.snapshotSha256 === binding.snapshotSha256, "修订与当前研究版本不匹配。");
  requireCompactRun(run);
  const version = readStoredVersions(scope).find((item) => item.versionId === binding.versionId);
  requireValue(version && canonicalJson(await buildMemoContext(version)) === canonicalJson(run.context), "原研究快照已改变或不存在，已停止保存与审核。");
  return run;
}
async function validateBoundRevisions(ledger: MemoRevisionLedger, run: MemoRun) {
  const sourceHash = await digest(run);
  for (const revision of ledger.revisions.filter((item) => item.runId === run.runId)) {
    requireValue(revision.sourceRunSha256 === sourceHash && revision.versionId === run.context.versionId
      && revision.snapshotSha256 === run.context.snapshotSha256 && revision.workspace === run.context.workspace
      && validateMemo(revision.memo, run.context, run.audit.promptVersion).memo, damaged);
  }
}

function captureBytes(scope: WorkspaceScope) {
  return [memoRevisionStorageKey(scope), memoStorageKey(scope), storageKeys(scope).versions]
    .map((key) => [key, window.localStorage.getItem(key)] as const);
}
function unchanged(bytes: ReturnType<typeof captureBytes>) {
  requireValue(bytes.every(([key, value]) => window.localStorage.getItem(key) === value), "记录在操作期间已更新，请核对最新版本后再保存。");
}
async function withWriteLock<T>(scope: WorkspaceScope, operation: () => Promise<T>): Promise<T> {
  requireValue(typeof window !== "undefined" && window.navigator?.locks, "当前浏览器不支持安全保存修订，请使用支持此功能的新版浏览器。");
  // Serializes writers across tabs. There is no unsafe unlocked fallback.
  return window.navigator.locks.request(memoRevisionStorageKey(scope), operation);
}
function writeLedger(ledger: MemoRevisionLedger, scope: WorkspaceScope, bytes: ReturnType<typeof captureBytes>) {
  unchanged(bytes); // No await between the final stale-read check and the write.
  window.localStorage.setItem(memoRevisionStorageKey(scope), JSON.stringify(ledger));
  window.dispatchEvent(new Event(MEMO_REVISIONS_UPDATED_EVENT));
}

export async function readBoundMemoRevisions(binding: Binding, scope: WorkspaceScope) {
  const bytes = captureBytes(scope);
  const run = await boundRun(binding, scope);
  const ledger = await readMemoRevisionLedger(scope);
  await validateBoundRevisions(ledger, run);
  unchanged(bytes);
  return { run, revisions: ledger.revisions.filter((item) => item.runId === run.runId), reviews: ledger.reviews.filter((item) => item.runId === run.runId) };
}

export async function appendMemoRevision(value: RevisionInput, scope: WorkspaceScope): Promise<MemoRevision> {
  const input = structuredClone(value);
  requireValue(textValue(input.author, 100) && textValue(input.reason, 1000), "请填写修订者和具体修改理由。");
  return withWriteLock(scope, async () => {
    const bytes = captureBytes(scope);
    const run = await boundRun(input, scope);
    const ledger = await readMemoRevisionLedger(scope);
    await validateBoundRevisions(ledger, run);
    const previous = ledger.revisions.filter((item) => item.runId === run.runId).at(-1);
    requireValue(input.parentRevisionId === (previous?.id ?? null), "已有更新的修订稿，请先核对最新稿再继续修订。");
    const checked = validateMemo(input.memo, run.context, run.audit.promptVersion);
    requireValue(checked.memo, `修订内容未通过原有格式或引用校验：${checked.errors.join("、")}。`);
    requireValue(canonicalJson(checked.memo) !== canonicalJson(previous?.memo ?? run.memo), "正文和引用没有变化，无需新建修订版本。");
    const revision: MemoRevision = {
      schemaVersion: "research-memo-revision.v1", id: crypto.randomUUID(), runId: run.runId,
      versionId: run.context.versionId, snapshotSha256: run.context.snapshotSha256, workspace: scope,
      sourceRunSha256: await digest(run), parentRevisionId: previous?.id ?? null,
      contentSha256: await digest(checked.memo), author: input.author.trim(), reason: input.reason.trim(),
      createdAt: new Date().toISOString(), origin: "human", scope: "memo-only", identityVerified: false, memo: checked.memo,
    };
    writeLedger({ ...ledger, revisions: [...ledger.revisions, revision] }, scope, bytes);
    return structuredClone(revision);
  });
}

export async function appendMemoRevisionReview(value: ReviewInput, scope: WorkspaceScope): Promise<MemoRevisionReview> {
  const input = structuredClone(value);
  requireValue(["accepted", "rejected"].includes(input.status) && textValue(input.reviewer, 100) && textValue(input.note, 1000), "请填写修订稿审核人和具体意见。");
  return withWriteLock(scope, async () => {
    const bytes = captureBytes(scope);
    const run = await boundRun(input, scope);
    const ledger = await readMemoRevisionLedger(scope);
    await validateBoundRevisions(ledger, run);
    const revision = ledger.revisions.filter((item) => item.runId === run.runId).at(-1);
    requireValue(revision && revision.id === input.revisionId && revision.contentSha256 === input.contentSha256,
      "待审核内容已不是最新修订稿，请重新核对后确认。");
    const review: MemoRevisionReview = {
      schemaVersion: "research-memo-revision-review.v1", id: crypto.randomUUID(), revisionId: revision.id,
      runId: run.runId, snapshotSha256: revision.snapshotSha256, contentSha256: revision.contentSha256,
      status: input.status, reviewer: input.reviewer.trim(), note: input.note.trim(), reviewedAt: new Date().toISOString(),
      scope: "memo-only", identityVerified: false,
    };
    writeLedger({ ...ledger, reviews: [...ledger.reviews, review] }, scope, bytes);
    return structuredClone(review);
  });
}

export function memoRevisionChanges(before: ResearchMemo, after: ResearchMemo) {
  return MEMO_SECTIONS.flatMap(({ key }) => {
    const left = key === "summary" ? [before.summary] : before[key];
    const right = key === "summary" ? [after.summary] : after[key];
    return right.flatMap((point, index) => canonicalJson(point) === canonicalJson(left[index]) ? []
      : [{ key, index, label: `${memoSectionLabel(key, MEMO_PROMPT_VERSION)}${right.length > 1 ? ` · 第 ${index + 1} 段` : ""}`, before: left[index], after: point }]);
  });
}

const md = (text: string) => text.replace(/\\/g, "\\\\").replace(/([`*_{}\[\]()#+.!|<>])/g, "\\$1").replace(/[\r\n]+/g, " ");
export async function exportMemoRevision(binding: Binding & { revisionId: string }, scope: WorkspaceScope) {
  const bytes = captureBytes(scope);
  const { run, revisions, reviews } = await readBoundMemoRevisions(binding, scope);
  const revision = revisions.find((item) => item.id === binding.revisionId);
  requireValue(revision, "该修订稿不存在或属于其他调用。");
  const review = reviews.filter((item) => item.revisionId === revision.id && item.contentSha256 === revision.contentSha256).at(-1);
  const previous = revisions.find((item) => item.id === revision.parentRevisionId);
  const changes = memoRevisionChanges(previous?.memo ?? run.memo!, revision.memo);
  const originalReviews = readMemoLedger(scope).reviews.filter((item) => item.runId === run.runId);
  unchanged(bytes);
  const status = review?.status === "accepted" ? "人工已接受修订稿" : review?.status === "rejected" ? "修订稿已退回" : "修订稿待复核";
  const point = (item: MemoPoint) => `${md(item.text)} ${item.citations.map((id) => `[${id}]`).join(" ")}`;
  const lines = ["# 研究备忘录 · 人工修订稿", "", `状态：${status}。审核仅限本修订稿，专业关卡仍待复核。`, "",
    revision.id === revisions.at(-1)?.id ? "导出的是本次读取时的最新修订版。" : "这是历史修订版，当前已有更新的修订稿。",
    `修订编号：${revision.id}；研究版本：${revision.versionId}；原调用：${revision.runId}。`,
    `修订者（自行填写、身份未核验）：${md(revision.author)}；时间：${revision.createdAt}。`,
    `修改理由：${md(revision.reason)}`, `内容 SHA-256：${revision.contentSha256}`, `研究快照 SHA-256：${revision.snapshotSha256}`,
    "", "以下正文由人工修订；模型名称和用量只属于后附 AI 原稿。", "", point(revision.memo.summary)];
  for (const { key } of MEMO_SECTIONS) if (key !== "summary") lines.push("", `## ${memoSectionLabel(key, run.audit.promptVersion)}`, "", ...revision.memo[key].map((item) => `- ${point(item)}`));
  lines.push("", "## 本次修改", "", ...changes.flatMap((change) => [`### ${change.label}`, "", `修改前：${point(change.before)}`, "", `修改后：${point(change.after)}`, ""]));
  if (review) lines.push("", `审核人（自行填写、身份未核验）：${md(review.reviewer)}；时间：${review.reviewedAt}；意见：${md(review.note)}。`);
  lines.push("", "## AI 原稿与原稿审核记录", "", "下列原始记录独立保留；修订稿通过不代表 AI 原稿通过，原稿的接受也不传递给修订稿。", "", memoMarkdown(run, originalReviews.at(-1)));
  return {
    markdown: lines.join("\n") + "\n",
    audit: { schemaVersion: "research-memo-revision-export.v1", selectedRevisionId: revision.id, original: { run, reviews: originalReviews }, revisions, reviews },
  };
}
