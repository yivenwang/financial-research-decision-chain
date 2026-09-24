import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { UpdateWorkflow } from "@/components/research/update-workflow";

export default function ChangesPage() {
  return (
    <BeaconShell
      eyebrow="Change review"
      title="只审核真正改变研究状态的部分"
      description="复用现有 PDF → Evidence → Validation → Graph Diff → Human Review 工作流。NEW、CHANGED、AFFECTED、CONFLICTED 与 BLOCKED 才进入处理队列。"
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="text-xs text-[#6b7280]">Observed change</p><p className="mt-1 text-sm font-semibold">归母净利润同比 -4.87%</p></div>
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="text-xs text-[#6b7280]">Counter signal</p><p className="mt-1 text-sm font-semibold">扣非归母净利润同比 +24.39%</p></div>
        <div className="rounded-lg border border-[#d1d5db] bg-white p-4"><p className="text-xs text-[#6b7280]">Human gate</p><p className="mt-1 text-sm font-semibold text-[#a66500]">EG-01 / EG-02 pending</p></div>
      </div>
      <div className={`${styles.surface} rounded-xl border border-[#d1d5db] bg-white p-3 shadow-sm sm:p-5`}>
        <UpdateWorkflow />
      </div>
    </BeaconShell>
  );
}
