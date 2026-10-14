# First-failure replay inputs

Source: [manual live run 38047109824, attempt 1](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38047109824),
[original artifact 11668745225](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38047109824/artifacts/11668745225).
Approved source commit: `39a41d5cbbf080cb0f7506efa1ab2d192f3c41ce`.

These are historical records, **not synthetic success responses or new live authorization**.
The original artifact is unchanged. Repository copies add one final LF; tests bind the
exact JSON file payload excluding that LF and bind the original prompt, answer and raw output hashes.

| Copy | Original file SHA-256 | Original raw output SHA-256 |
| --- | --- | --- |
| request-02.json | `bf23ca4694b95a4139a01d202c228fb220e83c38d1759c9e334830baffef29ab` | `136749a8607b94a0d4f846c0252661e1afcbcfcfadc724d3a2cebcc0e89aa022` |
| request-03.json | `1d0b38ff23d9f88e865abf0428d4fe156fe8e5b042697faa4983886e682ff468` | `2911fa69960c35940939e11bb3fc3b03b99ca96146394262634d04fa16c42ec1` |

Request 02 retains its original PARTIAL technical status and pending professional review.
It contains an unsupported causal year-on-year attribution and incomplete paragraph citations.
Request 03 retains its original OUT_OF_SCOPE plan with `referenceIds=["S-05"]`.
The batch failed at request 03; the remaining three requests were never sent.

Offline tests preserve v1 history and reject these outputs as new v2 results. Any edited
proposal in tests is expressly an unapproved regression example; it does not revise or accept
the original answer, record expert approval, or trigger provider transport.
