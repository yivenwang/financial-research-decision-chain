# Chain Blind Test 01 — S-09 First-Run Protocol

**Role:** historical holdout replay for Chain V0.1  
**Company:** Anker Innovations / 300866.SZ  
**Target document identity:** 2022 H1 full A-share semiannual report  
**Financial values:** intentionally unknown before first run

## Frozen baseline

- Parser: V0.5 on `main`
- Chain: V0.1 C-04 on `main`
- Claim scope: C-04 only
- A-03 / K-07 / F-02 / valuation-gate / decision rules: unchanged from `docs/CHAIN_V0.1_SPEC.md`

## Blind-test discipline

1. Do not embed the S-09 PDF URL or any S-09 financial values in the branch.
2. CI must discover the report from CNINFO by company code, reporting period and title only.
3. Before execution, CI verifies `lib/parser-v05.ts`, `lib/chain-v01.ts`, and `docs/CHAIN_V0.1_SPEC.md` are byte-identical to `main`.
4. CI downloads the discovered official PDF, hashes it, runs `PDF.js → Parser V0.5 → Chain V0.1`, and saves the entire first machine output as an immutable artifact.
5. No expected S-09 financial values are asserted in the first-run test.
6. Human ground-truth review starts only after the first-run artifact exists.
7. S-09 is historical replay data; it tests deterministic propagation behavior, not a current investment recommendation.
8. EG-01 and EG-02 remain pending; therefore formal recommendation must remain null regardless of financial output.
9. C-01/C-02/C-03/C-05/C-06 must remain unchanged.
10. After the artifact is preserved, S-09 permanently becomes regression-only.
