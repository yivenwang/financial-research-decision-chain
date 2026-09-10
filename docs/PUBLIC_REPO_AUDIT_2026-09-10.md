# Public Repository Audit — 2026-09-10

Scope: public-release hygiene review for `yivenwang/financial-research-decision-chain` after Open Source Release V0.1.

This audit is intentionally limited to repository/public-release hygiene. It is **not** a financial-content validation, professional accounting review, valuation review, security penetration test, or proof of cross-company generalization.

## Result

No immediate blocker was identified that requires returning the repository to private status.

## Confirmed

### Repository state

- Repository visibility is public.
- Default branch is `main`.
- Apache License 2.0, `CONTRIBUTING.md`, `SECURITY.md`, and `DISCLAIMER.md` are present.
- Public README states current capability boundaries and does not equate technical completion with financial accuracy or professional approval.
- S-07 history is disclosed correctly: it exposed a first-run failure and later became regression material, so it is not an unseen holdout.

### Credential / configuration hygiene

- `.gitignore` excludes `.env*` while explicitly allowing `.env.example`.
- `apps/web/.env.example` contains empty placeholders rather than real API credentials.
- Targeted default-branch searches found no matches for common secret patterns checked during this audit (`sk-`, `ghp_`, `BEGIN PRIVATE KEY`, `password`).
- Real model credentials are referenced through GitHub Actions Secrets rather than literal values in the checked workflow/configuration files.

### CI / paid-model boundary

- Normal PR / push workflows perform deterministic tests, build checks, parser / chain regressions, and browser regression flows.
- The live DeepSeek workflow is triggered only through `workflow_dispatch` and therefore is not automatically executed by an external pull request.
- Contributors should still inspect workflow changes carefully: changing trigger conditions or secret usage can materially alter this boundary.

### Contribution governance

- Core financial definitions (`Claim`, `Assumption`, `Kill Criteria`, `Formula`, `Valuation`, `Decision`) remain subject to explicit review.
- Historical failures must not be rewritten after fixes.
- Previously inspected materials must not be relabeled as unseen holdouts.
- Pull requests should distinguish technical workflow completion, deterministic calculation accuracy, LLM content quality, professional financial review, and cross-company generalization.

## Public-release risks that remain

### 1. Git history is public

The project intentionally preserves its audit history. Historical commit metadata, including author metadata already recorded in Git history, can therefore be visible publicly. Rewriting that history would weaken existing SHA-based audit references and was not performed in this release.

### 2. Actions artifacts and logs require continuing care

Workflow artifacts can contain inputs, screenshots, outputs, logs, or generated audit files. The repository security policy already requires treating artifacts and logs as potentially sensitive before sharing them publicly.

This audit confirms the workflow design boundary but does not claim exhaustive byte-level review of every historical Actions artifact ever generated.

### 3. Public filings are not the same as unrestricted third-party content

Contributors must not add licensed research, proprietary institutional datasets, confidential materials, or personal information merely because the repository is public.

### 4. Open source permits reuse

Apache License 2.0 permits reuse and modification under its terms. Public source code should not be treated as an exclusive technical secret. Competitive advantage should therefore not rely solely on hiding the current V0.x implementation.

### 5. Generalization remains unproven

The architecture is intended to generalize, but the currently validated automatic path is still centered on the Anker / C-04 case. Public visibility does not change that evidence boundary.

## Recommended operating rules

1. Keep `main` review-based; prefer issue → branch/fork → pull request → review → merge.
2. Do not grant direct-write access merely to obtain external feedback.
3. Treat changes to workflow triggers, secret handling, parser blockers, and frozen financial definitions as high-review changes.
4. Use genuinely unseen material for future holdout validation and record first-run outcomes before repairs.
5. Add real README product screenshots only after the UI is finalized; do not use mockups that could be confused with implemented behavior.
6. Re-run a public-repo hygiene audit before major releases or after adding new data sources, model providers, deployment workflows, or external contributors.

## Audit boundary

Checked repository state and representative public configuration/workflow files as of 2026-09-10. Targeted secret-pattern searches are useful hygiene checks, not a substitute for GitHub secret scanning, credential rotation, dependency security review, or a full security audit.
