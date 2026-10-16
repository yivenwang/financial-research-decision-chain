import { requireResearchBrowserCapabilities } from "./research-browser.ts";

export const QUESTION_PENDING_KEY = "beacon-question-pending-v1";
export type PendingQuestion = { phase: "plan" | "execute"; id: string; body?: unknown };

// One browser profile is one shared workspace. Claim its recovery pointer before
// sending, so a second tab cannot overwrite a request whose result is unknown.
export async function claimPendingQuestion(waiting: PendingQuestion) {
  requireResearchBrowserCapabilities();
  return window.navigator.locks.request(QUESTION_PENDING_KEY, () => {
    const previous = window.localStorage.getItem(QUESTION_PENDING_KEY);
    if (previous !== null) throw new Error("其他标签页仍有待确认任务。请刷新并检查原任务状态，再开始新任务。");
    window.localStorage.setItem(QUESTION_PENDING_KEY, JSON.stringify(waiting));
  });
}

export async function clearPendingQuestion(waiting: Pick<PendingQuestion, "phase" | "id">) {
  requireResearchBrowserCapabilities();
  return window.navigator.locks.request(QUESTION_PENDING_KEY, () => {
    const previous = JSON.parse(window.localStorage.getItem(QUESTION_PENDING_KEY) ?? "null");
    if (previous?.id === waiting.id && previous.phase === waiting.phase) window.localStorage.removeItem(QUESTION_PENDING_KEY);
  });
}
