# V0.4 Repair Pack Test Report

Date: 2026-09-04

## Local validation
- TypeScript strict compilation: PASS
- Fixture regression S-05: PASS
- Fixture regression S-06: PASS

## Explicit repaired failure modes
- Source metadata inheritance: PASS
- 45.86% no longer contaminated into 8045.86%: PASS
- 49.65% no longer contaminated into 5949.65%: PASS
- Cross-page non-recurring P&L total extraction fixture: PASS
- F-02 bridge completeness/reconciliation gate: PASS
- Any blocker prevents Evidence / Graph Diff promotion: PASS

## Boundary
This is a code/fixture-level regression against official page truth. It is not yet a real PDF.js end-to-end run inside the hosted MVP. Site V5 remains undeployed; production remains V4.