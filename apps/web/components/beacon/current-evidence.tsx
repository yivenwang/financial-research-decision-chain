"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDot, FileSearch } from "lucide-react";
import { useCurrentResearch } from "./use-current-research";

const number = (value: number) => Number.isFinite(value) ? value.toFixed(8) : "—";

export function CurrentEvidence() {
  const current = useCurrentResearch();

  return (
    <section className="mb-6 rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm" aria-label="当前研究版本的证据" data-testid="current-evidence">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><FileSearch className="size-5 text-[#1f6feb]" /><h2 className="font-semibold">当前浏览器研究版本</h2></div>
        {current.kind === "ready" && <span className="rounded-full bg-[#eaf2ff] px-3 py-1 font-mono text-xs text-[#175eb8]">{current.version.versionId}</span>}
      </div>
      {current.kind === "loading" && <p className="mt-5 text-sm text-[#6b7280]">正在读取本机研究记录…</p>}
      {current.kind === "unreadable" && <p role="alert" className="mt-5 rounded-lg bg-[#fff1f1] p-4 text-sm text-[#9b2c2c]">本机版本记录无法完整读取。原数据没有被清除；请核对版本历史，暂勿将下方固定案例视为当前结果。</p>}
      {current.kind === "empty" && (
        <div className="mt-5 rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-5">
          <p className="text-sm font-medium">尚无已保存的材料更新版本</p>
          <p className="mt-2 text-sm leading-6 text-[#6b7280]">先上传已登记的报告、核对候选证据，再由人确认保存。下方保留 S-05 固定案例供查看。</p>
          <Link href="/changes" className="mt-4 inline-flex rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white hover:bg-[#195fc7]">进入变更审核 →</Link>
        </div>
      )}
      {current.kind === "ready" && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-[#e5e7eb] pb-4 text-xs text-[#6b7280]">
            <span>来源：{current.version.source?.sourceId ?? "未登记"}</span>
            <span>期间：{current.version.source?.period ?? "未注明"}</span>
            <span>已审核证据：{current.version.evidence.filter((item) => item.reviewStatus === "accepted").length} / {current.version.evidence.length}</span>
            <span>专业关卡：{current.version.blockedGates.join(" / ") || "无记录"}</span>
          </div>
          {current.version.evidence.length === 0 ? <p className="mt-5 text-sm text-[#6b7280]">此版本没有可展示的证据。</p> : (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {current.version.evidence.map((item) => (
                <article key={item.id} className="rounded-lg border border-[#e5e7eb] bg-[#fcfdff] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-mono text-xs text-[#6b7280]">{item.id} · {item.location}</p><h3 className="mt-1 text-sm font-semibold">{item.label}</h3></div>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${item.reviewStatus === "accepted" ? "text-[#138a5b]" : item.reviewStatus === "rejected" ? "text-[#c23b3b]" : "text-[#a66500]"}`}>
                      {item.reviewStatus === "accepted" ? <CheckCircle2 className="size-3.5" /> : item.reviewStatus === "rejected" ? <AlertTriangle className="size-3.5" /> : <CircleDot className="size-3.5" />}
                      {item.reviewStatus === "accepted" ? "人工已核对" : item.reviewStatus === "rejected" ? "已退回" : "待核对"}
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-base font-semibold tabular-nums">{number(item.valueMn)} <span className="text-xs font-normal text-[#6b7280]">CNY mn</span></p>
                  <p className="mt-2 text-xs text-[#6b7280]">方向：{item.direction} · 同比：{item.changePct === null ? "—" : `${item.changePct.toFixed(2)}%`}</p>
                  <p className="mt-3 border-t border-[#e5e7eb] pt-3 text-xs leading-5 text-[#4b5563]">{item.snippet}</p>
                </article>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs leading-5 text-[#6b7280]">此处读取本机保存的研究版本。审核者身份未经验证；请以原始 PDF、页面位置和版本记录复核。</p>
        </>
      )}
    </section>
  );
}
