export function safeReviewReturnPath(value: string | null, origin: string) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch { return "/"; }
}

const PUBLIC_FILES = new Set(["/beacon-mark.svg", "/favicon.svg", "/favicon.ico", "/globe.svg", "/file.svg", "/window.svg", "/assets/beacon/lighthouse-hero-v2.webp", "/vendor/pdfjs/pdf.worker.min.mjs"]);
export function publicReviewPath(pathname: string) {
  return pathname === "/access" || pathname === "/api/access" || pathname.startsWith("/_next/static/") || PUBLIC_FILES.has(pathname);
}
export function reviewBearerPath(pathname: string) {
  return pathname === "/api/research-question" || pathname === "/api/research-memo";
}

// Process-local safety net. The reverse proxy must add a trusted per-IP limit.
export function createAccessLimiter(limit = 20, windowMs = 60000) {
  let started = 0, attempts = 0;
  return (now = Date.now()) => {
    if (now >= started + windowMs || now < started) { started = now; attempts = 0; }
    return ++attempts <= limit;
  };
}
