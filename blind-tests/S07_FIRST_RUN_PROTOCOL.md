# Blind Test 02 — S-07 First-Run Protocol

Parser baseline: V0.4 frozen on `main`.

Rules:

1. `lib/parser-v04.ts` must be byte-identical to `main` before the run.
2. The first run contains no embedded expected financial values.
3. The machine output must be saved as an Actions artifact before any human truth comparison.
4. No Evidence, Graph Diff, Valuation, Decision or research version may be written by this harness.
5. After the first-run artifact is preserved, S-07 is no longer considered unseen data and may only be used for evaluation/regression.
