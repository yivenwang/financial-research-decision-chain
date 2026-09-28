import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/legacy-light.module.css";
import { QuestionWorkflow } from "@/components/research/question-workflow";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "研究提问 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams;
  const initialQuestion = typeof params.q === "string" && params.q.trim() ? params.q.trim().slice(0, 1000) : undefined;
  return (
    <BeaconShell
      eyebrow="Ask · Question first"
      title="你想弄清什么？"
      description="先明确研究问题，再确认公司、期间和材料范围。每个事实附来源，证据不足时停下来；当前支持安克 S-05 / 2026Q1 / C-04。"
    >
      <div className={styles.surface}>
        <QuestionWorkflow key={initialQuestion ?? "default"} initialQuestion={initialQuestion} />
      </div>
    </BeaconShell>
  );
}
