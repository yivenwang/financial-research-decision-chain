"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canonicalJson, MEMO_OUTPUT_CONTRACT, MEMO_PROMPT_VERSION, MEMO_SECTIONS, memoSectionLabel, validateMemo, type MemoPoint, type MemoRun, type ResearchMemo } from "@/lib/research-memo";
import { MEMO_UPDATED_EVENT } from "@/lib/research-memo-storage";
import { appendMemoRevision, appendMemoRevisionReview, exportMemoRevision, MEMO_REVISIONS_UPDATED_EVENT, memoRevisionChanges, readBoundMemoRevisions, type MemoRevision, type MemoRevisionReview } from "@/lib/research-memo-revisions";
import { VERSION_UPDATED_EVENT, type WorkspaceScope } from "@/lib/research-versions";

const errors: Record<string, string> = {
  MEMO_POINT_SCHEMA: "每段填写正文，最多一百六十字符，并选择一至八个引用。",
  MEMO_SECTION_SCHEMA: "请保留完整的六段内容。",
  UNKNOWN_CITATION: "只能选择当前研究版本提供的引用。",
  SOURCE_EVIDENCE_OMITTED: "整份修订稿须覆盖全部原始财务证据。",
  COUNTER_REFERENCE_MISSING: "反证段须引用并讨论反证方向的事实。",
  SUPPORT_REFERENCE_MISSING: "支持段须引用并讨论支持方向的事实。",
  HYPOTHESIS_NOT_MARKED: "替代解释须保留“可能”“假设”或“待验证”的限定。",
  UNSUPPORTED_TEXT_LITERAL: "正文保留定性分析；数字和网址请通过下方事实引用呈现。",
  REVIEW_GATE_CHANGED: "会计和估值专业关卡须保持待复核。",
};
function saveFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Point({ point, runId }: { point: MemoPoint; runId: string }) {
  return <p className="text-sm leading-7 text-slate-200">{point.text} <span className="text-xs">{point.citations.map((id) => <a key={id} href={`#memo-${runId}-${id}`} className="ml-2 break-all text-cyan-200 underline underline-offset-4">[{id}]</a>)}</span></p>;
}

export function MemoRevisionPanel({ run, workspace }: { run: MemoRun; workspace: WorkspaceScope }) {
  const [records, setRecords] = useState<{ revisions: MemoRevision[]; reviews: MemoRevisionReview[] } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<{ memo: ResearchMemo; parentRevisionId: string | null } | null>(null);
  const [author, setAuthor] = useState("");
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const pending = useRef(false);
  const binding = { runId: run.runId, versionId: run.context.versionId, snapshotSha256: run.context.snapshotSha256 };

  useEffect(() => {
    let active = true, sequence = 0;
    const sync = async () => {
      const current = ++sequence;
      try {
        const value = await readBoundMemoRevisions({ runId: run.runId, versionId: run.context.versionId, snapshotSha256: run.context.snapshotSha256 }, workspace);
        if (active && current === sequence) { setRecords(value); setStorageError(null); }
      } catch (error) {
        if (active && current === sequence) { setRecords(null); setStorageError(error instanceof Error ? error.message : "修订记录读取失败。"); }
      }
    };
    void sync();
    const events = [MEMO_REVISIONS_UPDATED_EVENT, MEMO_UPDATED_EVENT, VERSION_UPDATED_EVENT, "storage"];
    for (const name of events) window.addEventListener(name, sync);
    return () => { active = false; for (const name of events) window.removeEventListener(name, sync); };
  }, [run, workspace]);

  const revisions = records?.revisions ?? [];
  const latest = revisions.at(-1);
  const selected = revisions.find((item) => item.id === selectedId) ?? latest;
  const selectedReviews = (records?.reviews ?? []).filter((item) => item.revisionId === selected?.id && item.contentSha256 === selected?.contentSha256);
  const review = selectedReviews.at(-1);
  const parent = revisions.find((item) => item.id === selected?.parentRevisionId);
  const changes = selected ? memoRevisionChanges(parent?.memo ?? run.memo!, selected.memo) : [];
  const draftErrors = draft ? validateMemo(draft.memo, run.context, run.audit.promptVersion).errors : [];
  const staleDraft = !!draft && draft.parentRevisionId !== (latest?.id ?? null);
  const draftChanged = !!draft && canonicalJson(draft.memo) !== canonicalJson(latest?.memo ?? run.memo);
  const canWrite = !!records && !storageError && !busy;

  async function act(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setNotice(null);
    try { await operation(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败，请保留正在编辑的内容并检查本机存储。"); }
    finally { pending.current = false; setBusy(false); }
  }
  function begin() {
    if (!canWrite || (selected && selected.id !== latest?.id)) return;
    setDraft({ memo: structuredClone(latest?.memo ?? run.memo!), parentRevisionId: latest?.id ?? null });
    setAuthor(""); setReason(""); setReviewer(""); setNote(""); setNotice(null);
  }
  function updatePoint(key: (typeof MEMO_SECTIONS)[number]["key"], index: number, change: (point: MemoPoint) => void) {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(key === "summary" ? next.memo.summary : next.memo[key][index]);
      return next;
    });
  }
  const save = () => act(async () => {
    if (!draft) return;
    const revision = await appendMemoRevision({ ...binding, ...draft, author, reason }, workspace);
    setSelectedId(revision.id); setDraft(null); setAuthor(""); setReason(""); setReviewer(""); setNote("");
    setNotice("人工修订稿已另存为新版本，当前待复核。AI 原文及原审核记录已保留。");
  });
  const reviewDraft = (status: MemoRevisionReview["status"]) => act(async () => {
    if (!selected) return;
    await appendMemoRevisionReview({ ...binding, revisionId: selected.id, contentSha256: selected.contentSha256, status, reviewer, note }, workspace);
    setNotice(status === "accepted" ? "已接受当前修订稿；专业关卡仍待复核。" : "已追加退回意见；可从这份稿件继续修订。");
  });
  const exportDraft = (format: "markdown" | "audit") => act(async () => {
    if (!selected) return;
    const result = await exportMemoRevision({ ...binding, revisionId: selected.id }, workspace);
    const filename = `human-memo-${run.context.versionId}-${selected.id}`;
    if (format === "markdown") saveFile(`${filename}.md`, result.markdown, "text/markdown;charset=utf-8");
    else saveFile(`${filename}-audit.json`, JSON.stringify(result.audit, null, 2), "application/json");
  });

  return <section className="space-y-4 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.025] p-4 sm:p-5" aria-label="人工修订与审核" data-testid="memo-revisions">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-semibold text-white">人工修订与版本记录</h4><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">核对证据后修改正文与引用，填写理由并保存。每份修订独立审核，AI 原稿始终保留。</p></div>
      {!draft && <Button onClick={begin} disabled={!canWrite || (!!selected && selected.id !== latest?.id)} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Pencil />{latest ? "继续修订" : "创建人工修订稿"}</Button>}
    </div>
    {storageError && <p role="alert" className="text-sm leading-6 text-rose-200">{storageError}</p>}
    {notice && <p role="status" className="text-sm leading-6 text-cyan-100">{notice}</p>}
    {draft ? <div className="space-y-5" data-testid="memo-revision-editor">
      <p className="text-sm leading-6 text-amber-100">正在编辑未保存稿。引用须支撑本段事实与比较两侧，假设仍须保留待验证或待专业复核条件。</p>
      {MEMO_SECTIONS.flatMap(({ key }) => {
        const points = key === "summary" ? [draft.memo.summary] : draft.memo[key];
        return points.map((point, index) => {
          const label = `${memoSectionLabel(key, MEMO_PROMPT_VERSION)}${points.length > 1 ? ` · 第 ${index + 1} 段` : ""}`;
          const length = Array.from(point.text).length;
          return <fieldset key={`${key}-${index}`} className="min-w-0 space-y-2 rounded-lg border border-white/10 p-3" data-testid={`revision-field-${key}-${index}`} disabled={busy}>
            <legend className="px-1 text-sm font-medium text-white">{label}</legend>
            <textarea aria-label={`${label}正文`} rows={3} value={point.text} onChange={(event) => updatePoint(key, index, (item) => { item.text = event.target.value; })} className="w-full rounded-lg border border-white/15 bg-slate-950/60 p-3 text-sm leading-7 text-slate-100 focus:border-cyan-300 focus:outline-none" />
            <p className={`text-right text-xs ${length > MEMO_OUTPUT_CONTRACT.maxPointCharacters ? "text-rose-200" : "text-slate-400"}`}>{length} / {MEMO_OUTPUT_CONTRACT.maxPointCharacters} 字符 · 已选 {point.citations.length} 项引用</p>
            <details><summary className="cursor-pointer text-sm text-cyan-200">选择本段引用并核对摘录</summary><div className="mt-3 space-y-2">{run.context.references.map((ref) => <label key={ref.id} className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-950/40 p-3 text-sm leading-6 text-slate-300">
              <input type="checkbox" className="mt-1.5 size-4 shrink-0 accent-cyan-300" aria-label={`${label}引用 ${ref.id}`} checked={point.citations.includes(ref.id)} onChange={(event) => updatePoint(key, index, (item) => { item.citations = event.target.checked ? [...item.citations, ref.id] : item.citations.filter((id) => id !== ref.id); })} />
              <span className="min-w-0"><span className="block break-all text-cyan-200">[{ref.id}] {ref.label}{ref.direction ? ` · ${ref.direction}` : ""}</span><span className="block">{ref.excerpt}</span></span>
            </label>)}</div></details>
          </fieldset>;
        });
      })}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-300"><span>修订者（自行填写）</span><Input maxLength={100} value={author} disabled={busy} onChange={(event) => setAuthor(event.target.value)} className="border-white/15 bg-slate-950/50" /></label>
        <label className="space-y-2 text-sm text-slate-300"><span>修改理由</span><textarea rows={2} maxLength={1000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950/50 p-3" /></label>
      </div>
      {draftErrors.length > 0 && <ul className="space-y-1 text-sm text-amber-100" aria-label="修订校验问题">{draftErrors.map((code) => <li key={code}>{errors[code] ?? "请检查正文格式与引用。"}</li>)}</ul>}
      {staleDraft && <p role="alert" className="text-sm text-amber-100">已出现更新的修订稿。请先保留正在编辑的内容，核对最新稿后继续。</p>}
      <div className="flex flex-wrap gap-3"><Button onClick={save} disabled={!canWrite || !author.trim() || !reason.trim() || draftErrors.length > 0 || staleDraft || !draftChanged} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Save />保存人工修订</Button><Button variant="outline" disabled={busy} onClick={() => { setDraft(null); setNotice(null); }} className="border-white/15 bg-transparent text-slate-200">放弃未保存修改</Button></div>
    </div> : selected && <div className="space-y-4" data-testid="memo-revision-reader">
      <label className="block space-y-2 text-sm text-slate-300"><span>查看修订历史</span><select aria-label="选择人工修订版本" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setReviewer(""); setNote(""); setNotice(null); }} className="block w-full rounded-lg border border-white/15 bg-slate-950 p-2">{revisions.map((item, index) => <option key={item.id} value={item.id}>修订 {index + 1} · {item.author} · {item.createdAt}</option>)}</select></label>
      <p className="text-sm font-medium text-cyan-100" data-testid="memo-revision-status">{review?.status === "accepted" ? "人工已接受修订稿" : review?.status === "rejected" ? "修订稿已退回" : "修订稿待复核"}{selected.id !== latest?.id ? " · 历史版本，仅供查看" : ""}</p>
      <p className="text-sm leading-6 text-slate-300">修订者：{selected.author}（自行填写、身份未核验）。修改理由：{selected.reason}</p>
      <div className="space-y-4">{MEMO_SECTIONS.map(({ key }) => <div key={key} className="space-y-2"><h5 className="text-sm font-medium text-white">{memoSectionLabel(key, run.audit.promptVersion)}</h5>{(key === "summary" ? [selected.memo.summary] : selected.memo[key]).map((point, index) => <Point key={index} point={point} runId={run.runId} />)}</div>)}</div>
      <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-sm text-cyan-200">本次改动 · {changes.length} 段</summary><div className="mt-3 space-y-4">{changes.map((change) => <div key={`${change.key}-${change.index}`} className="space-y-2"><h5 className="text-sm text-white">{change.label}</h5><p className="text-xs text-slate-400">修改前</p><Point point={change.before} runId={run.runId} /><p className="text-xs text-cyan-200">修改后</p><Point point={change.after} runId={run.runId} /></div>)}</div></details>
      {selected.id === latest?.id && <div className="space-y-3 rounded-lg border border-amber-300/20 p-3">
        <p className="text-sm leading-6 text-amber-100">请核对当前修订稿的正文与引用。接受仅适用于这份内容，不批准会计、估值关卡或投资动作。</p>
        <label className="block space-y-2 text-sm text-slate-300"><span>修订稿审核人（自行填写）</span><Input maxLength={100} value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="border-white/15 bg-slate-950/50" /></label>
        <label className="block space-y-2 text-sm text-slate-300"><span>修订稿复核意见</span><textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-white/15 bg-slate-950/50 p-3" /></label>
        <div className="flex flex-wrap gap-3"><Button onClick={() => reviewDraft("accepted")} disabled={!canWrite || !reviewer.trim() || !note.trim()} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200">接受此修订稿</Button><Button onClick={() => reviewDraft("rejected")} disabled={!canWrite || !reviewer.trim() || !note.trim()} variant="outline" className="border-rose-300/30 bg-transparent text-rose-200">退回此修订稿</Button></div>
      </div>}
      {selectedReviews.length > 0 && <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-sm text-slate-300">本稿审核历史 · {selectedReviews.length} 条</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">{selectedReviews.map((item) => <li key={item.id}>{item.status === "accepted" ? "接受" : "退回"} · {item.reviewer}（身份未核验）· {item.reviewedAt}：{item.note}</li>)}</ul></details>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!canWrite} onClick={() => exportDraft("markdown")} className="border-white/15 bg-transparent text-slate-200"><Download />导出人工修订稿</Button><Button variant="outline" disabled={!canWrite} onClick={() => exportDraft("audit")} className="border-white/15 bg-transparent text-slate-200"><Download />导出修订与原始记录</Button></div>
    </div>}
  </section>;
}
