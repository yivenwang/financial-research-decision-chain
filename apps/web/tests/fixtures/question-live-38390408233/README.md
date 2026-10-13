# Original attempt 1: 38390408233

Owner explicitly approved one new bounded batch at exact commit
`8aed309389ea02a7c0caf5619220e8ec95d8a3bf`. No prior authorization was reused.
[Run](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38390408233)
and [artifact](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38390408233/artifacts/11809017042).

Exactly two DeepSeek V4-Pro calls returned HTTP 200, complete JSON and known
usage. Plan v4 was correct. Explanation v7 was BLOCKED / answer=null with
ANSWER_CITATION_OR_TEXT_INVALID: numeric identifiers occurred in prose.
The first failure stopped the batch; the remaining four requests were not sent.
Input 4,485 / output 4,747; known-usage estimate USD 0.024719 is not a bill.

Independent content review also rejected unsupported attribution of the
attributable-profit decline to the current negative non-recurring adjustment,
and making verified adjusted-profit growth depend on the pending core-basis
accounting assumption. These original outputs are neither repaired nor accepted.
Synthetic examples in tests are separate and labelled. No signed execution
ticket, provider key or access cookie is stored here.

SHA-256:

- manifest.json: `39e2a229770547aa8dfc774ac45cbee539fd72dcf030e117e78afa4fdcf46bb5`
- request-01.json: `ff96c483cf80caa974b1cb57d6af3566f7fa0ddbaebcb9434a43105bf1f2c0a4`
- request-02.json: `150941b23dc7d749d96debc317d25b606e41e2af653a20ae41b30eee645cf7f3`
