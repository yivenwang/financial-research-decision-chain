"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, FileSearch } from "lucide-react";
import { getSourceRecord } from "@/lib/source-records";
import { useCurrentResearch } from "./use-current-research";
import styles from "./suite.module.css";

const number = (value: number) => Number.isFinite(value) ? value.toFixed(8) : "—";
export function CurrentEvidence() {
  const current = useCurrentResearch();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const version = current.kind === "ready" ? current.version : null;
  const selected = version?.evidence.find(item => item.id === selectedId) ?? version?.evidence[0];
  const source = version?.source?.sourceId ? getSourceRecord(version.source.sourceId) : null;
  const page = selected?.location.match(/(?:P|p|页)\s*(\d+)/)?.[1];
  return <section aria-label="当前研究版本的证据" data-testid="current-evidence">
    <div className={styles.panelTitle}><h2>当前浏览器研究版本</h2>{version && <span className={styles.badge}>{version.versionId}</span>}</div>
    {current.kind === "loading" && <div className={styles.panel} role="status"><p className={styles.subtle}>正在读取本机研究记录…</p></div>}
    {current.kind === "unreadable" && <p role="alert" className={styles.warning}>本机版本记录无法完整读取。原数据没有被清除；请核对版本历史，暂勿将固定案例视为当前结果。</p>}
    {current.kind === "empty" && <div className={`${styles.panel} ${styles.empty}`}><FileSearch aria-hidden="true" /><p className={styles.eyebrow}>EVIDENCE BEFORE CONCLUSION</p><h2>尚无已保存的材料更新版本</h2><p>先上传已登记的报告、核对候选证据，再由人确认保存。下方保留 S-05 固定案例供查看，不会作为当前版本的数据。</p><div className={styles.actions}><a href="/changes" className={styles.primary}>进入变更审核 <ArrowUpRight size={14} /></a></div></div>}
    {version && <>
      <div className={styles.evidenceInspector}>
        <div className={styles.evidenceList}>
          {version.evidence.length === 0 && <p className={styles.panel}>此版本没有可展示的证据。</p>}
          {version.evidence.map(item => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} aria-controls="evidence-detail" className={styles.evidenceItem} onClick={() => setSelectedId(item.id)}>
            <div className={styles.evidenceItemTop}><div><code>{item.id} · {item.location}</code><h3>{item.label}</h3></div><span className={`${styles.reviewStatus} ${item.reviewStatus === "accepted" ? styles.accepted : item.reviewStatus === "rejected" ? styles.rejected : styles.pending}`}>{item.reviewStatus === "accepted" ? <CheckCircle2 size={13} /> : item.reviewStatus === "rejected" ? <AlertTriangle size={13} /> : <CircleDot size={13} />}{item.reviewStatus === "accepted" ? "人工已核对" : item.reviewStatus === "rejected" ? "已退回" : "待核对"}</span></div>
            <div><span className={styles.evidenceValue}>{number(item.valueMn)} <small>CNY mn</small></span><span className={styles.evidenceChange}>同比：{item.changePct === null ? "—" : `${item.changePct.toFixed(2)}%`}</span></div>
          </button>)}
          <p className={styles.subtle}>专业关卡：{version.blockedGates.join(" / ") || "无记录"}。此处只读展示保存的证据，接受证据不等于接受投资结论。</p>
        </div>
        {selected && <aside id="evidence-detail" aria-label="所选证据详情" className={`${styles.panel} ${styles.inspector}`}><p className={styles.eyebrow}>EVIDENCE INSPECTOR</p><h3>{selected.label}</h3><dl><dt>证据 ID</dt><dd>{selected.id}</dd><dt>来源</dt><dd>{version.source?.sourceId ?? "未登记"} · {version.source?.period ?? "未注明"}</dd><dt>位置</dt><dd>{selected.location}</dd><dt>方向</dt><dd>{selected.direction}</dd><dt>材料类型</dt><dd>{version.source?.mode === "sample" ? "教学合成样例 · 非真实 PDF" : "本地解析 PDF"}</dd></dl><blockquote className={styles.quote}>{selected.snippet}</blockquote>{source && <a className={styles.secondary} href={source.url + (page ? `#page=${page}` : "")} target="_blank" rel="noopener noreferrer">核查登记的原始 PDF <ArrowUpRight size={13} /></a>}<p className={styles.subtle}>审核者身份未经验证；页码定位取决于 PDF 阅读器。请结合原文和版本记录核查。</p></aside>}
      </div>
    </>}
  </section>;
}
