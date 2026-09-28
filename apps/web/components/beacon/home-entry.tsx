"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileSearch, GitBranch, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import styles from "./home-entry.module.css";
import { BrandMark } from "./brand-mark";

const questions = [
  { label: "解释利润变化", text: "为什么安克表观利润下降，而扣非利润反而增长？" },
  { label: "核查证据来源", text: "安克创新2026Q1归母净利润同比下降的来源在哪里？" },
  { label: "理解决策影响", text: "安克创新2026Q1这次更新影响了哪些Claim和Assumption？" },
];
const steps = [
  { n: "01", title: "从问题开始", en: "QUESTION", copy: "先明确公司、期间和研究任务，再决定需要哪些材料。", icon: Sparkles, href: "/questions" },
  { n: "02", title: "让证据说话", en: "EVIDENCE", copy: "每项事实保留来源、页码和人工审核记录，反证同样可见。", icon: FileSearch, href: "/evidence" },
  { n: "03", title: "理解变化的影响", en: "IMPACT", copy: "沿既有研究链查看规则传播，区分事实、推论与未知。", icon: GitBranch, href: "/changes" },
  { n: "04", title: "由人确认下一步", en: "REVIEW & COMMIT", copy: "关键判断由人把关，研究更新可追溯、可导出、可回滚。", icon: ShieldCheck, href: "/versions" },
];
const caseStages = [
  { label: "看见变化", title: "两个利润指标，两个方向。", copy: "归母净利润同比 −4.87%，扣非归母净利润同比 +24.39%。反向变化都被保留，而不是只挑支持结论的数字。", meta: "S-05 · 2026Q1 对 2025Q1 · 第 2 页" },
  { label: "理解影响", title: "先核对桥，再解释原因。", copy: "F-02 核对归母净利润、非经常性损益与扣非归母净利润的闭合关系。计算成立，不等于调整项已获得会计定性。", meta: "F-02 · 确定性计算 · 非经常性损益 −75.16 CNY mn（约数）" },
  { label: "人工把关", title: "保留未知，不自动越过关卡。", copy: "EG-01 / EG-02 保持待复核。AI 可以解释证据，不能替代会计定性、估值复核或最终投资判断。", meta: "专业复核待完成 · 不是投资建议" },
];

export function HomeEntry() {
  const router = useRouter();
  const [question, setQuestion] = useState(questions[0].text);
  const [stage, setStage] = useState(0);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length > 6) router.push(`/questions?q=${encodeURIComponent(question.trim())}`);
  }
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#ask">跳至研究问题</a>
      <div className={styles.heroFrame}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Beacon 研灯首页"><BrandMark className={styles.brandMark} /><strong>Beacon <span>｜研灯</span></strong></Link>
          <nav className={styles.nav} aria-label="主导航"><a href="#workflow">研究方法</a><a href="#case">案例解读</a><a href="#boundaries">能力边界</a></nav>
          <Link className={styles.headerCta} href="/workspace">进入工作台 <ArrowUpRight size={16} /></Link>
        </header>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <p className={styles.kicker}><span /> RESEARCH DECISION INFRASTRUCTURE</p>
            <h1>Insight Today.<br /><span>A Brighter Tomorrow.</span></h1>
            <p className={styles.chineseTitle}>让变化被看见，让影响被理解，让决策有据可循。</p>
            <p className={styles.lead}>Beacon 从问题出发，把新信息转化为可核验的证据、可解释的影响和需要人重新判断的事项。</p>
            <form id="ask" className={styles.questionCard} onSubmit={submit}>
              <label htmlFor="beacon-home-question"><Sparkles size={16} /> 你现在想弄清什么？</label>
              <textarea id="beacon-home-question" aria-label="研究问题" value={question} maxLength={1000} onChange={event => setQuestion(event.target.value)} rows={2} />
              <div className={styles.questionActions}><span>安克创新 · S-05 · 2026Q1</span><button type="submit" disabled={question.trim().length <= 6}>开始研究 <ArrowRight size={17} /></button></div>
            </form>
            <div className={styles.exampleRow}><span>示例</span>{questions.map(item => <button key={item.label} type="button" onClick={() => setQuestion(item.text)}>{item.label}<ArrowUpRight size={12} /></button>)}</div>
            <p className={styles.heroNote}><ShieldCheck size={14} /> AI 提议 · 确定性程序校验 · 人工审核后提交</p>
          </div>
          <Link href="#case" className={styles.signalCard}>
            <div className={styles.signalCardHeading}><span><i /> LIVE CASE / S-05</span><ArrowUpRight size={17} /></div>
            <h2>同一份财报，两个相反的利润信号。</h2>
            <div className={styles.signalMetrics}><div><span>归母净利润同比</span><strong>−4.87<small>%</small></strong></div><i /><div><span>扣非归母净利润同比</span><strong className={styles.positive}>+24.39<small>%</small></strong></div></div>
            <p>固定验证案例 · 来源、计算与人工状态均可追溯</p>
          </Link>
          <div className={styles.heroRail}><span>SIGNAL</span><i /><span>EVIDENCE</span><i /><span>IMPACT</span><i /><span>REVIEW</span></div>
        </section>
      </div>
      <div className={styles.manifesto}><span>让变化被看见，让影响被理解，让决策有据可循。</span><a href="#workflow">了解研究链路 <ArrowDown size={15} /></a></div>
      <section id="workflow" className={styles.workflow}>
        <div className={styles.sectionHeading}><div><p className={styles.kicker}>A CLEAR PATH THROUGH COMPLEXITY</p><h2>不是一个答案，<br />而是一条经得起追问的研究链。</h2></div><p>新材料会改变旧判断。Beacon 将材料、证据、规则影响与人工审阅保留在同一条路径上，让每次更新都有来处。</p></div>
        <div className={styles.steps}>{steps.map(({ n, title, en, copy, icon: Icon, href }) => <Link key={n} href={href} className={styles.step}><div className={styles.stepTop}><Icon size={22} /><span>{n}</span></div><small>{en}</small><h3>{title}</h3><p>{copy}</p><ArrowRight className={styles.stepArrow} size={18} /></Link>)}</div>
      </section>
      <section id="case" className={styles.caseSection}>
        <div className={styles.caseIntro}><p className={styles.kicker}>ONE CASE. A VISIBLE RESEARCH PROCESS.</p><h2>好研究，不回避<br /><span>相反的证据。</span></h2><p>安克创新只是首个验证案例。这里展示研究方法，而不是对公司的投资推荐。</p><Link href="/evidence">打开证据核验 <ArrowUpRight size={16} /></Link></div>
        <div className={styles.casePanel}><div className={styles.casePanelTop}><span><Layers3 size={16} /> 安克创新 · 2026Q1</span><small>固定 S-05 案例</small></div><div className={styles.caseTabs} role="tablist" aria-label="案例研究步骤">{caseStages.map((item, index) => <button key={item.label} role="tab" id={`case-tab-${index}`} aria-selected={stage === index} aria-controls="case-panel" tabIndex={stage === index ? 0 : -1} onClick={() => setStage(index)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (stage + (event.key === "ArrowRight" ? 1 : 2)) % 3; setStage(next); document.getElementById(`case-tab-${next}`)?.focus(); } }}><span>0{index + 1}</span>{item.label}</button>)}</div><div id="case-panel" role="tabpanel" aria-labelledby={`case-tab-${stage}`} className={styles.caseContent}><h3>{caseStages[stage].title}</h3><p>{caseStages[stage].copy}</p><small>{caseStages[stage].meta}</small></div></div>
      </section>
      <section id="boundaries" className={styles.boundaries}><div><p className={styles.kicker}>BUILT WITH BOUNDARIES</p><h2>可信，也来自知道何时停下。</h2><p>已实现的能力、尚待验证的部分，都应清楚可见。</p></div><ul><li><Check size={17} /><span><strong>证据有出处</strong>来源、页码、期间与审核状态一起保留。</span></li><li><Check size={17} /><span><strong>判断由人负责</strong>专业关卡待复核，不生成正式投资建议。</span></li><li><Check size={17} /><span><strong>能力有明确范围</strong>当前为安克 S-05 / 2026Q1；记录仅保存在此浏览器。</span></li></ul></section>
      <footer className={styles.footer}><div><BrandMark className={styles.brandMark} /><strong>Beacon｜研灯</strong><span>Insight lights the way.</span></div><Link href="/help">使用说明与边界 <ArrowUpRight size={14} /></Link></footer>
    </main>
  );
}
