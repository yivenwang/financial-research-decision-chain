import type { C04ChainResult } from "@/lib/research-engine";

const gateLabels: Record<string, string> = {
  "EG-01": "会计复核未完成", "EG-02": "估值复核未完成",
  VALUATION_SHARE_COUNT_MISSING: "缺少本期间股数",
  VALUATION_MULTIPLES_MISSING: "缺少估值倍数",
  VALUATION_PERIOD_BASIS_MISSING: "缺少年化口径",
  "F-02": "利润桥不闭合",
};

export function ChainResultPanel({ result }: { result: C04ChainResult }) {
  const k = result.killCriterion;
  return (
    <section className="mt-5 space-y-4" aria-label="研究决策链结果" data-testid="chain-result">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="font-medium text-white">A-03 · 会计假设</h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">{result.assumption.text}</p>
          <p className="mt-2 text-sm text-amber-200">{result.assumption.status === "pending-review" ? "等待 EG-01 专业复核" : result.assumption.status}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="font-medium text-white">K-07 · 论点失效条件</h4>
          <p className="mt-2 text-sm text-slate-300">{k.currentState === "triggered" ? "已触发" : k.currentState === "watch" ? "当前出现非正增长，需跟踪" : "本期数值未触发"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">当前仅分析一份报告；尚未输入连续可比期间序列。调整项是否具有经常性仍待会计复核。</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2">
          <h4 className="font-medium text-white">估值输入与待补条件</h4>
          <p className="mt-2 text-sm text-slate-300">盈利口径：{result.valuation.earningsBasis === "adjusted_np" ? "扣非归母净利润" : "归母净利润"}；本期 {result.valuation.periodEarnings?.toFixed(8) ?? "—"} CNY mn。</p>
          <p className="mt-2 text-sm text-slate-400">年化占位系数 {result.valuation.annualizationFactor ?? "—"}；年化占位输入 {result.valuation.annualizedEarnings?.toFixed(8) ?? "—"} CNY mn。它用于展示传导，尚非盈利预测。</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200">
            {result.valuation.blockedGates.map((gate) => <li key={gate}>{gateLabels[gate] ?? gate}</li>)}
          </ul>
        </div>
      </div>
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4">
        <h4 className="font-medium text-white">变化依据</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {Object.entries(result.graphDiff.reasons).map(([node, reason]) => <li key={node}><span className="font-mono text-cyan-200">{node}</span> · {reason}</li>)}
        </ul>
        <p className="mt-3 text-sm text-slate-400">保持原状态：{result.graphDiff.unchangedNodeIds.join("、")}。</p>
        <p className="mt-3 text-sm text-slate-400">以上解释由确定性规则生成。本版本尚未调用大语言模型。</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
        <h4 className="font-medium text-white">系统证据方向（含派生证据）</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {result.evidence.map((item) => <li key={item.id}>{item.description}：{item.direction} · {item.sourceId}{item.page ? ` · P${item.page}` : " · 由已核对指标计算"}</li>)}
        </ul>
      </div>
    </section>
  );
}
