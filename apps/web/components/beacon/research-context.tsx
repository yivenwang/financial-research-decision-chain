"use client";

import { AlertTriangle, ArrowRight, CircleDot, HardDrive, ShieldAlert } from "lucide-react";
import { useCurrentResearch } from "./use-current-research";
import styles from "./suite.module.css";

export function ResearchContext() {
  const current = useCurrentResearch();
  return <section aria-label="当前研究范围与版本" data-testid="research-context" className={styles.context}>
    <span><HardDrive aria-hidden="true" /><strong>仅此浏览器</strong></span>
    {current.kind === "loading" && <span role="status">正在读取研究版本…</span>}
    {current.kind === "unreadable" && <span role="alert" className={styles.error}><AlertTriangle aria-hidden="true" />版本记录无法完整读取，原数据已保留</span>}
    {current.kind === "empty" && <><strong>当前版本 V-01 · 尚无材料更新</strong><span>已验证范围：安克 / S-05 / 2026Q1 / C-04</span><a href="/changes">处理材料 <ArrowRight aria-hidden="true" /></a></>}
    {current.kind === "ready" && <><span><CircleDot aria-hidden="true" /><strong>当前版本 {current.version.versionId}</strong></span><span>来源 {current.version.source?.sourceId ?? "未登记"} · {current.version.source?.period ?? "期间未注明"}</span><span>证据已核对 {current.version.evidence.filter(item => item.reviewStatus === "accepted").length}/{current.version.evidence.length}</span><span className={styles.pending}><ShieldAlert aria-hidden="true" />关卡 {current.version.blockedGates.join(" / ") || "无记录"}</span>{current.version.source?.sha256 && <span className={styles.hash} title={`源文件 SHA-256: ${current.version.source.sha256}`}>PDF SHA {current.version.source.sha256.slice(0, 8)}…</span>}</>}
  </section>;
}
