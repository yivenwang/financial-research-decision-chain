# Security Policy

## Reporting a vulnerability

Please do not publish exploitable security issues, credentials, private financial data, or sensitive user information in a public issue.

For issues that can be disclosed safely, open a GitHub issue with a minimal reproduction that excludes secrets and private data. For issues involving secrets or sensitive data, contact the repository owner privately through an available GitHub contact channel before public disclosure.

## Secrets

- Never commit `.env` files or API keys.
- Do not expose server secrets through `NEXT_PUBLIC_` variables.
- Rotate any credential immediately if it is suspected to have been committed or printed in logs.
- Treat workflow artifacts and logs as potentially sensitive before sharing them publicly.

## Financial-data safety

This repository is designed around public or authorized research materials. Contributors must not upload proprietary datasets, licensed research, personal information, or confidential institutional data without explicit authorization.

## Supported version

Security fixes currently target the latest `main` branch. Historical snapshots and archived test outputs are retained for auditability and may not receive backports.
