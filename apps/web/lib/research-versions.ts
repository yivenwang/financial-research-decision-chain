import type { MetricKey, ParseIssue } from "@/lib/parser-v04";

export const VERSION_STORAGE_KEY = "anker-research-mvp-versions";
export const ACTIVE_VERSION_KEY = "anker-research-mvp-active-version";
export const VERSION_UPDATED_EVENT = "anker-research-version-updated";

export type StoredEvidence = {
  id: string;
  metricKey?: MetricKey;
  label: string;
  valueMn: number;
  comparisonMn?: number | null;
  changePct: number | null;
  disclosedChange?: number | null;
  direction: "支持" | "反证";
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
  source: {
    name: string;
    size: number;
    pageCount: number;
    mode: "pdf" | "sample" | "baseline";
    sourceId?: string;
    period?: string;
    url?: string;
  } | null;
  evidence: StoredEvidence[];
  claim: {
    id: string;
    before: string;
    after: string;
  };
  formula: StoredFormula;
  decision: string;
  blockedGates: string[];
  parser?: {
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

export function readStoredVersions() {
  if (typeof window === "undefined") return [] as ResearchVersion[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VERSION_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isResearchVersion);
  } catch {
    return [];
  }
}

export function writeStoredVersions(versions: ResearchVersion[]) {
  window.localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
  window.dispatchEvent(new Event(VERSION_UPDATED_EVENT));
}

export function nextVersionId(versions: ResearchVersion[]) {
  const highest = versions.reduce((current, version) => {
    const parsed = Number(version.versionId.replace("V-", ""));
    return Number.isFinite(parsed) ? Math.max(current, parsed) : current;
  }, 1);
  return "V-" + String(highest + 1).padStart(2, "0");
}

export function readActiveVersionId(versions: ResearchVersion[]) {
  if (typeof window === "undefined") return "V-01";
  const saved = window.localStorage.getItem(ACTIVE_VERSION_KEY);
  if (saved && (saved === "V-01" || versions.some((version) => version.versionId === saved))) {
    return saved;
  }
  return versions.at(-1)?.versionId ?? "V-01";
}

export function setActiveVersionId(versionId: string) {
  window.localStorage.setItem(ACTIVE_VERSION_KEY, versionId);
  window.dispatchEvent(new Event(VERSION_UPDATED_EVENT));
}
