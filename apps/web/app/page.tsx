import { BeaconShell } from "@/components/beacon/shell";
import { WorkspaceOverview } from "@/components/beacon/workspace-overview";

export default function Home() {
  return (
    <BeaconShell
      eyebrow="Research workspace · Anker Innovations 300866.SZ"
      title="Research state, not another AI answer"
      description="Beacon 维护持续变化、可核验、可提交版本的研究状态。当前页面只展示已有 S-05 / C-04 验证链与真实待复核状态。"
    >
      <WorkspaceOverview />
    </BeaconShell>
  );
}
