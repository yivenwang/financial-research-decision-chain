import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Fingerprint,
  LockKeyhole,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const comparisons = [
  {
    id: "BT-01",
    field: "Source ID / 定位",
    frozen: "S-05 · P7",
    truth: "S-06 · P7",
    status: "FAIL",
    reason: "来源ID被写死为S-05。",
  },
  {
    id: "BT-02",
    field: "归母净利润",
    frozen: "1,702.037215391 mn",
    truth: "1,702.037215390 mn",
    status: "WARN",
    reason: "尾部拼入下一列首位数字。",
  },
  {
    id: "BT-03",
    field: "归母净利润同比",
    frozen: "8,045.86%",
    truth: "45.86%",
    status: "FAIL",
    reason: "上年同期金额尾部与同比值连接。",
  },
  {
    id: "BT-04",
    field: "扣非归母净利润",
    frozen: "1,438.7751658296102 mn",
    truth: "1,438.7751658200000 mn",
    status: "WARN",
    reason: "尾部拼入上年同期金额。",
  },
  {
    id: "BT-05",
    field: "扣非归母净利润同比",
    frozen: "5,949.65%",
    truth: "49.65%",
    status: "FAIL",
    reason: "上年同期金额尾部与同比值连接。",
  },
  {
    id: "BT-06",
    field: "非经常性损益合计",
    frozen: "未找到",
    truth: "263.26204957 mn · P8",
    status: "FAIL",
    reason: "E-107缺失，证据链不完整。",
  },
  {
    id: "BT-07",
    field: "F-02确定性复算",
    frozen: "未执行",
    truth: "1,438.77516582 mn",
    status: "FAIL",
    reason: "缺少E-107；公式正确阻断。",
  },
] as const;

const rubric = [
  ["ER-01", "来源选择", 100, "PASS"],
  ["ER-02", "原文定位", 50, "FAIL"],
  ["ER-03", "口径准确", 30, "FAIL"],
  ["ER-04", "数值准确", 20, "FAIL"],
  ["ER-05", "证据链", 30, "FAIL"],
  ["ER-06", "假设与证伪", 85, "PASS"],
  ["ER-07", "确定性计算", 60, "FAIL"],
  ["ER-08", "更新传播", 40, "FAIL"],
  ["ER-09", "版本与留出", 100, "PASS"],
  ["ER-10", "人工监督", 95, "PASS"],
  ["ER-11", "决策一致", 85, "PASS"],
] as const;

const controls = [
  "代码提交、工作簿和S-06 PDF均在测试前留存哈希",
  "错误候选没有进入正式Evidence、Claims、Metrics或Valuation",
  "E-107缺失时，F-02没有用猜测值继续计算",
  "投资动作保持“继续研究；不形成买卖建议”",
];

const repairPlan = [
  {
    title: "来源元数据去硬编码",
    body: "候选证据的Source ID必须继承本次导入材料，不能固定写成S-05。",
  },
  {
    title: "改为表格行列边界解析",
    body: "停止依赖“去掉全部空格后的窗口正则”，防止金额列和同比列粘连。",
  },
  {
    title: "加入完整性与数量级关卡",
    body: "E-105、E-106、E-107缺一项就阻断Graph Diff；异常同比必须显式报警。",
  },
  {
    title: "S-06只做回归，新材料做留出",
    body: "修复可用S-06验证旧错误不再出现，但下一次盲测必须换成未见材料。",
  },
];

function ResultBadge({ status }: { status: "PASS" | "WARN" | "FAIL" }) {
  const className =
    status === "PASS"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
      : status === "WARN"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
        : "border-rose-300/30 bg-rose-300/10 text-rose-200";
  return (
    <Badge variant="outline" className={className}>
      {status}
    </Badge>
  );
}

function Stat({ label, value, note, tone = "default" }: { label: string; value: string; note: string; tone?: "default" | "fail" }) {
  return (
    <div className={tone === "fail" ? "rounded-xl border border-rose-300/20 bg-rose-300/[0.055] p-4" : "rounded-xl border border-white/8 bg-white/[0.03] p-4"}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className={tone === "fail" ? "mt-2 text-2xl font-semibold text-rose-200" : "mt-2 text-2xl font-semibold text-white"}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

export function BlindTestReport() {
  return (
    <section className="space-y-4">
      <article className="research-panel overflow-hidden border-rose-300/20 bg-[linear-gradient(145deg,rgba(58,20,35,0.72),rgba(8,19,34,0.9))]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-rose-300 text-rose-950">BLIND TEST 01 · FAIL</Badge>
              <Badge variant="outline" className="border-slate-600 bg-slate-950/40 text-slate-300">
                <LockKeyhole /> FREEZE-2026-09-04-SLICE03
              </Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              第一轮盲测真实失败，结果已经锁定
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              冻结解析器首次输入官方2026年半年度报告。它命中P7，却把相邻列数字粘在一起、把来源写成S-05，并漏掉P8的非经常性损益合计。
            </p>
          </div>
          <a
            href="https://static.cninfo.com.cn/finalpage/2026-08-31/1225533054.PDF"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/[0.08]"
          >
            <ExternalLink className="size-4" /> 核对官方S-06
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="加权总分" value="57.7 / 100" note="通过线为85，且所有阻塞项必须无FAIL。" tone="fail" />
          <Stat label="阻塞FAIL" value="6" note="定位、口径、数值、证据链、计算与传播。" tone="fail" />
          <Stat label="静默数值错误" value="2" note="两项同比发生数量级错误，系统未主动报警。" tone="fail" />
          <Stat label="正式S-06证据" value="0" note="错误候选被隔离，没有污染研究链。" />
        </div>
      </article>

      <article className="research-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
              Frozen output vs ground truth
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">错误发生在哪里</h3>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            人工真值只使用官方报告P7–P8；没有因测试结果新增字段、阈值或映射。
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-white/8 bg-slate-950/30">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="px-4 text-slate-400">字段</TableHead>
                <TableHead className="px-4 text-slate-400">冻结输出</TableHead>
                <TableHead className="px-4 text-slate-400">人工真值</TableHead>
                <TableHead className="px-4 text-slate-400">结果</TableHead>
                <TableHead className="px-4 text-slate-400">原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisons.map((item) => (
                <TableRow key={item.id} className="border-white/8 hover:bg-white/[0.025]">
                  <TableCell className="px-4 py-3 whitespace-normal">
                    <p className="font-medium text-slate-100">{item.field}</p>
                    <p className="mt-1 font-mono text-[13px] text-slate-500">{item.id}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-sm text-rose-200">{item.frozen}</TableCell>
                  <TableCell className="px-4 py-3 font-mono text-sm text-emerald-200">{item.truth}</TableCell>
                  <TableCell className="px-4 py-3"><ResultBadge status={item.status} /></TableCell>
                  <TableCell className="max-w-sm px-4 py-3 whitespace-normal text-sm leading-6 text-slate-400">{item.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="research-panel">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Evaluation rubric</p>
              <h3 className="mt-2 text-xl font-semibold text-white">11项验收量表</h3>
            </div>
            <ResultBadge status="FAIL" />
          </div>
          <div className="mt-5 space-y-3">
            {rubric.map(([id, label, score, status]) => (
              <div key={id} className="grid grid-cols-[5.2rem_1fr_3rem] items-center gap-3">
                <div>
                  <p className="font-mono text-[13px] text-slate-500">{id}</p>
                  <p className="text-sm text-slate-200">{label}</p>
                </div>
                <Progress
                  value={score}
                  className={status === "PASS" ? "h-2 bg-slate-800 [&_[data-slot=progress-indicator]]:bg-emerald-300" : "h-2 bg-slate-800 [&_[data-slot=progress-indicator]]:bg-rose-300"}
                />
                <p className={status === "PASS" ? "text-right font-mono text-sm text-emerald-200" : "text-right font-mono text-sm text-rose-200"}>{score}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="research-panel">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">Control result</p>
              <h3 className="mt-2 text-xl font-semibold text-white">抽取失败，但治理关卡生效</h3>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {controls.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                <p className="text-sm leading-6 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
            <p className="text-sm leading-6 text-slate-300">
              这次不更新投资结论。失败证明当前解析器还不能安全接收新财报，但也证明错误能在进入决策链前被拦住。
            </p>
          </div>
        </article>
      </div>

      <article className="research-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">Post-test repair plan</p>
            <h3 className="mt-2 text-xl font-semibold text-white">下一步只修解析层，不动投资判断</h3>
          </div>
          <Badge variant="outline" className="border-amber-300/30 bg-amber-300/10 text-amber-200">
            <RotateCcw /> S-06 · 回归样本
          </Badge>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {repairPlan.map((item, index) => (
            <div key={item.title} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-cyan-300">0{index + 1}</span>
                {index === 0 ? <Fingerprint className="size-4 text-slate-500" /> : index === 1 ? <FileWarning className="size-4 text-slate-500" /> : index === 2 ? <ShieldAlert className="size-4 text-slate-500" /> : <LockKeyhole className="size-4 text-slate-500" />}
              </div>
              <h4 className="mt-4 text-base font-semibold text-white">{item.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-cyan-300" />
            <p className="text-sm leading-6 text-slate-200">
              修复完成后先跑S-05与S-06回归；全部通过也不等于盲测通过，仍要等待新的未见材料。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-sm text-cyan-200">
            Repair <ArrowRight className="size-4" /> Regression <ArrowRight className="size-4" /> New holdout
          </div>
        </div>
      </article>
    </section>
  );
}
