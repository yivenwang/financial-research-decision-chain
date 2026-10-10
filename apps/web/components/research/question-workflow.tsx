"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Database, ServerCog, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INTENT_LABELS, QUESTION_CAPABILITY, questionSources, questionMarkdown, type QuestionRun, type SignedQuestionDraft } from "@/lib/research-question";
import { appendQuestionRun, appendQuestionReview, readQuestionLedger, type QuestionLedger } from "@/lib/research-question-storage";
import { readStoredVersions, readActiveVersionId, VERSION_UPDATED_EVENT, type ResearchVersion } from "@/lib/research-versions";
import { questionReason } from "@/lib/question-presentation";
import { researchBrowserIssue, runResearchBrowserOperation } from "@/lib/research-browser";

import { useRouter } from "next/navigation";
import { useConfirmAction } from './use-confirm-action';
import { useUnsavedGuard } from './use-unsaved-guard';
import { MATERIAL_HANDOFF_KEY, MATERIAL_RETURN_TO, readMaterialQuestion } from '@/lib/material-handoff';
import { questionExportLabel } from '@/lib/question-presentation';

const PENDING_KEY = "beacon-question-pending-v1";
const DRAFT_KEY = "beacon-question-draft-v1";
type Pending = { phase: "plan" | "execute"; id: string; body?: unknown };

const examples = ["安克创新2026Q1归母净利润下降，但扣非归母净利润上升，这是否意味着核心经营恶化？", "归母净利润同比下降的来源在哪里？", "这次更新影响了哪些Claim和Assumption？"];
const statusLabel = { CONTRACT_DRAFTED: "待确认研究任务", MATERIALS_REQUIRED: "需要补充材料", OUT_OF_SCOPE: "超出当前范围", BLOCKED: "已阻断", ANSWER_READY: "研究草稿待审核", PARTIAL: "部分回答待审核" };
const panel = "rounded-xl border border-white/10 bg-slate-900/80 p-5 space-y-4";
const plainError = (e: unknown) => e instanceof Error ? e.message : "操作未完成。";
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Shanghai", hourCycle: "h23",
  }).format(new Date(value));
}

export function QuestionWorkflow({ initialQuestion = examples[0] }: { initialQuestion?: string }) {
  const router=useRouter();
  const initialQuestionRef=useRef(initialQuestion);
  const [question, setQuestion] = useState(initialQuestion);
  const [config, setConfig] = useState<{ configured: boolean; provider: string; model: string } | null>(null);
  const [snapshot, setSnapshot] = useState<ResearchVersion | null>(null);
  const [ledger, setLedger] = useState<QuestionLedger>({ runs: [], reviews: [] });
  const [draft, setDraft] = useState<SignedQuestionDraft | null>(null);
  const [shown, setShown] = useState<QuestionRun | null>(null);
  const [busy, setBusy] = useState<"plan" | "execute" | "review" | null>(null);
  const [error, setError] = useState("");
  const [browserIssue, setBrowserIssue] = useState<string | null>("正在检查浏览器环境…");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [pendingState, setPendingState] = useState<'sending'|'checking'|'waiting'|'unknown'|'blocked'>('unknown');
  const confirmation = useConfirmAction();
  const reviewGuard = useUnsavedGuard(!!reviewer || !!note, () => { setReviewer(''); setNote(''); });
  function selectRun(run: QuestionRun) { if(run.runId === shown?.runId) return; reviewGuard.protect(() => {setShown(run);setDraft(null);setReviewer('');setNote('');}); }
  function goToMaterials(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    reviewGuard.protect(() => {
      try { sessionStorage.setItem(MATERIAL_HANDOFF_KEY, JSON.stringify({question})); router.push('/changes?returnTo=' + encodeURIComponent(MATERIAL_RETURN_TO)); }
      catch { setError('无法保存本机问题草稿，请先复制问题再进入材料更新。'); }
    });
  }
  const recoveryAbort = useRef<AbortController | null>(null);
  const resumePending = useEffectEvent((waiting: Pending) => { void recover(waiting); });
  const reload = () => {
    const next = readQuestionLedger(); setLedger(next);
    const versions = readStoredVersions("research");
    setSnapshot(versions.find(v => v.versionId === readActiveVersionId(versions, "research")) ?? null);
    return next;
  };
  useEffect(() => {
    let active = true;
    const initialize = () => { if (!active) return; try { const next = reload(); setShown(next.runs.at(-1) ?? null); const resume = new URLSearchParams(window.location.search).get('resume') === 'materials'; const restored = resume ? readMaterialQuestion(JSON.parse(sessionStorage.getItem(MATERIAL_HANDOFF_KEY) ?? 'null')) : null; if(restored) setQuestion(restored); const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null"); if (saved?.ticket && saved.run?.status === "CONTRACT_DRAFTED" && saved.run.queryRaw === (restored ?? initialQuestionRef.current)) setDraft(saved); const waiting = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null"); if (waiting?.id && ["plan", "execute"].includes(waiting.phase)) { setPending(waiting); resumePending(waiting); } } catch (e) { setError(plainError(e)); } };
    const refresh = () => { if (!active) return; try { reload(); } catch (e) { setError(plainError(e)); } };
    queueMicrotask(() => { if (active) setBrowserIssue(researchBrowserIssue()); initialize(); });
    window.addEventListener(VERSION_UPDATED_EVENT, refresh); window.addEventListener("storage", refresh);
    const abort = new AbortController();
    fetch("/api/research-question", { signal: abort.signal }).then(async r => { if (!r.ok) throw new Error("无法读取模型配置状态。"); setConfig(await r.json()); }).catch(e => { if (e.name !== "AbortError") setError(plainError(e)); });
    return () => { active = false; abort.abort(); recoveryAbort.current?.abort(); window.removeEventListener(VERSION_UPDATED_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  async function receive(data: { run: QuestionRun; ticket?: string | null }, phase: "plan" | "execute") {
    setShown(data.run); setReviewer(""); setNote("");
    if (phase === "plan" && data.ticket) { const signed = { run: data.run, ticket: data.ticket }; localStorage.setItem(DRAFT_KEY, JSON.stringify(signed)); setDraft(signed); }
    if (phase === "execute" && data.run.status !== "MATERIALS_REQUIRED") { localStorage.removeItem(DRAFT_KEY); setDraft(null); }
    try { await appendQuestionRun(data.run); reload(); }
    catch { setError("结果已返回，但本机保存失败。请立即导出完整记录；无需再次调用模型。"); }
    localStorage.removeItem(PENDING_KEY); setPending(null);
  }
  async function recover(waiting: Pending) {
    recoveryAbort.current?.abort();
    const controller = new AbortController(); recoveryAbort.current = controller;
    setBusy(waiting.phase); setError("");
    try {
      setPendingState('checking');
      const response = await fetch(`/api/research-question?operationId=${encodeURIComponent(waiting.id)}&phase=${waiting.phase}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      const data = await response.json();
      if(controller.signal.aborted) return;
      if(response.status === 202) { setPendingState('waiting'); return; }
      if(!response.ok || !data.run) { setPendingState('blocked'); throw new Error(data.error ?? '任务状态无法读取，请保留任务标识并联系维护者。'); }
      await receive(data, waiting.phase);
    } catch (e) { if (!controller.signal.aborted) { setPendingState(current=>current==='blocked'?current:'unknown'); setError(plainError(e)); } }
    finally { if (!controller.signal.aborted) setBusy(null); }
  }
  async function retryPending(waiting: Pending) {
    if (!waiting.body || pendingState !== "unknown") return;
    const controller = new AbortController(); recoveryAbort.current = controller; setPendingState("sending");
    setBusy(waiting.phase); setError("");
    try {
      const response = await runResearchBrowserOperation(() => fetch("/api/research-question", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": waiting.id }, body: JSON.stringify(waiting.body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(175000)]) }));
      if(controller.signal.aborted) return;
      if (response.status === 202) { await recover(waiting); return; }
      const data = await response.json();
      if (!response.ok || !data.run) { setPendingState("blocked"); setError(data.error ?? "任务未完成，请先读取状态。"); return; }
      await receive(data, waiting.phase);
    } catch (e) { if(!controller.signal.aborted) {setPendingState("unknown");setError(plainError(e));} } finally { if(!controller.signal.aborted)setBusy(null); }
  }
  function endWaiting() {
    if (!pending) return;
    const records = JSON.parse(localStorage.getItem("beacon-question-unresolved-v1") ?? "[]");
    localStorage.setItem("beacon-question-unresolved-v1", JSON.stringify([...records, { phase: pending.phase, id: pending.id, endedAt: new Date().toISOString() }]));
    recoveryAbort.current?.abort(); setBusy(null);
    localStorage.removeItem(PENDING_KEY); setPending(null); setDraft(null); localStorage.removeItem(DRAFT_KEY);
    setError("原任务标识已保留，服务器记录不会删除。新任务可能再次产生调用费用；请先核查原任务。");
  }
  async function request(phase: "plan" | "execute") {
    const issue = researchBrowserIssue();
    if (issue) { setBrowserIssue(issue); setError(issue); return; }
    const controller = new AbortController(); recoveryAbort.current?.abort(); recoveryAbort.current = controller;
    setPendingState("sending"); setBusy(phase); setError("");
    if (phase === "plan") setDraft(null);
    try {
      // Read the current snapshot at the confirmation action, not from a stale render.
      const versions = readStoredVersions("research");
      const current = versions.find(v => v.versionId === readActiveVersionId(versions, "research")) ?? null;
      const waiting: Pending = { phase, id: phase === "execute" ? draft!.run.requestId : crypto.randomUUID(), body: phase === "plan" ? { phase, question } : { phase, draft, confirmed: true, snapshot: current } };
      localStorage.setItem(PENDING_KEY, JSON.stringify(waiting)); setPending(waiting);
      const response = await runResearchBrowserOperation(() => fetch("/api/research-question", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": waiting.id },
        body: JSON.stringify(waiting.body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(175000)]) }));
      if(controller.signal.aborted) return;
      if (response.status === 202) { await recover(waiting); return; }
      const data = await response.json();
      if ([400, 401, 403, 422, 429].includes(response.status)) { localStorage.removeItem(PENDING_KEY); setPending(null); }
      if (!response.ok || !data.run) { setPendingState("blocked"); setError(data.error ?? "研究请求未完成。"); return; }
      await receive(data, phase);
    } catch (e) { if(!controller.signal.aborted) {setPendingState("unknown");setError(plainError(e));} }
    finally { if(!controller.signal.aborted)setBusy(null); }
  }
  async function review(status: "accepted" | "rejected") {
    if (!shown) return;
    setBusy("review"); setError("");
    try { await appendQuestionReview(shown.runId, status, reviewer, note); setReviewer(""); setNote(""); reload(); }
    catch (e) { setError(plainError(e)); }
    finally { setBusy(null); }
  }
  const answer = shown?.answer;
  const lastReview = ledger.reviews.filter(r => r.runId === shown?.runId).at(-1);
  const contract = draft?.run.contract ?? shown?.contract;
  const selectQuestion = (value: string) => { setQuestion(value); setDraft(null); localStorage.removeItem(DRAFT_KEY); };
  const questionReady = question.trim().length > 0;
  const modelReady = config?.configured === true;
  return <div className="space-y-5" data-testid="question-workflow">
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">研究问题</h2><a className="text-cyan-300 underline" href="/changes?returnTo=%2Fquestions%3Fresume%3Dmaterials" onClick={goToMaterials}>补充材料</a></div>
      <p className="text-sm text-slate-300">{QUESTION_CAPABILITY.company} · {questionSources().map(s => s.period).join("、")} · 变化解释、证据核验、决策影响</p>
      <p className="text-sm text-slate-400">当前材料：{snapshot ? `${snapshot.source?.sourceId} · ${snapshot.versionId}${snapshot.source?.mode === "sample" ? " · 教学合成样例" : ""}` : "尚无已审核材料。可以先生成任务；执行前需要导入、逐条审核并保存 S-05（2026Q1）"}。每个事实附来源，关键证据不足时停止生成。</p>
      <p className="text-xs text-slate-400">任务绑定本次审验会话。刷新和多标签页可恢复；退出或重新登录后，旧任务不会自动移交。本机历史与导出仍保留。</p>
      <label className="block space-y-2"><span>你想研究什么？</span><Textarea aria-label="研究问题" value={question} maxLength={1000} disabled={!!busy} onChange={e => selectQuestion(e.target.value)} className="min-h-24" /><span className="block text-right text-xs text-slate-400">{Array.from(question).length} / 1000</span></label>
      <div className="flex flex-wrap gap-2">{examples.map((q, i) => <Button key={q} variant="outline" disabled={!!busy} onClick={() => selectQuestion(q)}>示例 {i + 1}：{["核心盈利", "证据来源", "影响链"][i]}</Button>)}</div>
      <p className="text-sm text-slate-400">{config ? config.configured ? `${config.provider} / ${config.model}；生成任务、确认执行各调用模型一次。` : "模型服务尚未配置，请按运行说明配置服务端环境。" : "正在读取服务状态…"}</p>
      <div className="grid gap-2 sm:grid-cols-3" aria-label="研究任务就绪状态">
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${modelReady ? "border-emerald-300/25 bg-emerald-300/[0.055] text-emerald-200" : "border-amber-300/25 bg-amber-300/[0.055] text-amber-200"}`}>{modelReady ? <CheckCircle2 className="size-4" /> : <ServerCog className="size-4" />}<span>模型服务<br /><small>{modelReady ? "已连接" : "待配置"}</small></span></div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/[0.055] p-3 text-sm text-emerald-200"><ShieldCheck className="size-4" /><span>审验访问<br /><small>已授权</small></span></div>
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${snapshot ? "border-emerald-300/25 bg-emerald-300/[0.055] text-emerald-200" : "border-slate-300/25 bg-slate-300/[0.04] text-slate-400"}`}>{snapshot ? <Database className="size-4" /> : <CircleAlert className="size-4" />}<span>研究材料<br /><small>{snapshot ? `${snapshot.versionId} 可用于执行` : "可先生成任务"}</small></span></div>
      </div>
      {browserIssue && <p role="alert" className="text-amber-200">{browserIssue}</p>}
      <Button onClick={() => reviewGuard.protect(() => {void request("plan");})} disabled={!!busy || !!pending || !modelReady || !questionReady || !!browserIssue}>生成研究任务</Button>
      {pending && <div className="space-y-3 text-sm" data-testid="pending-request">
        <p className="break-all">任务标识：{pending.id}。刷新后可检查状态；检查不会调用模型。</p>
        <p role="status">{pendingState === 'sending' ? '推荐下一步：等待本次请求返回。' : pendingState === 'checking' ? '推荐下一步：等待状态检查完成。' : pendingState === 'blocked' ? '推荐下一步：保留任务标识，联系维护者核查；禁止重发。' : pendingState === 'waiting' ? '任务仍在处理。推荐下一步：稍后检查状态。' : '结果尚不确定。推荐下一步：检查任务状态。'}</p>
        {!busy && <Button onClick={() => recover(pending)}>检查任务状态</Button>}
        <details><summary className="cursor-pointer">其他处理方式与费用说明</summary><div className="mt-3 flex flex-wrap gap-3">
          {!!pending.body && pendingState === 'unknown' && !busy && <Button variant="outline" onClick={() => confirmation.ask('重发同一请求？','仅复用原任务标识与原输入，服务器将核对幂等记录。若原请求从未送达，可能执行本次调用；结果不确定不代表未计费。优先检查状态，不会创建新任务标识。',()=>{void retryPending(pending);},'确认重发同一请求','返回检查状态')}>重发同一请求（幂等）</Button>}
          <Button variant="outline" onClick={() => confirmation.ask('结束等待？','原任务标识与运行阶段会保留在本机，服务器任务与历史不会删除或取消。页面停止等待，未返回的结果和执行草稿不再自动恢复到页面。新任务可能再次计费；请先核查原任务。',()=>{try{endWaiting();}catch(e){setError(plainError(e));}},'保留标识并结束等待','继续等待')}>结束等待</Button>
        </div></details>
      </div>}
      {busy && <p role="status" className="text-cyan-200">{busy === "plan" ? "正在理解问题并检查范围…" : busy === "execute" ? "正在核验材料、复算并生成解释…" : "正在保存审核记录…"}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
    </section>
    {contract && <section className={panel} data-testid="question-contract">
      <h2 className="text-lg font-semibold">确认研究任务</h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2"><div>公司：{contract.company}</div><div>任务：{INTENT_LABELS[contract.intent]}</div><div>报告期：{contract.period}</div><div>同比期间：{contract.comparablePeriod ?? "未要求比较"}</div><div>所需材料：{contract.requiredSourceIds.join("、") || "范围外"}</div><div>研究快照：{snapshot?.versionId ?? "待补充"}（不作为同比期间）</div></dl>
      <p className="text-sm text-slate-300">{contract.reasons.join("；")}</p>
      {draft && <><p className="text-sm text-slate-400">{snapshot ? "执行前仍会复核材料、审核记录及冻结计算。" : "缺少已审核 S-05（2026Q1）：请先到材料更新导入、审核并保存，再返回确认。此时确认只检查材料，不调用解释模型。"}</p><Button disabled={!!busy || !!pending || !!browserIssue} onClick={() => reviewGuard.protect(() => {void request("execute");})}>确认并执行</Button></>}
    </section>}
    {shown && <section className={panel} data-testid="question-result">
      {shown.calls.some(call => ["question-explanation.v1", "question-explanation.v2"].includes(call.promptVersion)) && <p className="text-sm text-amber-200" data-testid="historical-validation-notice">这份历史记录按当时的校验规则生成。当前已加强反证陈述、逐段引用和同比归因检查，历史状态与审核记录未重新评定；请人工核验原文，不将历史技术完成视为内容或专业认可。</p>}
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{statusLabel[shown.status]}</h2><div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download(`question-${shown.requestId}.json`, JSON.stringify({ run: shown, reviews: ledger.reviews.filter(r => r.runId === shown.runId) }, null, 2), "application/json")}>导出完整记录</Button>
        <Button variant="outline" onClick={() => download(`question-${shown.requestId}.md`, questionMarkdown(shown), "text/markdown;charset=utf-8")}>{questionExportLabel(shown.status, lastReview?.status)}</Button>
      </div></div>
      <p className="text-sm text-slate-300 break-words">{shown.queryRaw}</p>
      {shown.reasons.length > 0 && <p className="text-amber-200">{shown.reasons.map(questionReason).join("；")}</p>}
      {shown.status === "BLOCKED" && <details><summary>阻断技术详情</summary><code>{shown.reasons.join("；")}</code></details>}
      {shown.status === "MATERIALS_REQUIRED" && <a href="/changes?returnTo=%2Fquestions%3Fresume%3Dmaterials" onClick={goToMaterials} className="text-cyan-300 underline">提交、核验并保存材料，返回并继续研究</a>}
      {answer && <>
        <nav aria-label="研究结果章节" className="flex flex-wrap gap-3 text-sm"><a href="#question-explanation">解释</a><a href="#question-facts">事实</a><a href="#question-references">引用与边界</a><a href="#question-review">人工审核与下一步</a></nav>
        <div id="question-explanation" />
        <p className="text-sm text-amber-200">证据校验通过；解释为待人工核对草稿，专业关卡仍待复核。{answer.evidence.context.source.mode === "sample" && "当前输入为教学合成样例。"}</p>
        {([["directAnswer", "直接回答"], ["inference", "推论"], ["counterEvidence", "反向证据"], ["uncertainty", "未知与限制"]] as const).map(([key, label]) => <div key={key}><h3 className="font-medium text-cyan-200">{label}</h3><p className="mt-1 leading-relaxed">{answer.explanation[key].text}</p><div className="mt-1 flex flex-wrap gap-2 text-xs">{answer.explanation[key].citations.map(id => <a key={id} href={`#ref-${id}`} className="text-cyan-300 underline">[{id}]</a>)}</div></div>)}
        <h3 id="question-facts" className="font-medium">已核验事实 · 单位：CNY mn</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead className="text-slate-400"><tr><th>指标</th><th>本期</th><th>上年同期</th><th>披露同比</th><th>来源</th></tr></thead><tbody>{answer.evidence.facts.map(f => <tr key={f.id} className="border-t border-white/10"><td className="py-3">{f.label}</td><td>{f.value.toFixed(8)}</td><td>{f.comparisonValue?.toFixed(8) ?? "未提供"}</td><td>{f.disclosedYoy === null ? "未提供" : `${(f.disclosedYoy * 100).toFixed(2)}%`}</td><td><a className="text-cyan-300 underline" href={f.url} target="_blank" rel="noreferrer">{f.sourceId} · P{f.page}</a></td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer">确定性计算与影响链</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ calculations: answer.evidence.calculations, graphDiff: answer.evidence.graphDiff }, null, 2)}</pre></details>
        <details id="question-references" open><summary className="cursor-pointer">引用与适用边界</summary><ul className="mt-3 space-y-3 text-sm text-slate-300">{answer.evidence.context.references.map(r => <li id={`ref-${r.id}`} key={r.id}><strong>[{r.id}]</strong> {r.excerpt} {r.url && <a className="text-cyan-300 underline" href={r.url} target="_blank" rel="noreferrer">原文</a>}</li>)}</ul><ul className="mt-4 space-y-2 text-sm text-amber-200">{answer.evidence.context.limits.map(l => <li key={l}>{l}</li>)}</ul></details>
        <div className="space-y-3 border-t border-white/10 pt-4" id="question-review" data-testid="question-review">
          <p className="break-all text-sm" data-testid="review-context">当前 Run：{shown.runId} · 问题：{shown.queryRaw} · 创建时间：{formatDate(shown.createdAt)}</p>
          <p>{lastReview ? lastReview.status === "accepted" ? "人工已接受研究草稿" : "研究草稿已退回" : "研究草稿尚待人工审核"}</p>
          {lastReview && <p className="text-sm text-slate-400">最近审核：{lastReview.reviewer} · {formatDate(lastReview.reviewedAt)}{lastReview.note ? ` · ${lastReview.note}` : ""}</p>}
          <p className="text-sm text-slate-400">{answer.recommendedHumanAction} 再次审核会追加记录，原退回或接受意见仍保留。</p><details><summary>历次人工审核</summary>{ledger.reviews.filter(r => r.runId === shown.runId).map(r => <p key={r.id}>{r.status === "accepted" ? "接受草稿" : "退回草稿"} · {r.reviewer} · {formatDate(r.reviewedAt)} · {r.note}</p>)}</details>
          <p className="text-sm">下一步：核对上述事实、引用与边界，再提交当前 Run 的审核。专业判断请到 <a href="/help#professional-review" className="underline">专业复核准备</a>。</p>
          <Input aria-label="问题审核人" placeholder="审核人（自行填写）" value={reviewer} onChange={e => setReviewer(e.target.value)} maxLength={100} />
          <Textarea aria-label="问题审核意见" placeholder="审核意见" value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
          <div className="flex flex-wrap gap-2"><Button disabled={!!busy || !reviewer.trim()} onClick={() => review("accepted")}>接受研究草稿</Button><Button variant="outline" disabled={!!busy || !reviewer.trim()} onClick={() => review("rejected")}>退回研究草稿</Button></div>
        </div>
      </>}
      <details><summary className="cursor-pointer">运行记录 · {shown.events.length} 项事件</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ requestId: shown.requestId, calls: shown.calls, events: shown.events }, null, 2)}</pre></details>
    </section>}
    {ledger.runs.length > 0 && <section className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">本机研究问题历史</h2><span className="text-sm text-slate-400">{ledger.runs.length} 次运行</span></div><Input aria-label="查找研究问题历史" placeholder="按问题或请求标识查找" value={historySearch} onChange={e => setHistorySearch(e.target.value)} /><label>运行状态 <select aria-label="筛选研究问题状态" value={historyStatus} onChange={e => setHistoryStatus(e.target.value)}><option value="all">全部</option>{Object.entries(statusLabel).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label><div className="space-y-2">{ledger.runs.filter(r => (historyStatus === "all" || r.status === historyStatus) && `${r.queryRaw} ${r.requestId}`.toLowerCase().includes(historySearch.toLowerCase())).slice().reverse().map(r => <button aria-current={shown?.runId === r.runId ? "true" : undefined} className="block w-full rounded-lg border border-white/10 p-3 text-left text-sm hover:bg-white/5" key={r.runId} disabled={!!busy || !!pending} onClick={() => selectRun(r)}>{statusLabel[r.status]} · {r.queryRaw}<span className="block text-xs text-slate-400">{formatDate(r.createdAt)}</span></button>)}</div></section>}
    {reviewGuard.dialog}{confirmation.dialog}
  </div>;
}
