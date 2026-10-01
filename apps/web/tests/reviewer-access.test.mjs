import assert from "node:assert/strict";
import test from "node:test";
import { REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_DEADLINE_ISO, authorizedReviewer, hasReviewBearer, hasReviewSession, reviewAccessDeadlineMs, reviewAccessOpen, reviewSessionSeconds, reviewSessionValue } from "../lib/reviewer-access.ts";

const accessCode = "NOT_A_REAL_ACCESS_CODE_UNIT_TEST_ONLY";
const beforeDeadline = Date.parse("2026-10-08T15:59:58Z");
const afterDeadline = Date.parse("2026-10-08T16:00:00Z");

test("review access accepts the exact bearer code only before the deadline", async () => {
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: `Bearer ${accessCode}` } }), accessCode, beforeDeadline), true);
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }), accessCode, beforeDeadline), false);
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: `Bearer ${accessCode}` } }), accessCode, afterDeadline), false);
});

test("review session uses a derived cookie and expires at the fixed deadline", async () => {
  const value = await reviewSessionValue(accessCode);
  assert.notEqual(value, accessCode);
  const request = new Request("https://example.test", { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=${value}` } });
  assert.equal(await hasReviewSession(request, accessCode, beforeDeadline), true);
  assert.equal(await authorizedReviewer(request, accessCode, beforeDeadline), true);
  assert.equal(await hasReviewSession(request, accessCode, afterDeadline), false);
  assert.equal(await authorizedReviewer(request, accessCode, afterDeadline), false);
  assert.equal(await hasReviewSession(new Request("https://example.test", { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=invalid` } }), accessCode, beforeDeadline), false);
});

test("deadline is Oct 8 23:59 Beijing and remaining cookie life never extends past it", () => {
  const deadline = reviewAccessDeadlineMs();
  assert.equal(REVIEW_ACCESS_DEADLINE_ISO, "2026-10-08T23:59:59+08:00");
  assert.equal(deadline, Date.parse("2026-10-08T15:59:59Z"));
  assert.equal(reviewAccessOpen(beforeDeadline, deadline), true);
  assert.equal(reviewAccessOpen(afterDeadline, deadline), false);
  assert.equal(reviewSessionSeconds(beforeDeadline, deadline), 1);
  assert.equal(reviewSessionSeconds(afterDeadline, deadline), 0);
});

test("short or missing server access codes never authorize", async () => {
  const request = new Request("https://example.test", { headers: { authorization: "Bearer short" } });
  assert.equal(await authorizedReviewer(request, "short", beforeDeadline), false);
  assert.equal(await authorizedReviewer(request, "", beforeDeadline), false);
});
