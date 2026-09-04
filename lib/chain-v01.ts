import type { MetricValue } from './parser-v04.ts';
import type { ParseResultV05 } from './parser-v05.ts';

export type ReviewGateStatus = 'pending' | 'approved' | 'rejected';
export type EvidenceDirection = '支持' | '反证' | '中性';
export type ClaimSignal = '增强' | '混合' | '削弱' | '不更新' | '阻断';

export type ChainContext = {
  runId: string;
  priorAdjustedYoy?: number[];
  accountingAdjustmentRecurring?: boolean | null;
  gates: { eg01: ReviewGateStatus; eg02: ReviewGateStatus };
  valuation?: {
    dilutedSharesMn?: number | null;
    peMultiples?: { bear: number; base: number; bull: number } | null;
    annualizationFactor?: number | null;
  };
};

type ChainEvidence = {
  id: string;
  kind: 'source' | 'derived';
  metricKey?: string;
  description: string;
  direction: EvidenceDirection;
  claimId: 'C-04';
  sourceId: string;
  page?: number;
  value?: number | null;
};

export type C04ChainResult = {
  runId: string;
  sourceId: string;
  status: 'blocked' | 'ready-for-human-review';
  evidence: ChainEvidence[];
  claim: {
    id: 'C-04';
    baselineState: '成立';
    systemSignal: ClaimSignal;
    humanFinalState: '成立';
    humanSignoffRequired: true;
  };
  assumption: {
    id: 'A-03';
    text: string;
    status: 'pending-review' | 'approved' | 'rejected';
    gate: 'EG-01';
  };
  killCriterion: {
    id: 'K-07';
    text: string;
    quantitativeState: 'clear' | 'watch' | 'triggered';
    accountingState: 'unknown' | 'clear' | 'triggered';
    currentState: 'clear' | 'watch' | 'triggered';
    consecutiveNonPositivePeriods: number;
  };
  formula: null | {
    id: 'F-02';
    attributable: number;
    nonRecurring: number;
    reportedAdjusted: number;
    calculatedAdjusted: number;
    difference: number;
    consistent: boolean;
  };
  valuation: {
    status: 'blocked' | 'provisional';
    earningsBasis: 'adjusted_np' | 'attributable_np' | null;
    periodEarnings: number | null;
    annualizationFactor: number | null;
    annualizedEarnings: number | null;
    scenarios: null | Record<'bear' | 'base' | 'bull', { pe: number; equityValueMn: number; perShare: number }>;
    blockedGates: string[];
    publishable: false;
  };
  decision: {
    action: '继续研究';
    formalRecommendation: null;
    reviewNote: string;
    blockedGates: string[];
  };
  graphDiff: {
    changedNodeIds: string[];
    unchangedNodeIds: ['C-01','C-02','C-03','C-05','C-06'];
    reasons: Record<string, string>;
  };
};

function metric(result: ParseResultV05, key: 'attributable_np'|'adjusted_np'|'non_recurring_total'): MetricValue | undefined {
  return result.metrics[key];
}

function directionFromSign(value: number | undefined, positive: EvidenceDirection, negative: EvidenceDirection): EvidenceDirection {
  if (value === undefined || value === 0) return '中性';
  return value > 0 ? positive : negative;
}

function inferAnnualizationFactor(period: string): number | null {
  const normalized = period.toUpperCase().replace(/\s+/g, '');
  if (/Q1$/.test(normalized)) return 4;
  if (/H1$/.test(normalized)) return 2;
  if (/FY$/.test(normalized) || /Y$/.test(normalized)) return 1;
  return null;
}

function trailingNonPositiveCount(prior: number[], current: number | undefined): number {
  const series = current === undefined ? [...prior] : [...prior, current];
  let count = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] <= 0) count += 1;
    else break;
  }
  return count;
}

export function runC04Chain(result: ParseResultV05, context: ChainContext): C04ChainResult {
  const sourceId = result.source.sourceId;
  const attr = metric(result, 'attributable_np');
  const adjusted = metric(result, 'adjusted_np');
  const nonRecurring = metric(result, 'non_recurring_total');

  const baseDecisionGates = [
    ...(context.gates.eg01 === 'approved' ? [] : ['EG-01']),
    ...(context.gates.eg02 === 'approved' ? [] : ['EG-02']),
  ];

  if (!result.canPromoteToEvidence || result.blockers.length > 0 || attr?.current === undefined || adjusted?.current === undefined || nonRecurring?.current === undefined) {
    return {
      runId: context.runId,
      sourceId,
      status: 'blocked',
      evidence: [],
      claim: { id: 'C-04', baselineState: '成立', systemSignal: '阻断', humanFinalState: '成立', humanSignoffRequired: true },
      assumption: { id: 'A-03', text: '扣非利润比归母利润更能代表本期核心经营表现。', status: 'pending-review', gate: 'EG-01' },
      killCriterion: { id: 'K-07', text: '若扣非归母净利润同比≤0%，或调整项被认定为经常性，则下调 C-04 并取消归一化调整。', quantitativeState: 'clear', accountingState: 'unknown', currentState: 'clear', consecutiveNonPositivePeriods: 0 },
      formula: null,
      valuation: { status: 'blocked', earningsBasis: null, periodEarnings: null, annualizationFactor: null, annualizedEarnings: null, scenarios: null, blockedGates: ['PARSER_OR_REQUIRED_EVIDENCE', ...baseDecisionGates], publishable: false },
      decision: { action: '继续研究', formalRecommendation: null, reviewNote: '输入未通过证据 Gate，禁止更新研究链。', blockedGates: ['PARSER_OR_REQUIRED_EVIDENCE', ...baseDecisionGates] },
      graphDiff: { changedNodeIds: [sourceId, 'Decision'], unchangedNodeIds: ['C-01','C-02','C-03','C-05','C-06'], reasons: { [sourceId]: '新来源进入但未通过证据 Gate。', Decision: '保持继续研究；不形成买卖建议。' } },
    };
  }

  const attrYoy = attr.disclosedChange;
  const adjustedYoy = adjusted.disclosedChange;
  const spread = attrYoy !== undefined && adjustedYoy !== undefined ? adjustedYoy - attrYoy : undefined;
  const evidence: ChainEvidence[] = [
    { id: `EV-${sourceId}-C04-ATTR`, kind: 'source', metricKey: 'attributable_np', description: '归母净利润同比', direction: directionFromSign(attrYoy, '中性', '反证'), claimId: 'C-04', sourceId, page: attr.page, value: attrYoy ?? null },
    { id: `EV-${sourceId}-C04-ADJ`, kind: 'source', metricKey: 'adjusted_np', description: '扣非归母净利润同比', direction: directionFromSign(adjustedYoy, '支持', '反证'), claimId: 'C-04', sourceId, page: adjusted.page, value: adjustedYoy ?? null },
    { id: `EV-${sourceId}-C04-NR`, kind: 'source', metricKey: 'non_recurring_total', description: '非经常性损益对归母利润的影响方向', direction: nonRecurring.current < 0 ? '支持' : nonRecurring.current > 0 ? '反证' : '中性', claimId: 'C-04', sourceId, page: nonRecurring.page, value: nonRecurring.current },
    { id: `EV-${sourceId}-C04-SPREAD`, kind: 'derived', description: '扣非利润同比相对归母利润同比的增速差', direction: spread === undefined ? '中性' : spread > 0 ? '支持' : spread < 0 ? '反证' : '中性', claimId: 'C-04', sourceId, value: spread ?? null },
  ];

  const consecutive = trailingNonPositiveCount(context.priorAdjustedYoy ?? [], adjustedYoy);
  const quantitativeState = consecutive >= 2 ? 'triggered' : consecutive === 1 ? 'watch' : 'clear';
  const accountingState = context.accountingAdjustmentRecurring === true ? 'triggered' : context.accountingAdjustmentRecurring === false ? 'clear' : 'unknown';
  const killTriggered = quantitativeState === 'triggered' || accountingState === 'triggered';
  const currentState = killTriggered ? 'triggered' : quantitativeState === 'watch' ? 'watch' : 'clear';

  let systemSignal: ClaimSignal = '不更新';
  if (killTriggered) systemSignal = '削弱';
  else if (adjustedYoy !== undefined && adjustedYoy <= 0) systemSignal = '削弱';
  else if (adjustedYoy !== undefined && spread !== undefined && adjustedYoy > 0 && spread > 0) systemSignal = '增强';
  else if (adjustedYoy !== undefined && adjustedYoy > 0) systemSignal = '混合';

  const calculatedAdjusted = attr.current - nonRecurring.current;
  const difference = Math.abs(calculatedAdjusted - adjusted.current);
  const formula = { id: 'F-02' as const, attributable: attr.current, nonRecurring: nonRecurring.current, reportedAdjusted: adjusted.current, calculatedAdjusted, difference, consistent: difference <= 0.001 };

  const earningsBasis = killTriggered ? 'attributable_np' as const : 'adjusted_np' as const;
  const periodEarnings = killTriggered ? attr.current : adjusted.current;
  const annualizationFactor = context.valuation?.annualizationFactor ?? inferAnnualizationFactor(result.source.period);
  const annualizedEarnings = annualizationFactor === null ? null : periodEarnings * annualizationFactor;
  const dilutedSharesMn = context.valuation?.dilutedSharesMn ?? null;
  const peMultiples = context.valuation?.peMultiples ?? null;
  const valuationBlockers = [...baseDecisionGates];
  if (annualizationFactor === null) valuationBlockers.push('VALUATION_PERIOD_BASIS_MISSING');
  if (dilutedSharesMn === null || dilutedSharesMn <= 0) valuationBlockers.push('VALUATION_SHARE_COUNT_MISSING');
  if (!peMultiples) valuationBlockers.push('VALUATION_MULTIPLES_MISSING');
  if (!formula.consistent) valuationBlockers.push('F-02');

  let scenarios: C04ChainResult['valuation']['scenarios'] = null;
  if (annualizedEarnings !== null && dilutedSharesMn && peMultiples && formula.consistent) {
    scenarios = Object.fromEntries((['bear','base','bull'] as const).map((name) => {
      const pe = peMultiples[name];
      const equityValueMn = annualizedEarnings * pe;
      return [name, { pe, equityValueMn, perShare: equityValueMn / dilutedSharesMn }];
    })) as C04ChainResult['valuation']['scenarios'];
  }

  const assumptionStatus = context.gates.eg01 === 'approved' ? 'approved' : context.gates.eg01 === 'rejected' ? 'rejected' : 'pending-review';
  const decisionGates = [...new Set([...baseDecisionGates, ...(formula.consistent ? [] : ['F-02'])])];

  return {
    runId: context.runId,
    sourceId,
    status: formula.consistent ? 'ready-for-human-review' : 'blocked',
    evidence,
    claim: { id: 'C-04', baselineState: '成立', systemSignal, humanFinalState: '成立', humanSignoffRequired: true },
    assumption: { id: 'A-03', text: '扣非利润比归母利润更能代表本期核心经营表现。', status: assumptionStatus, gate: 'EG-01' },
    killCriterion: { id: 'K-07', text: '若扣非归母净利润同比≤0%，或调整项被认定为经常性，则下调 C-04 并取消归一化调整。', quantitativeState, accountingState, currentState, consecutiveNonPositivePeriods: consecutive },
    formula,
    valuation: { status: valuationBlockers.length ? 'blocked' : 'provisional', earningsBasis, periodEarnings, annualizationFactor, annualizedEarnings, scenarios, blockedGates: valuationBlockers, publishable: false },
    decision: { action: '继续研究', formalRecommendation: null, reviewNote: decisionGates.length ? `系统信号=${systemSignal}；专业关卡未关闭，不形成买卖建议。` : `系统信号=${systemSignal}；仍需人工签字后才能形成正式动作。`, blockedGates: decisionGates },
    graphDiff: {
      changedNodeIds: [...evidence.map((item) => item.id), 'C-04','A-03','K-07','F-02','Valuation-B5','Decision'],
      unchangedNodeIds: ['C-01','C-02','C-03','C-05','C-06'],
      reasons: {
        'C-04': `由扣非同比、归母同比、两者增速差与非经常性损益方向生成系统信号：${systemSignal}。`,
        'A-03': `会计定性仍由 EG-01 人工复核；当前=${assumptionStatus}。`,
        'K-07': `连续扣非同比≤0期间=${consecutive}；会计定性=${accountingState}。`,
        'F-02': formula.consistent ? '归母净利润−非经常性损益与扣非归母净利润闭合。' : '利润桥不闭合，阻断传播。',
        'Valuation-B5': valuationBlockers.length ? `估值节点收到新盈利输入，但被 ${valuationBlockers.join(', ')} 阻塞。` : '估值情景已确定性重算，但仍不可自动发布。',
        Decision: '保持“继续研究”；系统不自动生成买卖建议。',
      },
    },
  };
}
