# Project working agreement

Recorded from the project owner's instructions on 2026-09-07.

## Codex takeover baseline (2026-10-04)

Codex is now the primary engineering executor for Beacon. The owner should not be used as a manual terminal relay. For ordinary engineering work, inspect the repository and environment directly, make changes on a branch, run the relevant tests, review the diff, and report the result. Ask the owner only when a decision is genuinely product-level, financially semantic, paid/external, secret-bearing, destructive, or otherwise irreversible.

Before doing substantial work, read only the files relevant to the task. Use `docs/PROJECT_STATE.md` for current project status, `docs/AUDIT_REPAIR_ROUND_1.md` for the current security-audit repair branch, and narrower design/runbooks when the task touches those areas. Always check actual GitHub HEAD / PR / CI state instead of trusting stale prose.

Current handoff:
- Repository: `yivenwang/financial-research-decision-chain`; GitHub is the source of truth.
- `main` is currently `fe9af2b9450c069fc979cb539cd43454783a95fa`.
- PR #30 / branch `fix/audit-round-1` is the active first-round audit repair. On audited head `2c2d34e4ba42a168dfb261dda02b9bdfe52cbaa8`, Web CI executed successfully; the four financial-engine workflows passed their scope jobs and intentionally skipped their regression jobs because this head did not change their scoped files. Do not describe that result as five regression suites executing.
- The owner reported that the public-IP HTTPS arrangement was completed manually on 2026-10-04 after the audit branch prepared the deployment guidance. A later read-only machine check independently verified HTTP→HTTPS 308, a valid Let's Encrypt IP certificate, loopback Next upstream, and production still at old `main` `fe9af2b9450c069fc979cb539cd43454783a95fa` / Next 16.2.6. Renewal configuration exists, but no successful renewal cycle has yet been observed. Do not silently overwrite server configuration.
- Internal review access remains intentionally time-bounded through 2026-10-08 23:59:59 Beijing time unless the owner changes it.
- First task for Codex takeover: independently review PR #30 against the audit findings and the live deployment assumptions, identify any regression/security gaps, and only then recommend merge/deploy follow-up. Do not claim a server-side fix is verified without observing the relevant live configuration or behavior.

Default engineering workflow:
1. Inspect the current branch/HEAD, open PRs, dirty worktree if local, and relevant CI.
2. State the intended change and acceptance criteria briefly.
3. Implement the smallest coherent change without weakening frozen rules.
4. Run targeted tests plus required regression/build/lint/type/security checks.
5. Review the diff for secrets, scope creep, migration risk, and financial-semantic changes.
6. Commit to a task branch and open/update a PR with evidence.
7. For deployment tasks, verify the live release SHA, process manager, Nginx/TLS state, environment-variable loading and smoke tests. Preserve rollback.
8. Report: changed / not changed, tests run, live calls made, PR/commit, residual risks, and next smallest high-value task.

Owner approval is still required before:
- changing target users, core workflow, claims, assumptions, Kill Criteria, formulas, thresholds, valuation/decision rules, AI/human boundary, professional gates, or prompts that change judgement criteria;
- destructive data/schema migrations or deletion of historical evidence;
- exposing secrets, changing paid-provider budgets, making unapproved real model calls, purchasing services, changing repository visibility/licensing, or opening the product beyond the approved access boundary;
- making an investment decision on the owner's behalf.

Routine implementation, debugging, tests, CI fixes, documentation, dependency maintenance, security hardening within the approved product boundary, and reversible deployment diagnostics do not require the owner to copy commands between tools.

## Current cross-chat baseline (2026-09-20)

Read `docs/PROJECT_STATE.md` and check the actual GitHub HEAD / PR status before continuing. The owner confirmed the brand **Beacon｜研灯**, Question First, Workspace, Diff → Impact → Review → Commit, a light theme, five desktop task screens and a Mobile Companion. Final visual designs are still pending; implement their approved design when supplied, preserving the existing financial and review semantics. Older dated approval entries below are historical scope, not a reason to ask again for actions authorized later.

The owner approved all six proposed non-UI workstreams: one fixed manual question-acceptance batch covering three intents (planning and execution, at most six provider requests total, stop the entire batch on the first failure, no automatic retries); reviewed PR integration and release preparation; a fixed evaluation protocol; one limited additional-company public-report validation; competition materials; and professional-review preparation. This includes routine implementation, fixes, ordinary tests and documentation together. PR #24 and #25 have merged following green ordinary CI. Keep new question live content acceptance pending until actual output and review exist. Do not create paid deployments, broaden financial logic or fabricate expert approval. Real execution uses the existing GitHub Secret only in the explicit manual workflow. Do not expose keys or dispatch another batch to evade the first-failure stop.

The cross-company exercise is isolated validation: preserve the first output and classify acquisition/execution/format/reconciliation failures separately. Do not register another company in the product or transfer Anker's investment assumptions/thresholds just to claim generalization. A separate tracking/Shadow Portfolio idea is still being scoped; it is not authority for real trades or unattended model spend.

## Product mainline

New materials update a traceable research decision chain: source evidence, affected claims and assumptions, deterministic calculations, a cited research memo, human judgement, and version history. Anker is the first validation case. The target is a reproducible competition entry that can later become a useful research product for secondary-market investors.

AI explains the supplied evidence and drafts research content. People retain key assumptions and final investment judgement. Technical acceptance does not constitute professional approval.

## Approval scope

Propose each new stage and obtain the owner's approval before execution. Routine implementation, tests and fixes within an approved stage can proceed without repeated permission requests.

Before changing product core logic, explain the reason, before/after behaviour and affected results, then obtain the owner's confirmation. This includes target users, the core workflow, claims, assumptions, kill criteria, financial formulas, thresholds, valuation/decision rules, the AI/human boundary, professional gates, and Prompt changes that alter judgement criteria. Do not weaken a rule to make a test pass.

The owner approved closing PR #14: DeepSeek integration and origin/test fixes, provider labels/configuration/docs, real S-05 acceptance, and merging only after ordinary CI and real-provider acceptance pass. This does not authorize a new product scope, brand rename, overall UI redesign, deployment or repository visibility change.

On 2026-09-08, after PR #14 merged, the owner approved reviewing the successful real memo and preparing the competition demo script, and reaffirmed that Anker is a case within the intended research system. This stage may inspect the approved S-05 artifact, verify its evidence, and record review findings, system scope, and the demo script in GitHub. Findings do not authorize changing the Prompt's judgement requirements, financial rules, professional gates, or historical review events. Proposed core changes must be explained and confirmed separately.

The owner subsequently approved revising the model instructions to retain the pending status of assumptions, limit unsupported attribution, and review one new real output. This authorizes a versioned Prompt change and its regression/content checks. It does not authorize changes to the underlying financial definitions, thresholds, calculations, decisions, professional gates, or original model/review records. K-07 display wording, broader evidence inputs and cross-company migration remain separate proposals. Keep the new Prompt's live acceptance pending until its own output is available and reviewed.

After live run #6 failed, the owner approved the bounded recovery proposal: DeepSeek maximum output 6,000 tokens and 150-second timeout, matching live browser waits, compatible diagnostic fields and bounded final text retention for incomplete responses, then one new manual live acceptance after ordinary checks pass. This does not authorize automatic retries, accepting partial output, changing the Prompt or financial rules, or backfilling historical records. OpenAI keeps its prior limits. Preserve run #6 as failed and review the next complete output before claiming content acceptance.

After reviewing live run #7, the owner approved a targeted Prompt follow-up: distinguish missing structured input from absent disclosure in the whole report, and require citations for each paragraph's facts, comparison sides and rule limits, including the summary and explicit year-on-year period wording. Implement the versioned instructions, run ordinary regressions, then review one new manual live output. Keep the existing provider budgets, inputs, validation, financial rules and historical records. This approval does not mark run #7 as content-accepted or authorize a broader product stage.

On 2026-09-09, after the run #9 reliability proposal, the owner approved the compact memo stage: five sections containing six paragraphs total (summary, supporting, counter and alternatives one each; questions two), at most 160 Unicode characters per paragraph; one versioned contract shared by instructions, supported schema constraints and local validation; functional counter wording aligned to counter facts and related limits; historical output preserved under its original version. This permits a lossless wire-to-storage shape mapping, not repairing model content or changing evidence requirements. The owner also approved one manual fixed-commit batch of at most three sequential independent S-05 samples, one request each, stopping remaining samples on API, truncation, structure or flow failure. Keep DeepSeek V4 Pro / low / 6,000 output tokens / 150 seconds per sample; no automatic retry, fourth sample, new input or financial change. Three technical completions still require individual content review. The owner asked whether a larger token allowance could be considered for finals: research and propose a rehearsed configuration, but no specific higher allowance or extra paid comparison has been approved yet.

On 2026-09-13, the owner explicitly approved completing human memo revision and version lineage as one feature branch and one PR based on the latest main: integrate the existing local implementation, finish targeted tests, production build and browser acceptance, follow GitHub CI through necessary fixes, and deliver updated documentation and the demo script. The approval covers those routine implementation and verification steps without repeated confirmations. Preserve original model runs and review events; append human revisions and their reviews separately, binding each to exact content and the original research snapshot. Saving is not acceptance, and later revisions start pending. This stage makes zero new live model calls and keeps the existing Prompt, provider budgets, financial rules and professional gates. Deliver the verified PR for review; overall UI, naming, new materials, core-logic changes, merge and deployment remain separately decided. PR #16, open-source preparation PR #17 and collaboration PR #21 had already merged, and the repository was public before this stage.

## Repository and evidence

On 2026-09-16, after the question-input design package, the owner approved starting implementation and asked to finish work that fits in one round without unnecessary stages. This authorizes the first question-input implementation: versioned Research Contract, three intents, capability routing, existing Source/Evidence and frozen-engine integration, structured answers, a minimal functional question entry, necessary tests/fixes, documentation and one reviewable PR from current main. Models interpret tasks and explain validated evidence; they cannot calculate or write financial facts or formal decisions. Preserve existing memo instructions, financial definitions, professional gates, per-call limits and historical records. Ordinary acceptance uses labelled synthetic transport; this stage makes no additional live model acceptance calls. Each question has separate user actions for planning and confirmed execution, each making at most one provider request, without automatic repair/retry. Merge, deployment, overall visual redesign, new companies/materials and professional sign-off remain separate. Keep the existing S-07 exclusion.

On 2026-09-14, the owner said “继续” in response to the proposed non-visual readiness package: map current pages to data and states, prepare editorial revision suggestions for all three archived run-10 outputs, deliver reproducible demo/replay material, a run/deployment plan, and a professional review packet. Routine documentation, offline tooling, validation and one PR are authorized together. PR #22 is still open; this package may be stacked on its branch without merging either PR. Original archive bytes and CI review events remain unchanged; editorial proposals are pending owner review and are not stored as accepted product revisions. No new live model call, new company/material, product UI redesign, core-logic change, deployment, merge or professional signature is included. Any issue requiring a change to research judgement or version-difference semantics must be explained and confirmed before implementation.

On 2026-09-16, after receiving a concise account of the three exact run-10 proposals, the owner instructed “三份全部按建议通过”. Record that decision append-only against the three proposal, source-run and snapshot hashes. It approves the 16 proposed paragraph changes and 2 proposed retentions as memo content; it does not rewrite the original model outputs or historical CI review events, authenticate a browser identity, close EG-01 / EG-02, or authorize changes to the Prompt, model budget, financial rules, decision logic, deployment, overall UI or name.

- Work in GitHub branches and PRs. Check the latest PR head before writing. Do not overwrite the newer dev/deepseek-provider-v02 with the old uncommitted v01 draft.
- Preserve historical versions, rollback records and first blind-test failures. Passing a regression never changes a first-run result.
- Do not read S-07 raw material, truth or first output, or run S-07 tests in this stage. Historical PASS records do not grant fresh authorization.
- Keep financial calculations in the frozen deterministic engine. EG-01 and EG-02 remain pending until separately supported professional review.
- API keys stay in server environment variables or GitHub Secrets. Do not request, read out, commit or log a real key.
- Ordinary CI uses labelled transport stubs. Each live sample and each product generation action makes at most one model request, without automatic retries. The approved compact-stage manual batch may start at most three sequential samples and must stop after a failure; this bounded batch is not authorization for unattended repeated runs.

## UI and team

The owner leads core work; supporting teammates prepare UI references, PPT, video and documents. Beacon｜研灯 and the workbench direction are confirmed. Follow `docs/UI_HANDOFF_V0.2.md`; final visual files and task-state layouts remain the UI implementation input. Genuine financial-semantic changes still need the before/after explanation and owner confirmation.
