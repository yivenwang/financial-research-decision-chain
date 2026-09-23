import { decideReview } from "../lib/adversarial-review.ts";

// Offline policy replay only. It never calls Jev or the research model.
export default class ReviewerOffline {
  id() { return "beacon-review-policy-v1"; }
  async callApi(_prompt, context) {
    const verdict = JSON.parse(context.vars.verdict);
    return { output: decideReview(verdict).outcome };
  }
}
