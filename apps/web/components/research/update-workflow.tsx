"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  FileCheck2,
  FileText,
  GitCompareArrows,
  Loader2,
  LockKeyhole,
  PencilLine,
  RotateCcw,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  nextVersionId,
  readStoredVersions,
  readActiveVersionId,
  appendVersion,
} from "@/lib/research-versions";
import {
  getSourceRecord,
  sourceRecords,
  resolveSourceRecord,
  type SourceRecord,
} from "@/lib/source-records";
import {
  parseResearchReport,
  extractCandidates,
  reviewAndRun,
  createResearchSnapshot,
  type CandidateEvidence,
  type ParseIssue,
  type ParseResult,
  type PdfTextItem,
  type SourceMeta,
} from "@/lib/research-engine";
import { verifiedSampleItems } from "@/lib/sample-s05";
import { ChainResultPanel } from "@/components/research/chain-result-panel";

type Direction = CandidateEvidence["direction"];
type WorkflowStep = "upload" | "review" | "diff" | "saved";

type SourceFile = SourceMeta & {
  name: string;
  size: number;
  pageCount: number;
  mode: "pdf" | "sample";
  useStatus: SourceRecord["useStatus"];
  sha256?: string;
};

const stepOrder: WorkflowStep[] = ["upload", "review", "diff", "saved"];
const stepLabels: Record<WorkflowStep, string> = {
  upload: "导入材料",
  review: "审核证据",
  diff: "生成变化",
  saved: "保存版本",
};

function sourceFileFromRecord(
  record: SourceRecord,
  details: Pick<SourceFile, "name" | "size" | "pageCount" | "mode" | "sha256">,
): SourceFile {
  return {
    sourceId: record.sourceId,
    period: record.period,
    url: record.url,
    useStatus: record.useStatus,
    ...details,
  };
}

type PdfExtraction = {
  items: PdfTextItem[];
  pageCount: number;
  documentTitle: string;
  sha256: string;
};

async function extractPdfItems(file: File): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  // Served from the same locked pdfjs-dist package by prepare-pdf-worker.mjs.
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  const buffer = await file.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  try {
    const document = await loadingTask.promise;
    const items: PdfTextItem[] = [];
    const titleParts: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const raw of content.items) {
        const item = raw as unknown as {
          str?: unknown;
          transform?: unknown;
          width?: unknown;
        };
        if (typeof item.str !== "string" || !Array.isArray(item.transform)) {
          continue;
        }
        const x = Number(item.transform[4]);
        const y = Number(item.transform[5]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        items.push({
          str: item.str,
          x,
          y,
          page: pageNumber,
          width: typeof item.width === "number" ? item.width : undefined,
        });
        if (pageNumber <= 3) titleParts.push(item.str);
      }
    }
    return {
      items,
      pageCount: document.numPages,
      documentTitle: titleParts.join(" "),
      sha256,
    };
  } finally {
    await loadingTask.destroy();
  }
}

function summarizeBlockers(blockers: ParseIssue[]) {
  return blockers
    .map((issue) => `${issue.code}${issue.field ? `(${issue.field})` : ""}`)
    .join("；");
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "已验证样例";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function formatValue(value: number) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function StepRail({ active }: { active: WorkflowStep }) {
  const activeIndex = stepOrder.indexOf(active);
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {stepOrder.map((step, index) => {
        const complete = index < activeIndex;
        const current = index === activeIndex;
        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-3",
              complete && "border-emerald-300/25 bg-emerald-300/[0.06]",
              current && "border-cyan-300/35 bg-cyan-300/[0.08]",
              !complete && !current && "border-white/8 bg-white/[0.02]",
            )}
          >
            <div
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border",
                complete && "border-emerald-300/40 bg-emerald-300/15 text-emerald-200",
                current && "border-cyan-300/40 bg-cyan-300/15 text-cyan-200",
                !complete && !current && "border-slate-600 text-slate-500",
              )}
            >
              {complete ? <Check className="size-4" /> : <span className="text-[13px]">{index + 1}</span>}
            </div>
            <span className={cn("text-sm", current || complete ? "text-slate-100" : "text-slate-500")}>
              {stepLabels[step]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function UpdateWorkflow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [source, setSource] = useState<SourceFile | null>(null);
  const [candidates, setCandidates] = useState<CandidateEvidence[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [parserResult, setParserResult] = useState<ParseResult | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("S-05");
  const [reviewer, setReviewer] = useState("");
  const selectedRecord = getSourceRecord(selectedSourceId)!;
  const workspace = selectedRecord.useStatus === "regression-only" ? "regression" : "research";

  const reviewedCount = candidates.filter((item) => item.reviewStatus !== "pending").length;
  const accepted = candidates.filter((item) => item.reviewStatus === "accepted");
  const allReviewed = candidates.length > 0 && reviewedCount === candidates.length;

  const reviewedRun = useMemo(
    () => parserResult ? reviewAndRun(parserResult, candidates, "current-preview") : null,
    [parserResult, candidates],
  );
  const formula = reviewedRun?.formula ?? null;
  const reviewBlockers = reviewedRun?.blockers ?? [];
  const canPromoteToEvidence = reviewedRun?.canPromoteToEvidence ?? false;
  const claimSignal = reviewedRun?.chain?.claim.systemSignal ?? "不更新";
  const visibleBlockers = allReviewed ? reviewBlockers : (parserResult?.blockers ?? []);

  function loadSample() {
    const record = getSourceRecord("S-05");
    if (!record) {
      setMessage("当前 Source 记录缺失，无法载入已验证样例。");
      return;
    }
    const result = parseResearchReport(verifiedSampleItems, record);
    setSelectedSourceId(record.sourceId);
    setReviewer("");
    setParserResult(result);
    setSource(
      sourceFileFromRecord(record, {
        name: record.name + " · S-05 已验证样例",
        size: 0,
        pageCount: 14,
        mode: "sample",
      }),
    );
    setCandidates(extractCandidates(result));
    setMessage(
      result.blockers.length
        ? "已载入样例，但解析 Gate 阻断：" + summarizeBlockers(result.blockers)
        : "已载入 S-05 教学样例（合成坐标，非本次 PDF 上传）；请逐条审核三条候选证据。",
    );
    setStep("review");
    setSavedVersion(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (/s[-_ ]?0?7(?:\b|[_.-])/i.test(file.name)) {
      setMessage("该文件不在当前允许的 S-05/S-06 导入范围内。");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("当前只接受 PDF。请上传正式披露文件，或先载入 S-05 已验证样例。");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setMessage("文件超过 25 MB。请先压缩 PDF，再重新导入。");
      return;
    }

    setIsParsing(true);
    setStep("upload");
    setReviewer("");
    setMessage(null);
    setSavedVersion(null);
    setParserResult(null);
    setSource(null);
    setCandidates([]);
    try {
      const extraction = await extractPdfItems(file);
      const record = resolveSourceRecord(file.name, extraction.documentTitle);
      if (!record || record.sourceId !== selectedRecord.sourceId) {
        setParserResult(null);
        setMessage("PDF 内的公司或报告期间与所选材料记录不一致，已阻断导入。请核对原文及材料选择。");
        return;
      }

      const result = parseResearchReport(extraction.items, record);
      const extracted = extractCandidates(result);
      setParserResult(result);
      setSource(
        sourceFileFromRecord(record, {
          name: file.name,
          size: file.size,
          pageCount: extraction.pageCount,
          sha256: extraction.sha256,
          mode: "pdf",
        }),
      );
      setCandidates(extracted);
      setMessage(
        result.blockers.length
          ? "PDF 已读取，但解析 Gate 阻断：" + summarizeBlockers(result.blockers)
          : extracted.length
            ? "PDF 在本机完成几何解析，定位到 " + extracted.length + " 条候选证据。"
            : "PDF 已读取，但没有定位到目标指标。请检查 Source 记录与报告格式。",
      );
      setStep("review");
    } catch {
      setParserResult(null);
      setSource(null);
      setCandidates([]);
      setMessage("PDF 解析失败。文件可能是扫描件或受保护；当前版本尚不处理 OCR。");
    } finally {
      setIsParsing(false);
    }
  }

  function updateCandidate(id: string, patch: Partial<CandidateEvidence>) {
    setCandidates((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function generateDiff() {
    if (!allReviewed) {
      setMessage("请先处理全部候选证据：每一条都必须接受或拒绝。");
      return;
    }
    if (!canPromoteToEvidence) {
      setMessage(
        "存在 blocker，已禁止接受并进入 Graph Diff：" +
          summarizeBlockers(reviewBlockers),
      );
      return;
    }
    setMessage(null);
    setStep("diff");
  }

  function saveVersion() {
    if (!canPromoteToEvidence || !source || !parserResult) {
      setMessage(
        "存在 blocker，不能保存正式研究版本：" +
          summarizeBlockers(reviewBlockers),
      );
      return;
    }
    try {
      const current = readStoredVersions(workspace);
      const versionId = nextVersionId(current);
      const snapshot = createResearchSnapshot({
        versionId,
        parentVersionId: readActiveVersionId(current, workspace),
        createdAt: new Date().toISOString(),
        reviewer,
        source: {
          name: source.name, size: source.size, pageCount: source.pageCount,
          mode: source.mode, sourceId: source.sourceId, period: source.period, url: source.url, sha256: source.sha256,
        },
        result: parserResult,
        candidates,
        scope: workspace,
      });
      appendVersion(snapshot, workspace);
      setSavedVersion(versionId);
      setStep("saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "版本保存失败，请检查浏览器存储空间。");
    }
  }

  function resetWorkflow() {
    setStep("upload");
    setSource(null);
    setCandidates([]);
    setMessage(null);
    setSavedVersion(null);
    setParserResult(null);
    setReviewer("");
  }

  return (
    <section className="space-y-4">
      <div className="research-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
              Slice 02 · Human-in-the-loop Update
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              导入新材料，再由人决定哪些证据进入研究链
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              PDF 只在当前设备解析。系统负责定位候选事实，接受、拒绝、修改与最终决策必须由研究者完成。
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
            <ShieldCheck /> {workspace === "regression" ? "S-06 · 独立回归演示" : "S-05 · 研究更新"}
          </Badge>
        </div>
        <div className="mt-4 max-w-lg space-y-2">
          <p className="text-sm text-slate-300">选择已登记材料</p>
          <Select value={selectedSourceId} disabled={isParsing} onValueChange={(value) => { resetWorkflow(); setSelectedSourceId(value); }}>
            <SelectTrigger aria-label="选择已登记材料" className="w-full border-white/10 bg-slate-950/40 text-slate-100"><SelectValue /></SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
              {sourceRecords.map((record) => <SelectItem key={record.sourceId} value={record.sourceId}>{record.sourceId} · {record.period} · {record.useStatus === "regression-only" ? "回归演示" : "研究更新"}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm text-slate-400">{workspace === "regression" ? "回归演示使用独立版本库，不写入研究版本库。" : "上传 PDF 内的公司和期间须与材料记录一致。"}</p>
        </div>
        <div className="mt-5">
          <StepRail active={step} />
        </div>
      </div>

      {step === "upload" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.38fr]">
          <div className="research-panel">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={isParsing}
              onChange={handleFile}
              aria-label="选择财报 PDF"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isParsing}
              className="flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-300/[0.04] px-6 text-center transition-colors hover:border-cyan-300/55 hover:bg-cyan-300/[0.07] disabled:cursor-wait"
            >
              {isParsing ? (
                <Loader2 className="size-10 animate-spin text-cyan-300" />
              ) : (
                <UploadCloud className="size-10 text-cyan-300" />
              )}
              <p className="mt-4 text-lg font-semibold text-white">
                {isParsing ? "正在读取 PDF 文本" : "选择所选材料的 PDF"}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                当前支持可复制文字的 PDF，最大 25 MB；扫描件 OCR 将在后续版本加入。
              </p>
            </button>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">没有文件也可以先走通审核工作流。</p>
              <Button
                type="button"
                variant="outline"
                onClick={loadSample}
                disabled={isParsing}
                className="border-cyan-300/25 bg-cyan-300/[0.06] text-cyan-100 hover:bg-cyan-300/10 hover:text-white"
              >
                <FileCheck2 /> 载入 S-05 已验证样例
              </Button>
            </div>
          </div>

          <aside className="research-panel">
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-rose-300/80">
              Source Boundary
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">已登记材料的使用边界</h3>
            <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.055] p-4">
              <LockKeyhole className="size-5 text-rose-200" />
              <p className="mt-3 text-sm leading-6 text-slate-300">
                系统核对 PDF 内的公司与期间。S-06 已转为回归材料，本次演示保存在独立版本库，首次失败报告保持原样。
              </p>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <div className="flex items-center gap-2"><Check className="size-4 text-emerald-300" /> S-05：允许开发</div>
              <div className="flex items-center gap-2"><X className="size-4 text-rose-300" /> S-06：独立回归演示</div>
              <div className="flex items-center gap-2"><Circle className="size-4 text-slate-500" /> 扫描件：暂不支持</div>
            </div>
          </aside>
        </div>
      )}

      {step === "review" && source && (
        <div className="grid gap-4 xl:grid-cols-[0.32fr_1fr]">
          <aside className="research-panel h-fit">
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
              Source · {source.sourceId}
            </p>
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <FileText className="size-5 text-cyan-300" />
              <p className="mt-3 text-sm font-medium leading-6 text-slate-100">{source.name}</p>
              <p className="mt-2 text-[13px] text-slate-400">
                {source.period} · {formatFileSize(source.size)} · {source.pageCount} 页 · 本地解析
              </p>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">审核进度</span>
                <span className="text-slate-200">{reviewedCount} / {candidates.length}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full bg-cyan-300 transition-all"
                  style={{ width: candidates.length ? String((reviewedCount / candidates.length) * 100) + "%" : "0%" }}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={resetWorkflow}
              className="mt-4 w-full text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <RotateCcw /> 重新选择材料
            </Button>
          </aside>

          <div className="research-panel">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                  Candidate Evidence
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">逐条确认，不允许一键全收</h3>
              </div>
              <Badge variant="outline" className="w-fit border-amber-300/30 bg-amber-300/10 text-amber-200">
                <PencilLine /> 可修改字段
              </Badge>
            </div>

            {visibleBlockers.length > 0 && (
              <div className="mt-5 rounded-xl border border-rose-300/25 bg-rose-300/[0.055] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-200" />
                  <div>
                    <p className="font-medium text-rose-100">解析 Gate · blocker FAIL</p>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-slate-300">
                      {visibleBlockers.map((issue, index) => (
                        <p key={`${issue.code}-${issue.field ?? "general"}-${index}`}>
                          {issue.field ? `${issue.field} · ` : ""}{issue.message}
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-[13px] text-rose-200">
                      已隔离：不得进入正式 Evidence、Metrics 或 Graph Diff。
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {candidates.map((item) => (
                <article
                  key={item.id}
                  data-testid={`candidate-${item.metricKey}`}
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    item.reviewStatus === "accepted" && "border-emerald-300/30 bg-emerald-300/[0.055]",
                    item.reviewStatus === "rejected" && "border-rose-300/25 bg-rose-300/[0.045] opacity-75",
                    item.reviewStatus === "pending" && "border-white/10 bg-white/[0.025]",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-slate-600 font-mono text-slate-300">{item.id}</Badge>
                      <Badge variant="outline" className="border-cyan-300/25 text-cyan-200">{item.claimId}</Badge>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        item.reviewStatus === "accepted" && "border-emerald-300/30 text-emerald-200",
                        item.reviewStatus === "rejected" && "border-rose-300/30 text-rose-200",
                        item.reviewStatus === "pending" && "border-amber-300/30 text-amber-200",
                      )}
                    >
                      {item.reviewStatus === "accepted" ? "已接受" : item.reviewStatus === "rejected" ? "已拒绝" : "待审核"}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_0.55fr_0.55fr]">
                    <label className="space-y-2">
                      <span className="text-[13px] text-slate-400">指标名称</span>
                      <Input
                        value={item.label}
                        onChange={(event) => updateCandidate(item.id, { label: event.target.value, reviewStatus: "pending" })}
                        className="border-white/10 bg-slate-950/40 text-slate-100"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[13px] text-slate-400">数值 · CNY mn</span>
                      <Input
                        type="number"
                        step="0.001"
                        value={Number.isFinite(item.valueMn) ? item.valueMn : ""}
                        onChange={(event) => updateCandidate(item.id, { valueMn: event.target.value === "" ? Number.NaN : Number(event.target.value), reviewStatus: "pending" })}
                        className="border-white/10 bg-slate-950/40 font-mono text-slate-100"
                      />
                    </label>
                    <div className="space-y-2">
                      <span className="text-[13px] text-slate-400">人工方向标注</span>
                      <Select
                        value={item.direction}
                        onValueChange={(value) => updateCandidate(item.id, { direction: value as Direction, reviewStatus: "pending" })}
                      >
                        <SelectTrigger className="w-full border-white/10 bg-slate-950/40 text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                          <SelectItem value="支持">支持</SelectItem>
                          <SelectItem value="反证">反证</SelectItem>
                          <SelectItem value="中性">中性</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2.5">
                    <p className="text-[13px] leading-6 text-slate-400">
                      <a href={`${source.url}#page=${parserResult?.metrics[item.metricKey]?.page ?? 1}`} target="_blank" rel="noreferrer" className="text-cyan-200 underline underline-offset-4">{item.location}</a> · {item.snippet} · 系统方向：{item.systemDirection}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateCandidate(item.id, { reviewStatus: "rejected" })}
                      className="border-rose-300/25 bg-rose-300/[0.04] text-rose-200 hover:bg-rose-300/10 hover:text-rose-100"
                    >
                      <X /> 拒绝进入研究链
                    </Button>
                    <Button
                      type="button"
                      onClick={() => updateCandidate(item.id, { reviewStatus: "accepted" })}
                      disabled={parserResult?.canPromoteToEvidence !== true}
                      className="bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                    >
                      <Check /> 接受证据
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-white/8 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                {visibleBlockers.length
                  ? "存在 blocker，已隔离候选证据，不能生成变化。"
                  : allReviewed && canPromoteToEvidence
                    ? "全部证据已处理，F-02 已闭合，可以生成变化。"
                    : "还有 " + (candidates.length - reviewedCount) + " 条证据等待处理。"}
              </p>
              <Button
                type="button"
                onClick={generateDiff}
                disabled={!allReviewed || !canPromoteToEvidence}
                className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                生成 Graph Diff <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      )}

      {(step === "diff" || step === "saved") && source && (
        <div className="grid gap-4 xl:grid-cols-[1fr_0.38fr]">
          <div className="research-panel">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                  Graph Diff · C-04
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">新信息改变了什么</h3>
              </div>
              <Badge className="w-fit bg-cyan-300 text-slate-950">{accepted.length} 条证据进入研究链</Badge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Evidence</p>
                <p className="mt-3 text-lg font-semibold text-white">新增 {accepted.length} 条已审核证据</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {accepted.length ? accepted.map((item) => (
                    <Badge key={item.id} variant="outline" className="border-emerald-300/25 text-emerald-200">{item.id}</Badge>
                  )) : <span className="text-sm text-slate-500">无证据被接受</span>}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Claim · C-04</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-slate-300">系统信号</span>
                  <ArrowRight className="size-4 text-cyan-300" />
                  <span className="text-lg font-semibold text-emerald-300">{claimSignal}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">信号由已冻结的 C-04 规则计算。人工最终状态仍为“成立”，本次只确认事实证据。</p>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Formula · F-02</p>
                {formula ? (
                  <>
                    <p className="mt-3 font-mono text-base text-cyan-100">
                      {formatValue(formula.attributable)} − ({formatValue(formula.nonRecurring)}) = {formatValue(formula.calculated)}
                    </p>
                    <p className={cn("mt-3 text-sm", formula.consistent ? "text-emerald-300" : "text-rose-300")}>
                      {formula.consistent ? "复算与披露值一致" : "复算存在差异，禁止进入下一步"}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-amber-200">缺少 F-02 所需的已接受证据，公式不执行。</p>
                )}
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm text-slate-400">Decision</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-slate-300">继续研究</span>
                  <ArrowRight className="size-4 text-cyan-300" />
                  <span className="text-lg font-semibold text-white">继续研究</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">理由发生变化，但 EG-01、EG-02 未完成，动作不升级。</p>
              </div>
            </div>

            {reviewedRun?.chain && <ChainResultPanel result={reviewedRun.chain} />}

            <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-200" />
                <div>
                  <p className="font-medium text-amber-100">人工判断仍是硬闸门</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    A-03 与 K-07 尚未通过 EG-01，会计边界不能由证据数量或公式自动决定。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="research-panel h-fit">
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
              Version Snapshot
            </p>
            {step === "saved" ? (
              <div className="mt-4">
                <div className="grid size-12 place-items-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-emerald-200">
                  <CheckCircle2 className="size-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{savedVersion} 已保存{workspace === "regression" ? "（回归演示）" : ""}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  当前版本保存在本机浏览器，包含来源、审核记录、Graph Diff、公式结果与阻塞关卡。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetWorkflow}
                  className="mt-5 w-full border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white"
                >
                  <RotateCcw /> 开始下一次更新
                </Button>
              </div>
            ) : (
              <div className="mt-4">
                <Save className="size-6 text-cyan-300" />
                <h3 className="mt-3 text-lg font-semibold text-white">保存研究快照</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  保存来源、原始与修改数值、系统信号、审核人自填记录及专业待复核项。本次确认不会批准投资决策。
                </p>
                <label className="mt-4 block space-y-2 text-sm text-slate-300">
                  <span>证据审核人（自行填写）</span>
                  <Input aria-label="证据审核人（自行填写）" value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="border-white/10 bg-slate-950/40 text-white" />
                </label>
                <Button
                  type="button"
                  onClick={saveVersion}
                  disabled={!canPromoteToEvidence || !reviewer.trim()}
                  className="mt-5 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                >
                  <Save /> 保存为新版本
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("review")}
                  className="mt-2 w-full text-slate-400 hover:bg-white/5 hover:text-white"
                >
                  返回修改证据
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] px-4 py-3 text-sm leading-6 text-slate-300">
          <GitCompareArrows className="mt-1 size-4 shrink-0 text-cyan-300" />
          <p>{message}</p>
        </div>
      )}
    </section>
  );
}
