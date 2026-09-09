# Project working agreement

Recorded from the project owner's instructions on 2026-09-07.

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

## Repository and evidence

- Work in GitHub branches and PRs. Check the latest PR head before writing. Do not overwrite the newer dev/deepseek-provider-v02 with the old uncommitted v01 draft.
- Preserve historical versions, rollback records and first blind-test failures. Passing a regression never changes a first-run result.
- Do not read S-07 raw material, truth or first output, or run S-07 tests in this stage. Historical PASS records do not grant fresh authorization.
- Keep financial calculations in the frozen deterministic engine. EG-01 and EG-02 remain pending until separately supported professional review.
- API keys stay in server environment variables or GitHub Secrets. Do not request, read out, commit or log a real key.
- Ordinary CI uses labelled transport stubs. Each live sample and each product generation action makes at most one model request, without automatic retries. The approved compact-stage manual batch may start at most three sequential samples and must stop after a failure; this bounded batch is not authorization for unattended repeated runs.

## UI and team

The owner leads core work; two supporting teammates collect UI references and prepare PPT, video and documents. Overall visual direction and the candidates 研序 / 证衡 / 研迹 await confirmation. Correct functional labels within approved work; agree on visual and information-design changes before presentation recording.
