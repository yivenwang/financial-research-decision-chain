---
name: Technical review
description: Review architecture, reliability, auditability, model boundaries, or generalization
title: "Review: "
labels: []
assignees: []
---

## Review area

What part of the system are you reviewing?

## Observation

Describe the issue, risk, or design concern as precisely as possible.

## Why it matters

Which property could be affected?

- [ ] Financial calculation accuracy
- [ ] Parser reliability
- [ ] Evidence lineage / traceability
- [ ] Failure blocking
- [ ] LLM / deterministic boundary
- [ ] Human review semantics
- [ ] Reproducibility
- [ ] Cross-company generalization
- [ ] Security / privacy
- [ ] Maintainability

## Evidence

Link code, tests, workflow runs, docs, or a minimal reproduction. Do not include secrets or private financial materials.

## Suggested direction

What would you change? Distinguish an architectural suggestion from a proposed change to frozen financial definitions.

## Validation needed

What test or evidence would be sufficient to accept the change?

## Scope warning

If this suggestion changes `Claim`, `Assumption`, `Kill Criteria`, `Formula`, `Valuation`, or `Decision`, do not implement it solely to make a test pass. It requires explicit project-owner review first.
