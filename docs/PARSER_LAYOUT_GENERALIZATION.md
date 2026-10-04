# Parser layout generalization after the Bull holdout

## Scope and immutable baseline

Owner-approved parser-only work, 2026-10-04. PR #31 was merged with explicit
approval, without deployment, as `c4a4dc2f028927144fa03ab0c3eb0166fa0ba4a5`.
Branch: `codex/parser-layout-generalization`, based on that latest main.

The original [Bull validation report](CROSS_COMPANY_VALIDATION_BULL_2026Q1.md)
and everything in `validation/cross-company/bull-group-2026q1/` remain unchanged.
The first blind execution FAIL and the subsequent PARTIAL / UNSUPPORTED_FORMAT
remain historical results. This stage's known-material rerun is **not blind**.

No S-07 material, truth, first output or test was read or executed. No model
request, product company registration, merge of this new PR or deployment is
part of this stage. Source review is assistant review, not professional approval.

## Reusable architecture

`lib/parser-primary-layout.ts` introduces an explicit `PrimaryHeader` and
`PrimarySegment`. Each header retains page and vertical extent, label boundary,
ordered column centers, current/comparison period identities, comparison index
and the change column's percentage declaration. Each segment owns its rows and
records whether it inherited a preceding header across the page boundary.

V0.6 now parses these bounded segments directly instead of parsing the entire
first header page through V0.5 and overriding rows by numeric token count.
V0.4, V0.5, strict schema wrappers and the deterministic chain are unchanged.
The same nine strict primary rows and non-recurring total remain required.

### Percentage inheritance

- A change cell `3.52` under a detected `%` column becomes internal `0.0352`.
- Explicit `3.52%` stays `0.0352`, without a second division.
- A wrapped header's isolated `(%)` token belongs only to that header's change
  column. The unit never leaks into a subsequent segment.
- Ratio row labels declaring `(%)` normalize bare current/comparison cells;
  `增加 0.15 个百分点` becomes `0.0015`, and `减少` supplies the negative sign.
- Bare values without a unit declaration are not guessed into percentages.
  Malformed numeric text, contradictory signs and ambiguous columns fail closed.

The existing internal ratio contract, YoY calculation, 0.005 reconciliation
tolerance, F-02 calculation and its absolute/relative tolerances are unchanged.
No expected result is substituted for a parsed value.

### Multiple headers and continuation

Headers are recognized by explicit current/comparison/change identities and
usable geometry, not company, ticker, page number or numeric values. Period
pairs must be consistent (`本报告期 / 上年同期` or `本报告期末 / 上年度末`).
Restated comparison requires explicit ordered `调整前 / 调整后` subcolumns;
four arbitrary numbers do not establish an adjusted comparison.

Every later recognized primary header creates a separate context. Sections,
notes and unrelated table headers close the preceding context. An ambiguous
header in an identified primary table remains a blocker. Similar incomplete
headers in unrelated later tables cannot contribute values or invalidate the
primary table globally. Conflicting duplicate metrics retain the first value
and add an `AMBIGUOUS_COLUMNS` blocker; identical repeats do not overwrite it.

A headerless continuation is deliberately conservative: only the immediately
following page can inherit a still-open segment; the last identified primary
row must be in the prior page's bottom quarter of observed text extent; the
first left-column content on the next page must identify a primary row in its
top quarter, with aligned cells. Running titles/footers cannot initiate it.
Label wrapping still uses the existing 22-point nearest-numeric-row rule.
Column count and geometry must both match the detected header. Missing columns
are not shifted into another role; `PRIMARY_ROW_INCOMPLETE` remains a blocker.

These conservative format heuristics can reject other legitimate layouts. They
are not financial thresholds and are not a claim of universal PDF support.

## Regression evidence

The new S-05/S-06 fixtures preserve pre-change strict results at the merged
baseline, not results regenerated from the new parser. Coordinates come from
the hash-locked PDFs already used by browser regression. New parser results must
match **all metrics, pages, labels, issues and gates**, not just the profit bridge.

| Corpus | Source hash | Result |
| --- | --- | --- |
| Anker S-05 | `88d2ab7c603a94b7e0943ef07e219235ee59b9048e1dfa8e38bd6ebac99b6d03` | Entire strict result unchanged |
| Anker S-06 | `ff81b9e7c2e8eb04bd450fce3c084b28f5b4be4c1e2638250160b7bb813ebac1` | Entire strict result unchanged |
| Bull 2026Q1 | `38a09fe6b0c81e26a04207f9e0396f8e20c2d1d2e94b852946f67bf4b4a099e6` | Non-blind parser rerun PASS |

`tests/parser-layout-pdf.test.mjs` extracts the actual frozen-source PDFs again.
Bull's fresh coordinates equal the PR #31 frozen coordinates exactly. The
parser derives all ten independently source-reviewed facts: revenue,
attributable/adjusted profit, operating cash flow, basic/diluted EPS, ROE, assets,
attributable equity and non-recurring total. Current/comparison/disclosed change
and source page are checked, with no value backfill. F-02 difference is zero.

The Bull layout now yields three segments: page 1 flow header, page 2 inherited
ROE continuation, and page 2 assets/equity header. The new result is stored
separately in
`validation/parser-layout-generalization/bull-group-2026q1/rerun.json`, with
source/coordinate/review hashes and implementation-file hashes for reproduction.
It is not a new acceptance event for historical outputs.

New negative tests cover absent/extra columns, ambiguous period identities,
missing restatement identities, duplicate conflicts, unrelated tables, page
gaps, non-edge continuation, absent/unit-leaking headers, wrong disclosed YoY
and an unclosed F-02 bridge. Eight initial repro tests produced six failures
before the implementation and passed after it; the corpus was then expanded.

## Validation commands and CI routing

Local validation:

- 15 parser-generalization tests, including frozen S-05/S-06 and Bull coordinates.
- Three CI-routing tests; three allowed legacy parser tests; four deterministic
  chain unit tests (the latter include a synthetic counter-evidence case, not a
  new report corpus). All pass.
- Three real PDF tests (S-05/S-06 and Bull) pass.
- `apps/web: npm test`: 95 tests pass; lint passes with four pre-existing unused
  variable warnings and no errors; `npx tsc --noEmit`, production build and
  production runtime smoke pass; production dependency audit reports zero
  vulnerabilities. No dependency version or lockfile was changed.
- Existing browser regression covers real S-05/S-06 upload, review, save,
  reload and rollback, plus mismatch/rejected-value blockers. Models are NOT-LIVE.
  All three tests pass against the final rebuilt local app. An earlier run of
  the pre-fix build blocked S-06; the gate was retained, the unrelated-header
  diagnosis was fixed, and the build/test was rerun without changing truth.

The root `npm test` is intentionally **not** invoked: it chains a mixed PDF
corpus that includes excluded S-07 tests. The explicit allowed root parser/chain
commands and the web application's `npm test` are the permitted validation.
No mixed test module is imported just to filter its test names.

`scripts/parser-layout-ci-scope.mjs` adds a narrow allowed-corpus lane based on
an exact allowlist of layout implementation/new tests/Anker fixtures, not branch
name. Changes to any other engine/test/root-package file retain the original
broad financial jobs. For this parser-only HEAD:

- Web CI must execute, including ordinary tests, lint/types, dependency audit,
  production build/runtime and existing browser suites.
- New `Parser layout allowed corpus / allowed-parser-regression` must execute
  all allowed unit/source-PDF tests and check frozen engine/holdout bytes.
- The four historical financial workflows execute scope detection, while their
  mixed-corpus regression jobs are intentionally scope-skipped to exclude S-07.
  A successful scope job is not a successfully executed financial regression.

Actual run IDs and job conclusions are recorded after GitHub verification;
requirements and expected routing above are not a claim that CI already ran.

## Remaining boundaries and safe claim

No parser blocker remains for the approved Anker/Bull corpus. Other formats may
remain unsupported; OCR, arbitrary table schemas, rotated pages, distant
headerless continuations and unusual restatement layouts are not validated.
EG-01/EG-02 remain pending. Existing development-tooling vulnerabilities are not
changed by this parser stage; production audit must remain clean. No production
version or certificate-renewal claim is inferred from local testing.

Beacon can now safely say: **its strict parser preserves the frozen Anker
S-05/S-06 results and, in a non-blind rerun of one independently reviewed Bull
2026Q1 report, derives all ten required source metrics using reusable
header-unit inheritance and bounded multi-segment/cross-page detection, while
retaining the existing reconciliation and promotion gates.** It cannot claim
universal report support, blind generalization success, end-to-end multi-company
research judgement, professional approval or production release.
