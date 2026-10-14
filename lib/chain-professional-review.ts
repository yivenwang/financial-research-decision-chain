import { runC04ChainK07B, type K07BContext } from './chain-k07-b.ts';
import { assertArchiveSafe } from './archive-safety.ts';
import type { ParseResultV05 } from './parser-v05.ts';

export const REVIEW_CHAIN_VERSION = 'V0.3-K07-B-Review';
export type ProfessionalReview = {
  recordId: string;
  workflow: 'pending' | 'completed';
  source: { kind: 'ai-assisted' | 'human-opinion'; author: string; reference: string; reviewedAt: string };
  scope: { companyId: '300866.SZ'; sourceId: string; period: string };
  limitations: string[];
  assumption: { conclusion: 'accepted' | 'qualified' | 'rejected' | 'insufficient'; evidenceIds: string[]; rationale: string };
  accounting: {
    item: string; amountMn: number | null; classification: 'recurring' | 'non-recurring' | 'unknown';
    coverage: 'entire-normalization' | 'item-only'; evidenceIds: string[]; rationale: string;
  }[];
};

// Records an attributed opinion, not identity authentication or a gate signature.
export function validateProfessionalReview(value: ProfessionalReview, result: ParseResultV05): ProfessionalReview {
  assertArchiveSafe(value, []);
  const text = (v: unknown) => typeof v === 'string' && Boolean(v.trim()) && v.length <= 2000;
  const exact = (v: unknown, keys: string[]) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
  const ids = (v: unknown) => Array.isArray(v) && v.length > 0 && v.length <= 16 &&
    v.every(text) && new Set(v).size === v.length;
  if (!exact(value, ['recordId','workflow','source','scope','limitations','assumption','accounting']) || !text(value.recordId) || !['pending', 'completed'].includes(value.workflow) ||
      !exact(value.source, ['kind','author','reference','reviewedAt']) || !['ai-assisted', 'human-opinion'].includes(value.source.kind) ||
      !text(value.source.author) || !text(value.source.reference) || !text(value.source.reviewedAt) ||
      !Number.isFinite(Date.parse(value.source.reviewedAt)) || !exact(value.scope, ['companyId','sourceId','period']) || value.scope?.companyId !== '300866.SZ' ||
      value.scope.sourceId !== result.source.sourceId || value.scope.period !== result.source.period ||
      !Array.isArray(value.limitations) || !value.limitations.length || value.limitations.length > 16 || !value.limitations.every(text) ||
      !exact(value.assumption, ['conclusion','evidenceIds','rationale']) || !['accepted', 'qualified', 'rejected', 'insufficient'].includes(value.assumption.conclusion) ||
      !ids(value.assumption.evidenceIds) || !text(value.assumption.rationale) ||
      !Array.isArray(value.accounting) || value.accounting.length > 32 ||
      value.accounting.some(row => !exact(row, ['item','amountMn','classification','coverage','evidenceIds','rationale']) || !text(row.item) ||
        !(row.amountMn === null || typeof row.amountMn === 'number' && Number.isFinite(row.amountMn)) ||
        !['recurring', 'non-recurring', 'unknown'].includes(row.classification) ||
        !['entire-normalization', 'item-only'].includes(row.coverage) || !ids(row.evidenceIds) || !text(row.rationale)) ||
      new Set(value.accounting.map(row => row.item)).size !== value.accounting.length) {
    throw new Error('PROFESSIONAL_REVIEW_INVALID');
  }
  return structuredClone(value);
}

// New versions separate workflow, hypothesis and scoped classification. Old
// V0.1 / V0.2 entry points remain unchanged for historical replay.
export function runC04ChainReviewed(result: ParseResultV05, context: K07BContext & { professionalReview?: ProfessionalReview }) {
  if (!['pending','approved','rejected'].includes(context.gates?.eg01) || !['pending','approved','rejected'].includes(context.gates?.eg02)) throw new Error('PROFESSIONAL_GATE_INVALID');
  const review = context.professionalReview ? validateProfessionalReview(context.professionalReview, result) : null;
  // An attributed AI review is never authority to close a professional gate.
  const gates = {
    eg01: review?.workflow === 'completed' && review.source.kind === 'human-opinion' ? context.gates.eg01 : 'pending' as const,
    // This stage has no validated valuation dossier or professional valuation
    // sign-off input. A caller flag or accounting opinion cannot close EG-02.
    eg02: 'pending' as const,
  };
  const valid = review?.workflow === 'completed' && review.source.kind === 'human-opinion' && gates.eg01 === 'approved';
  const covered = valid ? review.accounting.filter(row => row.coverage === 'entire-normalization') : [];
  const classifications = new Set(covered.map(row => row.classification));
  // Conflicting or partial-item opinions are retained, but cannot silently
  // change the approved whole-normalization fallback scope.
  const recurring = classifications.size === 1 && classifications.has('recurring') ? true :
    classifications.size === 1 && classifications.has('non-recurring') ? false : null;
  const chain = runC04ChainK07B(result, { ...context, gates, accountingAdjustmentRecurring: recurring });
  if (review) {
    chain.professionalReview = review;
    chain.professionalGates = structuredClone(gates);
  }
  chain.assumption = { ...chain.assumption,
    text: '若调整分类与持续性经核验，扣非可作核心经营代理；不是已证实判断。',
    status: valid ? review.assumption.conclusion === 'accepted' ? 'approved' :
      review.assumption.conclusion === 'qualified' ? 'qualified' :
      review.assumption.conclusion === 'rejected' ? 'rejected' : 'insufficient-evidence' : 'pending-review' };
  const positive = context.currentPeriod?.yoy !== undefined && context.currentPeriod.yoy > 0 &&
    chain.killCriterion.quantitativeState === 'clear' && chain.status !== 'blocked';
  if (positive) chain.killCriterion.reviewNote =
    '本期扣非同比为正，已中断以本期结束的连续非正序列；历史缺口仅影响历史判断。';
  chain.graphDiff.reasons['A-03'] = '假设=' + chain.assumption.status + '；扣非增长事实独立，系统信号非经营结论。';
  chain.graphDiff.reasons['K-07'] += positive ? ' ' + chain.killCriterion.reviewNote : '';
  chain.valuation = { ...chain.valuation, status: 'blocked', annualizedEarnings: null, scenarios: null,
    blockedGates: [...new Set([...chain.valuation.blockedGates, 'VALUATION_EVIDENCE_UNVERIFIED'])], publishable: false };
  chain.graphDiff.reasons['Valuation-B5'] =
    '机械年化非预测；盈利、股数/稀释、信息时点与倍数缺证，估值受阻。';
  return chain;
}
