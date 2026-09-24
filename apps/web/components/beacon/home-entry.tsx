"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileSearch,
  GitCompareArrows,
  History,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import styles from "./home-entry.module.css";

const defaultQuestion = "为什么安克表观利润下降，而扣非利润反而增长？";

const capabilities = [
  {
    icon: FileSearch,
    title: "Traceable Evidence",
    copy: "Every material change stays linked to a source, location, period and reviewed value.",
    meta: "Source → Evidence",
  },
  {
    icon: ShieldCheck,
    title: "Research Health",
    copy: "See what is validated, conflicted, missing or blocked before a conclusion moves forward.",
    meta: "Validation → Gate",
  },
  {
    icon: GitCompareArrows,
    title: "Decision Updates",
    copy: "Review only what changed, understand downstream impact, then commit a new research version.",
    meta: "Diff → Review → Version",
  },
];

const trace = [
  ["Source", "12 registered"],
  ["Evidence", "reviewed facts"],
  ["Calculation", "deterministic"],
  ["Claim", "impact-aware"],
  ["Review", "human gate"],
  ["Version", "auditable"],
];

export function HomeEntry() {
  const router = useRouter();
  const [question, setQuestion] = useState(defaultQuestion);
  const ready = useMemo(() => question.trim().length > 6, [question]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    router.push(`/questions?q=${encodeURIComponent(question.trim())}`);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Beacon 研灯首页">
          <span className={styles.brandMark}>B</span>
          <span className={styles.brandWord}>
            <strong>BEACON</strong>
            <small>研灯 · RESEARCH INTELLIGENCE</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          <Link href="/questions">Ask</Link>
          <Link href="/changes">Workspace</Link>
          <Link href="/evidence">Evidence</Link>
          <Link href="/versions">Versions</Link>
        </nav>

        <div className={styles.headerNote}>
          <span>TRUSTED EVIDENCE</span>
          <i />
          <span>CONTROLLED DECISIONS</span>
        </div>
      </header>

      <section className={styles.hero}>
        <ResearchSignalField />

        <div className={styles.heroContent}>
          <p className={styles.kicker}>QUESTION FIRST · EVIDENCE BEFORE CONCLUSION</p>
          <h1>
            From change
            <br />
            <span>to conviction.</span>
          </h1>
          <p className={styles.lead}>
            让变化被看见，让影响被理解，让决策有据可循。
            <br />
            Beacon 把研究问题变成可核验、可审核、可版本化的研究状态。
          </p>

          <form className={styles.questionCard} onSubmit={submit}>
            <label htmlFor="beacon-home-question">你想弄清什么？</label>
            <div className={styles.questionInputRow}>
              <Search aria-hidden="true" />
              <textarea
                id="beacon-home-question"
                aria-label="研究问题"
                value={question}
                maxLength={1000}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
              />
            </div>

            <div className={styles.questionActions}>
              <div className={styles.scope}>
                <CircleDot />
                <span>Current validated scope · Anker 2026Q1</span>
              </div>
              <button type="submit" disabled={!ready}>
                Start research
                <ArrowRight />
              </button>
            </div>
          </form>

          <div className={styles.heroLinks}>
            <Link href="/changes">
              Open current workspace
              <ArrowRight />
            </Link>
            <span>Question → Contract → Evidence → Diff → Review → Version</span>
          </div>
        </div>

        <aside className={styles.preview} aria-label="Current research preview">
          <div className={styles.previewBar}>
            <span className={styles.previewDots}><i /><i /><i /></span>
            <span>Current research</span>
            <span className={styles.previewStatus}><CircleDot /> REVIEW REQUIRED</span>
          </div>

          <div className={styles.previewBody}>
            <div className={styles.previewQuestion}>
              <small>Research question</small>
              <strong>Why did reported profit decline while adjusted profit increased?</strong>
            </div>

            <div className={styles.snapshot}>
              <div className={styles.snapshotTop}>
                <span>Decision snapshot</span>
                <em>Draft</em>
              </div>
              <p>核心经营表现强于归母利润表面读数，但关键会计定性仍需人工复核。</p>
            </div>

            <div className={styles.metricGrid}>
              <Metric label="Reported NP" value="-4.87%" tone="down" />
              <Metric label="Adjusted NP" value="+24.39%" tone="up" />
              <Metric label="Non-recurring" value="-75.16 mn" tone="plain" />
            </div>

            <div className={styles.previewColumns}>
              <div>
                <span className={styles.sectionLabel}>WHAT CHANGED</span>
                <p>Reported NP ↓ while adjusted NP ↑</p>
                <p>Counter-evidence remains visible</p>
              </div>
              <div>
                <span className={styles.sectionLabel}>RESEARCH HEALTH</span>
                <HealthRow label="Source coverage" state="Validated" />
                <HealthRow label="Calculation" state="Passed" />
                <HealthRow label="Professional gate" state="Pending" pending />
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className={styles.capabilitySection}>
        <div className={styles.capabilityHeading}>
          <div>
            <p>BUILT FOR RESEARCH THAT CHANGES</p>
            <h2>Not another answer. A controlled research state.</h2>
          </div>
          <p>
            Generic AI can generate a response. Beacon preserves the evidence, deterministic checks,
            conflicts, human review and version history behind a changing conclusion.
          </p>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map(({ icon: Icon, title, copy, meta }, index) => (
            <article key={title} className={styles.capabilityCard}>
              <div className={styles.capabilityTop}>
                <span><Icon /></span>
                <small>0{index + 1}</small>
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <strong>{meta}<ArrowRight /></strong>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.traceSection}>
        <div className={styles.traceTitle}>
          <div>
            <Layers3 />
            <span>
              <small>RESEARCH TRACE</small>
              <strong>Every conclusion keeps its lineage.</strong>
            </span>
          </div>
          <Link href="/evidence">Inspect evidence <ArrowRight /></Link>
        </div>

        <div className={styles.traceRail}>
          {trace.map(([label, meta], index) => (
            <div key={label} className={styles.traceNode}>
              <span className={styles.traceDot}>{index === 4 ? <CheckCircle2 /> : index + 1}</span>
              <div><strong>{label}</strong><small>{meta}</small></div>
              {index < trace.length - 1 && <i />}
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>BEACON｜研灯</strong>
          <span>Evidence before conclusion.</span>
        </div>
        <p>Research state & decision change control</p>
      </footer>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "plain" }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong className={tone === "up" ? styles.up : tone === "down" ? styles.down : ""}>{value}</strong>
    </div>
  );
}

function HealthRow({ label, state, pending = false }: { label: string; state: string; pending?: boolean }) {
  return (
    <div className={styles.healthRow}>
      <span>{label}</span>
      <strong className={pending ? styles.pending : styles.passed}>
        {pending ? <Sparkles /> : <CheckCircle2 />}
        {state}
      </strong>
    </div>
  );
}

function ResearchSignalField() {
  return (
    <div className={styles.signalField} aria-hidden="true">
      <svg viewBox="0 0 780 620" role="presentation">
        <defs>
          <linearGradient id="beacon-line" x1="0" x2="1">
            <stop offset="0" stopColor="#bed4f5" stopOpacity=".15" />
            <stop offset=".52" stopColor="#1f6feb" stopOpacity=".45" />
            <stop offset="1" stopColor="#8cc9ba" stopOpacity=".2" />
          </linearGradient>
          <radialGradient id="beacon-glow">
            <stop offset="0" stopColor="#1f6feb" stopOpacity=".18" />
            <stop offset="1" stopColor="#1f6feb" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="420" cy="300" r="250" fill="url(#beacon-glow)" />
        <path className={styles.signalPath} d="M50 415 C170 330 195 240 305 260 S465 400 570 330 S650 210 735 245" />
        <path className={styles.signalPathMuted} d="M80 170 C220 235 315 135 430 190 S580 290 720 145" />
        <path className={styles.signalPathMuted} d="M120 510 C255 460 300 515 410 440 S585 420 690 505" />
        <g className={styles.signalNodeA}><circle cx="305" cy="260" r="8" /><circle cx="305" cy="260" r="18" /></g>
        <g className={styles.signalNodeB}><circle cx="570" cy="330" r="8" /><circle cx="570" cy="330" r="18" /></g>
        <g className={styles.signalNodeC}><circle cx="430" cy="190" r="7" /><circle cx="430" cy="190" r="16" /></g>
        <g className={styles.signalNodeD}><circle cx="410" cy="440" r="7" /><circle cx="410" cy="440" r="16" /></g>
      </svg>
    </div>
  );
}
