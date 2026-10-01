export const REVIEW_ACCESS_COOKIE = "beacon_review_access";
export const REVIEW_ACCESS_DEADLINE_ISO = "2026-10-08T23:59:59+08:00";
export const REVIEW_ACCESS_DEADLINE_LABEL = "2026 年 10 月 8 日 23:59（北京时间）";

const encoder = new TextEncoder();

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function reviewAccessDeadlineMs(raw = process.env.REVIEW_ACCESS_DEADLINE?.trim()) {
  const parsed = Date.parse(raw || REVIEW_ACCESS_DEADLINE_ISO);
  return Number.isFinite(parsed) ? parsed : Date.parse(REVIEW_ACCESS_DEADLINE_ISO);
}

export function reviewAccessOpen(now = Date.now(), deadlineMs = reviewAccessDeadlineMs()) {
  return now <= deadlineMs;
}

export function reviewSessionSeconds(now = Date.now(), deadlineMs = reviewAccessDeadlineMs()) {
  return Math.max(0, Math.floor((deadlineMs - now) / 1000));
}

export async function reviewSessionValue(accessCode: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(`beacon-review-session.v1\n${accessCode}`)));
}

function cookieValue(request: Request, name: string) {
  const row = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!row) return "";
  try { return decodeURIComponent(row.slice(name.length + 1)); } catch { return ""; }
}

export async function hasReviewSession(request: Request, accessCode: string, now = Date.now()) {
  if (!reviewAccessOpen(now) || accessCode.length < 16) return false;
  return secureEqual(cookieValue(request, REVIEW_ACCESS_COOKIE), await reviewSessionValue(accessCode));
}

export function hasReviewBearer(request: Request, accessCode: string, now = Date.now()) {
  if (!reviewAccessOpen(now) || accessCode.length < 16) return false;
  return secureEqual(request.headers.get("authorization") ?? "", `Bearer ${accessCode}`);
}

export async function authorizedReviewer(request: Request, accessCode: string, now = Date.now()) {
  return hasReviewBearer(request, accessCode, now) || hasReviewSession(request, accessCode, now);
}
