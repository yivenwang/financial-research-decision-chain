# 原始真实验收失败：38501083398

2026-10-14，对精确 `b30d7e49ebe1baa3e559c1267076a654938d2e74` 获批后
只执行一次 attempt 1；第二请求首次失败后停止，余四次未发，无重试。
[运行](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38501083398)
及[原始附件](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38501083398/artifacts/11865997211)。
以下 JSON 是附件的原字节副本；没有修复模型正文、添加引用、替换原失败代码或补写审核。

| 文件 | SHA-256 |
| --- | --- |
| manifest.json | 23eee449f34c7fc2890a2da3706ae5349e978e486edc759010affb456f1cfbe4 |
| request-01.json | e83f3d6486e41dee212a5cf4a3d7da465be6946d43cf5d449fff04cec8109067 |
| request-02.json | bbea9f711e3411738cee3702f707a097c37ada0cfc0ed1f569df7824a0f5513b |

原解释 v9 首报 ASSUMPTION_PROMOTED，BLOCKED / answer=null。离线审查发现
前提切分丢失导致这一首报误判；修复该误判后，原反证另有事实/假设混淆，
仍被未来 v10 的 VERIFIED_FACT_CONDITIONED_ON_ASSUMPTION 拒绝。
历史 v9 重放保留原判定。不能把修复后的专项测试称为真实内容通过。

本批两次 HTTP 200，已知 input 4624 / output 4207，未知用量 0；
已知用量估算 USD 0.022764，非账单。详细审查见
[RC_LIVE_V10_REVIEW.md](../../../../../docs/RC_LIVE_V10_REVIEW.md)。
