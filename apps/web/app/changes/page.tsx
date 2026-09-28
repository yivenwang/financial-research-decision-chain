import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { UpdateWorkflow } from "@/components/research/update-workflow";
import type { Metadata } from "next";
import suite from "@/components/beacon/suite.module.css";

export const metadata: Metadata = { title: "变更审核 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function ChangesPage() {
  return (
    <BeaconShell
      eyebrow="Change review"
      title="新材料，如何改变当前研究？"
      description="上传已登记报告，核对来源与候选证据，再查看确定性计算和影响；由人确认后保存研究版本。"
    >
      <div className={suite.stepRail} aria-label="材料更新步骤">
        <div><small>01 · SOURCE</small><strong>选择并读取材料</strong><p>核对公司、期间与登记来源</p></div>
        <div><small>02 · EVIDENCE</small><strong>逐项审核证据</strong><p>保留原值、反证与阻断原因</p></div>
        <div><small>03 · VERSION</small><strong>查看影响并保存</strong><p>版本留痕，专业关卡继续待复核</p></div>
      </div>
      <div className={styles.surface}>
        <UpdateWorkflow />
      </div>
    </BeaconShell>
  );
}
