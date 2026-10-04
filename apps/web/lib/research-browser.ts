type Capabilities = { secure: boolean; hashing: boolean; ids: boolean; locks: boolean };
export function researchBrowserIssue(capabilities?: Capabilities): string | null {
  const available = capabilities ?? {
    secure: typeof window !== "undefined" && window.isSecureContext,
    hashing: typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function",
    ids: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function",
    locks: typeof navigator !== "undefined" && typeof navigator.locks?.request === "function",
  };
  return Object.values(available).every(Boolean) ? null : "当前环境不支持安全生成与可靠保存。请使用 HTTPS 下的现代浏览器打开系统；本次未调用模型。";
}
