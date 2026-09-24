"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDot, HardDrive, ShieldAlert } from "lucide-react";
import { useCurrentResearch } from "./use-current-research";

export function ResearchContext() {
  const current = useCurrentResearch();
  return (
    <section aria-label="当前研究范围与版本" data-testid="research-context" className="mb-6 rounded-xl border border-[#d9e2ed] bg-white px-4 py-3 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#526173]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#175eb8]"><HardDrive aria-hidden="true" className="size-3.5" />仅此浏览器</span>
        <span className="hidden h-3 w-px bg-[#d1d5db] sm:block" aria-hidden="true" />
        {current.kind === "loading" && <span>正在读取研究版本…</span>}
        {current.kind === "unreadable" && <span role="alert" className="inline-flex items-center gap-1.5 font-medium text-[#b42318]"><AlertTriangle aria-hidden="true" className="size-3.5" />版本记录无法完整读取，原数据已保留</span>}
        {current.kind === "empty" && <>
          <span className="font-medium text-[#111827]">当前版本 V-01 · 尚无材料更新</span>
          <span>已验证问题范围：安克创新 / S-05 / 2026Q1 / C-04</span>
          <Link href="/changes" className="ml-auto inline-flex items-center gap-1 font-medium text-[#175eb8] hover:underline">处理材料 <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
        </>}
        {current.kind === "ready" && <>
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#111827]"><CircleDot aria-hidden="true" className="size-3.5 text-[#138a5b]" />当前版本 {current.version.versionId}</span>
          <span>来源 {current.version.source?.sourceId ?? "未登记"} · {current.version.source?.period ?? "期间未注明"}</span>
          <span>证据已核对 {current.version.evidence.filter((item) => item.reviewStatus === "accepted").length}/{current.version.evidence.length}</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#a66500]"><ShieldAlert aria-hidden="true" className="size-3.5" />关卡 {current.version.blockedGates.join(" / ") || "无记录"}</span>
          {current.version.source?.sha256 && <span title={`源文件 SHA-256: ${current.version.source.sha256}`} className="font-mono text-[#8090a2]">PDF SHA {current.version.source.sha256.slice(0, 8)}…</span>}
        </>}
      </div>
    </section>
  );
}
