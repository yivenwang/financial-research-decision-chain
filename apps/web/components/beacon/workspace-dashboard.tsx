"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, GitCompareArrows, History, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { getSourceRecord } from "@/lib/source-records";
import { useCurrentResearch } from "./use-current-research";

const tasks = [
  { href: "/questions", label: "提出研究问题", detail: "确认范围和研究任务后再执行", icon: MessageCircleQuestion },
  { href: "/changes", label: "处理材料变化", detail: "上传、审核证据、保存新版本", icon: GitCompareArrows },
  { href: "/evidence", label: "核查证据来源", detail: "回到页码、数值、审核和反证", icon: FileSearch },
  { href: "/versions", label: "检查版本历史", detail: "查看审核、导出与回滚记录", icon: History },
];

export function WorkspaceDashboard() {
  const current = useCurrentResearch();
  const version = current.kind === "ready" ? current.version : null;
  const accepted = version?.evidence.filter((item) => item.reviewStatus === "accepted").length ?? 0;
  const sourceRecord = version?.source?.sourceId ? getSourceRecord(version.source.sourceId) : null;
  const impact = version?.chain?.graphDiff;

  return (
    <div className="space-y-5" data-testid="workspace-dashboard">
      {current.kind === "loading" && <section className="rounded-xl border border-[#d1d5db] bg-white p-6 text-sm text-[#6b7280]">正在读取本机研究版本…</section>}
      {current.kind === "unreadable" && (
        <section role="alert" className="flex items-start gap-3 rounded-xl border border-[#f4b4b4] bg-[#fff6f6] p-6 text-sm text-[#9b2c2c]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div><h2 className="font-semibold">版本记录无法完整读取</h2><p className="mt-1 leading-6">系统未清除原始数据，也不会用固定案例填充当前状态。请先核对本机版本记录。</p></div>
        </section>
      )}
      {current.kind === "empty" && (
        <section className="rounded-xl border border-[#d1d5db] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#1f6feb]">Research baseline · V-01</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">先建立一份可审核的研究更新</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#526173]">本浏览器尚未保存材料更新。V-01 是研究基线，不代表已解析完整财报。你可以先提出安克创新 2026Q1 的问题，或从已登记的 S-05 报告开始核对证据。</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/questions" className="inline-flex items-center gap-2 rounded-md bg-[#1f6feb] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#195fc7]">提出问题 <ArrowRight aria-hidden="true" className="size-4" /></Link>
            <Link href="/changes" className="inline-flex items-center gap-2 rounded-md border border-[#d1d5db] px-4 py-2.5 text-sm font-semibold text-[#175eb8] hover:bg-[#f3f7fd]">处理材料 <ArrowRight aria-hidden="true" className="size-4" /></Link>
          </div>
        </section>
      )}
      {version && (
        <>
          <section className="grid gap-5 rounded-xl border border-[#d1d5db] bg-white p-6 shadow-sm lg:grid-cols-[1.3fr_.7fr]" aria-label="当前研究快照">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#1f6feb]">Current research · {version.versionId}</p>
                <span className="rounded-full bg-[#fff8e8] px-2.5 py-1 text-xs font-medium text-[#a66500]">人工研究记录 · 专业待复核</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">{version.source?.name ?? "未登记材料名称"}</h2>
              <p className="mt-2 text-sm leading-6 text-[#526173]">规则状态：{version.decision}。这一状态不构成正式投资建议；后续判断仍由研究者负责。</p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#657487]">
                <span>材料 {version.source?.sourceId ?? "—"} · {version.source?.period ?? "期间未注明"}</span>
                <span>版本类型 {version.kind === "rollback" ? "回滚" : "材料更新"}</span>
                {version.parentVersionId && <span>承接 {version.parentVersionId}</span>}
                {version.source?.sha256 && <span className="font-mono" title={`PDF SHA-256: ${version.source.sha256}`}>PDF SHA {version.source.sha256.slice(0, 12)}…</span>}
              </div>
              {sourceRecord && <a className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#175eb8] hover:underline" href={sourceRecord.url} target="_blank" rel="noopener noreferrer">查看登记的来源 PDF <ArrowRight aria-hidden="true" className="size-4" /></a>}
            </div>
            <div className="rounded-lg border border-[#f3c37a] bg-[#fffaf0] p-4">
              <div className="flex items-center gap-2 text-[#a66500]"><ShieldAlert className="size-5" aria-hidden="true" /><h3 className="text-sm font-semibold">仍需人工把关</h3></div>
              <p className="mt-3 text-sm leading-6 text-[#7a4d00]">{version.blockedGates.length ? `待处理关卡：${version.blockedGates.join(" / ")}` : "当前版本未记录阻断关卡；仍须独立核对正式判断。"}</p>
              <p className="mt-2 text-xs leading-5 text-[#8c6a35]">审核者身份由本机自行填写，尚未经服务端核验。</p>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3" aria-label="研究状态摘要">
            <Summary label="证据审核" value={`${accepted} / ${version.evidence.length}`} note="仅统计此版本人工接受的证据" icon={CheckCircle2} />
            <Summary label="规则影响节点" value={impact ? String(impact.changedNodeIds.length) : "—"} note="冻结规则传播结果，不是逐字段新旧差" icon={GitCompareArrows} />
            <Summary label="专业关卡" value={String(version.blockedGates.length)} note="关卡清单仍需实际专业复核" icon={ShieldAlert} />
          </section>
          {impact && <section className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold">这次更新影响了什么</h3>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {Object.entries(impact.reasons).map(([node, reason]) => <li key={node} className="rounded-lg bg-[#f6f9fd] p-3 text-xs leading-6 text-[#526173]"><span className="mr-2 font-mono font-semibold text-[#175eb8]">{node}</span>{reason}</li>)}
            </ul>
            <p className="mt-3 text-xs text-[#6b7280]">以上为本次更新的规则影响说明，不是任意两个版本之间的字段对比。</p>
          </section>}
        </>
      )}
      <section aria-label="研究任务" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tasks.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm transition hover:border-[#8bb8ec] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6feb]">
            <Icon className="size-5 text-[#1f6feb]" aria-hidden="true" /><h3 className="mt-4 text-sm font-semibold">{label}</h3><p className="mt-1 text-xs leading-5 text-[#6b7280]">{detail}</p><ArrowRight className="mt-4 size-4 text-[#1f6feb] transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ))}
      </section>
    </div>
  );
}

function Summary({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof CheckCircle2 }) {
  return <div className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-[#657487]"><Icon className="size-4 text-[#1f6feb]" aria-hidden="true" />{label}</div><p className="mt-3 font-mono text-2xl font-semibold text-[#111827]">{value}</p><p className="mt-2 text-xs leading-5 text-[#6b7280]">{note}</p></div>;
}
