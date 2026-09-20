import { createQuestionHandler } from "@/lib/research-question.server";

export const runtime = "nodejs";
// Two separate user actions; each request makes at most one provider call.
export const maxDuration = 180;
export const dynamic = "force-dynamic";
const handler = createQuestionHandler();
export const GET = handler.GET;
export const POST = handler.POST;
