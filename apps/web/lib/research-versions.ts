import type { MetricKey } from "../../../lib/parser-v04.ts";
import type { ParseIssueV06 as ParseIssue, ParseResultV06 } from "../../../lib/parser-v06.ts";
import type { C04ChainResult } from "../../../lib/chain-v01.ts";
import { getSourceRecord } from "./source-records.ts";

export const VERSION_STORAGE_KEY = "anker-research-mvp-versions";
export const ACTIVE_VERSION_KEY = "anker-research-mvp-active-version";
export const VERSION_UPDATED_EVENT = "anker-research-version-updated";
export type WorkspaceScope = "research" | "regression";

export function storageKeys(scope: WorkspaceScope = "research") {
  return scope === "research"
    ? { versions: VERSION_STORAGE_KEY, active: ACTIVE_VERSION_KEY }
    : { versions: `${VERSION_STORAGE_KEY}-regression`, active: `${ACTIVE_VERSION_KEY}-regression` };
}

export type StoredEvidence = {
  id: string;
  metricKey?: MetricKey;
  label: string;
  valueMn: number;
  originalValueMn?: number;
  comparisonMn?: number | null;
  changePct: number | null;
  disclosedChange?: number | null;
  direction: "支持" | "反证" | "中性";
  systemDirection?: "支持" | "反证" | "中性";
  claimId: string;
  sourceId?: string;
  period?: string;
  location: string;
  snippet: string;
  reviewStatus: "pending" | "accepted" | "rejected";
};

export type StoredFormula = {
  attributable: number;
  nonRecurring: number;
  reportedAdjusted: number;
  calculated: number;
  difference: number;
  consistent: boolean;
} | null;

export type ResearchVersion = {
  versionId: string;
  createdAt: string;
  kind?: "update" | "rollback" | "baseline";
  restoredFrom?: string;
  parentVersionId?: string;
  workspace?: WorkspaceScope;
  chain?: C04ChainResult;
  chainVersion?: string;
  humanReview?: { reviewer: string; confirmedAt: string; scope: "evidence-only"; identityVerified: false };
  source: {
    name: string;
    size: number;
    pageCount: number;
    mode: "pdf" | "sample" | "baseline";
    sourceId?: string;
    period?: string;
    url?: string;
    sha256?: string;
  } | null;
  evidence: StoredEvidence[];
  claim: {
    id: string;
    before: string;
    after: string;
    systemSignal?: string;
  };
  formula: StoredFormula;
  decision: string;
  blockedGates: string[];
  parser?: {
    version?: string;
    originalMetrics?: ParseResultV06["metrics"];
    reviewedMetrics?: ParseResultV06["metrics"];
    canPromoteToEvidence: boolean;
    blockers: ParseIssue[];
  };
};

export const baselineVersion: ResearchVersion = {
  versionId: "V-01",
  createdAt: "2026-04-10T00:00:00.000Z",
  kind: "baseline",
  source: {
    name: "安克创新 2025 年度报告 · 基线",
    size: 0,
    pageCount: 0,
    mode: "baseline",
  },
  evidence: [],
  claim: {
    id: "C-04",
    before: "待建立",
    after: "成立",
  },
  formula: null,
  decision: "继续研究",
  blockedGates: ["EG-01", "EG-02"],
};

function isResearchVersion(value: unknown): value is ResearchVersion {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ResearchVersion>;
  return (
    typeof record.versionId === "string" &&
    typeof record.createdAt === "string" &&
    Array.isArray(record.evidence) &&
    typeof record.decision === "string"
  );
}

export function readStoredVersions(scope: WorkspaceScope = "research") {
  if (typeof window === "undefined") return [] as ResearchVersion[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKeys(scope).versions) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isResearchVersion);
  } catch {
    return [];
  }
}

export function writeStoredVersions(versions: ResearchVersion[], scope: WorkspaceScope = "research") {
  window.localStorage.setItem(storageKeys(scope).versions, JSON.stringify(versions));
  window.dispatchEvent(new Event(VERSION_UPDATED_EVENT));
}

export function nextVersionId(versions: ResearchVersion[]) {
  const highest = versions.reduce((current, version) => {
    const parsed = Number(version.versionId.replace("V-", ""));
    return Number.isFinite(parsed) ? Math.max(current, parsed) : current;
  }, 1);
  return "V-" + String(highest + 1).padStart(2, "0");
}

export function readActiveVersionId(versions: ResearchVersion[], scope: WorkspaceScope = "research") {
  if (typeof window === "undefined") return "V-01";
  const saved = window.localStorage.getItem(storageKeys(scope).active);
  if (saved && (saved === "V-01" || versions.some((version) => version.versionId === saved))) {
    return saved;
  }
  return versions.at(-1)?.versionId ?? "V-01";
}

export function setActiveVersionId(versionId: string, scope: WorkspaceScope = "research") {
  window.localStorage.setItem(storageKeys(scope).active, versionId);
  window.dispatchEvent(new Event(VERSION_UPDATED_EVENT));
}

export function appendVersion(version: ResearchVersion, scope: WorkspaceScope = "research") {
  const raw = JSON.parse(window.localStorage.getItem(storageKeys(scope).versions) ?? "[]") as unknown;
  if (!Array.isArray(raw) || !raw.every(isResearchVersion)) throw new Error("版本库存在无法读取的记录，已停止写入以保留原数据。");
  if (raw.some((item) => item.versionId === version.versionId)) throw new Error("版本编号已被使用，请刷新后重试。");
  const record = version.source?.sourceId ? getSourceRecord(version.source.sourceId) : undefined;
  if (scope === "research" && (version.workspace === "regression" || record?.useStatus === "regression-only")) {
    throw new Error("回归材料只能保存到独立回归版本库。");
  }
  writeStoredVersions([...raw, version], scope);
  setActiveVersionId(version.versionId, scope);
}

export function createRollbackSnapshot(selected: ResearchVersion, current: ResearchVersion[], activeId: string, scope: WorkspaceScope): ResearchVersion {
  return {
    ...structuredClone(selected),
    versionId: nextVersionId(current),
    createdAt: new Date().toISOString(),
    kind: "rollback",
    restoredFrom: selected.versionId,
    parentVersionId: activeId,
    workspace: scope,
  };
}
