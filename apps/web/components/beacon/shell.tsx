import Link from "next/link";
import { ChevronRight, CircleHelp, HardDrive } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { BeaconNavigation } from "./navigation";
import { ResearchContext } from "./research-context";
import styles from "./suite.module.css";

export function BeaconShell({ children, eyebrow, title, description }: {
  children: React.ReactNode; eyebrow: string; title: string; description: string;
}) {
  return (
    <div className={styles.shell}>
      <a href="#beacon-content" className={styles.skip}>跳至主要内容</a>
      <aside className={styles.sidebar}>
        <Link href="/" aria-label="Beacon 研灯首页" className={styles.brand}><BrandMark className={styles.brandMark} /><span><strong>Beacon｜研灯</strong><small>INSIGHT LIGHTS THE WAY</small></span></Link>
        <div className={styles.space}><span>RESEARCH SPACE</span><strong>安克创新 · 首个验证案例</strong><small>300866.SZ / 2026Q1</small></div>
        <p className={styles.navCaption}>研究工作空间</p>
        <BeaconNavigation />
        <div className={styles.sidebarFoot}><Link href="/help"><CircleHelp size={15} />使用说明与边界</Link><p>AI 做流程，人做判断。<br />每次研究更新，都有据可循。</p></div>
      </aside>
      <div className={styles.body}>
        <header className={styles.topbar}><div className={styles.breadcrumb}><Link href="/workspace">研究空间</Link><ChevronRight size={12} /><strong>{eyebrow.split(" · ")[0]}</strong></div><span className={styles.topbarMeta}><HardDrive size={12} /> 本机工作区 <i /></span></header>
        <main id="beacon-content" className={styles.main}>
          <section className={styles.heading}><div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.description}>{description}</p></div><span className={styles.pageNumber}>RESEARCH / DESKTOP</span></section>
          <ResearchContext />
          {children}
          <footer className={styles.footer}><span>证据先于结论 · 专业判断由人把关 · 不是投资建议</span><Link href="/help">本机存储、模型配置与使用说明 ↗</Link></footer>
        </main>
      </div>
    </div>
  );
}
