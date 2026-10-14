import { runC04Chain, type ChainContext, type C04ChainResult } from './chain-v01.ts';
import type { ParseResultV05 } from './parser-v05.ts';

export const K07_B_VERSION = 'V0.2-K07-B';
export const K07_B_TEXT = '首次扣非归母净利润同比≤0%进入观察并削弱 C-04 系统信号；连续两个经核验且口径可比的期间非正时触发并取消归一化调整；专业会计复核认定调整项为经常性时立即触发。人工状态与正式投资动作仍需独立审核。';
export type K07Period = {
  companyId: string;
  period: string;
  periodBasis: 'single-quarter' | 'cumulative-half-year' | 'full-year';
  profitBasis: 'adjusted-attributable';
  unit: 'CNY_mn';
  yoy: number;
  evidenceId: string;
  review: { status: 'accepted'; scope: 'evidence-only' };
};
export type K07BContext = ChainContext & { currentPeriod: K07Period | null; priorPeriods?: K07Period[] };

function ordinal(row: K07Period): number | null {
  if (!row || typeof row.yoy !== 'number' || !Number.isFinite(row.yoy) ||
      row.profitBasis !== 'adjusted-attributable' || row.unit !== 'CNY_mn' ||
      typeof row.companyId !== 'string' || !row.companyId.trim() ||
      typeof row.evidenceId !== 'string' || !row.evidenceId.trim() ||
      row.review?.status !== 'accepted' || row.review.scope !== 'evidence-only') return null;
  const pattern = row.periodBasis === 'single-quarter' ? /^(\d{4})Q([1-4])$/ :
    row.periodBasis === 'cumulative-half-year' ? /^(\d{4})H1$/ :
    row.periodBasis === 'full-year' ? /^(\d{4})FY$/ : null;
  const match = pattern?.exec(row.period);
  return match ? Number(match[1]) * (row.periodBasis === 'single-quarter' ? 4 : 1) + Number(match[2] ?? 0) : null;
}

// Numeric legacy priorAdjustedYoy is ignored: only reviewed, labelled periods
// can establish continuity. This is evidence review, not expert authentication.
export function runC04ChainK07B(result: ParseResultV05, context: K07BContext): C04ChainResult {
  const current = context.currentPeriod;
  const currentOrdinal = current ? ordinal(current) : null;
  const currentVerified = currentOrdinal !== null && current?.companyId === '300866.SZ' && current.period === result.source.period &&
    current.yoy === result.metrics.adjusted_np?.disclosedChange && current.evidenceId === `EV-${result.source.sourceId}-C04-ADJ`;
  const prior = context.priorPeriods ?? [];
  let sequenceStatus: 'verified' | 'missing' | 'invalid' = prior.length ? 'verified' : 'missing';
  const values: number[] = [];
  if (!currentVerified) sequenceStatus = 'invalid';
  let previousOrdinal: number | null = null;
  const evidenceIds = new Set<string>();
  for (const row of prior) {
    if (!row || typeof row !== 'object') { sequenceStatus = 'invalid'; continue; }
    const value = ordinal(row);
    if (value === null || !current || row.companyId !== current.companyId || row.periodBasis !== current.periodBasis ||
        row.profitBasis !== current.profitBasis || row.unit !== current.unit ||
        previousOrdinal !== null && value !== previousOrdinal + 1 ||
        evidenceIds.has(row.evidenceId) || row.evidenceId === current.evidenceId) sequenceStatus = 'invalid';
    if (value !== null) previousOrdinal = value;
    evidenceIds.add(row.evidenceId); values.push(row.yoy);
  }
  if (prior.length && (previousOrdinal === null || currentOrdinal !== previousOrdinal + 1)) sequenceStatus = 'invalid';
  const accountingApproved = context.gates.eg01 === 'approved' ? context.accountingAdjustmentRecurring : null;
  const chain = runC04Chain(result, { ...context,
    priorAdjustedYoy: sequenceStatus === 'verified' ? values : [], accountingAdjustmentRecurring: accountingApproved });
  const quantitativeState = chain.status === 'blocked' || !currentVerified ? 'unknown' : chain.killCriterion.quantitativeState;
  const accountingState = accountingApproved === true ? 'triggered' : accountingApproved === false ? 'clear' : 'unknown';
  const currentState = accountingState === 'triggered' ? 'triggered' : quantitativeState === 'triggered' || quantitativeState === 'watch' ? quantitativeState :
    quantitativeState === 'unknown' || accountingState === 'unknown' ? 'unknown' : 'clear';
  const reviewNote = !currentVerified ? '本期同比或期间口径尚未通过核验，定量条件不可判断。' :
    sequenceStatus === 'invalid' ? '历史序列存在未核验、断序或口径不一致；仅按本期观察，不推定连续触发。' :
    sequenceStatus === 'missing' ? '缺少经核验的连续可比历史序列，不能排除或确认连续触发；本期单独判断。' : '连续可比期间已核验。';
  chain.killCriterion = { ...chain.killCriterion, text: K07_B_TEXT, quantitativeState, accountingState, currentState,
    consecutiveNonPositivePeriods: currentVerified && chain.status !== 'blocked' ? chain.killCriterion.consecutiveNonPositivePeriods : 0,
    policyVersion: K07_B_VERSION, sequenceStatus, reviewNote };
  chain.graphDiff.reasons['K-07'] = `${K07_B_VERSION}：定量=${quantitativeState}；会计=${accountingState}；连续非正期间=${chain.killCriterion.consecutiveNonPositivePeriods}。${reviewNote}`;
  return chain;
}
