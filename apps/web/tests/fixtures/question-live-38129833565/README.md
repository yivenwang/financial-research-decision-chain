# 原始规划误分类负例（不是接受样例）

来自 [run 38129833565](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38129833565)，
精确 SHA `08e65140972162a2ceb4414f172441d18ebb45f4`，attempt=1。
下载的 request-01 / manifest 均按原始 bytes 复制，未补写或改写模型内容。

| 文件 | SHA-256 |
| --- | --- |
| request-01.json | `7ab209120dda14a278c161a64533f9f61066dd71d7257d7950c59835f50931f3` |
| manifest.json | `77bae29e4a4486ed819ab7743199c7aa66051d43e9ea8a869697d910f83cf9e6` |

模型使用 question-contract.v2，完整返回 EVIDENCE_AUDIT；固定问题的主要目标为 CHANGE_EXPLAIN。
该计划 schema 和范围合法，产品原记录保持 CONTRACT_DRAFTED / 人工确认；
批次独立意图验收返回 INTENT_MISMATCH 并停止，仅一次请求，剩余五次未发送。
不将批次失败改写成产品 BLOCKED，不将合法 JSON 当成意图正确。
API Key、Cookie、session secret、ticket 和 authorization 均不在附件中。
approvalReference 仅为历史审计元数据，不是新提交的 live authorization。
