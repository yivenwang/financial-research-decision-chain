export function questionReason(code: string) {
  const reasons: Record<string, string> = {
    INFERENCE_NOT_MARKED: "模型没有明确标注推论的条件或待核实性质，草稿已阻断。请查看原始记录并核对推论；本次没有可接受的分析结果。",
    ANSWER_CITATION_OR_TEXT_INVALID: "模型段落的引用或文本格式不符合要求，草稿已阻断。请在运行详情核查原文；新任务会产生新的模型调用。",
    SOURCE_EVIDENCE_OMITTED: "模型遗漏了必要的原始证据引用，草稿已阻断。",
    COUNTER_EVIDENCE_OMITTED: "模型遗漏了已提供的反向证据，草稿已阻断。",
    PROFESSIONAL_LIMIT_OMITTED: "模型遗漏了专业复核限制，草稿已阻断。",
    PROVIDER_TIMEOUT: "模型服务等待超时，没有完整研究结果。请先读取任务状态，勿重复确认。",
    PROVIDER_INCOMPLETE: "模型返回了不完整输出，已保留失败记录，不能作为成功分析。",
    MODEL_JSON_INVALID: "模型返回的结构无法读取，已保留原始阻断记录。",
    ANSWER_SCHEMA_INVALID: "模型返回的研究结构不符合约定，草稿已阻断。",
    CONTRACT_SCHEMA_INVALID: "模型返回的任务结构不符合约定，请核对运行详情。",
  };
  return reasons[code] ?? (/^[A-Z][A-Z_0-9]+$/.test(code) ? "研究请求未通过校验。请查看技术详情并联系维护者核查。" : code);
}
export const formatMoneyMn = (value: number) => Number.isFinite(value) ? value.toFixed(8) : "未提供";

export function questionExportLabel(status: string, reviewStatus?: string) {
  if (["ANSWER_READY", "PARTIAL"].includes(status) && reviewStatus) return reviewStatus === "accepted" ? "导出已审核研究草稿" : "导出退回研究草稿";
  return ({BLOCKED: '导出阻断说明', OUT_OF_SCOPE: '导出范围说明', MATERIALS_REQUIRED: '导出材料需求', CONTRACT_DRAFTED: '导出待确认任务', ANSWER_READY: '导出待审核研究草稿', PARTIAL: '导出部分回答草稿'} as Record<string,string>)[status] ?? '导出研究记录';
}
