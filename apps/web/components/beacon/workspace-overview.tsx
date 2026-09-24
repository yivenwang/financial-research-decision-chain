import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, GitCompareArrows, ShieldCheck } from "lucide-react";

const metrics = [
  { label: "归母净利润", value: "4.72 亿元", delta: "同比 -4.87%", tone: "review" },
  { label: "扣非归母净利润", value: "5.47 亿元", delta: "同比 +24.39%", tone: "validated" },
  { label: "非经常性损益", value: "-0.75 亿元", delta: "F-02 bridge", tone: "neutral" },
];

const health = [
  { label: "Source coverage", value: "S-05 已登记", status: "validated" },
  { label: "Calculation validation", value: "F-02 闭合", status: "validated" },
  { label: "Contradictions", value: "反证保留", status: "review" },
  { label: "Professional gates", value: "EG-01 / EG-02 pending", status: "blocked" },
];

export function WorkspaceOverview() {
  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.45fr_.85fr]">
        <article className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#6b7280]">Current research question</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">为什么安克表观利润下降，而扣非利润反而增长？</h2>
            </div>
            <span className="rounded-full border border-[#f3c37a] bg-[#fff8e8] px-3 py-1 text-xs font-medium text-[#a66500]">REVIEW REQUIRED</span>
          </div>
          <div className="mt-5 rounded-lg border-l-4 border-[#1f6feb] bg-[#f8fbff] px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280]">Decision snapshot · Draft</p>
            <p className="mt-1 text-base font-medium text-[#111827]">核心经营表现强于归母净利润的表面读数，但关键会计定性仍需人工复核。</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-[#e5e7eb] bg-white p-4">
                <p className="text-xs text-[#6b7280]">{metric.label}</p>
                <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{metric.value}</p>
                <p className={"mt-1 text-xs " + (metric.tone === "validated" ? "text-[#138a5b]" : metric.tone === "review" ? "text-[#a66500]" : "text-[#6b7280]")}>{metric.delta}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[#1f6feb]" />
            <h2 className="font-semibold">Research Health</h2>
          </div>
          <div className="mt-4 divide-y divide-[#e5e7eb]">
            {health.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs text-[#6b7280]">{item.value}</p>
                </div>
                {item.status === "validated" ? <CheckCircle2 className="size-4 text-[#138a5b]" /> : item.status === "review" ? <AlertTriangle className="size-4 text-[#a66500]" /> : <AlertTriangle className="size-4 text-[#c23b3b]" />}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link href="/changes" className="group rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm transition hover:border-[#1f6feb]">
          <GitCompareArrows className="size-5 text-[#1f6feb]" />
          <p className="mt-4 text-sm font-semibold">What changed</p>
          <p className="mt-1 text-sm leading-6 text-[#6b7280]">查看 NEW / CHANGED / AFFECTED，以及它们如何进入 Review Queue。</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#1f6feb]">Open change review <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
        <Link href="/evidence" className="group rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm transition hover:border-[#1f6feb]">
          <FileText className="size-5 text-[#1f6feb]" />
          <p className="mt-4 text-sm font-semibold">Why should I trust it</p>
          <p className="mt-1 text-sm leading-6 text-[#6b7280]">回到 Source ID、页码、提取值、期间、单位与确定性复算。</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#1f6feb]">Inspect evidence <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
        <Link href="/versions" className="group rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm transition hover:border-[#1f6feb]">
          <ShieldCheck className="size-5 text-[#1f6feb]" />
          <p className="mt-4 text-sm font-semibold">Human gate & version</p>
          <p className="mt-1 text-sm leading-6 text-[#6b7280]">AI 不能自动 Commit；正式更新必须留下审核动作和版本轨迹。</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#1f6feb]">Open versions <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
      </section>

      <section className="rounded-xl border border-[#d1d5db] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Question → Diff → Impact → Review → Commit</p>
            <p className="mt-1 text-xs text-[#6b7280]">这是产品主线；底层 Source → Evidence → Calculation → Claim → Assumption → Decision 按需展开。</p>
          </div>
          <Link href="/questions" className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#195fc7]">Start research</Link>
        </div>
      </section>
    </div>
  );
}
