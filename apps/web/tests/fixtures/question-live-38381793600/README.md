# Original attempt 1: 38381793600

Commit: `8d3b93d83d61cad84df9309713a678f3d0326f98`.
Workflow: https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38381793600
Artifact: https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38381793600/artifacts/11803672086

Two real DeepSeek V4-Pro requests returned HTTP 200 with complete JSON and usage.
Plan v4 selected the correct intent/period. Explanation v6 omitted ADJ in a counter
paragraph that mentioned adjusted-profit growth; PARAGRAPH_EVIDENCE_OMITTED
stopped the batch, answer=null, four remaining phases unsent. The original inference
also asserted spread expansion without a prior-period spread, and the counter
paragraph asserted a core-profit basis without an accounting qualification.

These are original bytes, not repaired or accepted outputs. Current tests use
labelled synthetic examples separately. No ticket, provider key or access cookie
is retained. Cost USD 0.023419 is an estimate for known usage, not a bill.

SHA-256:

- manifest.json: `f37bba905922b96fce28ea5ae11d81038a59f6ffd444697dd352137fd6847112`
- request-01.json: `efe0b32614d4d283f2689de7baacdaba2510baab911f0849e291842418dbeee3`
- request-02.json: `1121c971fe11058ed1f805650dc153146677204d6ae6146b14f288ab587202ef`
