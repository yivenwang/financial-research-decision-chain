# Chain V0.1 — C-04 propagation specification

## Scope

First deterministic research-decision chain for one frozen claim only:

`Source/Parser → Evidence → C-04 → A-03/K-07 → F-02 → Valuation B5 → Decision → Graph Diff`

The other five claims must remain unchanged in this slice.

## Frozen business rules

### C-04

Claim: `核心经营强于归母净利润表面读数`.

The engine emits a **system signal only**. It never changes the human final claim state automatically.

- adjusted NP YoY > 0 and adjusted YoY > attributable NP YoY → `增强`
- adjusted NP YoY > 0 without the above spread → `混合`
- adjusted NP YoY <= 0 → `削弱`
- K-07 triggered → `削弱`

### A-03

`扣非利润比归母利润更能代表本期核心经营表现。`

This remains a human/accounting judgment and is controlled by EG-01. The engine may not approve it itself.

### K-07

Frozen candidate rule from the gold standard:

`若扣非归母净利润同比≤0%，或调整项被认定为经常性，则下调 C-04 并取消归一化调整。`

Quantitative trigger requires two consecutive comparable periods with adjusted NP YoY <= 0. A qualified accounting reviewer may trigger the accounting branch immediately by determining that the adjustment is recurring.

### F-02

`attributable_np - non_recurring_total = adjusted_np`

Tolerance: 0.001 CNY mn. Failure blocks propagation.

### Valuation B5

This slice preserves the existing deterministic placeholder structure:

- normalized earnings basis = adjusted NP unless K-07 is triggered; then fall back to attributable NP;
- annualization factor is deterministic by period: Q1=4, H1=2, FY=1;
- Bear/Base/Bull P/E inputs remain 18/24/30 only when explicitly supplied by context;
- diluted share count must be supplied for the relevant period;
- EG-01 and EG-02 remain blocking gates;
- valuation output is never publishable in Chain V0.1.

### Decision

While EG-01 or EG-02 is open, the only permitted action is `继续研究`, with `formalRecommendation = null`.

## Graph Diff rule

Only C-04 and its linked nodes may be updated in this slice. `C-01/C-02/C-03/C-05/C-06` must be explicitly returned as unchanged.

## Acceptance criteria

1. Existing Parser V0.5 real-PDF and strict-schema regressions remain PASS.
2. Chain unit regression PASS.
3. Real S-05 and S-08 PDF → Parser V0.5 → Chain V0.1 regression PASS.
4. S-05 reproduces the frozen B5 Base value when its frozen share-count and P/E inputs are supplied.
5. S-08 preserves positive core-profit evidence and the positive non-recurring item as counter-evidence.
6. Missing historical share count blocks per-share valuation instead of reusing a current-period share count.
7. EG-01/EG-02 block formal recommendation.
8. K-07 requires two consecutive non-positive adjusted-profit YoY periods unless accounting review independently triggers the qualitative branch.
9. Parser blockers prevent Evidence, F-02 and downstream propagation.
10. No other Claim is silently changed.

Only after all criteria pass may Chain V0.1 be frozen and a new unseen report be selected for Chain Blind Test 01.
