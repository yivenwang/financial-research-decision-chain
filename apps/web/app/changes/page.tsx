import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { UpdateWorkflow } from "@/components/research/update-workflow";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "变更审核 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function ChangesPage() {
  return (
    <BeaconShell
      eyebrow="Change review"
      title="只审核真正改变研究状态的部分"
      description="上传已登记报告，核对来源与候选证据，再查看确定性计算和影响；由人确认后保存研究版本。"
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="材料更新步骤">
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="font-mono text-xs text-[#1f6feb]">01 · SOURCE</p><p className="mt-1 text-sm font-semibold">选择并读取材料</p><p className="mt-1 text-xs text-[#6b7280]">核对公司、期间与登记来源</p></div>
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="font-mono text-xs text-[#1f6feb]">02 · EVIDENCE</p><p className="mt-1 text-sm font-semibold">逐项审核证据</p><p className="mt-1 text-xs text-[#6b7280]">保留原值、反证与阻断原因</p></div>
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="font-mono text-xs text-[#1f6feb]">03 · VERSION</p><p className="mt-1 text-sm font-semibold">查看影响并保存</p><p className="mt-1 text-xs text-[#6b7280]">版本留痕，专业关卡继续待复核</p></div>
      </div>
      <div className={`${styles.surface} rounded-xl border border-[#d1d5db] bg-white p-3 shadow-sm sm:p-5`}>
        <UpdateWorkflow />
      </div>
    </BeaconShell>
  );
}
