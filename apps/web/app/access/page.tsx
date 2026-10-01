import type { Metadata } from "next";
import { REVIEW_ACCESS_DEADLINE_LABEL } from "@/lib/reviewer-access";
import { AccessForm } from "./access-form";

export const metadata: Metadata = { title: "内部审验 · Beacon｜研灯", robots: { index: false, follow: false, nocache: true } };

export default function AccessPage() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
    <section className="w-full max-w-md rounded-2xl border border-cyan-300/20 bg-slate-900/90 p-7 shadow-2xl shadow-cyan-950/30">
      <p className="text-xs font-semibold tracking-[0.22em] text-cyan-300">BEACON · INTERNAL REVIEW</p>
      <h1 className="mt-3 text-3xl font-semibold">内部审验入口</h1>
      <p className="mt-3 leading-7 text-slate-300">请输入项目负责人提供的访问码。本轮审验权限统一于 {REVIEW_ACCESS_DEADLINE_LABEL} 截止，不因刷新页面或重新登录而延长。</p>
      <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">本系统与研究材料仅限受邀审验。请勿转发、录屏、复制或用于其他项目。</div>
      <AccessForm />
    </section>
  </main>;
}
