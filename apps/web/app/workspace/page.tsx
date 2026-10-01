import type { Metadata } from "next";
import { BeaconShell } from "@/components/beacon/shell";
import { WorkspaceDashboard } from "@/components/beacon/workspace-dashboard";

export const metadata: Metadata = { title: "研究工作台 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function WorkspacePage() {
  return (
    <BeaconShell
      eyebrow="Research workspace"
      title="让下一步研究，清晰可见。"
      description="查看本机已保存的研究版本、证据审核和规则影响，再进入具体任务。安克创新是首个验证案例。"
    >
      <WorkspaceDashboard />
    </BeaconShell>
  );
}
