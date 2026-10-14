import { NextRequest, NextResponse } from "next/server";
import { hasReviewBearer, hasReviewSession } from "@/lib/reviewer-access";
import { publicReviewPath, reviewBearerPath } from "@/lib/review-security";

function protect(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  // Compatible with Next hydration; strict script nonces remain a follow-up.
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Current product uses fixed static images and no next/image transformation.
  if (pathname === "/_next/image") return protect(new NextResponse(null, { status: 404 }));
  if (publicReviewPath(pathname)) return protect(NextResponse.next());

  const accessCode = process.env.RESEARCH_DEMO_TOKEN ?? "";
  const bearerAllowed = reviewBearerPath(pathname) && (pathname !== "/api/research-question" || request.method === "GET" && !request.nextUrl.searchParams.has("operationId"));
  if ((bearerAllowed && hasReviewBearer(request, accessCode)) || await hasReviewSession(request, accessCode)) return protect(NextResponse.next());

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
