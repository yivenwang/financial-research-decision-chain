# Contributing

Thanks for contributing to Financial Research Decision Chain.

## Scope

The project focuses on auditable financial-research workflows rather than autonomous investment decisions. Contributions are welcome in parser reliability, evidence tracing, deterministic calculations, research memo quality controls, reproducibility, UI, and cross-company validation.

## Before opening a PR

1. Create an issue or reference an existing issue when the change is non-trivial.
2. Keep financial business rules separate from parser, UI, and infrastructure changes.
3. Do not weaken blockers, evidence requirements, or audit trails merely to make tests pass.
4. Preserve historical failures and regression records. A later fix must not rewrite a first-run blind-test result.
5. Do not include API keys, paid/private datasets, personal data, or confidential research material.
6. New model calls used for validation should record provider, model, prompt/version, limits, and whether the run is reproducible.

## Development

```bash
cd apps/web
npm ci
npm test
npm run build
npm run test:runtime
```

Node.js 22 is the current CI baseline.

## Pull requests

A useful PR should state:

- problem being solved;
- files/modules changed;
- whether financial business logic changes;
- tests added or rerun;
- known limitations;
- evidence that historical behavior was preserved where relevant.

Core financial definitions (`Claim`, `Assumption`, `Kill Criteria`, `Formula`, `Valuation`, `Decision`) require explicit review before merge.

## Validation terminology

Please distinguish clearly between:

- technical workflow completion;
- deterministic calculation accuracy;
- model-output content quality;
- professional investment/accounting review;
- cross-company generalization.

Passing one category does not imply the others.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0 used by this repository.
