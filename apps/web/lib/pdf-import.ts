export const PDF_LIMITS = { bytes: 25 * 1024 * 1024, pages: 500, items: 250000, characters: 4000000, timeoutMs: 45000 };
export function validatePdfFile(file: { name: string; type: string; size: number }) {
  if (/s[-_ ]?0?7(?:\b|[_.-])/i.test(file.name)) throw new Error("该文件不在当前允许的 S-05/S-06 导入范围内。");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("当前只接受 PDF，请选择已登记的正式披露文件。");
  if (file.size <= 0) throw new Error("PDF 文件为空，请重新选择原件。");
  if (file.size > PDF_LIMITS.bytes) throw new Error("文件超过 25 MB，请选择大小符合要求的原始 PDF。");
}
export function validatePdfHeader(bytes: Uint8Array) {
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new Error("文件内容不是有效 PDF，修改扩展名无法导入。");
}
export function validatePdfResources(pages: number, items: number, characters: number) {
  if (pages > PDF_LIMITS.pages || items > PDF_LIMITS.items || characters > PDF_LIMITS.characters) throw new Error("PDF 超出本机解析资源上限，请联系维护者核查；未生成研究证据。");
}
