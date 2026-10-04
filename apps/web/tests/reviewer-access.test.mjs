import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { REVIEW_ACCESS_COOKIE, REVIEW_ACCESS_DEADLINE_ISO, authorizedReviewer, hasReviewBearer, hasReviewSession, reviewAccessDeadlineMs, reviewAccessOpen, reviewSessionSeconds, reviewSessionValue } from "../lib/reviewer-access.ts";

process.env.REVIEW_SESSION_SECRET = "NOT_A_REAL_SESSION_SECRET_UNIT_TEST_ONLY";
delete process.env.REVIEW_ACCESS_DEADLINE;

const accessCode = "NOT_A_REAL_ACCESS_CODE_UNIT_TEST_ONLY";
const beforeDeadline = Date.parse("2026-10-08T15:59:58Z");
const afterDeadline = Date.parse("2026-10-08T16:00:00Z");

test("review access accepts the exact bearer code only before the deadline", async () => {
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: `Bearer ${accessCode}` } }), accessCode, beforeDeadline), true);
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }), accessCode, beforeDeadline), false);
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: `Bearer ${accessCode}` } }), accessCode, afterDeadline), false);
});

test("review session uses a unique signed cookie and expires at the fixed deadline", async () => {
  const value = await reviewSessionValue(accessCode, beforeDeadline - 1000);
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

test("signed sessions reject old hashes, expiry tampering, future issue times and key/code rotation", async () => {
  const issuedAt = beforeDeadline - 60000;
  const value = await reviewSessionValue(accessCode, issuedAt);
  assert.notEqual(value, await reviewSessionValue(accessCode, issuedAt));
  const request = (cookie) => new Request("https://example.test", { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=${cookie}` } });
  const oldHash = createHash("sha256").update(`beacon-review-session.v1\n${accessCode}`).digest("hex");
  assert.equal(await hasReviewSession(request(oldHash), accessCode, beforeDeadline), false);
  assert.equal(await hasReviewSession(request(value), accessCode, issuedAt - 1), false);
  assert.equal(await hasReviewSession(request(value), accessCode + "rotated", beforeDeadline), false);
  const fields = value.split("."); fields[2] = String(afterDeadline + 60000);
  assert.equal(await hasReviewSession(request(fields.join(".")), accessCode, beforeDeadline), false);
  const secret = process.env.REVIEW_SESSION_SECRET;
  try {
    process.env.REVIEW_SESSION_SECRET = "ANOTHER_SYNTHETIC_SIGNING_SECRET_TEST_ONLY";
    assert.equal(await hasReviewSession(request(value), accessCode, beforeDeadline), false);
    delete process.env.REVIEW_SESSION_SECRET;
    assert.equal(await hasReviewSession(request(value), accessCode, beforeDeadline), false);
    await assert.rejects(reviewSessionValue(accessCode, issuedAt));
  } finally { process.env.REVIEW_SESSION_SECRET = secret; }
});
