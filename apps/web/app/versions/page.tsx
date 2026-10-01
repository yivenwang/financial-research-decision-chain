import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { VersionHistory } from "@/components/research/version-history";
import type { Metadata } from "next";
import suite from "@/components/beacon/suite.module.css";

export const metadata: Metadata = { title: "研究版本 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function VersionsPage() {
  return (
    <BeaconShell
      eyebrow="Version & commit"
      title="每次更新，都保留来时的路。"
      description="旧版本保持只读；人工审核动作、修订理由、导出与回滚都必须追加留痕。Commit 是研究版本更新，不是投资下单。"
    >
      <div className={`${suite.warning} mb-5`}>
        当前专业关卡 EG-01 / EG-02 仍为 Pending。任何版本状态都不能被解读为会计、估值或投资专业认可。
      </div>
      <p className={`${suite.subtle} mb-4`}>版本时间统一显示为北京时间（UTC+8）。</p>
      <div className={styles.surface}>
        <VersionHistory />
      </div>
    </BeaconShell>
  );
}
