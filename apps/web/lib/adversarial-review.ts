import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { canonicalJson, sha256Text, type MemoContext } from "./research-memo.ts";
import { validateQuestionExplanation, type QuestionExplanation } from "./research-question.ts";

export const REVIEW_VERSION = "adversarial-review.v1";
export const REVIEW_QUESTIONS_VERSION = "jev-review.v1";
export type ReviewOutcome = "PASS_CANDIDATE" | "REVIEW" | "BLOCK";
export type ReviewState = {
  version: typeof REVIEW_VERSION;
  snapshotSha256: string;
  sourceId: string;
  points: { kind: string; text: string; citations: string[] }[];
  references: { id: string; kind: string; direction: string | null; description: string }[];
  limits: string[];
};
export type JudgeVerdict = {
  decision: "supported" | "uncertain" | "contradicted";
  confidence: number;
  evidenceSupports: number;
  counterAddressed: number;
  model: string;
  requestedModel?: string;
  usage?: { inputTokens: number; outputTokens: number };
};
export type ReviewRecord = {
  version: typeof REVIEW_VERSION;
  questionsVersion: typeof REVIEW_QUESTIONS_VERSION;
  stateSha256: string;
  verdictSha256: string | null;
  snapshotSha256: string;
  createdAt: string;
  outcome: ReviewOutcome;
  reasons: string[];
  verdict: JudgeVerdict | null;
  humanGate: "pending";
};

// The reference set is built from the frozen research context. The explanation
// remains untrusted model text, so this is a shadow review, never an authority
// to commit. No raw PDF, user snippet, URL, key, or editable evidence label.
export function buildReviewState(context: MemoContext, explanation: QuestionExplanation): ReviewState {
  validateQuestionExplanation(explanation, context);
  const keys = ["directAnswer", "inference", "counterEvidence", "uncertainty"] as const;
  return {
    version: REVIEW_VERSION, snapshotSha256: context.snapshotSha256, sourceId: context.source.sourceId,
    points: keys.map(kind => ({ kind, text: explanation[kind].text, citations: [...explanation[kind].citations] })),
    references: context.references.map(r => ({ id: r.id, kind: r.kind, direction: r.direction,
      description: r.excerpt.slice(0, 500) })),
    limits: context.limits.map(l => l.slice(0, 300)),
  };
}

function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function decideReview(verdict: JudgeVerdict | null): { outcome: ReviewOutcome; reasons: string[] } {
  if (!verdict) return { outcome: "REVIEW", reasons: ["JUDGE_UNAVAILABLE"] };
  if (![verdict.confidence, verdict.evidenceSupports, verdict.counterAddressed].every(probability) ||
    !["supported", "uncertain", "contradicted"].includes(verdict.decision)) {
    return { outcome: "REVIEW", reasons: ["JUDGE_RESPONSE_INVALID"] };
  }
  if (verdict.decision === "contradicted" && verdict.confidence >= 0.8 || verdict.evidenceSupports <= 0.2 || verdict.counterAddressed <= 0.2) {
    return { outcome: "BLOCK", reasons: ["SEMANTIC_CONFLICT_CANDIDATE"] };
  }
  if (verdict.decision === "supported" && verdict.confidence >= 0.9 && verdict.evidenceSupports >= 0.9 && verdict.counterAddressed >= 0.9) {
    return { outcome: "PASS_CANDIDATE", reasons: [] };
  }
  return { outcome: "REVIEW", reasons: ["SEMANTIC_REVIEW_REQUIRED"] };
}

export async function reviewCandidate(context: MemoContext, explanation: QuestionExplanation,
  judge: (state: ReviewState) => Promise<JudgeVerdict | null>): Promise<ReviewRecord> {
  const state = buildReviewState(context, explanation);
  const stateSha256 = await sha256Text(canonicalJson(state));
  let verdict: JudgeVerdict | null = null;
  try { verdict = await judge(state); } catch { /* Failure never becomes a PASS. */ }
  const { outcome, reasons } = decideReview(verdict);
  return { version: REVIEW_VERSION, questionsVersion: REVIEW_QUESTIONS_VERSION, stateSha256,
    verdictSha256: verdict ? await sha256Text(canonicalJson(verdict)) : null,
    snapshotSha256: state.snapshotSha256, createdAt: new Date().toISOString(), outcome, reasons,
    verdict, humanGate: "pending" };
}

// Explicit opt-in experiment. Exactly one SDK request; the SDK otherwise
// retries twice by default. A judge verdict never commits a research decision.
export async function jevJudge(state: ReviewState, apiKey: string, options: { model?: string; fetcher?: typeof fetch } = {}): Promise<JudgeVerdict> {
  if (!apiKey) throw new Error("TYPESAFE_API_KEY_REQUIRED");
  if (!options.model || options.model === "jev-latest") throw new Error("PINNED_JEV_MODEL_REQUIRED");
  const client = new TypeSafeClient({ apiKey, defaultModel: options.model, retry: { maxRetries: 0 },
    timeout: 10000, logLevel: "off", ...(options.fetcher ? { fetch: options.fetcher } : {}) });
  const result = await client.systemOne({ state,
    questions: {
      decision: choice("Does the draft's cited evidence support its conditional conclusions, taking counter-evidence and stated limits seriously?", {
        supported: "Citations and limits support the cautious draft", uncertain: "Requires human inspection or more evidence",
        contradicted: "Cited evidence contradicts a material assertion",
      }),
      evidenceSupports: noul("Do the cited references actually support the draft's material claims?"),
      counterAddressed: noul("Does the draft fairly address the cited counter-evidence?"),
    },
  });
  return { decision: result.answers.decision.choice, confidence: result.answers.decision.confidence,
    evidenceSupports: result.answers.evidenceSupports.noul, counterAddressed: result.answers.counterAddressed.noul,
    model: result.model, requestedModel: options.model,
    usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens } };
}
