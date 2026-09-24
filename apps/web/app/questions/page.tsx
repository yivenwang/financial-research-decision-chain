import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { QuestionWorkflow } from "@/components/research/question-workflow";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "研究提问 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function QuestionsPage() {
  return (
    <BeaconShell
      eyebrow="Ask · Question first"
      title="你想弄清什么？"
      description="先提出研究问题，再由 Research Contract 约束公司、期间、材料、输出与禁止动作。当前首批能力仍限定安克创新 / S-05 / 2026Q1 / C-04。"
    >
      <div className={`${styles.surface} rounded-xl border border-[#d1d5db] bg-white p-3 shadow-sm sm:p-5`}>
        <QuestionWorkflow />
      </div>
    </BeaconShell>
  );
}
