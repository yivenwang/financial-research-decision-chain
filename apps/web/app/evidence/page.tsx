import { BeaconShell } from "@/components/beacon/shell";
import { ArrowUpRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import { getSourceRecord } from "@/lib/source-records";
import { CurrentEvidence } from "@/components/beacon/current-evidence";
import styles from "@/components/beacon/suite.module.css";

export const metadata: Metadata = { title: "证据核验 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };
const items = [
  { id: "E-105", label: "归母净利润", value: "4.72 亿元", change: "同比 -4.87%", location: "P2", kind: "反证", note: "表面利润下降，不能被删除；必须与调整项共同解释。" },
  { id: "E-106", label: "扣非归母净利润", value: "5.47 亿元", change: "同比 +24.39%", location: "P2", kind: "支持", note: "支持核心经营表现强于归母净利润表面读数。" },
  { id: "E-107", label: "非经常性损益", value: "-0.75 亿元", change: "F-02 bridge", location: "P2–P3", kind: "支持", note: "解释归母与扣非之间的桥，但是否属于非核心仍需会计复核。" },
];
export default function EvidencePage() {
  const source = getSourceRecord("S-05");
  return <BeaconShell eyebrow="Evidence inspector" title="每个判断，都能回到来源。" description="选择一项当前证据，检查数值、页码、原文片段与人工审核状态。支持和反向证据都必须保留。">
    <CurrentEvidence />
    <section className={`${styles.panel} ${styles.sample}`} aria-labelledby="cross-company-scope">
      <div className={styles.panelTitle}><h2 id="cross-company-scope">跨公司验证与研究范围</h2></div>
      <p className={styles.subtle}>解析器与 F-02 法定利润桥已在公牛集团 2026Q1（603195.SH）进行隔离迁移验证：该次运行提取 10 项 strict 指标中的 7 项，利润桥精确闭合（差额 0）；受表头单位继承与跨页多表段布局限制，结果为 UNSUPPORTED_FORMAT / BLOCKED_REVIEW_REQUIRED，未形成完整 Evidence。当前研究语义层仍仅限安克创新 S-05 / 2026Q1 / C-04（anker-c04.v1），尚未为公牛建立 Claim / Assumption / Kill / Valuation / Decision；解析迁移验证不代表端到端研究支持。</p>
    </section>
    <details className={styles.sample}><summary><FileText size={16} />查看固定 S-05 案例 · 非当前研究数据</summary><div className={styles.sampleGrid}>{items.map(item => <article key={item.id} className={styles.sampleCard}><span className={styles.badge}>{item.id} · S-05 · {item.location} · {item.kind}</span><h3>{item.label}</h3><strong>{item.value}</strong><span className={styles.subtle}>{item.change}</span><p>{item.note}</p></article>)}</div><p className={styles.subtle}>安克创新 2026Q1 对 2025Q1；展示数值为约数。这些卡片不随本机版本更新，EG-01 / EG-02 仍待复核。</p>{source && <div className={styles.actions}><a className={styles.secondary} href={source.url} target="_blank" rel="noopener noreferrer">查看登记的原始 PDF <ArrowUpRight size={13} /></a></div>}</details>
  </BeaconShell>;
}
