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

## Repository and evidence

- Work in GitHub branches and PRs. Check the latest PR head before writing. Do not overwrite the newer dev/deepseek-provider-v02 with the old uncommitted v01 draft.
- Preserve historical versions, rollback records and first blind-test failures. Passing a regression never changes a first-run result.
- Do not read S-07 raw material, truth or first output, or run S-07 tests in this stage. Historical PASS records do not grant fresh authorization.
- Keep financial calculations in the frozen deterministic engine. EG-01 and EG-02 remain pending until separately supported professional review.
- API keys stay in server environment variables or GitHub Secrets. Do not request, read out, commit or log a real key.
- Ordinary CI uses labelled transport stubs. Keep paid live acceptance manual, one request per run, without automatic retries.

## UI and team

The owner leads core work; two supporting teammates collect UI references and prepare PPT, video and documents. Overall visual direction and the candidates 研序 / 证衡 / 研迹 await confirmation. Correct functional labels within approved work; agree on visual and information-design changes before presentation recording.
