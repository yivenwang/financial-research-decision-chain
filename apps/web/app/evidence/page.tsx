import { BeaconShell } from "@/components/beacon/shell";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "证据核验 · Beacon｜研灯" };

const items = [
  { id: "E-105", label: "归母净利润", value: "4.72 亿元", change: "同比 -4.87%", location: "S-05 · P2", kind: "反证", note: "表面利润下降，不能被删除；必须与调整项共同解释。" },
  { id: "E-106", label: "扣非归母净利润", value: "5.47 亿元", change: "同比 +24.39%", location: "S-05 · P2", kind: "支持", note: "支持核心经营表现强于归母净利润表面读数。" },
  { id: "E-107", label: "非经常性损益", value: "-0.75 亿元", change: "F-02 bridge", location: "S-05 · P2–P3", kind: "支持", note: "解释归母与扣非之间的桥，但是否属于非核心仍需会计复核。" },
];

export default function EvidencePage() {
  return (
    <BeaconShell
      eyebrow="Evidence inspector"
      title="每个正式判断都必须能回到来源"
      description="这里展示当前 S-05 样本已在既有产品中使用的 Evidence。它是核验入口，不用 citation 编号替代证据检查。"
    >
      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="size-5 text-[#1f6feb]" /><h2 className="font-semibold">Source · S-05</h2></div>
          <p className="mt-3 text-sm font-medium">安克创新 2026 年第一季度报告</p>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-3 text-sm">
            <dt className="text-[#6b7280]">Role</dt><dd>已登记研究更新材料</dd>
            <dt className="text-[#6b7280]">Period</dt><dd>2026Q1</dd>
            <dt className="text-[#6b7280]">Lineage</dt><dd>Source → Evidence → Calculation → Claim</dd>
            <dt className="text-[#6b7280]">Professional</dt><dd className="text-[#a66500]">EG-01 / EG-02 pending</dd>
          </dl>
          <div className="mt-5 rounded-lg bg-[#fff8e8] p-4 text-sm leading-6 text-[#7a4d00]">
            页面位置和数值来自既有 S-05 验证链；本页不新增财务判断，也不把当前样本外推成跨公司泛化。
          </div>
        </section>

        <section className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-[#d1d5db] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-xs text-[#6b7280]">{item.id} · {item.location}</p><h2 className="mt-1 font-semibold">{item.label}</h2></div>
                <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + (item.kind === "支持" ? "bg-[#eaf7f1] text-[#138a5b]" : "bg-[#fff8e8] text-[#a66500]")}>
                  {item.kind === "支持" ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{item.kind}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                <p className="font-mono text-2xl font-semibold tabular-nums">{item.value}</p>
                <p className="text-sm text-[#6b7280]">{item.change}</p>
              </div>
              <p className="mt-4 border-t border-[#e5e7eb] pt-4 text-sm leading-6 text-[#374151]">{item.note}</p>
            </article>
          ))}
        </section>
      </div>
    </BeaconShell>
  );
}
