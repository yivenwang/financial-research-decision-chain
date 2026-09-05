"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileClock,
  GitCommitHorizontal,
  HardDrive,
  History,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  VERSION_UPDATED_EVENT,
  baselineVersion,
  nextVersionId,
  readActiveVersionId,
  readStoredVersions,
  setActiveVersionId,
  writeStoredVersions,
  type ResearchVersion,
} from "@/lib/research-versions";
import { cn } from "@/lib/utils";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function versionKind(version: ResearchVersion) {
  if (version.kind === "baseline") return "基线";
  if (version.kind === "rollback") return "回滚";
  return "材料更新";
}

function VersionBadge({ version }: { version: ResearchVersion }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        version.kind === "rollback" && "border-amber-300/30 bg-amber-300/10 text-amber-200",
        version.kind === "baseline" && "border-slate-600 bg-slate-900/60 text-slate-300",
        (!version.kind || version.kind === "update") && "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
      )}
    >
      {versionKind(version)}
    </Badge>
  );
}

export function VersionHistory() {
  const [storedVersions, setStoredVersions] = useState<ResearchVersion[]>([]);
  const [activeVersionId, setActive] = useState("V-01");
  const [selectedVersionId, setSelected] = useState("V-01");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function syncVersions() {
      const stored = readStoredVersions();
      const active = readActiveVersionId(stored);
      setStoredVersions(stored);
      setActive(active);
      setSelected(active);
    }

    syncVersions();
    window.addEventListener(VERSION_UPDATED_EVENT, syncVersions);
    window.addEventListener("storage", syncVersions);
    return () => {
      window.removeEventListener(VERSION_UPDATED_EVENT, syncVersions);
      window.removeEventListener("storage", syncVersions);
    };
  }, []);

  const allVersions = useMemo(
    () => [baselineVersion, ...storedVersions],
    [storedVersions],
  );
  const selectedVersion =
    allVersions.find((version) => version.versionId === selectedVersionId) ?? baselineVersion;
  const newestFirst = [...allVersions].reverse();
  const acceptedCount = selectedVersion.evidence.filter(
    (item) => item.reviewStatus === "accepted",
  ).length;
  const rejectedCount = selectedVersion.evidence.filter(
    (item) => item.reviewStatus === "rejected",
  ).length;
  const rollbackTested = storedVersions.some((version) => version.kind === "rollback");
  const canRollback = storedVersions.length > 0 && selectedVersion.versionId !== activeVersionId;

  function performRollback() {
    const current = readStoredVersions();
    const versionId = nextVersionId(current);
    const rollbackVersion: ResearchVersion = {
      ...selectedVersion,
      versionId,
      createdAt: new Date().toISOString(),
      kind: "rollback",
      restoredFrom: selectedVersion.versionId,
      source: selectedVersion.source ? { ...selectedVersion.source } : null,
      evidence: selectedVersion.evidence.map((item) => ({ ...item })),
      claim: { ...selectedVersion.claim },
      formula: selectedVersion.formula ? { ...selectedVersion.formula } : null,
      blockedGates: [...selectedVersion.blockedGates],
    };
    writeStoredVersions([...current, rollbackVersion]);
    setActiveVersionId(versionId);
    setStoredVersions([...current, rollbackVersion]);
    setActive(versionId);
    setSelected(versionId);
    setNotice(versionId + " 已创建，内容恢复自 " + selectedVersion.versionId + "；原历史未被覆盖。");
  }

  const readiness = [
    { label: "Slice 01 决策链", pass: true },
    { label: "Slice 02 材料更新", pass: true },
    { label: "S-06 零引用保护", pass: true },
    { label: "版本历史可读取", pass: true },
    { label: "回滚已人工验收", pass: rollbackTested },
  ];
  const readinessCount = readiness.filter((item) => item.pass).length;

  return (
    <section className="space-y-4">
      <div className="research-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
              Slice 03 · Version Ledger
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              历史只追加，不覆盖；回滚也必须留下记录
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              每个快照保存来源、证据审核、论点变化、公式结果、决策与专业关卡。当前仍是浏览器本机版本库。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
              <ShieldCheck /> Slice 02 · PASS
            </Badge>
            <Badge variant="outline" className="border-slate-600 bg-slate-900/60 text-slate-300">
              <LockKeyhole /> S-06 · 0 次引用
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.42fr_1fr]">
        <aside className="research-panel h-fit">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                Timeline
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">版本时间线</h3>
            </div>
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              {allVersions.length} 个版本
            </Badge>
          </div>

          <div className="mt-5 space-y-2.5">
            {newestFirst.map((version) => {
              const selected = version.versionId === selectedVersion.versionId;
              const active = version.versionId === activeVersionId;
              return (
                <button
                  key={version.versionId}
                  type="button"
                  onClick={() => {
                    setSelected(version.versionId);
                    setNotice(null);
                  }}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-cyan-300/40 bg-cyan-300/[0.08]"
                      : "border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <GitCommitHorizontal className={cn("size-4", active ? "text-emerald-300" : "text-slate-500")} />
                      <span className="font-mono text-sm font-semibold text-slate-100">{version.versionId}</span>
                    </div>
                    {active && <Badge className="bg-emerald-300 text-emerald-950">当前</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VersionBadge version={version} />
                    {version.restoredFrom && (
                      <span className="text-[13px] text-amber-200">来自 {version.restoredFrom}</span>
                    )}
                  </div>
                  <p className="mt-2 text-[13px] text-slate-500">{formatDate(version.createdAt)}</p>
                </button>
              );
            })}
          </div>

          {storedVersions.length === 0 && (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-4 text-sm leading-6 text-slate-300">
              还没有更新快照。先到“材料更新”完成一次保存，系统才有可回滚的版本。
            </div>
          )}
        </aside>

        <div className="space-y-4">
          <article className="research-panel">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-xl font-semibold text-white">{selectedVersion.versionId}</h3>
                  <VersionBadge version={selectedVersion} />
                  {selectedVersion.versionId === activeVersionId && (
                    <Badge className="bg-emerald-300 text-emerald-950">当前活动版本</Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-400">{formatDate(selectedVersion.createdAt)}</p>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canRollback}
                    className="border-amber-300/25 bg-amber-300/[0.055] text-amber-100 hover:bg-amber-300/10 hover:text-white"
                  >
                    <RotateCcw /> 回滚到此版本
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-slate-700 bg-slate-950 text-slate-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>恢复 {selectedVersion.versionId} 的研究状态？</AlertDialogTitle>
                    <AlertDialogDescription className="leading-6 text-slate-400">
                      系统不会删除当前版本，而会创建一个新的回滚快照，并记录恢复来源。历史版本始终保留。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">
                      取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={performRollback}
                      className="bg-amber-300 text-amber-950 hover:bg-amber-200"
                    >
                      确认并创建回滚版本
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <FileClock className="size-4 text-cyan-300" />
                <p className="mt-3 text-[13px] text-slate-400">来源</p>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-100">
                  {selectedVersion.source?.name ?? "无来源记录"}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <History className="size-4 text-cyan-300" />
                <p className="mt-3 text-[13px] text-slate-400">证据审核</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  接受 {acceptedCount} · 拒绝 {rejectedCount}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <CheckCircle2 className="size-4 text-cyan-300" />
                <p className="mt-3 text-[13px] text-slate-400">公式状态</p>
                <p className={cn("mt-1 text-sm font-medium", selectedVersion.formula?.consistent ? "text-emerald-300" : "text-amber-200")}>
                  {selectedVersion.formula?.consistent ? "F-02 复算一致" : "无可执行公式"}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <HardDrive className="size-4 text-cyan-300" />
                <p className="mt-3 text-[13px] text-slate-400">保存位置</p>
                <p className="mt-1 text-sm font-medium text-slate-100">当前浏览器本机</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-400">Claim · {selectedVersion.claim.id}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-slate-300">{selectedVersion.claim.before}</span>
                  <ArrowRight className="size-4 text-cyan-300" />
                  <span className="text-lg font-semibold text-white">{selectedVersion.claim.after}</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-400">Decision</p>
                <p className="mt-3 text-lg font-semibold text-white">{selectedVersion.decision}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedVersion.blockedGates.map((gate) => (
                    <Badge key={gate} variant="outline" className="border-amber-300/25 text-amber-200">
                      {gate} · 阻塞
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {selectedVersion.formula && (
              <div className="mt-4 rounded-xl border border-cyan-300/18 bg-cyan-300/[0.045] p-4">
                <p className="text-sm text-slate-400">F-02 确定性复算</p>
                <p className="mt-2 font-mono text-base leading-7 text-cyan-100">
                  {selectedVersion.formula.attributable.toFixed(3)} − ({selectedVersion.formula.nonRecurring.toFixed(3)}) = {selectedVersion.formula.calculated.toFixed(3)} mn
                </p>
              </div>
            )}

            {notice && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.065] p-4 text-sm leading-6 text-slate-200">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                <p>{notice}</p>
              </div>
            )}
          </article>

          <article className="research-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                  Freeze Gate
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">功能冻结准备度 · {readinessCount} / {readiness.length}</h3>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  rollbackTested
                    ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                    : "border-amber-300/30 bg-amber-300/10 text-amber-200",
                )}
              >
                {rollbackTested ? <CheckCircle2 /> : <Clock3 />}
                {rollbackTested ? "可以申请冻结" : "等待回滚验收"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
              {readiness.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "rounded-xl border px-3 py-3",
                    item.pass
                      ? "border-emerald-300/20 bg-emerald-300/[0.045]"
                      : "border-amber-300/20 bg-amber-300/[0.045]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.pass ? (
                      <Check className="size-4 text-emerald-300" />
                    ) : (
                      <AlertTriangle className="size-4 text-amber-300" />
                    )}
                    <span className="text-sm text-slate-200">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-300/18 bg-rose-300/[0.04] p-4">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-rose-200" />
              <p className="text-sm leading-6 text-slate-300">
                在你完成一次回滚并确认结果以前，S-06 继续封存。功能冻结只冻结规则与字段，不代表 EG-01、EG-02 已通过。
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
