## Summary

What problem does this PR solve, and why is this change needed?

## Scope

- [ ] Parser / extraction
- [ ] Evidence lineage / auditability
- [ ] Deterministic chain / calculation
- [ ] LLM memo / prompt / schema
- [ ] UI / presentation
- [ ] CI / tooling / infrastructure
- [ ] Documentation only
- [ ] Other

## Financial business logic

Does this PR change any frozen financial definition or rule (`Claim`, `Assumption`, `Kill Criteria`, `Formula`, `Valuation`, `Decision`)?

- [ ] No
- [ ] Yes — describe the before/after behavior and link the explicit approval below

Approval / issue link (required for core financial logic changes):

## Files / modules changed

List the main files or modules changed.

## Validation

List every test, build, browser flow, or manual review performed.

- [ ] Existing deterministic tests remain green
- [ ] New regression added where appropriate
- [ ] Build checked where appropriate
- [ ] No real paid model call was triggered unintentionally

Commands / workflow runs:

## Test material governance

Does this PR use new financial materials, PDFs, fixtures, or holdout samples?

- [ ] No
- [ ] Yes — list them below and state whether each is unseen, regression material, or a known fixture

Do not relabel a previously inspected sample as an unseen holdout.

## Evidence & auditability

Explain how the change preserves or improves source binding, blockers, version history, reproducibility, and historical failure records.

## Known limitations / risks

What is still not proven after this PR?

## Security / data check

- [ ] No API keys, `.env` files, private datasets, personal information, licensed research, or confidential materials are included
- [ ] Logs and workflow artifacts were considered for sensitive-data exposure

## Screenshots

Required only for visible UI changes. Use real product screenshots rather than mockups when representing implemented behavior.
