import { parseFinancialReportV06Strict } from "../../../lib/parser-v06-strict.ts";
import { runC04Chain, type C04ChainResult, type EvidenceDirection } from "../../../lib/chain-v01.ts";
import type { ParseIssueV06, ParseResultV06 } from "../../../lib/parser-v06.ts";
import type { MetricKey, PdfTextItem, SourceMeta } from "../../../lib/parser-v04.ts";
import type { ResearchVersion, StoredFormula } from "./research-versions.ts";

export type { C04ChainResult, PdfTextItem, SourceMeta };
export type ParseResult = ParseResultV06;
export type ParseIssue = ParseIssueV06;
export type RequiredMetricKey = "attributable_np" | "adjusted_np" | "non_recurring_total";
export const REQUIRED_METRICS: RequiredMetricKey[] = ["attributable_np", "adjusted_np", "non_recurring_total"];
export const ENGINE_VERSIONS = { parser: "V0.6-strict", chain: "V0.1" } as const;
export const METRIC_CONFIG = {
  attributable_np: { suffix: "ATTR", label: "归母净利润" },
  adjusted_np: { suffix: "ADJ", label: "扣非归母净利润" },
  non_recurring_total: { suffix: "NR", label: "非经常性损益" },
};

export type CandidateEvidence = {
  id: string;
  metricKey: RequiredMetricKey;
  label: string;
  valueMn: number;
  originalValueMn: number;
  comparisonMn: number | null;
  changePct: number | null;
  disclosedChange: number | null;
  direction: EvidenceDirection;
  systemDirection: EvidenceDirection;
  claimId: string;
  sourceId: string;
  period: string;
  location: string;
  snippet: string;
  reviewStatus: "pending" | "accepted" | "rejected";
};

const context = (runId: string) => ({
  runId,
  // An upload alone supplies no verified sequence of comparable periods.
  // In particular, Q1 and H1 must not be treated as consecutive quarters.
  priorAdjustedYoy: [],
  gates: { eg01: "pending" as const, eg02: "pending" as const },
});

export function parseResearchReport(items: PdfTextItem[], source: SourceMeta): ParseResult {
  return parseFinancialReportV06Strict(items, source);
}

export function extractCandidates(result: ParseResult): CandidateEvidence[] {
  const signals = runC04Chain(result, context("candidate-preview")).evidence;
  return REQUIRED_METRICS.flatMap((key) => {
    const metric = result.metrics[key];
    if (metric?.current === undefined) return [];
    const direction = signals.find((item) => item.metricKey === key)?.direction ?? "中性";
    const yoy = metric.disclosedChange ?? null;
    return [{
      id: `EV-${result.source.sourceId}-C04-${METRIC_CONFIG[key].suffix}`,
      metricKey: key,
      label: METRIC_CONFIG[key].label,
      valueMn: metric.current,
      originalValueMn: metric.current,
      comparisonMn: metric.comparison ?? null,
      changePct: yoy === null ? null : Number((yoy * 100).toFixed(2)),
      disclosedChange: yoy,
      direction,
      systemDirection: direction,
      claimId: "C-04",
      sourceId: result.source.sourceId,
      period: result.source.period,
      location: `${metric.sourceId} · P${metric.page}`,
      snippet: `${metric.label} · ${metric.current.toFixed(8)} CNY mn${yoy === null ? "" : ` · 同比 ${(yoy * 100).toFixed(2)}%`}`,
      reviewStatus: "pending" as const,
    }];
  });
}

export type ReviewedRun = {
  canPromoteToEvidence: boolean;
  blockers: ParseIssue[];
  chain: C04ChainResult | null;
  formula: StoredFormula;
  reviewedMetrics: ParseResult["metrics"];
};

export function reviewAndRun(result: ParseResult, candidates: CandidateEvidence[], runId: string): ReviewedRun {
  const blockers: ParseIssue[] = [...result.blockers];
  const metrics = structuredClone(result.metrics);
  const fail = (field: MetricKey, message: string) => blockers.push({ code: "REQUIRED_FIELD_MISSING", severity: "FAIL", field, message });
  for (const key of REQUIRED_METRICS) {
    const matches = candidates.filter((item) => item.metricKey === key);
    const candidate = matches[0];
    const original = result.metrics[key];
    if (matches.length !== 1 || !candidate || candidate.reviewStatus !== "accepted" || !original) {
      fail(key, `${METRIC_CONFIG[key].label} 必须有且只有一条已接受证据。`);
      continue;
    }
    if (candidate.sourceId !== result.source.sourceId || candidate.period !== result.source.period ||
        candidate.originalValueMn !== original.current || candidate.comparisonMn !== (original.comparison ?? null) ||
        candidate.disclosedChange !== (original.disclosedChange ?? null)) {
      fail(key, `${METRIC_CONFIG[key].label} 的来源或原始比较值发生变化，请重新导入并审核。`);
      continue;
    }
    if (!Number.isFinite(candidate.valueMn)) {
      fail(key, `${METRIC_CONFIG[key].label} 必须是有效数字。`);
      continue;
    }
    if (candidate.comparisonMn !== null && candidate.disclosedChange !== null) {
      const change = (candidate.valueMn - candidate.comparisonMn) / Math.abs(candidate.comparisonMn);
      if (!Number.isFinite(change) || Math.abs(change - candidate.disclosedChange) > 0.005) {
        blockers.push({ code: "YOY_RECONCILIATION_FAIL", severity: "FAIL", field: key, message: `${METRIC_CONFIG[key].label} 的修改值与披露同比不一致。` });
      }
    }
    metrics[key] = { ...original, current: candidate.valueMn };
  }
  if (candidates.some((item) => !REQUIRED_METRICS.includes(item.metricKey))) {
    fail("adjusted_np", "候选证据包含当前 C-04 范围外的指标。");
  }
  if (!result.canPromoteToEvidence || blockers.length) {
    return { canPromoteToEvidence: false, blockers, chain: null, formula: null, reviewedMetrics: metrics };
  }
  const chain = runC04Chain({ ...result, metrics }, context(runId));
  if (chain.status === "blocked" || !chain.formula?.consistent) {
    blockers.push({ code: "BRIDGE_RECONCILIATION_FAIL", severity: "FAIL", field: "adjusted_np", message: "F-02 利润桥未闭合，禁止生成变化和保存。" });
  }
  const f = chain.formula;
  const formula = f ? { attributable: f.attributable, nonRecurring: f.nonRecurring, reportedAdjusted: f.reportedAdjusted, calculated: f.calculatedAdjusted, difference: f.difference, consistent: f.consistent } : null;
  return { canPromoteToEvidence: blockers.length === 0, blockers, chain: blockers.length ? null : chain, formula, reviewedMetrics: metrics };
}

export function createResearchSnapshot(input: {
  versionId: string;
  parentVersionId: string;
  createdAt: string;
  reviewer: string;
  source: NonNullable<ResearchVersion["source"]>;
  result: ParseResult;
  candidates: CandidateEvidence[];
  scope: "research" | "regression";
}): ResearchVersion {
  const reviewed = reviewAndRun(input.result, input.candidates, input.versionId);
  if (!reviewed.canPromoteToEvidence || !reviewed.chain) throw new Error("证据或计算未通过，不能保存。");
  if (!input.reviewer.trim()) throw new Error("请填写本次证据审核人。");
  if (input.source.sourceId !== input.result.source.sourceId || input.source.period !== input.result.source.period || input.source.url !== input.result.source.url) {
    throw new Error("快照来源与解析记录不一致。");
  }
  const chain = reviewed.chain;
  return {
    versionId: input.versionId,
    parentVersionId: input.parentVersionId,
    createdAt: input.createdAt,
    kind: "update",
    workspace: input.scope,
    source: structuredClone(input.source),
    evidence: structuredClone(input.candidates),
    claim: { id: "C-04", before: chain.claim.baselineState, after: chain.claim.humanFinalState, systemSignal: chain.claim.systemSignal },
    formula: reviewed.formula,
    decision: chain.decision.action,
    blockedGates: [...chain.decision.blockedGates],
    parser: { version: ENGINE_VERSIONS.parser, canPromoteToEvidence: true, blockers: [], originalMetrics: structuredClone(input.result.metrics), reviewedMetrics: reviewed.reviewedMetrics },
    chain: structuredClone(chain),
    chainVersion: ENGINE_VERSIONS.chain,
    humanReview: { reviewer: input.reviewer.trim(), confirmedAt: input.createdAt, scope: "evidence-only", identityVerified: false },
  };
}
