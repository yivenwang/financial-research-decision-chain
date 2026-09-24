import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { VersionHistory } from "@/components/research/version-history";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "研究版本 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function VersionsPage() {
  return (
    <BeaconShell
      eyebrow="Version & commit"
      title="AI 不能自动提交正式研究状态"
      description="旧版本保持只读；人工审核动作、修订理由、导出与回滚都必须追加留痕。Commit 是研究版本更新，不是投资下单。"
    >
      <div className="mb-5 rounded-lg border border-[#f3c37a] bg-[#fff8e8] px-4 py-3 text-sm text-[#7a4d00]">
        当前专业关卡 EG-01 / EG-02 仍为 Pending。任何版本状态都不能被解读为会计、估值或投资专业认可。
      </div>
      <div className={`${styles.surface} rounded-xl border border-[#d1d5db] bg-white p-3 shadow-sm sm:p-5`}>
        <VersionHistory />
      </div>
    </BeaconShell>
  );
}
