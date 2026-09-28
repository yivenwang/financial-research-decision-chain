"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, FileSearch, GitCompareArrows, History, MessageCircleQuestion, ShieldAlert, Telescope } from "lucide-react";
import { getSourceRecord } from "@/lib/source-records";
import { useCurrentResearch } from "./use-current-research";
import styles from "./suite.module.css";

const tasks = [
  { href: "/questions", label: "提出研究问题", detail: "确认范围和研究任务后再执行", icon: MessageCircleQuestion },
  { href: "/changes", label: "处理材料变化", detail: "上传、审核证据、保存新版本", icon: GitCompareArrows },
  { href: "/evidence", label: "核查证据来源", detail: "回到页码、数值、审核和反证", icon: FileSearch },
  { href: "/versions", label: "检查版本历史", detail: "查看审核、导出与回滚记录", icon: History },
];
export function WorkspaceDashboard() {
  const current = useCurrentResearch();
  const version = current.kind === "ready" ? current.version : null;
  const accepted = version?.evidence.filter(item => item.reviewStatus === "accepted").length ?? 0;
  const source = version?.source?.sourceId ? getSourceRecord(version.source.sourceId) : null;
  const impact = version?.chain?.graphDiff;
  const path = [
    ["材料与来源", version?.source ? `${version.source.sourceId} · ${version.source.period}${version.source.mode === "sample" ? " · 教学合成样例" : ""}` : "等待登记材料的本地解析"],
    ["证据与审核", version ? `${accepted} / ${version.evidence.length} 项证据人工已核对` : "原值、期间、单位与反证"],
    ["规则与影响", impact ? `${impact.changedNodeIds.length} 个规则影响节点` : "固定规则传播，不代替判断"],
    ["复核与版本", version ? `${version.versionId} · ${version.blockedGates.length} 项关卡待处理` : "人确认后，才保存研究更新"],
  ];
  return <div className={styles.dashboard} data-testid="workspace-dashboard">
    {current.kind === "loading" && <section className={styles.panel} role="status"><p className={styles.subtle}>正在读取本机研究版本…</p></section>}
    {current.kind === "unreadable" && <section role="alert" className={styles.warning}><AlertTriangle size={17} /><strong>版本记录无法完整读取</strong><p>系统未清除原始数据，也不会用固定案例填充当前状态。请先核对本机版本记录。</p></section>}
    <div className={styles.dashboardColumns}>
      <div className={styles.dashboard}>
        {current.kind === "empty" && <section className={`${styles.panel} ${styles.empty}`}><Telescope aria-hidden="true" /><p className={styles.eyebrow}>YOUR RESEARCH STARTS HERE · V-01</p><h2>从一个问题，建立有据可循的研究。</h2><p>本浏览器尚未保存材料更新。V-01 是研究基线，不代表已解析完整财报。先提出问题，或从已登记的 S-05 报告开始核对证据。</p><div className={styles.actions}><Link href="/questions" className={styles.primary}>提出研究问题 <ArrowRight size={14} /></Link><Link href="/changes" className={styles.secondary}>导入研究材料 <ArrowUpRight size={14} /></Link></div></section>}
        {version && <>
          <section className={`${styles.panel} ${styles.snapshot}`} aria-label="当前研究快照"><div className={styles.panelTitle}><p className={styles.eyebrow}>CURRENT RESEARCH · {version.versionId}</p><span className={styles.badge}>人工研究记录</span></div><h2>{source?.name ?? version.source?.name ?? "未登记材料名称"}</h2><p>规则状态：{version.decision}。这是一份待持续复核的研究记录，不构成正式投资建议。</p><div className={styles.snapshotMeta}><span>材料 {version.source?.sourceId ?? "—"} · {version.source?.period ?? "期间未注明"}</span><span>版本类型 {version.kind === "rollback" ? "回滚" : "材料更新"}</span>{version.parentVersionId && <span>承接 {version.parentVersionId}</span>}{version.source?.mode === "sample" && <span>教学合成样例 · 非真实 PDF</span>}</div><div className={styles.actions}><Link className={styles.primary} href="/questions">继续研究 <ArrowRight size={14} /></Link><Link className={styles.secondary} href="/evidence">核查当前证据 <FileSearch size={14} /></Link>{source && <a className={styles.secondary} href={source.url} target="_blank" rel="noopener noreferrer">来源 PDF <ArrowUpRight size={14} /></a>}</div></section>
          <section className={styles.stats} aria-label="研究状态摘要"><Summary label="证据审核" value={`${accepted} / ${version.evidence.length}`} note="当前版本人工接受的证据" icon={CheckCircle2} /><Summary label="规则影响节点" value={impact ? String(impact.changedNodeIds.length) : "—"} note="不是逐字段新旧差分" icon={GitCompareArrows} /><Summary label="待复核关卡" value={String(version.blockedGates.length)} note="不等于专业审核通过" icon={ShieldAlert} /></section>
        </>}
        {impact && <section className={styles.panel}><div className={styles.panelTitle}><h2>这次更新影响了什么</h2><Link href="/versions">版本详情 <ArrowUpRight size={13} /></Link></div><ul className={styles.impactList}>{Object.entries(impact.reasons).map(([node, reason]) => <li key={node}><code>{node}</code><p>{reason}</p></li>)}</ul><p className={styles.subtle}>以上为本次更新的规则影响说明，不是任意两个版本之间的字段对比。</p></section>}
      </div>
      <aside className={styles.dashboard}><section className={styles.panel}><div className={styles.panelTitle}><h2>一条完整的研究路径</h2></div><ol className={styles.path}>{path.map(([label, detail], i) => <li key={label}><span className={styles.pathNumber}>{i + 1}</span><div><h3>{label}</h3><p>{detail}</p></div></li>)}</ol></section><section className={styles.warning}><ShieldAlert size={16} /><strong>专业判断仍需人把关</strong><p>{version ? version.blockedGates.length ? `待处理：${version.blockedGates.join(" / ")}` : "此版本未记录阻断关卡；仍须独立核对正式判断。" : "EG-01 / EG-02 仍为待复核。"}<br />本机审核身份未经服务端验证。</p></section></aside>
    </div>
    <section><div className={styles.panelTitle}><h2>继续你的研究</h2><span>四个任务，同一份研究状态</span></div><div className={styles.tasks} aria-label="研究任务">{tasks.map(({ href, label, detail, icon: Icon }, i) => <Link key={href} href={href} className={styles.task}><div><Icon size={19} aria-hidden="true" /><span>0{i + 1}</span></div><h3>{label}</h3><p>{detail}</p><ArrowRight size={15} aria-hidden="true" /></Link>)}</div></section>
  </div>;
}
function Summary({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof CheckCircle2 }) {
  return <div className={styles.stat}><div>{label}<Icon aria-hidden="true" /></div><strong>{value}</strong><small>{note}</small></div>;
}
