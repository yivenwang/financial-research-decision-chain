import type { MemoContext } from "./research-memo.ts";

export const QUESTION_POINTS = ["directAnswer", "inference", "counterEvidence", "uncertainty"] as const;
export type QuestionPointKey = typeof QUESTION_POINTS[number];

// Existing subjects, evidence and calculation dependencies share one policy.
// This catalog creates neither financial facts nor investment judgements.
export function questionCitationPolicy(context: MemoContext, includeCoreBasis = false) {
  const prefix = `EV-${context.source.sourceId}-C04-`;
  const available = new Set(context.references.map(r => r.id));
  return [
    { id: prefix + "ATTR", mentions: /归母|归属于.{0,12}(?:利润|净利)/, requires: [] as string[] },
    { id: prefix + "ADJ", mentions: /扣非|扣除非经常/, requires: [] as string[] },
    { id: prefix + "NR", mentions: /非经常性损益|非经常(?:性)?项目|调整项|负向调整/, requires: [] as string[] },
    { id: prefix + "SPREAD", mentions: /增速差|增长速度差/, requires: [prefix + "ATTR", prefix + "ADJ"] },
    { id: "F-02", mentions: /利润桥|勾稽/, requires: [prefix + "ATTR", prefix + "ADJ", prefix + "NR"] },
    { id: "A-03", mentions: includeCoreBasis ? /核心经营|核心盈利|核心利润|核心口径/ : /核心经营|核心盈利|核心利润/, requires: [] as string[] },
    { id: "K-07", mentions: /连续可比|连续.{0,6}期间|失效条件/, requires: [] as string[] },
    { id: "Valuation-B5", mentions: /估值|股数|倍数/, requires: [] as string[] },
  ].filter(r => available.has(r.id) && r.requires.every(id => available.has(id)));
}

// Each enum names every selected ID. The model explicitly selects a complete
// group before writing; no missing ID is supplied after the response arrives.
export function questionCitationChoices(context: MemoContext, point: QuestionPointKey, comparisonSafe = true): string[] {
  const counter = context.references.filter(r => r.direction === "反证").map(r => r.id);
  const policy = questionCitationPolicy(context);
  const closure = (ids: string[]) => [...new Set(ids.flatMap(id => [id, ...(policy.find(r => r.id === id)?.requires ?? [])]))];
  const prefix = `EV-${context.source.sourceId}-C04-`;
  const available = new Set(context.references.map(r => r.id));
  // v7 comparison groups explicitly select both profit facts and the boundary
  // of the core-profit assumption. IDs remain literal choices, never repairs.
  const contrast = comparisonSafe ? [prefix + 'ATTR', prefix + 'ADJ', 'A-03'].filter(id => available.has(id)) : [];
  const choices = policy.flatMap(r => {
    if (point === "uncertainty") return [closure([r.id, "A-03"]).join("|")];
    if (point === "counterEvidence" && counter.length) return counter.map(id => {
      const ids = closure([r.id, id, ...contrast]);
      return (comparisonSafe ? ids.sort() : ids).join('|');
    });
    return [closure([r.id]).join("|")];
  });
  return [...new Set(choices)];
}

export function expandQuestionCitationChoices(tokens: string[], context: MemoContext, point: QuestionPointKey, comparisonSafe = true): string[] {
  const choices = new Set(questionCitationChoices(context, point, comparisonSafe));
  if (!tokens.length || tokens.length > 8 || new Set(tokens).size !== tokens.length || tokens.some(token => typeof token !== "string"))
    throw new Error("ANSWER_CITATION_OR_TEXT_INVALID");
  if (tokens.some(token => !choices.has(token))) {
    const selected = new Set(tokens.flatMap(token => token.split("|")));
    if (point === "uncertainty" && !selected.has("A-03")) throw new Error("PROFESSIONAL_LIMIT_OMITTED");
    const counter = context.references.filter(r => r.direction === "反证");
    if (point === "counterEvidence" && counter.length && !counter.some(r => selected.has(r.id))) throw new Error("COUNTER_EVIDENCE_OMITTED");
    if (questionCitationPolicy(context).some(r => selected.has(r.id) && r.requires.some(id => !selected.has(id)))) throw new Error("PARAGRAPH_EVIDENCE_OMITTED");
    throw new Error("ANSWER_CITATION_OR_TEXT_INVALID");
  }
  const ids = [...new Set(tokens.flatMap(token => token.split("|")))];
  if (ids.length > 8) throw new Error("ANSWER_CITATION_OR_TEXT_INVALID");
  return ids;
}
