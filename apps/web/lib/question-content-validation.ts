import type { MemoContext } from "./research-memo.ts";
import type { QuestionExplanation } from "./research-question.ts";

export function questionCitationDependencies(context: MemoContext): Record<string, string[]> {
  const prefix = `EV-${context.source.sourceId}-C04-`;
  const available = new Set(context.references.map(r => r.id));
  const dependencies: Record<string, string[]> = { "F-02": [prefix + "ATTR", prefix + "ADJ", prefix + "NR"],
    [prefix + "SPREAD"]: [prefix + "ATTR", prefix + "ADJ"] };
  return Object.fromEntries(Object.entries(dependencies).filter(([id, deps]) => available.has(id) && deps.every(dep => available.has(dep))));
}

// Conservative checks for known unsupported claims; not a general semantic proof.
// Unrecognised reasoning still requires human content review and professional gates.
export function validateQuestionContent(answer: QuestionExplanation, context: MemoContext, strictCounter = false) {
  const prefix = `EV-${context.source.sourceId}-C04-`;
  const dependencies = questionCitationDependencies(context);
  const nr = context.references.find(r => r.id === prefix + "NR");
  const missingComparison = !nr || /比较值 未提供/.test(nr.excerpt);
  const available = new Set(context.references.map(r => r.id));
  if (strictCounter) {
    const metricMentions: Record<string, RegExp> = {
      [prefix + "ATTR"]: /归母|归属于.{0,12}(?:利润|净利)/,
      [prefix + "ADJ"]: /扣非|扣除非经常/,
      [prefix + "NR"]: /非经常性损益|调整项/,
      [prefix + "SPREAD"]: /增速差|增速.{0,8}(?:归母|扣非)|(?:归母|扣非).{0,8}增速/,
    };
    const counter = context.references.filter(r => r.direction === "反证");
    const text = answer.counterEvidence.text.replace(/扣非归母|扣除非经常性损益后(?:归属于.{0,12})?/g, "扣非");
    if (counter.length && !counter.some(r => answer.counterEvidence.citations.includes(r.id) && metricMentions[r.id]?.test(text)))
      throw new Error("COUNTER_FACT_NOT_STATED");
  }
  for (const point of [answer.directAnswer, answer.inference, answer.counterEvidence, answer.uncertainty]) {
    const citations = new Set(point.citations);
    if (citations.size !== point.citations.length) throw new Error("ANSWER_CITATION_OR_TEXT_INVALID");
    const requireCitations = (ids: string[]) => {
      if (ids.some(id => available.has(id) && !citations.has(id))) throw new Error("PARAGRAPH_EVIDENCE_OMITTED");
    };
    for (const id of citations) requireCitations(dependencies[id] ?? []);
    // Metric mentions need their own evidence, not a citation elsewhere in the answer.
    if (/归母|归属于.{0,12}(?:利润|净利)/.test(point.text.replace(/扣非归母|扣除非经常性损益后(?:归属于.{0,12})?/g, "扣非"))) requireCitations([prefix + "ATTR"]);
    if (/扣非|扣除非经常/.test(point.text)) requireCitations([prefix + "ADJ"]);
    if (/非经常性损益|调整项|负向调整/.test(point.text)) requireCitations([prefix + "NR"]);
    if (/利润桥|勾稽/.test(point.text)) requireCitations(["F-02"]);
    if (/核心经营|核心盈利|核心利润/.test(point.text)) requireCitations(["A-03"]);
    if (/连续可比|连续.{0,6}期间|失效条件/.test(point.text)) requireCitations(["K-07"]);
    if (/估值|股数|倍数/.test(point.text)) requireCitations(["Valuation-B5"]);
    for (const clause of point.text.split(/[；。！？\n]/u)) {
      const qualified = /不能|无法|未能|尚未|尚无|不代表|不等于|不足|并非|待|可能|假设|如果|假如|倘若|若/.test(clause);
      const yoyClause = /同比|上年同期/.test(clause) || (strictCounter ? /差异|分化|相反|分歧|背离|原因/ : /差异|分化|相反/).test(clause) && /同比|上年同期/.test(point.text);
      const unsafeCause = strictCounter
        ? [...clause.matchAll(/来自|源于|导致|造成|归因|所致|引起|在于/g)].some(match =>
          !/(?:不能|无法|未能|尚未|尚无|不代表|不等于|不足|并非|待核验|可能|或许|假设|如果|假如|倘若|若)[^，,]*$/.test(clause.slice(0, match.index)))
        : /来自|源于|导致|造成|归因|所致/.test(clause) && !qualified;
      if (missingComparison && yoyClause && unsafeCause)
        throw new Error("UNSUPPORTED_YOY_ATTRIBUTION");
      if (/(?:报告|公告|全文|原文).{0,12}(?:未披露|未提供|没有披露|没有提供)|(?:未披露|未提供|没有披露|没有提供).{0,12}(?:报告|公告|全文)/.test(clause) && !/本次.{0,6}输入|受控输入|结构化输入/.test(clause))
        throw new Error("DISCLOSURE_SCOPE_OVERCLAIM");
      if (/已证明|已经证明|已证实|已经证实|已经确认|已确认/.test(clause) && /核心经营|核心盈利|核心利润/.test(clause) && !/(?:不能|无法|尚未|未能|并未|没有|并非).{0,6}(?:证明|确认|证实)/.test(clause))
        throw new Error("ASSUMPTION_PROMOTED");
      if (/(?:建议|应当|应该|推荐|适合|值得|可以)(?:立即|现在|直接)?(?:买入|卖出|加仓|减仓)|(?:专业|会计|估值).{0,8}(?:已通过|已经通过|已获认可)|无需.{0,8}(?:专业|会计|估值)复核/.test(clause) && !/不能|不应|不得|禁止|不提供|尚未|并未|没有|并非/.test(clause))
        throw new Error("PROFESSIONAL_BOUNDARY_VIOLATION");
    }
  }
}
