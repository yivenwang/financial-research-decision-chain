// Local planning estimate, not a provider tokenizer or billing authorization.
export const QUESTION_BUDGET_VERSION = "question-live-budget.v1";
export const QUESTION_BUDGET_ACK = "estimated-usd-0.33660-not-hard-cap-v1";
export const QUESTION_BATCH_BUDGET = Object.freeze({
  maxRequests: 6, maxInputEstimatePerRequest: 16000, maxOutputTokensPerRequest: 6000,
  maxInputEstimateTotal: 96000, maxOutputTokensTotal: 36000, framingReserve: 4096,
  inputUsdCentsPerMillion: 132, outputUsdCentsPerMillion: 396,
  priceCheckedAt: "2026-10-09", priceSource: "https://api-docs.deepseek.com/quick_start/pricing/",
  estimateCeilingUsdMicros: 350000, monetaryHardCap: false,
});
export function costEstimateUsdMicros(inputTokens: number, outputTokens: number) {
  if (![inputTokens, outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("QUESTION_BUDGET_USAGE_INVALID");
  return Math.ceil((inputTokens * QUESTION_BATCH_BUDGET.inputUsdCentsPerMillion + outputTokens * QUESTION_BATCH_BUDGET.outputUsdCentsPerMillion) / 100);
}
export function budgetSummary() {
  const estimatedMaximumUsdMicros = costEstimateUsdMicros(QUESTION_BATCH_BUDGET.maxInputEstimateTotal, QUESTION_BATCH_BUDGET.maxOutputTokensTotal);
  return { ...QUESTION_BATCH_BUDGET, estimatedMaximumUsdMicros,
    planningReserveUsdMicros: Math.ceil(estimatedMaximumUsdMicros * 125 / 100),
    inputMethod: "full-wire-utf8-bytes-plus-4096-not-exact-tokenization" };
}
export function checkQuestionInputBudget(body: string) {
  const request = JSON.parse(body);
  if (request.model !== "deepseek-v4-pro" || request.max_output_tokens !== 6000 || request.reasoning?.effort !== "low") throw new Error("QUESTION_BUDGET_CONFIGURATION_INVALID");
  const wireBytes = new TextEncoder().encode(body).length;
  const estimatedInputTokens = wireBytes + QUESTION_BATCH_BUDGET.framingReserve;
  if (estimatedInputTokens > QUESTION_BATCH_BUDGET.maxInputEstimatePerRequest) throw new Error("QUESTION_INPUT_BUDGET_EXCEEDED");
  return { version: QUESTION_BUDGET_VERSION, wireBytes, estimatedInputTokens,
    reservedOutputTokens: 6000, estimatedCostUsdMicros: costEstimateUsdMicros(estimatedInputTokens, 6000) };
}
