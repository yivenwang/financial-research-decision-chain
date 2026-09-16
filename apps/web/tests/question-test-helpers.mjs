import { parseResearchReport, extractCandidates, createResearchSnapshot } from "../lib/research-engine.ts";
import { verifiedSampleItems } from "../lib/sample-s05.ts";
import { getSourceRecord } from "../lib/source-records.ts";

// Synthetic prose and transport responses are NEVER production fallbacks.
export const questionTestConfig = { provider: "deepseek", apiKey: "question-test-NOT-A-REAL-KEY", accessToken: "question-test-access-code", model: "deepseek-v4-pro" };
export const mainQuestion = "安克创新2026Q1归母净利润下降，但扣非归母净利润上升，这是否意味着核心经营恶化？";
export const planOutput = (patch = {}) => ({ intent: "CHANGE_EXPLAIN", company: "安克创新", period: "2026Q1", comparisonPeriod: "2025Q1", metricKeys: ["attributable_np", "adjusted_np", "non_recurring_total"], referenceIds: ["C-04", "F-02"], reason: "仅核验本期利润结构。", ...patch });
export const answerOutput = (patch = {}) => ({
  sufficiency: "complete",
  directAnswer: { text: "归母下滑与扣非增长应拆开核对，不能单凭一个指标认定核心经营恶化。", citations: ["EV-S-05-C04-ATTR", "EV-S-05-C04-ADJ", "A-03"] },
  inference: { text: "负向调整可能影响表面利润，但扣非能否代表核心经营仍是待复核假设。", citations: ["EV-S-05-C04-NR", "A-03", "F-02"] },
  counterEvidence: { text: "归母利润下降仍构成反向证据，不能忽略。", citations: ["EV-S-05-C04-ATTR"] },
  uncertainty: { text: "需复核调整项经常性及连续可比期间，现有输入不足以完成专业判断。", citations: ["A-03", "K-07"] }, ...patch,
});
export function questionTestSnapshot() {
  const source = getSourceRecord("S-05");
  const result = parseResearchReport(verifiedSampleItems, source);
  return createResearchSnapshot({ versionId: "V-02", parentVersionId: "V-01", createdAt: "2026-09-16T00:00:00Z", reviewer: "Synthetic fixture reviewer", scope: "research",
    source: { name: "Synthetic coordinates NOT real PDF", sourceId: source.sourceId, period: source.period, url: source.url, size: 0, pageCount: 14, mode: "sample" },
    result, candidates: extractCandidates(result).map(item => ({ ...item, reviewStatus: "accepted" })) });
}
export const providerResponse = (output, patch = {}) => Response.json({ id: "response-question-test-NOT-LIVE", model: "question-test-NOT-LIVE", status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }], ...patch });
export const questionRequest = (body, headers = {}) => new Request("http://localhost/api/research-question", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", authorization: `Bearer ${questionTestConfig.accessToken}`, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
