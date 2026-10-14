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

export function reviewSessionConfigured(secret = process.env.REVIEW_SESSION_SECRET ?? "") {
  return secret.length >= 32;
}

async function sessionSignature(payload: string, accessCode: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`beacon-review-session.v2\n${accessCode}\n${payload}`)));
}

export async function reviewSessionValue(accessCode: string, now = Date.now()) {
  const secret = process.env.REVIEW_SESSION_SECRET ?? "";
  const deadline = reviewAccessDeadlineMs();
  if (!reviewSessionConfigured(secret) || accessCode.length < 16 || !reviewAccessOpen(now, deadline)) throw new Error("REVIEW_SESSION_NOT_CONFIGURED_OR_EXPIRED");
  // Preserve the owner's Oct 8 access window; expiry is also verified on the server.
  const payload = `v2.${now}.${deadline}.${hex(crypto.getRandomValues(new Uint8Array(24)).buffer)}`;
  return `${payload}.${await sessionSignature(payload, accessCode, secret)}`;
}

function cookieValue(request: Request, name: string) {
  const row = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!row) return "";
  try { return decodeURIComponent(row.slice(name.length + 1)); } catch { return ""; }
}

export async function hasReviewSession(request: Request, accessCode: string, now = Date.now()) {
  const secret = process.env.REVIEW_SESSION_SECRET ?? "";
  if (!reviewAccessOpen(now) || accessCode.length < 16 || !reviewSessionConfigured(secret)) return false;
  const value = cookieValue(request, REVIEW_ACCESS_COOKIE);
  if (!/^v2\.[0-9]{13}\.[0-9]{13}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(value)) return false;
  const [version, issued, expires, nonce, signature] = value.split(".");
  const iat = Number(issued), exp = Number(expires);
  if (iat > now || exp < now || exp <= iat || exp > reviewAccessDeadlineMs()) return false;
  return secureEqual(signature, await sessionSignature(`${version}.${issued}.${expires}.${nonce}`, accessCode, secret));
}

// An access code is shared admission, never identity. Only a verified,
// server-issued session nonce can own a paid research operation.
export async function reviewSessionOwner(request: Request, accessCode: string, now = Date.now()): Promise<string | null> {
  if (!await hasReviewSession(request, accessCode, now)) return null;
  const nonce = cookieValue(request, REVIEW_ACCESS_COOKIE).split(".")[3];
  const key = await crypto.subtle.importKey("raw", encoder.encode(process.env.REVIEW_SESSION_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`beacon-operation-owner.v1\n${accessCode}\n${nonce}`)));
}

export function hasReviewBearer(request: Request, accessCode: string, now = Date.now()) {
  if (!reviewAccessOpen(now) || accessCode.length < 16) return false;
  return secureEqual(request.headers.get("authorization") ?? "", `Bearer ${accessCode}`);
}

export async function authorizedReviewer(request: Request, accessCode: string, now = Date.now()) {
  return hasReviewBearer(request, accessCode, now) || hasReviewSession(request, accessCode, now);
}
