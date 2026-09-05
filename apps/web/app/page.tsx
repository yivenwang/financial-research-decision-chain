"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  FileCheck2,
  FileSearch,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpdateWorkflow } from "@/components/research/update-workflow";
import { VersionHistory } from "@/components/research/version-history";
import { BlindTestReport } from "@/components/research/blind-test-report";

type Evidence = {
  id: string;
  direction: "支持" | "反证";
  label: string;
  value: string;
  change: string;
  location: string;
  explanation: string;
};

const evidence: Evidence[] = [
  {
    id: "E-105",
    direction: "反证",
    label: "归母净利润",
    value: "4.72 亿元",
    change: "同比 -4.87%",
    location: "S-05 · P2",
    explanation:
      "表面利润下降，直接反对“核心经营更强”的判断；它不能被删除，只能与调整项一起解释。",
  },
  {
    id: "E-106",
    direction: "支持",
    label: "扣非归母净利润",
    value: "5.47 亿元",
    change: "同比 +24.39%",
    location: "S-05 · P2",
    explanation:
      "扣除非经常项目后利润增长，支持核心经营表现强于归母净利润表面读数。",
  },
  {
    id: "E-107",
    direction: "支持",
    label: "非经常性损益",
    value: "-0.75 亿元",
    change: "公允价值等项目",
    location: "S-05 · P2–P3",
    explanation:
      "负向调整解释了归母与扣非利润之间的差额，但其是否真正“非核心”仍需会计复核。",
  },
];

const contractEntities = [
  {
    name: "Source",
    count: 12,
    role: "原始材料与样本边界",
    fields: ["source_id", "period", "role", "use_status", "location"],
  },
  {
    name: "Evidence",
    count: 15,
    role: "可定位的事实与方向",
    fields: ["evidence_id", "source_id", "direction", "claim_id", "confidence"],
  },
  {
    name: "Claim",
    count: 14,
    role: "可被强化或推翻的判断",
    fields: ["claim_id", "update_signal", "assumption_ids", "kill_criteria_ids"],
  },
  {
    name: "Assumption",
    count: 14,
    role: "证据与结论之间的推断",
    fields: ["assumption_id", "observation_window", "required_reviewer", "risk_level"],
  },
  {
    name: "Metric / Formula",
    count: 20,
    role: "确定性计算层",
    fields: ["metric_id", "current_value", "formula_id", "input_metric_ids", "test_status"],
  },
  {
    name: "Decision / Version",
    count: 21,
    role: "人工决策与历史快照",
    fields: ["action", "blocked_gate_ids", "version_id", "decision_change", "status"],
  },
  {
    name: "KillCriterion",
    count: 13,
    role: "论点失效与重算规则",
    fields: ["kill_id", "claim_ids", "trigger_rule", "observation_window", "current_state"],
  },
  {
    name: "ValuationScenario",
    count: 10,
    role: "估值情景与审阅关卡",
    fields: ["scenario_id", "normalized_earnings", "valuation_multiple", "implied_price", "review_gate"],
  },
  {
    name: "EvaluationResult",
    count: 10,
    role: "留出测试与评分证据",
    fields: ["evaluation_id", "dataset_split", "criterion_id", "score", "blocking_issue"],
  },
];

const chain = ["S-05", "E-105/106/107", "C-04", "A-03 / K-07", "F-02", "Decision"];

function DirectionBadge({ direction }: { direction: Evidence["direction"] }) {
  const positive = direction === "支持";
  return (
    <Badge
      variant="outline"
      className={
        positive
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
          : "border-rose-400/30 bg-rose-400/10 text-rose-300"
      }
    >
      {positive ? <Check /> : <AlertTriangle />}
      {direction}
    </Badge>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
      {children}
    </p>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" | "good" }) {
  const toneClass =
    tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-slate-100";
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5">
      <p className="text-[13px] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function Home() {
  const [selectedId, setSelectedId] = useState("E-106");
  const [calcStatus, setCalcStatus] = useState<"ready" | "running" | "done">("ready");

  const selectedEvidence = useMemo(
    () => evidence.find((item) => item.id === selectedId) ?? evidence[0],
    [selectedId],
  );

  const attributableProfit = 471.59418971;
  const nonRecurring = -75.16470719;
  const adjustedProfit = attributableProfit - nonRecurring;

  function runFormula() {
    setCalcStatus("running");
    window.setTimeout(() => setCalcStatus("done"), 520);
  }

  return (
    <main className="min-h-screen px-4 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1580px]">
        <header className="mb-4 flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/65 px-5 py-4 shadow-2xl shadow-slate-950/30 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
              <GitBranch className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                  安克创新研究决策链
                </h1>
                <Badge className="bg-rose-300 text-rose-950">MVP · Blind Test 01</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                300866.SZ · S-06 盲测结果已锁定 · As of 2026-09-04
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-200">
              <CircleDot /> QA · FAIL
            </Badge>
            <Badge variant="outline" className="border-rose-300/30 bg-rose-300/10 text-rose-200">
              <ShieldCheck /> 6 个阻塞 FAIL
            </Badge>
            <Badge variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-300">
              <LockKeyhole /> S-06 · 已用 / 0 次正式引用
            </Badge>
          </div>
        </header>

        <Tabs defaultValue="blind-test" className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl border border-white/10 bg-slate-950/70 p-1">
            <TabsTrigger
              value="blind-test"
              className="h-9 px-4 text-slate-400 data-[state=active]:bg-rose-300 data-[state=active]:text-rose-950"
            >
              <FlaskConical /> 盲测报告
            </TabsTrigger>
            <TabsTrigger
              value="update"
              className="h-9 px-4 text-slate-400 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950"
            >
              <FileCheck2 /> 材料更新
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="h-9 px-4 text-slate-400 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950"
            >
              <History /> 版本历史
            </TabsTrigger>
            <TabsTrigger
              value="chain"
              className="h-9 px-4 text-slate-400 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950"
            >
              <GitBranch /> 决策链
            </TabsTrigger>
            <TabsTrigger
              value="contract"
              className="h-9 px-4 text-slate-400 data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950"
            >
              <Database /> 数据契约
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blind-test" className="space-y-4">
            <BlindTestReport />
          </TabsContent>

          <TabsContent value="update" className="space-y-4">
            <UpdateWorkflow />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <VersionHistory />
          </TabsContent>

          <TabsContent value="chain" className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-[0.92fr_1.18fr_0.9fr]">
              <article className="research-panel min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Kicker>01 · Source & Evidence</Kicker>
                    <h2 className="mt-2 text-lg font-semibold">新信息进入</h2>
                  </div>
                  <Badge variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-300">
                    S-05
                  </Badge>
                </div>

                <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 size-5 shrink-0 text-cyan-300" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">安克创新 2026 年第一季度报告</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        角色：首次增量 · 状态：开发 · 定位：P2–P8
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5" aria-label="证据列表">
                  {evidence.map((item) => {
                    const selected = item.id === selectedId;
                    return (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedId(item.id)}
                        className={`h-auto w-full justify-start rounded-xl border px-4 py-3 text-left whitespace-normal transition-all ${
                          selected
                            ? "border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.08)]"
                            : "border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="w-full">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[13px] text-slate-400">{item.id}</span>
                            <DirectionBadge direction={item.direction} />
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-sm text-slate-300">{item.label}</p>
                              <p className="mt-0.5 text-base font-semibold text-white">{item.value}</p>
                            </div>
                            <p className={item.direction === "反证" ? "text-sm text-rose-300" : "text-sm text-emerald-300"}>
                              {item.change}
                            </p>
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-slate-950/45 p-4">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <FileSearch className="size-4 text-cyan-300" />
                    当前选中 · {selectedEvidence.location}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{selectedEvidence.explanation}</p>
                </div>
              </article>

              <article className="research-panel min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Kicker>02 · Claim & Judgment</Kicker>
                    <h2 className="mt-2 text-lg font-semibold">C-04 · 利润质量</h2>
                  </div>
                  <Badge className="bg-emerald-300 text-emerald-950">Q1 信号 · 增强</Badge>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5">
                  <p className="text-xl font-semibold leading-8 text-white sm:text-2xl">
                    核心经营强于归母净利润表面读数
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <Stat label="基线状态" value="成立" />
                    <Stat label="累计支持 / 反证" value="3 / 1" tone="good" />
                    <Stat label="人工置信度" value="4 / 5" />
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-[13px] text-slate-400">
                      <span>证据结构</span>
                      <span>支持 75% · 反证 25%</span>
                    </div>
                    <Progress value={75} className="h-2 bg-rose-300/20 [&_[data-slot=progress-indicator]]:bg-emerald-300" />
                  </div>
                  <p className="mt-4 border-l-2 border-amber-300/60 pl-3 text-sm leading-6 text-slate-300">
                    计数只能提示“证据结构”，不能自动生成投资结论。E-105 的反证必须始终可见。
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-sm font-semibold text-amber-200">A-03 · 假设</p>
                      <Badge variant="outline" className="border-amber-300/30 text-amber-200">待复核</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">
                      扣非利润比归母利润更能代表本期核心经营表现。
                    </p>
                    <p className="mt-3 text-[13px] text-slate-400">需要：财报老师 / CPA · EG-01</p>
                  </div>

                  <div className="rounded-xl border border-rose-300/20 bg-rose-300/[0.05] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-sm font-semibold text-rose-200">K-07 · 失效条件</p>
                      <Badge variant="outline" className="border-rose-300/30 text-rose-200">候选阈值</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">
                      若扣非归母净利润同比≤0%，或调整项被认定为经常性，则下调 C-04 并取消归一化调整。
                    </p>
                    <p className="mt-3 text-[13px] text-slate-400">观察：连续2个可比期；会计定性可即时触发 · 当前未触发</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-slate-950/40 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <Link2 className="size-4 text-cyan-300" /> 当前影响范围
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["M-002", "M-003", "M-025", "F-02", "Valuation B5", "Decision"].map((item) => (
                      <Badge key={item} variant="outline" className="border-slate-600 bg-slate-900/70 font-mono text-slate-300">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </article>

              <article className="research-panel min-w-0">
                <div>
                  <Kicker>03 · Formula & Decision</Kicker>
                  <h2 className="mt-2 text-lg font-semibold">确定性传播</h2>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/55">
                  <div className="border-b border-white/8 bg-cyan-300/[0.065] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Calculator className="size-4 text-cyan-300" />
                        <p className="font-mono text-sm font-semibold text-cyan-100">F-02</p>
                      </div>
                      <Badge variant="outline" className="border-cyan-300/25 text-cyan-200">代码 / 公式负责</Badge>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-slate-400">归母净利润 · M-002</span>
                      <span className="font-mono text-slate-100">{attributableProfit.toFixed(2)} mn</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-slate-400">减：非经常性损益 · M-025</span>
                      <span className="font-mono text-rose-300">({Math.abs(nonRecurring).toFixed(2)}) mn</span>
                    </div>
                    <div className="h-px bg-white/10" />
                    <p className="rounded-lg bg-white/[0.035] px-3 py-2 font-mono text-[13px] leading-6 text-cyan-100">
                      471.594 − (−75.165) = 546.759 mn
                    </p>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-400">扣非归母净利润 · M-003</p>
                        <p className="mt-1 text-[13px] text-emerald-300">同比 +24.39%</p>
                      </div>
                      <p className="font-mono text-2xl font-semibold text-white">{adjustedProfit.toFixed(2)}</p>
                    </div>

                    <Button
                      type="button"
                      onClick={runFormula}
                      disabled={calcStatus === "running"}
                      className="mt-2 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    >
                      <RefreshCw className={calcStatus === "running" ? "animate-spin" : ""} />
                      {calcStatus === "ready" ? "运行 F-02 复算" : calcStatus === "running" ? "正在复算" : "已复算 · 结果一致"}
                    </Button>
                  </div>
                </div>

                <div className={`mt-4 rounded-2xl border p-4 transition-colors ${calcStatus === "done" ? "border-emerald-300/35 bg-emerald-300/[0.075]" : "border-white/10 bg-white/[0.035]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-400">Decision · 当前动作</p>
                      <p className="mt-2 text-lg font-semibold text-white">继续研究</p>
                    </div>
                    <Badge variant="outline" className="border-amber-300/30 bg-amber-300/10 text-amber-200">
                      不形成买卖建议
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300">
                    C-04 增强，但 A-03 与 K-07 尚未通过 EG-01；估值输入也需 EG-02。因此系统只能记录研究进展。
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <Stat label="会计关卡" value="EG-01 · 待完成" tone="warn" />
                    <Stat label="估值关卡" value="EG-02 · 待完成" tone="warn" />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/8 bg-slate-950/40 p-4 text-sm text-slate-400">
                  <div className="flex items-center gap-2 text-slate-200">
                    <ShieldCheck className="size-4 text-emerald-300" /> 计算边界
                  </div>
                  <p className="mt-2 leading-6">LLM 可以抽取和解释；数字计算、阈值判断与版本检查必须交给确定性程序。</p>
                </div>
              </article>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3.5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <GitBranch className="size-4 text-cyan-300" /> 可回放路径
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {chain.map((item, index) => (
                    <div key={item} className="flex items-center gap-1.5">
                      <span className="rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1.5 font-mono text-[13px] text-slate-300">
                        {item}
                      </span>
                      {index < chain.length - 1 && <ChevronRight className="size-3.5 text-slate-600" />}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="contract" className="space-y-4">
            <section className="grid gap-4 lg:grid-cols-[1fr_0.34fr]">
              <article className="research-panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Kicker>Data Contract · V0.2</Kicker>
                    <h2 className="mt-2 text-xl font-semibold">屏幕上的每个对象都有明确字段</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      这不是一张写死的演示图。第一版数据库和 API 将直接采用工作簿中的字段定义，新增字段必须留下版本记录。
                    </p>
                  </div>
                  <Badge className="bg-emerald-300 text-emerald-950">129 个唯一字段</Badge>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {contractEntities.map((entity) => (
                    <div key={entity.name} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-semibold text-cyan-200">{entity.name}</p>
                          <p className="mt-1 text-sm text-slate-400">{entity.role}</p>
                        </div>
                        <Badge variant="outline" className="border-slate-600 text-slate-300">{entity.count}</Badge>
                      </div>
                      <div className="mt-4 space-y-1.5">
                        {entity.fields.map((field) => (
                          <div key={field} className="flex items-center gap-2 font-mono text-[13px] text-slate-300">
                            <CircleDot className="size-3 text-cyan-300/70" /> {field}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <aside className="research-panel">
                <Kicker>Freeze Status</Kicker>
                <h2 className="mt-2 text-lg font-semibold">可以开始基础工程</h2>
                <div className="mt-5 space-y-3">
                  <Stat label="数据字段" value="129 · 唯一" tone="good" />
                  <Stat label="失效条件" value="7 · 覆盖 6 Claims" tone="good" />
                  <Stat label="评估量表" value="11 项 · 100 分" tone="good" />
                  <Stat label="当前阻塞" value="专业结论，不阻塞编码" tone="warn" />
                </div>
                <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-100">
                    <Database className="size-4" /> 第一张数据库表
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    先实现 Source、Evidence、Claim 三个对象及其关系，再接入 Assumption、Metric 与 Version。
                  </p>
                </div>
              </aside>
            </section>
          </TabsContent>
        </Tabs>

        <footer className="mt-4 flex flex-col gap-2 px-1 pb-2 text-[13px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>公开披露基线 · A股 / 中国企业会计准则 · 行业顾问不阻塞 MVP</p>
          <p className="flex items-center gap-1.5"><ArrowRight className="size-3.5" /> 下一关：功能冻结后解封 S-06 盲测</p>
        </footer>
      </div>
    </main>
  );
}
