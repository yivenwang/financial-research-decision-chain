import { createMemoHandler } from "../../../lib/research-memo.server.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const handler = createMemoHandler();
export const GET = handler.GET;
export const POST = handler.POST;
