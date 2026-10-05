export type ResearchBrowserCapabilities = Readonly<{
  secure: boolean;
  hashing: boolean;
  ids: boolean;
  locks: boolean;
}>;

export type ResearchBrowserCapability = keyof ResearchBrowserCapabilities;

const capabilityLabels: Record<ResearchBrowserCapability, string> = {
  secure: "安全上下文（window.isSecureContext）",
  hashing: "Web Crypto（crypto.subtle）",
  ids: "安全标识生成（crypto.randomUUID）",
  locks: "跨标签页写入锁（navigator.locks）",
};

export function inspectResearchBrowserCapabilities(): ResearchBrowserCapabilities {
  if (typeof window === "undefined") {
    return { secure: false, hashing: false, ids: false, locks: false };
  }
  return {
    secure: window.isSecureContext === true,
    hashing: typeof window.crypto?.subtle?.digest === "function",
    ids: typeof window.crypto?.randomUUID === "function",
    locks: typeof window.navigator?.locks?.request === "function",
  };
}

export function missingResearchBrowserCapabilities(
  capabilities: ResearchBrowserCapabilities = inspectResearchBrowserCapabilities(),
): ResearchBrowserCapability[] {
  return (Object.keys(capabilityLabels) as ResearchBrowserCapability[])
    .filter((capability) => !capabilities[capability]);
}

export function researchBrowserIssue(capabilities?: ResearchBrowserCapabilities): string | null {
  const missing = missingResearchBrowserCapabilities(capabilities);
  if (missing.length === 0) return null;
  return `当前浏览器缺少：${missing.map((capability) => capabilityLabels[capability]).join("、")}。请通过 HTTPS 使用支持 Web Crypto 与 Web Locks 的现代浏览器；操作已阻断，未写入研究记录，也未调用模型。`;
}

export class ResearchBrowserCapabilityError extends Error {
  readonly code = "RESEARCH_BROWSER_CAPABILITY_MISSING";
  readonly missing: ResearchBrowserCapability[];

  constructor(capabilities?: ResearchBrowserCapabilities) {
    const missing = missingResearchBrowserCapabilities(capabilities);
    super(researchBrowserIssue(capabilities) ?? "浏览器研究能力检查失败。");
    this.name = "ResearchBrowserCapabilityError";
    this.missing = missing;
  }
}

export function requireResearchBrowserCapabilities(
  capabilities?: ResearchBrowserCapabilities,
): ResearchBrowserCapabilities {
  const available = capabilities ?? inspectResearchBrowserCapabilities();
  if (missingResearchBrowserCapabilities(available).length > 0) {
    throw new ResearchBrowserCapabilityError(available);
  }
  return available;
}

export async function runResearchBrowserOperation<T>(
  operation: () => T | Promise<T>,
  capabilities?: ResearchBrowserCapabilities,
): Promise<T> {
  requireResearchBrowserCapabilities(capabilities);
  return operation();
}
