import type { MemoContext } from "./research-memo.ts";
import type { QuestionExplanation } from "./research-question.ts";
import { questionCitationPolicy } from "./question-citation-policy.ts";

export function questionCitationDependencies(context: MemoContext): Record<string, string[]> {
  return Object.fromEntries(questionCitationPolicy(context).filter(r => r.requires.length).map(r => [r.id, r.requires]));
}

function assertionNegated(clause: string, index: number) {
  return /(?:不能|无法|不应|不得|禁止|不提供|尚未|并未|没有|并非|不代表|不等于|不|未)(?:据此|因此|直接|立即|现在|贸然|轻率|自行|擅自|明确|断言|声称|认为|判断|说|宣称|已|已经|给出|作出|提供)*$/.test(clause.slice(0, index));
}
function statementScopes(text: string) {
  return text.split(/[；。！？\n]|但是|然而|不过|可是|但|却/u).flatMap(statement => {
    const conditional = /^(?:如果|假如|倘若|若)/.test(statement);
    return statement.split(/[，,]/u).map((clause, i) => conditional && i > 0 && /^(?:则|才|就)/.test(clause) ? "若" + clause : clause);
  });
}

// Conservative checks for known unsupported claims; not a general semantic proof.
// Unrecognised reasoning still requires human content review and professional gates.
export function validateQuestionContent(answer: QuestionExplanation, context: MemoContext, strictCounter = false, currentContract = false, extendedContract = false) {
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
    if (currentContract) {
      const text = point.text.replace(/扣非归母|扣除非经常性损益后(?:归属于.{0,12})?/g, "扣非");
      for (const rule of questionCitationPolicy(context, extendedContract)) if (rule.mentions.test(rule.id.endsWith("ATTR") ? text : point.text)) requireCitations([rule.id]);
    } else {
      // Historical rules: metric mentions need their own evidence, not a citation elsewhere in the answer.
      if (/归母|归属于.{0,12}(?:利润|净利)/.test(point.text.replace(/扣非归母|扣除非经常性损益后(?:归属于.{0,12})?/g, "扣非"))) requireCitations([prefix + "ATTR"]);
      if (/扣非|扣除非经常/.test(point.text)) requireCitations([prefix + "ADJ"]);
      if (/非经常性损益|调整项|负向调整/.test(point.text)) requireCitations([prefix + "NR"]);
      if (/利润桥|勾稽/.test(point.text)) requireCitations(["F-02"]);
      if (/核心经营|核心盈利|核心利润/.test(point.text)) requireCitations(["A-03"]);
      if (/连续可比|连续.{0,6}期间|失效条件/.test(point.text)) requireCitations(["K-07"]);
      if (/估值|股数|倍数/.test(point.text)) requireCitations(["Valuation-B5"]);
    }
    for (const clause of currentContract ? statementScopes(point.text) : point.text.split(/[；。！？\n]/u)) {
      const qualified = /不能|无法|未能|尚未|尚无|不代表|不等于|不足|并非|待|可能|假设|如果|假如|倘若|若/.test(clause);
      if (extendedContract) {
        // A condition on the accounting assumption cannot establish a change
        // in the spread across periods: only this period's spread is supplied.
        for (const match of clause.matchAll(/(?:增速差|增长速度差)(.{0,8})(?:扩大|扩张|收窄|缩小)/g)) {
          if (!/不能|无法|未|并非|是否|可能|或许/.test(match[1]) && !assertionNegated(clause, match.index!) &&
              !/^(?:若|如果|假如|倘若)(?:未来|后续)?(?:增速差|增长速度差)/.test(clause)) throw new Error('UNSUPPORTED_SPREAD_TREND');
        }
        if (/扣非.{0,24}(?:是|代表|属于|只限于|可视为|即为).{0,8}(?:核心经营|核心盈利|核心利润|核心口径)/.test(clause) && !qualified)
          throw new Error('ASSUMPTION_PROMOTED');
      }
      const explicitlyCurrent = strictCounter && /本期(?:的)?(?:口径|勾稽|利润桥)/.test(clause);
      const yoyClause = /同比|上年同期/.test(clause) || !explicitlyCurrent && (strictCounter ? /差异|分化|相反|分歧|背离|原因/ : /差异|分化|相反/).test(clause) && /同比|上年同期/.test(point.text);
      const unsafeCause = strictCounter
        ? [...clause.matchAll(/来自|源于|导致|造成|归因|所致|引起|在于/g)].some(match =>
          !/(?:不能|无法|未能|尚未|尚无|不代表|不等于|不足|并非|待核验|可能|或许|假设|如果|假如|倘若|若)[^，,]*$/.test(clause.slice(0, match.index)))
        : /来自|源于|导致|造成|归因|所致/.test(clause) && !qualified;
      if (missingComparison && yoyClause && unsafeCause)
        throw new Error("UNSUPPORTED_YOY_ATTRIBUTION");
      if (currentContract) {
        const rules: [RegExp, string][] = [
          [/(?:报告|公告|全文|原文).{0,12}(?:未披露|未提供|没有披露|没有提供)|(?:未披露|未提供|没有披露|没有提供).{0,12}(?:报告|公告|全文)/g, "DISCLOSURE_SCOPE_OVERCLAIM"],
          [/(?:已证明|已经证明|已证实|已经证实|已经确认|已确认).{0,12}(?:核心经营|核心盈利|核心利润)/g, "ASSUMPTION_PROMOTED"],
          [/(?:建议|应当|应该|推荐|适合|值得|可以)(?:立即|现在|直接)?(?:买入|卖出|加仓|减仓)|(?:专业|会计|估值).{0,8}(?:已通过|已经通过|已获认可)|无需.{0,8}(?:专业|会计|估值)复核/g, "PROFESSIONAL_BOUNDARY_VIOLATION"],
        ];
        for (const [pattern, code] of rules) for (const match of clause.matchAll(pattern)) {
          if (!assertionNegated(clause, match.index!)) throw new Error(code);
        }
      } else {
        if (/(?:报告|公告|全文|原文).{0,12}(?:未披露|未提供|没有披露|没有提供)|(?:未披露|未提供|没有披露|没有提供).{0,12}(?:报告|公告|全文)/.test(clause) && !/本次.{0,6}输入|受控输入|结构化输入/.test(clause))
          throw new Error("DISCLOSURE_SCOPE_OVERCLAIM");
        if (/已证明|已经证明|已证实|已经证实|已经确认|已确认/.test(clause) && /核心经营|核心盈利|核心利润/.test(clause) && !/(?:不能|无法|尚未|未能|并未|没有|并非).{0,6}(?:证明|确认|证实)/.test(clause))
          throw new Error("ASSUMPTION_PROMOTED");
        if (/(?:建议|应当|应该|推荐|适合|值得|可以)(?:立即|现在|直接)?(?:买入|卖出|加仓|减仓)|(?:专业|会计|估值).{0,8}(?:已通过|已经通过|已获认可)|无需.{0,8}(?:专业|会计|估值)复核/.test(clause) && !/不能|不应|不得|禁止|不提供|尚未|并未|没有|并非/.test(clause))
          throw new Error("PROFESSIONAL_BOUNDARY_VIOLATION");
      }
    }
  }
}
