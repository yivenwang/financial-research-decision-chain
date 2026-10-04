import { NextResponse } from "next/server";
import { REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_DEADLINE_LABEL, hasReviewBearer, hasReviewSession, reviewAccessDeadlineMs, reviewAccessOpen, reviewSessionConfigured, reviewSessionSeconds, reviewSessionValue } from "@/lib/reviewer-access";
import { BodyReadError, readBoundedJson } from "@/lib/request-body";
import { createAccessLimiter } from "@/lib/review-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowLogin = createAccessLimiter();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.RESEARCH_APP_ORIGIN?.trim();
  return origin === (configured || new URL(request.url).origin);
}

function secureCookie(request: Request) {
  const configured = process.env.RESEARCH_APP_ORIGIN?.trim();
  if (configured) {
    try { return new URL(configured).protocol === "https:"; } catch {}
  }
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === "https:";
  return new URL(request.url).protocol === "https:";
}

function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet" } });
}

export async function GET(request: Request) {
  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  return response({
    configured: accessCode.length >= 16 && reviewSessionConfigured(),
    session: await hasReviewSession(request, accessCode),
    deadline: new Date(reviewAccessDeadlineMs()).toISOString(),
    expired: !reviewAccessOpen(),
  });
}

export async function POST(request: Request) {
  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  if (accessCode.length < 16 || !reviewSessionConfigured()) return response({ error: "审验访问服务尚未配置。" }, 503);
  if (!reviewAccessOpen()) return response({ error: `本轮审验访问已截止（默认截止：${REVIEW_ACCESS_DEADLINE_LABEL}）。` }, 410);
  if (!sameOrigin(request)) return response({ error: "请求来源不匹配。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "请求格式错误。" }, 415);

  if (!allowLogin()) {
    const limited = response({ error: "访问验证过于频繁，请一分钟后重试。" }, 429);
    limited.headers.set("Retry-After", "60");
    return limited;
  }
  let code = "";
  try {
    const body = await readBoundedJson(request, 4096) as { code?: unknown };
    if (typeof body.code === "string" && Object.keys(body).length === 1) code = body.code;
  } catch (error) {
    return response({ error: "请求内容无效、过大或读取超时。" }, error instanceof BodyReadError ? error.code === "BODY_TOO_LARGE" ? 413 : error.code === "BODY_TIMEOUT" ? 408 : 400 : 400);
  }

  if (!hasReviewBearer(new Request(request.url, { headers: { authorization: `Bearer ${code}` } }), accessCode)) {
    return response({ error: "访问码不正确。" }, 401);
  }

  const deadlineMs = reviewAccessDeadlineMs();
  const now = Date.now();
  if (!reviewAccessOpen(now, deadlineMs) || reviewSessionSeconds(now, deadlineMs) === 0) return response({ error: "本轮审验访问已截止。" }, 410);
  const result = response({ ok: true, deadline: new Date(deadlineMs).toISOString() });
  result.cookies.set(REVIEW_ACCESS_COOKIE, await reviewSessionValue(accessCode, now), {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "strict",
    path: "/",
    maxAge: reviewSessionSeconds(now, deadlineMs),
    expires: new Date(deadlineMs),
  });
  return result;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return response({ error: "请求来源不匹配。" }, 403);
  const result = response({ ok: true });
  result.cookies.set(REVIEW_ACCESS_COOKIE, "", { httpOnly: true, secure: secureCookie(request), sameSite: "strict", path: "/", maxAge: 0 });
  return result;
}
