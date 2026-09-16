"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INTENT_LABELS, QUESTION_CAPABILITY, questionSources, questionMarkdown, type QuestionRun, type SignedQuestionDraft } from "@/lib/research-question";
import { appendQuestionRun, appendQuestionReview, readQuestionLedger, type QuestionLedger } from "@/lib/research-question-storage";
import { readStoredVersions, readActiveVersionId, VERSION_UPDATED_EVENT, type ResearchVersion } from "@/lib/research-versions";

const examples = ["安克创新2026Q1归母净利润下降，但扣非归母净利润上升，这是否意味着核心经营恶化？", "归母净利润同比下降的来源在哪里？", "这次更新影响了哪些Claim和Assumption？"];
const statusLabel = { CONTRACT_DRAFTED: "待确认研究任务", MATERIALS_REQUIRED: "需要补充材料", OUT_OF_SCOPE: "超出当前范围", BLOCKED: "已阻断", ANSWER_READY: "研究草稿待审核", PARTIAL: "部分回答待审核" };
const panel = "rounded-xl border border-white/10 bg-slate-900/80 p-5 space-y-4";
const plainError = (e: unknown) => e instanceof Error ? e.message : "操作未完成。";
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QuestionWorkflow() {
  const [question, setQuestion] = useState(examples[0]);
  const [token, setToken] = useState("");
  const [config, setConfig] = useState<{ configured: boolean; provider: string; model: string } | null>(null);
  const [snapshot, setSnapshot] = useState<ResearchVersion | null>(null);
  const [ledger, setLedger] = useState<QuestionLedger>({ runs: [], reviews: [] });
  const [draft, setDraft] = useState<SignedQuestionDraft | null>(null);
  const [shown, setShown] = useState<QuestionRun | null>(null);
  const [busy, setBusy] = useState<"plan" | "execute" | "review" | null>(null);
  const [error, setError] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const reload = () => {
    const next = readQuestionLedger(); setLedger(next);
    const versions = readStoredVersions("research");
    setSnapshot(versions.find(v => v.versionId === readActiveVersionId(versions, "research")) ?? null);
    return next;
  };
  useEffect(() => {
    try { const next = reload(); setShown(next.runs.at(-1) ?? null); } catch (e) { setError(plainError(e)); }
    const refresh = () => { try { reload(); } catch (e) { setError(plainError(e)); } };
    window.addEventListener(VERSION_UPDATED_EVENT, refresh); window.addEventListener("storage", refresh);
    const abort = new AbortController();
    fetch("/api/research-question", { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("无法读取模型配置状态。"); setConfig(await r.json()); }).catch(e => { if (e.name !== "AbortError") setError(plainError(e)); });
    return () => { abort.abort(); window.removeEventListener(VERSION_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  async function request(phase: "plan" | "execute") {
    setBusy(phase); setError("");
    if (phase === "plan") setDraft(null);
    try {
      // Read the current snapshot at the confirmation action, not from a stale render.
      const versions = readStoredVersions("research");
      const current = versions.find(v => v.versionId === readActiveVersionId(versions, "research")) ?? null;
      const response = await fetch("/api/research-question", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(phase === "plan" ? { phase, question } : { phase, draft, confirmed: true, snapshot: current }), signal: AbortSignal.timeout(175000) });
      const data = await response.json();
      if (!response.ok || !data.run) throw new Error(data.error ?? "研究请求未完成。");
      setShown(data.run);
      // Keep result visible and downloadable even if local persistence fails.
      await appendQuestionRun(data.run); reload();
      if (phase === "plan" && data.ticket) setDraft({ run: data.run, ticket: data.ticket });
      if (phase === "execute" && data.run.status !== "MATERIALS_REQUIRED") setDraft(null);
    } catch (e) { setError(plainError(e)); }
    finally { setBusy(null); }
  }
  async function review(status: "accepted" | "rejected") {
    if (!shown) return;
    setBusy("review"); setError("");
    try { await appendQuestionReview(shown.runId, status, reviewer, note); reload(); }
    catch (e) { setError(plainError(e)); }
    finally { setBusy(null); }
  }
  const answer = shown?.answer;
  const lastReview = ledger.reviews.filter(r => r.runId === shown?.runId).at(-1);
  const contract = draft?.run.contract ?? shown?.contract;
  const selectQuestion = (value: string) => { setQuestion(value); setDraft(null); };
  return <div className="space-y-5" data-testid="question-workflow">
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">研究问题</h1><Link className="text-cyan-300 underline" href="/">补充材料 / 研究版本</Link></div>
      <p className="text-sm text-slate-300">{QUESTION_CAPABILITY.company} · {questionSources().map(s => s.period).join("、")} · 变化解释、证据核验、决策影响</p>
      <p className="text-sm text-slate-400">当前材料：{snapshot ? `${snapshot.source?.sourceId} · ${snapshot.versionId}${snapshot.source?.mode === "sample" ? " · 教学合成样例" : ""}` : "尚无已审核材料，执行时会提示补充"}。每个事实附来源，关键证据不足时停止生成。</p>
      <label className="block space-y-2"><span>你想研究什么？</span><Textarea aria-label="研究问题" value={question} maxLength={1000} disabled={!!busy} onChange={e => selectQuestion(e.target.value)} className="min-h-24" /></label>
      <div className="flex flex-wrap gap-2">{examples.map((q, i) => <Button key={q} variant="outline" disabled={!!busy} onClick={() => selectQuestion(q)}>示例 {i + 1}：{["核心盈利", "证据来源", "影响链"][i]}</Button>)}</div>
      <label className="block max-w-sm space-y-2"><span className="text-sm">演示访问码（仅本次页面使用）</span><Input aria-label="问题研究访问码" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
      <p className="text-sm text-slate-400">{config ? config.configured ? `${config.provider} / ${config.model}；生成任务、确认执行各调用模型一次。` : "模型服务尚未配置，请按运行说明配置服务端环境。" : "正在读取服务状态…"}</p>
      <Button onClick={() => request("plan")} disabled={!!busy || !config?.configured || !question.trim() || !token}>生成研究任务</Button>
      {busy && <p role="status" className="text-cyan-200">{busy === "plan" ? "正在理解问题并检查范围…" : busy === "execute" ? "正在核验材料、复算并生成解释…" : "正在保存审核记录…"}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </section>
    {contract && <section className={panel} data-testid="question-contract">
      <h2 className="text-lg font-semibold">确认研究任务</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2"><div>公司：{contract.company}</div><div>任务：{INTENT_LABELS[contract.intent]}</div><div>报告期：{contract.period}</div><div>同比期间：{contract.comparablePeriod ?? "未要求比较"}</div><div>所需材料：{contract.requiredSourceIds.join("、") || "范围外"}</div><div>研究快照：{snapshot?.versionId ?? "待补充"}（不作为同比期间）</div></dl>
      <p className="text-sm text-slate-300">{contract.reasons.join("；")}</p>
      {draft && <Button disabled={!!busy || !token} onClick={() => request("execute")}>确认并执行</Button>}
    </section>}
    {shown && <section className={panel} data-testid="question-result">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{statusLabel[shown.status]}</h2><div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download(`question-${shown.requestId}.json`, JSON.stringify({ run: shown, reviews: ledger.reviews.filter(r => r.runId === shown.runId) }, null, 2), "application/json")}>导出完整记录</Button>
        <Button variant="outline" onClick={() => download(`question-${shown.requestId}.md`, questionMarkdown(shown), "text/markdown;charset=utf-8")}>导出研究结果</Button>
      </div></div>
      <p className="text-sm text-slate-300 break-words">{shown.queryRaw}</p>
      {shown.reasons.length > 0 && <p className="text-amber-200">{shown.reasons.join("；")}</p>}
      {shown.status === "MATERIALS_REQUIRED" && <Link href="/" className="text-cyan-300 underline">去导入、审核并保存材料，再返回生成研究任务</Link>}
      {answer && <>
        <p className="text-sm text-amber-200">证据校验通过；解释为待人工核对草稿，专业关卡仍待复核。{answer.evidence.context.source.mode === "sample" && "当前输入为教学合成样例。"}</p>
        {([["directAnswer", "直接回答"], ["inference", "推论"], ["counterEvidence", "反向证据"], ["uncertainty", "未知与限制"]] as const).map(([key, label]) => <div key={key}><h3 className="font-medium text-cyan-200">{label}</h3><p className="mt-1 leading-relaxed">{answer.explanation[key].text}</p><div className="mt-1 flex flex-wrap gap-2 text-xs">{answer.explanation[key].citations.map(id => <a key={id} href={`#ref-${id}`} className="text-cyan-300 underline">[{id}]</a>)}</div></div>)}
        <h3 className="font-medium">已核验事实 · 单位：CNY mn</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead className="text-slate-400"><tr><th>指标</th><th>本期</th><th>上年同期</th><th>披露同比</th><th>来源</th></tr></thead><tbody>{answer.evidence.facts.map(f => <tr key={f.id} className="border-t border-white/10"><td className="py-3">{f.label}</td><td>{f.value.toFixed(8)}</td><td>{f.comparisonValue?.toFixed(8) ?? "未提供"}</td><td>{f.disclosedYoy === null ? "未提供" : `${(f.disclosedYoy * 100).toFixed(2)}%`}</td><td><a className="text-cyan-300 underline" href={f.url} target="_blank" rel="noreferrer">{f.sourceId} · P{f.page}</a></td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer">确定性计算与影响链</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ calculations: answer.evidence.calculations, graphDiff: answer.evidence.graphDiff }, null, 2)}</pre></details>
        <details open><summary className="cursor-pointer">引用与适用边界</summary><ul className="mt-3 space-y-3 text-sm text-slate-300">{answer.evidence.context.references.map(r => <li id={`ref-${r.id}`} key={r.id}><strong>[{r.id}]</strong> {r.excerpt} {r.url && <a className="text-cyan-300 underline" href={r.url} target="_blank" rel="noreferrer">原文</a>}</li>)}</ul><ul className="mt-4 space-y-2 text-sm text-amber-200">{answer.evidence.context.limits.map(l => <li key={l}>{l}</li>)}</ul></details>
        <div className="space-y-3 border-t border-white/10 pt-4" data-testid="question-review">
          <p>{lastReview ? lastReview.status === "accepted" ? "人工已接受研究草稿" : "研究草稿已退回" : "研究草稿尚待人工审核"}</p>
          <p className="text-sm text-slate-400">{answer.recommendedHumanAction}</p>
          <Input aria-label="问题审核人" placeholder="审核人（自行填写）" value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={100} />
          <Textarea aria-label="问题审核意见" placeholder="审核意见" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
          <div className="flex flex-wrap gap-2"><Button disabled={!!busy || !reviewer.trim()} onClick={() => review("accepted")}>接受研究草稿</Button><Button variant="outline" disabled={!!busy || !reviewer.trim()} onClick={() => review("rejected")}>退回研究草稿</Button></div>
        </div>
      </>}
      <details><summary className="cursor-pointer">运行记录 · {shown.events.length} 项事件</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ requestId: shown.requestId, calls: shown.calls, events: shown.events }, null, 2)}</pre></details>
    </section>}
    {ledger.runs.length > 0 && <section className={panel}><h2 className="font-semibold">本机研究问题历史</h2><div className="space-y-2">{ledger.runs.slice().reverse().map(r => <button className="block w-full rounded-lg border border-white/10 p-3 text-left text-sm hover:bg-white/5" key={r.runId} disabled={!!busy} onClick={() => { setShown(r); setDraft(null); }}>{statusLabel[r.status]} · {r.queryRaw}<span className="block text-xs text-slate-400">{r.createdAt}</span></button>)}</div></section>}
  </div>;
}
