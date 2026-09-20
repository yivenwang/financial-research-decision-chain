import { createMemoHandler } from "../../../lib/research-memo.server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave response/audit time around the existing 150-second provider budget.
export const maxDuration = 180;
const handler = createMemoHandler();
export const GET = handler.GET;
export const POST = handler.POST;
