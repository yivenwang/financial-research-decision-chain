import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleDot, Smartphone } from "lucide-react";

export default function MobilePage() {
  return (
    <main className="min-h-screen bg-[#eef3f8] px-4 py-8 text-[#111827]">
      <div className="mx-auto max-w-[430px] overflow-hidden rounded-[28px] border border-[#d1d5db] bg-white shadow-xl">
        <header className="border-b border-[#e5e7eb] px-5 py-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#1f6feb]">Beacon｜研灯</p><p className="mt-1 text-sm font-semibold">Live Demo Companion</p></div>
            <Smartphone className="size-5 text-[#6b7280]" />
          </div>
        </header>
        <div className="space-y-5 p-5">
          <div className="rounded-xl bg-[#f8fbff] p-4">
            <div className="flex items-center gap-2 text-xs text-[#138a5b]"><CircleDot className="size-3.5" /> Current case · Anker 2026Q1</div>
            <p className="mt-2 text-lg font-semibold">变化被看见，影响被理解，决策有据可循。</p>
          </div>

          <section>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#6b7280]">3 key insights</p>
            <div className="mt-3 space-y-3">
              {[
                ["归母净利润", "同比 -4.87%", "反证必须保留"],
                ["扣非归母净利润", "同比 +24.39%", "核心经营信号增强"],
                ["Human gate", "EG-01 / EG-02", "仍待专业复核"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-lg border border-[#e5e7eb] p-4">
                  <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#1f6feb]" /><p className="text-sm font-medium">{label}</p></div>
                  <p className="mt-2 font-mono text-lg font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-[#6b7280]">{note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#e5e7eb] p-4">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#6b7280]">Research trace</p>
            <p className="mt-3 text-sm leading-7 text-[#374151]">Source → Evidence → Validation → Claim → Human Review → Version</p>
          </section>

          <div className="rounded-lg bg-[#f3f4f6] p-3 text-xs leading-5 text-[#6b7280]">
            当前 Mobile Companion 为比赛辅助视图。跨设备实时同步与反馈提交仍需正式部署后验收。
          </div>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#1f6feb]"><ArrowLeft className="size-4" /> Back to desktop workspace</Link>
        </div>
      </div>
    </main>
  );
}
