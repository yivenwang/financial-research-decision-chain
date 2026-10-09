import { createQuestionHandler } from "@/lib/research-question.server";

export const runtime = "nodejs";
// Two separate user actions; each request makes at most one provider call.
export const maxDuration = 180;
export const dynamic = "force-dynamic";
const handler = createQuestionHandler();
export async function GET(request: Request) { return handler.GET(request); }
export const POST = handler.POST;
