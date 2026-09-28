"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileSearch, GitBranch, Layers3, Search, ShieldCheck } from "lucide-react";
import styles from "./home-entry.module.css";
import { BrandMark } from "./brand-mark";

const questions = [
  { label: "解释利润变化", text: "为什么安克表观利润下降，而扣非利润反而增长？" },
  { label: "核查证据来源", text: "安克创新2026Q1归母净利润同比下降的来源在哪里？" },
  { label: "理解决策影响", text: "安克创新2026Q1这次更新影响了哪些Claim和Assumption？" },
];
const steps = [
  { n: "01", title: "从问题开始", en: "QUESTION", copy: "先明确公司、期间和研究任务，再决定需要哪些材料。", icon: Search, href: "/questions" },
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
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Beacon 研灯首页"><BrandMark className={styles.brandMark} /><strong>Beacon <span>｜研灯</span></strong></Link>
        <nav className={styles.nav} aria-label="主导航"><a href="#workflow">研究方法</a><a href="#case">案例解读</a><a href="#boundaries">能力边界</a></nav>
        <Link className={styles.headerCta} href="/workspace">进入工作台 <ArrowUpRight size={16} /></Link>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.kicker}><span /> EVIDENCE BEFORE CONCLUSION</p>
          <h1>看见变化，<br /><span>照亮每一步判断。</span></h1>
          <p className={styles.lead}>在信息噪声中识别信号，在复杂研究中照亮决策路径。<br className={styles.desktopBreak} />从一个问题出发，让证据、影响与人的判断连成一条线。</p>
          <form id="ask" className={styles.questionCard} onSubmit={submit}>
            <label htmlFor="beacon-home-question"><Search size={17} /> 你的研究，从这里开始</label>
            <textarea id="beacon-home-question" aria-label="研究问题" value={question} maxLength={1000} onChange={event => setQuestion(event.target.value)} rows={2} />
            <div className={styles.questionActions}><span>当前范围 · 安克创新 2026Q1</span><button type="submit" disabled={question.trim().length <= 6}>开始研究 <ArrowRight size={17} /></button></div>
          </form>
          <div className={styles.exampleRow}><span>试着问</span>{questions.map(item => <button key={item.label} type="button" onClick={() => setQuestion(item.text)}>{item.label}<ArrowUpRight size={12} /></button>)}</div>
          <p className={styles.heroNote}><ShieldCheck size={14} /> AI 做流程，人做判断。确认研究任务后，才执行。</p>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.visualTop}><span>BEACON / RESEARCH SIGNAL</span><span className={styles.signalTag}>证据点亮研究</span></div>
          <LighthouseScene />
          <div className={styles.visualCaption}><span>From signal<br />to understanding.</span><small>让变化被看见<br />让影响被理解</small></div>
          <Link href="#case" className={styles.signalCard}>
            <div className={styles.signalCardHeading}><span><i /> S-05 · 案例预览</span><ArrowUpRight size={17} /></div>
            <h2>同一份财报，为什么呈现相反的信号？</h2>
            <div className={styles.signalMetrics}><div><span>归母净利润同比</span><strong>−4.87<small>%</small></strong></div><i /><div><span>扣非归母净利润同比</span><strong className={styles.positive}>+24.39<small>%</small></strong></div></div>
            <p>固定验证案例 · 非实时研究状态</p>
          </Link>
          <div className={styles.visualBottom}><span>来源可核查</span><span>影响可解释</span><span>判断有边界</span></div>
        </div>
      </section>
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

/** Decorative brand illustration; not a chart or a live data feed. */
function LighthouseScene() {
  return <svg className={styles.lighthouse} viewBox="0 0 600 430" fill="none" aria-hidden="true" focusable="false"><defs><linearGradient id="tower" x1="314" y1="150" x2="400" y2="330" gradientUnits="userSpaceOnUse"><stop stopColor="#bed7e5" /><stop offset=".4" stopColor="#709fb6" /><stop offset="1" stopColor="#203e5a" /></linearGradient><linearGradient id="beam" x1="344" y1="119" x2="0" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#a4f0e3" stopOpacity=".85" /><stop offset="1" stopColor="#79d6d5" stopOpacity="0" /></linearGradient><radialGradient id="halo"><stop stopColor="#8ee5de" stopOpacity=".25" /><stop offset="1" stopColor="#8ee5de" stopOpacity="0" /></radialGradient></defs><circle cx="348" cy="123" r="150" fill="url(#halo)" /><g stroke="#71a8bb" strokeOpacity=".12"><circle cx="348" cy="123" r="72" /><circle cx="348" cy="123" r="138" /><circle cx="348" cy="123" r="210" /><path d="M0 269h600M0 305h600M0 347h600M115 0v430M232 0v430M465 0v430" /></g><path className={styles.beam} d="M348 118 0 28v186z" fill="url(#beam)" /><path d="m348 118 252-50v104z" fill="#a4f0e3" opacity=".06" /><path d="m283 331 22-30 48-4 37 27 24-5 39 30 57 18 90 63H146l82-49z" fill="#0a2032" /><path d="m228 381 55-50 41 13 29-47 23 46 38-24 18 63" stroke="#427084" strokeOpacity=".3" /><path d="m321 152-21 173q46 16 85 0l-23-173z" fill="url(#tower)" /><path d="m321 177 44 22 5 36-53-24zm-9 70 63 28 4 31-71-31z" fill="#153a51" opacity=".75" /><path d="M310 147h61v12h-61z" fill="#95c3ce" /><path d="M314 130h54v18h-54z" fill="#183951" stroke="#90bfca" /><path d="M314 133h54m-47-3v18m13-18v18m13-18v18m13-18v18" stroke="#80aabb" /><path d="M324 101h33v28h-33z" fill="#b9eade" /><path d="M331 100v30m18-30v30" stroke="#284d5e" strokeWidth="3" /><path d="m316 101 25-19 24 19z" fill="#709db0" /><path d="M341 77v8" stroke="#a3c2cf" strokeWidth="2" /><path d="M300 325q43 16 85 0l9 14q-52 16-102 0z" fill="#15364b" /><circle cx="341" cy="114" r="7" fill="#f2ffed" /><g fill="#9ee3da"><circle cx="119" cy="200" r="3" /><circle cx="221" cy="246" r="3" /><circle cx="478" cy="219" r="3" /></g><path d="m62 227 57-27 102 46 111-44 146 17 65-45" stroke="#8ddbd6" strokeOpacity=".5" strokeDasharray="3 6" /><g fill="#83a5b4" fontSize="9" fontFamily="monospace" letterSpacing="2"><text x="74" y="186">EVIDENCE</text><text x="194" y="269">IMPACT</text><text x="450" y="242">REVIEW</text></g></svg>;
}
