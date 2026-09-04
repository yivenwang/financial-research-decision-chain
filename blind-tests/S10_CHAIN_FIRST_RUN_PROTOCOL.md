# Chain Blind Test 02 — S-10 First-Run Protocol

**Role:** historical holdout replay for frozen Parser V0.6 + Chain V0.1  
**Company:** Anker Innovations / 300866.SZ  
**Target document identity:** 2021 H1 full A-share semiannual report  
**Financial values:** intentionally unknown before first run

## Blind-test discipline

1. No S-10 PDF URL or financial truth is embedded before first run.
2. CI discovers the official report from CNINFO using only company code, year/period and report title.
3. `lib/parser-v06.ts`, `lib/parser-v06-strict.ts`, `lib/chain-v01.ts`, and `docs/CHAIN_V0.1_SPEC.md` must remain byte-identical to `main`.
4. CI downloads and hashes the PDF, runs `PDF.js → Parser V0.6 Strict → Chain V0.1`, and writes the complete machine output before any governance assertion.
5. Human ground-truth comparison starts only after the immutable artifact exists.
6. EG-01/EG-02 remain pending; formal recommendation must remain null.
7. C-01/C-02/C-03/C-05/C-06 must remain unchanged.
8. After first-run preservation, S-10 becomes regression-only regardless of PASS/FAIL.
