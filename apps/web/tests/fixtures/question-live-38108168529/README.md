# 原始真实首失败负例，禁止回写

来源：[run 38108168529 / attempt 1](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38108168529)，
获批提交 `7af0c7c160d0d07b1c4b68defbc5126cd412a019`。
原附件：[11690576102](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38108168529/artifacts/11690576102)。
实际两次请求，第二次 `PROFESSIONAL_LIMIT_OMITTED` 后停止，余四次未运行。

| 文件 | SHA-256 |
| --- | --- |
| request-01.json | 54254c7c53cee1fa87b422f2b5b02496c9c5fb77dc1928010e412289c3792890 |
| request-02.json | 1ce215ecca3edf986debfc5a71eee676e41d1a8b89270cff799841c1e93921c3 |

原执行 rawOutput SHA-256：`72975f45a9f0ce98d647b2311554204fad8c1bc04d7bd781e34b0aa8a1065c43`。
两文件完整保留原 bytes；仅用于离线负例重放，原状态仍 BLOCKED / answer=null。
测试里的引用补齐示例是 synthetic，不能存成真实模型结果或接受事件。
上述记录不是新的 live authorization；新提交需要精确 SHA 批准。
