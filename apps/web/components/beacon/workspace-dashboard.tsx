"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, CheckCircle2, FileSearch, GitCompareArrows, History, MessageCircleQuestion, ShieldAlert, Telescope } from "lucide-react";
import { getSourceRecord } from "@/lib/source-records";
import type { StoredEvidence } from "@/lib/research-versions";
import { useCurrentResearch } from "./use-current-research";
import styles from "./suite.module.css";

const tasks = [
  { href: "/questions", label: "提出研究问题", detail: "确认范围和研究任务后再执行", icon: MessageCircleQuestion },
  { href: "/changes", label: "处理材料变化", detail: "上传、审核证据、保存新版本", icon: GitCompareArrows },
  { href: "/evidence", label: "核查证据来源", detail: "回到页码、数值、审核和反证", icon: FileSearch },
  { href: "/versions", label: "检查版本历史", detail: "查看审核、导出与回滚记录", icon: History },
];

function percent(item?: StoredEvidence) {
  if (!item || item.changePct == null) return "—";
  return (item.changePct > 0 ? "+" : "") + item.changePct.toFixed(2) + "%";
}

export function WorkspaceDashboard() {
  const current = useCurrentResearch();
  const version = current.kind === "ready" ? current.version : null;
  const accepted = version?.evidence.filter(item => item.reviewStatus === "accepted").length ?? 0;
  const pending = version?.evidence.filter(item => item.reviewStatus !== "accepted").length ?? 0;
  const source = version?.source?.sourceId ? getSourceRecord(version.source.sourceId) : null;
  const impact = version?.chain?.graphDiff;
  const attributable = version?.evidence.find(item => item.metricKey === "attributable_np");
  const adjusted = version?.evidence.find(item => item.metricKey === "adjusted_np");
  const nonRecurring = version?.evidence.find(item => item.metricKey === "non_recurring_total");
  const selected = attributable ?? version?.evidence[0];

  return <div className={styles.dashboard} data-testid="workspace-dashboard">
    {current.kind === "loading" && <section className={styles.panel} role="status"><p className={styles.subtle}>正在读取本机研究版本…</p></section>}
    {current.kind === "unreadable" && <section role="alert" className={styles.warning}><AlertTriangle size={17} /><strong>版本记录无法完整读取</strong><p>系统未清除原始数据，也不会用固定案例填充当前状态。请先核对本机版本记录。</p></section>}

    {current.kind === "empty" && <section className={styles.panel + " " + styles.empty + " " + styles.emptyWorkspace}>
      <div className={styles.emptyBeacon}><Telescope aria-hidden="true" /></div>
      <div><p className={styles.eyebrow}>QUESTION FIRST · RESEARCH WORKSPACE</p><h2>从一个问题，建立持续更新的研究状态。</h2><p>当前浏览器只有 V-01 基线，尚无材料更新。先提出问题，或导入已登记材料；系统将在有证据后生成变化、影响和待审核项。</p><div className={styles.actions}><Link href="/questions" className={styles.primary}>提出研究问题 <ArrowRight size={14} /></Link><Link href="/changes" className={styles.secondary}>导入研究材料 <ArrowUpRight size={14} /></Link></div></div>
      <ol className={styles.emptyFlow}><li><span>01</span><div><strong>Ask</strong><small>明确问题</small></div></li><li><span>02</span><div><strong>Diff</strong><small>识别变化</small></div></li><li><span>03</span><div><strong>Impact</strong><small>传播影响</small></div></li><li><span>04</span><div><strong>Review</strong><small>人工提交</small></div></li></ol>
    </section>}

    {version && <>
      <section className={styles.decisionSnapshot} aria-label="Decision Snapshot">
        <div className={styles.decisionHeader}>
          <div><p className={styles.eyebrow}>CURRENT RESEARCH · {version.versionId}</p><span className={styles.sourceLine}>{source?.name ?? version.source?.name ?? "未登记材料"} · {version.source?.period ?? "期间未注明"}</span></div>
          <span className={styles.statusPill}><i /> {version.source?.mode === "sample" ? "教学合成样例" : "人工研究记录"}</span>
        </div>
        <div className={styles.decisionBody}>
          <div className={styles.decisionCopy}>
            <span className={styles.microLabel}>DECISION SNAPSHOT</span>
            <h2>{version.claim.after === "成立" ? "核心盈利质量判断维持成立" : "当前判断：" + version.claim.after}</h2>
            <p>表观利润与扣非利润出现反向变化。确定性计算已完成，变化原因的专业定性仍需 EG-01 / EG-02 复核。</p>
            <div className={styles.actions}><Link className={styles.primary} href="/changes">处理审核队列 <ArrowRight size={14} /></Link><Link className={styles.secondary} href="/evidence">核查证据 <FileSearch size={14} /></Link></div>
          </div>
          <div className={styles.keyMetrics} aria-label="关键指标">
            <Metric label={attributable?.label ?? "归母净利润"} value={percent(attributable)} tone="down" meta={attributable?.location ?? "等待证据"} />
            <Metric label={adjusted?.label ?? "扣非归母净利润"} value={percent(adjusted)} tone="up" meta={adjusted?.location ?? "等待证据"} />
            <Metric label={nonRecurring?.label ?? "非经常性损益"} value={nonRecurring ? nonRecurring.valueMn.toFixed(2) : "—"} tone="neutral" meta={nonRecurring ? "CNY mn" : "等待证据"} />
          </div>
        </div>
      </section>

      <div className={styles.workspaceGrid}>
        <div className={styles.workspaceMain}>
          <section className={styles.panel}>
            <div className={styles.panelTitle}><div><p className={styles.microLabel}>WHAT CHANGED</p><h2>变化不是一个数字，而是一组相互约束的信号</h2></div><Link href="/changes">查看 Change Set <ArrowUpRight size={13} /></Link></div>
            <div className={styles.changeList}>
              {[attributable, adjusted, nonRecurring].filter(Boolean).map(item => <div key={item!.id} className={styles.changeRow}><span className={item!.direction === "反证" ? styles.signalNegative : styles.signalPositive}>{item!.direction}</span><div><strong>{item!.label}</strong><small>{item!.location} · {item!.reviewStatus === "accepted" ? "人工已核对" : "待核对"}</small></div><b>{item!.changePct == null ? item!.valueMn.toFixed(2) + " mn" : percent(item!)}</b></div>)}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelTitle}><div><p className={styles.microLabel}>WHAT MATTERS</p><h2>这次更新影响了什么</h2></div><span>{impact ? impact.changedNodeIds.length + " 个节点" : "等待 Graph Diff"}</span></div>
            {impact ? <ul className={styles.impactList}>{Object.entries(impact.reasons).slice(0, 5).map(([node, reason]) => <li key={node}><code>{node}</code><p>{reason}</p></li>)}</ul> : <p className={styles.subtle}>完成证据审核后，系统只沿已冻结的相关路径传播影响。</p>}
            <p className={styles.subtle}>规则影响说明不等于任意版本逐字段差分，也不替代最终研究判断。</p>
          </section>

          <section className={styles.healthPanel}>
            <div><p className={styles.microLabel}>RESEARCH HEALTH</p><h2>研究完整性</h2></div>
            <Health label="Source Coverage" value={version.source ? "已登记" : "缺失"} ok={Boolean(version.source)} />
            <Health label="Evidence Review" value={accepted + "/" + version.evidence.length} ok={accepted === version.evidence.length && version.evidence.length > 0} />
            <Health label="Calculation" value={version.formula?.consistent ? "F-02 闭合" : "待验证"} ok={Boolean(version.formula?.consistent)} />
            <Health label="Professional Gate" value={version.blockedGates.length ? version.blockedGates.length + " Pending" : "无记录"} ok={version.blockedGates.length === 0} />
          </section>
        </div>

        <aside className={styles.workspaceAside}>
          <section className={styles.panel + " " + styles.inspectorCard} aria-label="Evidence Inspector">
            <div className={styles.panelTitle}><div><p className={styles.microLabel}>EVIDENCE INSPECTOR</p><h2>关键证据</h2></div><Link href="/evidence">全部证据 <ArrowUpRight size={13} /></Link></div>
            {selected ? <>
              <span className={styles.evidenceTag}>{selected.id} · {selected.reviewStatus === "accepted" ? "VERIFIED" : "REVIEW"}</span>
              <h3>{selected.label}</h3>
              <div className={styles.inspectorValue}>{selected.valueMn.toFixed(8)} <small>CNY mn</small></div>
              <dl><dt>变化</dt><dd>{percent(selected)}</dd><dt>方向</dt><dd>{selected.direction}</dd><dt>位置</dt><dd>{selected.location}</dd><dt>来源</dt><dd>{selected.sourceId ?? version.source?.sourceId ?? "未登记"}</dd></dl>
              <blockquote>{selected.snippet}</blockquote>
            </> : <p className={styles.subtle}>当前版本没有可展示的证据。</p>}
          </section>

          <section className={styles.reviewCard}>
            <div><p className={styles.microLabel}>REVIEW QUEUE</p><strong>{pending + version.blockedGates.length}</strong><span>项需要人处理</span></div>
            <ul><li><Check size={14} />证据已核对 {accepted}/{version.evidence.length}</li>{version.blockedGates.map(gate => <li key={gate}><ShieldAlert size={14} />{gate} · Pending</li>)}</ul>
            <Link href="/changes">进入审核队列 <ArrowRight size={14} /></Link>
          </section>
        </aside>
      </div>
    </>}

    <section><div className={styles.panelTitle}><h2>继续你的研究</h2><span>四个任务，共享同一研究状态</span></div><div className={styles.tasks} aria-label="研究任务">{tasks.map(({ href, label, detail, icon: Icon }, i) => <Link key={href} href={href} className={styles.task}><div><Icon size={19} aria-hidden="true" /><span>0{i + 1}</span></div><h3>{label}</h3><p>{detail}</p><ArrowRight size={15} aria-hidden="true" /></Link>)}</div></section>
  </div>;
}

function Metric({ label, value, tone, meta }: { label: string; value: string; tone: "up" | "down" | "neutral"; meta: string }) {
  return <div className={styles.metric}><span>{label}</span><strong className={tone === "up" ? styles.metricUp : tone === "down" ? styles.metricDown : undefined}>{value}</strong><small>{meta}</small></div>;
}

function Health({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className={styles.healthItem}><span className={ok ? styles.healthOk : styles.healthPending}>{ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><div><strong>{label}</strong><small>{value}</small></div></div>;
}
