# Financial Research Decision Chain

Auditable AI-assisted financial research MVP for the finance competition project.

## Project status

- Production Site: V4
- Site repair version: V5 (undeployed)
- Parser repair target: V0.4
- Blind Test 01: FAIL (57.7/100), failure intentionally preserved
- S-05 / S-06 fixture regression: PASS
- V0.4 Freeze: **NOT YET DECLARED** pending real PDF.js end-to-end validation
- Blind Test 02 candidate S-07: sealed / not read for development

## Core chain

`Source → Evidence → Claim → Assumption / Kill Criteria → Formula → Valuation → Decision → Human Review → Version`

## Repository policy

This repository is the canonical code/history location from now on. The existing ChatGPT Site remains the demo/runtime surface until its full V5 source is migrated here.

Financial business rules (Claims, Assumptions, Kill Criteria, Formula, Valuation, Decision) must not be changed merely to make parser tests pass.
