"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildMemoContext, memoMarkdown, type MemoContext, type MemoPoint, type MemoReview, type MemoRun } from "@/lib/research-memo";
import { appendMemoReview, appendMemoRun, MEMO_UPDATED_EVENT, readMemoLedger } from "@/lib/research-memo-storage";
import type { ResearchVersion, WorkspaceScope } from "@/lib/research-versions";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Point({ item, runId }: { item: MemoPoint; runId: string }) {
  return <p className="leading-7 text-slate-200">{item.text} <span className="text-xs">{item.citations.map((id) => <a key={id} href={`#memo-${runId}-${id}`} className="ml-2 text-cyan-200 underline underline-offset-4">[{id}]</a>)}</span></p>;
}

export function MemoPanel({ version, workspace }: { version: ResearchVersion; workspace: WorkspaceScope }) {
  const [context, setContext] = useState<MemoContext | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<MemoRun[]>([]);
  const [reviews, setReviews] = useState<MemoReview[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    let boundContext: MemoContext | null = null;
    const sync = () => {
      if (cancelled || !boundContext) return;
      try {
        const ledger = readMemoLedger(workspace);
        setRuns(ledger.runs.filter((run) => run.context.snapshotSha256 === boundContext!.snapshotSha256));
        setReviews(ledger.reviews);
      } catch (error) { setNotice(error instanceof Error ? error.message : "备忘录历史读取失败。"); }
    };
    buildMemoContext(version).then((value) => { if (!cancelled) { boundContext = value; setContext(value); sync(); } }).catch((error) => { if (!cancelled) setNotice(error instanceof Error ? error.message : "此版本尚不能生成备忘录。"); });
    fetch("/api/research-memo", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (!cancelled) setConfigured(data.configured === true); }).catch(() => { if (!cancelled) setConfigured(false); });
    window.addEventListener(MEMO_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { cancelled = true; controller.current?.abort(); window.removeEventListener(MEMO_UPDATED_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [version, workspace]);

  const run = runs.find((item) => item.runId === selectedId) ?? runs.at(-1);
  const review = run ? reviews.filter((item) => item.runId === run.runId).at(-1) : undefined;
  const statusLabel = run?.status === "completed" ? review?.status === "accepted" ? "人工已接受（备忘录内容）" : review?.status === "rejected" ? "已退回" : "待人工复核草稿" : run?.status === "blocked" ? "输出已阻断" : "调用未完成";

  async function generate() {
    if (!context || busy) return;
    setBusy(true); setNotice(null);
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch("/api/research-memo", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessCode}` }, body: JSON.stringify(version), signal: request.signal });
      const data = await response.json();
      if (data.run) { await appendMemoRun(data.run, version, workspace); setSelectedId(data.run.runId); setReviewer(""); setNote(""); }
      if (!response.ok) setNotice(typeof data.error === "string" ? data.error : "此次模型调用未完成。");
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "模型请求或保存失败，请检查网络和本机存储。");
    } finally { if (!request.signal.aborted) setBusy(false); }
  }
  async function reviewMemo(status: MemoReview["status"]) {
    if (!run) return;
    try { await appendMemoReview(run.runId, status, reviewer, note, workspace); setNotice("已追加备忘录审核记录。专业关卡仍待复核。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "审核记录保存失败。"); }
  }

  return <section className="research-panel space-y-5" aria-label="AI 研究备忘录" data-testid="memo-panel">
    <div>
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><Sparkles className="size-5 text-cyan-300" /> AI 研究备忘录</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">从当前已保存版本生成支持与反证分析、待验证解释和下一步问题。生成内容先作为草稿，审核记录仅适用于备忘录。</p>
    </div>
    {configured === false && <p className="text-sm text-amber-200" data-testid="memo-unconfigured">模型服务尚未配置，当前无法生成 AI 备忘录。</p>}
    {configured && context && <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <p className="text-sm leading-6 text-slate-300">点击后，将该版本的结构化证据和冻结计算发送至 OpenAI。PDF 文件和审核人姓名不进入模型请求。</p>
      <label className="block max-w-md space-y-2 text-sm text-slate-300"><span>演示访问码</span><Input type="password" autoComplete="off" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} className="border-white/10 bg-slate-950/50" /></label>
    </div>}
    <Button onClick={generate} disabled={!configured || !context || busy || accessCode.length < 16} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "正在生成备忘录" : "生成 AI 备忘录"}</Button>
    {notice && <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm leading-6 text-amber-100">{notice}</p>}
    {runs.length > 1 && <label className="block space-y-2 text-sm text-slate-300"><span>本版本的模型调用</span><select aria-label="选择模型调用" value={run?.runId ?? ""} onChange={(event) => { setSelectedId(event.target.value); setReviewer(""); setNote(""); setNotice(null); }} className="block w-full rounded-lg border border-slate-700 bg-slate-950 p-2">{runs.map((item, index) => <option key={item.runId} value={item.runId}>第 {index + 1} 次 · {item.audit.finishedAt} · {item.status === "completed" ? "已生成" : "未生成有效备忘录"}</option>)}</select></label>}
    {run && <div className="space-y-5" data-testid="memo-run">
      <p className="text-sm text-cyan-200" data-testid="memo-status">{statusLabel} · {run.audit.returnedModel ?? run.audit.requestedModel}</p>
      {run.memo && <>
        <Point item={run.memo.summary} runId={run.runId} />
        {([["supporting", "支持依据"], ["counter", "反证与限制"], ["alternatives", "待验证的替代解释"], ["questions", "下一步研究问题"]] as const).map(([section, label]) => <div key={section} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"><h4 className="font-medium text-white">{label}</h4>{run.memo![section].map((item, index) => <Point key={index} item={item} runId={run.runId} />)}</div>)}
        <details className="rounded-xl border border-white/10 p-4" open><summary className="cursor-pointer text-sm font-medium text-white">引用与固定事实</summary><ul className="mt-3 space-y-3 text-sm leading-6 text-slate-300">{run.context.references.map((ref) => <li key={ref.id} id={`memo-${run.runId}-${ref.id}`}><span className="text-cyan-200">[{ref.id}] {ref.label}</span><p>{ref.excerpt}</p>{ref.url && <a href={ref.url} target="_blank" rel="noreferrer" className="text-cyan-200 underline">查看原文第 {ref.page} 页</a>}</li>)}</ul></details>
        <div className="space-y-3 rounded-xl border border-amber-300/20 p-4">
          <p className="text-sm leading-6 text-amber-100">引用编号已校验；是否足以支持模型解释仍需逐条核对。接受备忘录不会关闭会计或估值复核关卡。</p>
          <label className="block space-y-2 text-sm text-slate-300"><span>备忘录审核人（自行填写）</span><Input maxLength={100} value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="border-white/10 bg-slate-950/50" /></label>
          <label className="block space-y-2 text-sm text-slate-300"><span>复核意见</span><textarea maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950/50 p-3" /></label>
          <div className="flex flex-wrap gap-3"><Button onClick={() => reviewMemo("accepted")} disabled={!reviewer.trim()} className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200">接受备忘录</Button><Button onClick={() => reviewMemo("rejected")} disabled={!reviewer.trim()} variant="outline" className="border-rose-300/30 bg-transparent text-rose-200">退回备忘录</Button></div>
          {review && <p className="text-sm text-slate-400">最近记录：{review.reviewer} · {review.reviewedAt} · {review.note || "未填写意见"}。身份未核验。</p>}
        </div>
      </>}
      <div className="flex flex-wrap gap-3">
        {run.memo && <Button variant="outline" className="border-white/15 bg-transparent text-slate-200" onClick={() => download(`research-memo-${version.versionId}-${run.runId}.md`, memoMarkdown(run, review), "text/markdown;charset=utf-8")}><Download />导出备忘录</Button>}
        <Button variant="outline" className="border-white/15 bg-transparent text-slate-200" onClick={() => download(`research-audit-${version.versionId}-${run.runId}.json`, JSON.stringify({ run, reviews: reviews.filter((item) => item.runId === run.runId) }, null, 2), "application/json")}><Download />导出调用与审核记录</Button>
      </div>
      <details className="rounded-xl border border-white/10 p-4"><summary className="cursor-pointer text-sm text-slate-300">调用与引用校验详情</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-slate-400">{JSON.stringify(run.audit, null, 2)}</pre></details>
    </div>}
  </section>;
}
