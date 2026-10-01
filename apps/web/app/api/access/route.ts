import { NextResponse } from "next/server";
import { REVIEW_ACCESS_COOKIE, REVIEW_SESSION_SECONDS, hasReviewBearer, hasReviewSession, reviewSessionValue } from "@/lib/reviewer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const configured = process.env.RESEARCH_APP_ORIGIN?.trim();
  return origin === (configured || new URL(request.url).origin);
}

function response(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet" } });
}

export async function GET(request: Request) {
  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  return response({ configured: accessCode.length >= 16, session: await hasReviewSession(request, accessCode) });
}

export async function POST(request: Request) {
  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  if (accessCode.length < 16) return response({ error: "审验访问服务尚未配置。" }, 503);
  if (!sameOrigin(request)) return response({ error: "请求来源不匹配。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "请求格式错误。" }, 415);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > 4096) return response({ error: "请求内容过大。" }, 413);
  let code = "";
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return response({ error: "请求内容过大。" }, 413);
    const body = JSON.parse(raw) as { code?: unknown };
    if (typeof body.code === "string" && Object.keys(body).length === 1) code = body.code;
  } catch { return response({ error: "请求内容无效。" }, 400); }
  if (!hasReviewBearer(new Request(request.url, { headers: { authorization: `Bearer ${code}` } }), accessCode)) {
    return response({ error: "访问码不正确。" }, 401);
  }

  const result = response({ ok: true });
  result.cookies.set(REVIEW_ACCESS_COOKIE, await reviewSessionValue(accessCode), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: REVIEW_SESSION_SECONDS,
  });
  return result;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return response({ error: "请求来源不匹配。" }, 403);
  const result = response({ ok: true });
  result.cookies.set(REVIEW_ACCESS_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return result;
}
