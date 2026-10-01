import { NextRequest, NextResponse } from "next/server";
import { hasReviewSession } from "@/lib/reviewer-access";

function protect(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicPath = pathname === "/access" || pathname === "/api/access" || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname);
  if (publicPath) return protect(NextResponse.next());

  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  if (await hasReviewSession(request, accessCode)) return protect(NextResponse.next());

  if (pathname.startsWith("/api/")) {
    return protect(NextResponse.json({ code: "REVIEW_ACCESS_REQUIRED", error: "请先使用审验访问码进入系统。" }, { status: 401 }));
  }

  const target = request.nextUrl.clone();
  target.pathname = "/access";
  target.search = "";
  target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return protect(NextResponse.redirect(target));
}

export const config = { matcher: "/:path*" };
