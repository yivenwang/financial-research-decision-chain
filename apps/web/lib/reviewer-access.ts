export const REVIEW_ACCESS_COOKIE = "beacon_review_access";
export const REVIEW_SESSION_SECONDS = 8 * 60 * 60;

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

export async function reviewSessionValue(accessCode: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(`beacon-review-session.v1\n${accessCode}`)));
}

function cookieValue(request: Request, name: string) {
  const row = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  if (!row) return "";
  try { return decodeURIComponent(row.slice(name.length + 1)); } catch { return ""; }
}

export async function hasReviewSession(request: Request, accessCode: string) {
  if (accessCode.length < 16) return false;
  return secureEqual(cookieValue(request, REVIEW_ACCESS_COOKIE), await reviewSessionValue(accessCode));
}

export function hasReviewBearer(request: Request, accessCode: string) {
  if (accessCode.length < 16) return false;
  return secureEqual(request.headers.get("authorization") ?? "", `Bearer ${accessCode}`);
}

export async function authorizedReviewer(request: Request, accessCode: string) {
  return hasReviewBearer(request, accessCode) || hasReviewSession(request, accessCode);
}
