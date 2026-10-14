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
        <div><small>01</small><strong>提交材料</strong><p>核对公司、期间与来源</p></div>
        <div><small>02</small><strong>人工核验</strong><p>逐条保留原值与审核记录</p></div>
        <div><small>03</small><strong>预览影响</strong><p>查看冻结计算与阻断原因</p></div>
        <div><small>04</small><strong>保存版本</strong><p>追加历史，专业门禁保留</p></div>
        <div><small>05</small><strong>继续研究</strong><p>返回问题，由人确认执行</p></div>
      </div>
      <div className={styles.surface}>
        <UpdateWorkflow />
      </div>
    </BeaconShell>
  );
}
