# Chain V0.1 Freeze

**Status:** `FREEZE READY`  
**Scope:** C-04 only  
**Regression workflow:** `Chain V0.1 C-04 Regression` run `33892735990`

## CI evidence

- Parser V0.5 real PDF regression S-05/S-06/S-07: PASS 3/3
- Parser V0.5 strict schema S-05/S-06/S-07 + missing-row gate: PASS 4/4
- C-04 chain unit regression: PASS 4/4
- Real official PDF chain regression:
  - S-05 → Parser V0.5 → Chain V0.1: PASS
  - S-08 → Parser V0.5 → Chain V0.1: PASS

## Frozen propagation boundaries

- C-04 receives only a system signal; human final state is not auto-written.
- A-03 remains controlled by EG-01.
- K-07 requires two consecutive comparable periods with adjusted NP YoY <= 0 unless qualified accounting review triggers the qualitative branch.
- F-02 is deterministic and blocks downstream propagation if it does not close.
- Valuation B5 accepts deterministic new earnings inputs but cannot publish while EG-01/EG-02 or required valuation inputs are open.
- Decision remains `继续研究` and `formalRecommendation = null` while professional gates are open.
- C-01/C-02/C-03/C-05/C-06 are explicitly unchanged in this slice.

## Regression observations

### S-05

- system signal: `增强`
- F-02: closed
- K-07: clear
- annualization factor: 4
- with frozen B5 inputs (diluted shares 536.158873 mn; P/E 18/24/30), Base per-share value reproduces 97.8979491819396 CNY
- EG-01/EG-02 block any formal recommendation

### S-08

- system signal: `增强`
- positive non-recurring P&L is preserved as counter-evidence rather than suppressed
- F-02: closed
- annualization factor: 2
- historical diluted share count is intentionally absent, so per-share valuation is blocked instead of reusing a current-period share count
- EG-01/EG-02 block any formal recommendation

## Next step

Select a genuinely unseen official report only after this freeze. Save the first Chain V0.1 machine output before any human ground-truth comparison. Previously inspected or regression reports are ineligible as blind-test data.
