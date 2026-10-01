import assert from "node:assert/strict";
import test from "node:test";
import { REVIEW_ACCESS_COOKIE, authorizedReviewer, hasReviewBearer, hasReviewSession, reviewSessionValue } from "../lib/reviewer-access.ts";

const accessCode = "NOT_A_REAL_ACCESS_CODE_UNIT_TEST_ONLY";

test("review access accepts the exact bearer code only", async () => {
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: `Bearer ${accessCode}` } }), accessCode), true);
  assert.equal(hasReviewBearer(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }), accessCode), false);
});

test("review session uses a derived cookie instead of the raw access code", async () => {
  const value = await reviewSessionValue(accessCode);
  assert.notEqual(value, accessCode);
  const request = new Request("https://example.test", { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=${value}` } });
  assert.equal(await hasReviewSession(request, accessCode), true);
  assert.equal(await authorizedReviewer(request, accessCode), true);
  assert.equal(await hasReviewSession(new Request("https://example.test", { headers: { cookie: `${REVIEW_ACCESS_COOKIE}=invalid` } }), accessCode), false);
});

test("short or missing server access codes never authorize", async () => {
  const request = new Request("https://example.test", { headers: { authorization: "Bearer short" } });
  assert.equal(await authorizedReviewer(request, "short"), false);
  assert.equal(await authorizedReviewer(request, ""), false);
});
