# Blind Test 03 — S-08

**Result:** `PARSER BLIND TEST PASS`  
**Scope:** frozen V0.5 PDF.js extraction + parser + strict schema + deterministic validation  
**Not claimed:** full Evidence → Graph Diff → Valuation → Decision product propagation

## Protocol integrity

- Candidate: S-08 / 安克创新 2024 年半年度报告全文
- Period: 2024H1
- Official CNINFO PDF: `https://static.cninfo.com.cn/finalpage/2024-08-30/1221057646.PDF`
- Frozen parser commit: `4ad704fd311f45cb09a0d3bfed8984ffb5241f5b`
- No expected S-08 financial values were encoded in the first-run harness.
- First-run output was saved before human ground-truth comparison.
- First-run workflow: `33878433220`
- First-run artifact: `9938817044`
- Artifact digest: `sha256:208290ee6ba390cee8e3c24086d8009c2d903fd933423981f4c368c4bdf59325`
- S-08 PDF SHA-256: `fae97eeabfa99796b3331310e27ed9887ef40bc7c8af3e7b982992d7c2ee9b32`
- PDF bytes: `1,887,282`
- PDF pages: `178`
- PDF.js TextItems: `31,773`

## Frozen first-run vs official ground truth

| Metric | Frozen first run | Official ground truth | Result |
|---|---:|---:|---|
| Revenue current | 9,648.32722181 mn | 9,648.32722181 mn | PASS |
| Revenue comparison | 7,065.69213983 mn | 7,065.69213983 mn | PASS |
| Revenue disclosed change | +36.55% | +36.55% | PASS |
| Attributable NP current | 872.12618617 mn | 872.12618617 mn | PASS |
| Attributable NP comparison | 820.00465935 mn | 820.00465935 mn | PASS |
| Attributable NP disclosed change | +6.36% | +6.36% | PASS |
| Adjusted NP current | 765.76531177 mn | 765.76531177 mn | PASS |
| Adjusted NP comparison | 544.89472835 mn | 544.89472835 mn | PASS |
| Adjusted NP disclosed change | +40.53% | +40.53% | PASS |
| Operating cash flow current | 841.30128092 mn | 841.30128092 mn | PASS |
| Operating cash flow comparison | 610.03912440 mn | 610.03912440 mn | PASS |
| Operating cash flow disclosed change | +37.91% | +37.91% | PASS |
| Basic EPS current | 1.6505 | 1.6505 | PASS |
| Basic EPS comparison | 2.0176 | 2.0176 | PASS |
| Basic EPS disclosed change | -18.19% | -18.19% | PASS |
| Diluted EPS current | 1.6397 | 1.6397 | PASS |
| Diluted EPS comparison | 2.0152 | 2.0152 | PASS |
| Diluted EPS disclosed change | -18.63% | -18.63% | PASS |
| ROE current | 10.44% | 10.44% | PASS |
| ROE comparison | 11.44% | 11.44% | PASS |
| ROE disclosed delta | -1.00 pp | -1.00 pp | PASS |
| Total assets current | 14,336.92849485 mn | 14,336.92849485 mn | PASS |
| Total assets comparison | 12,776.70117748 mn | 12,776.70117748 mn | PASS |
| Total assets disclosed change | +12.21% | +12.21% | PASS |
| Attributable equity current | 8,172.77679800 mn | 8,172.77679800 mn | PASS |
| Attributable equity comparison | 7,999.91960754 mn | 7,999.91960754 mn | PASS |
| Attributable equity disclosed change | +2.16% | +2.16% | PASS |
| Non-recurring P&L total | 106.36087440 mn | 106.36087440 mn | PASS |

**Atomic numerical checks:** `28 / 28 PASS`  
**Silent numerical errors:** `0`  
**Parser issues:** `0`  
**Parser blockers:** `0`

## Deterministic bridge

`872.12618617 - 106.36087440 = 765.76531177 mn`

F-02 closes exactly at disclosed precision.

## Interpretation

Blind Test 03 provides the first clean unseen-report evidence that the V0.5 parser generalizes beyond its S-05/S-06/S-07 regression set. It directly addresses the silent column-shift failure discovered in Blind Test 02.

This does **not** by itself prove the entire MVP passes the 11-item acceptance rubric. The isolated blind-test harness intentionally does not write Evidence, execute Graph Diff, modify Valuation, save a research version, or update Decision. Those product-level propagation and governance dimensions require a separate end-to-end validation.

## Dataset status after test

S-08 is permanently `regression-only` after this first run and must not be reused as a future blind-test candidate.
