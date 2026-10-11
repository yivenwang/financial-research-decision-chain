# 真实批次 38129833565：规划误分类与最小修复

2026-10-11，负责人明确批准交付的精确 SHA
`08e65140972162a2ceb4414f172441d18ebb45f4`，只启动一次
[run 38129833565](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38129833565)。
普通预检、生产构建、S-05/S-06 官方 PDF 解析与离线问题浏览器全部通过。
随后实际调用 DeepSeek V4-Pro **1 次**，约 **18.736 秒**，完整返回；
第一个计划的意图验收失败后立即停止，剩余五次未发送。没有 rerun、补发或自动重试。
[原始附件 11698423351](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38129833565/artifacts/11698423351)
保留原文、用量、失败及 checkpoint。

## 结果和原因

| 项目 | 实际结果 |
| --- | --- |
| 问题 | 解释归母同比下降、扣非同比上升，并指出尚需核验的原因 |
| 固定验收意图 | CHANGE_EXPLAIN |
| 实际模型意图 | EVIDENCE_AUDIT |
| 版本 | question-contract.v2；Prompt SHA `6f7213ee573119ed2ae4236efc7114b52d026b4b397126f8bd78ce7e7775591d` |
| 批次结果 | stopped-after-failure / INTENT_MISMATCH |
| 原产品记录 | CONTRACT_DRAFTED；answer=null，尚需用户核对任务，不回写成 BLOCKED |
| runId | `794f784c-5684-46cf-bf00-4a2f78edf97c` |
| requestId | `715c7e6c-aed6-4170-ab1c-f2236259b5ac` |
| 已知用量 | input 897 / output 1776；unknown usage=0 |
| 费用 | 既有算法估算 $0.008217，非实际账单 |

模型把辅助的“核验原因”当成主要研究目标。旧指令只列出三个分类名，
未明确“用户要得到的结果”与“完成该任务所需核验步骤”的区别。
这是语义分类错误；网络、模型身份、返回完整性及 JSON 形状均成功。
固定验收不接受另一种意图来补齐三题，不通过自动覆盖 intent 或换问法降低要求。
该错误发生在解释执行前，因此本批没有测试 question-explanation.v4 的真实输出。

原始输出 hash `c6af89ac827ff6d242de6c8ec6d30dcf1e4605110ab99852009b96bcfa18b59c`。
独立只读复核完成 Prompt hash、事件校验、原合同重放、合法引用、范围、费用和首失败停止。
新增提供方请求 **0**。原 request / manifest 按 bytes 收录为
[负例](../apps/web/tests/fixtures/question-live-38129833565/README.md)。
内容初审为 **阻断（规划意图不符）**；三题解释均 **未运行**，不能评为可接受。

## 修复范围

当前规划指令升级 question-contract.v3；解释继续 question-explanation.v4。
新增共享的三类目标说明，同时用于 Prompt 与 Schema intent.description：

- 解释变化、原因或同比分化：CHANGE_EXPLAIN；附带“哪些原因待核验”仍是变化解释。
- 核对原文位置、数字或勾稽一致性：EVIDENCE_AUDIT。
- 更新对既有 Claim、假设、规则和人工复核的影响：DECISION_IMPACT。
- 混合问题含任意超范围目标：优先整体 OUT_OF_SCOPE，不删掉不支持的目标。

reason 围绕主要目标。模型仍解释任务、用户仍确认规划；无硬编码问句映射、自动纠正、
降级答案或额外请求。金融口径、公式、阈值、估值、K-07、专业关卡和模型配置均未改变。
v1/v2 原 Prompt hash 和验证行为保留，v2 的严格长度/枚举校验不会因当前版本升级而失效。
历史 UI 明示旧分类说明，保留原任务及原始导出，不冒称过去意图正确。

## 离线验收与限制

新增五项回归：原始 bytes/hash/单次停止；Prompt/Schema 一致与原合同不被覆盖；
历史 v2 严格验证；真实误分类原文在 mock handler 下停止且同标识不重复调用；
三个规划位置分别误分类时停止剩余请求。现有六请求演练继续覆盖三意图、
最大合法引用、长公司别名与 160 个四字节 Unicode reason，保留原输入/输出预算。
这些模型回复为 synthetic transport，不证明真实分类准确率或多次采样稳定性。

本地 Web 单元/集成 **177/177**（Question **52/52**、access/security **51/51**、RC **11/11**）通过；
TypeScript 通过，lint 零错误 / 四个既存警告，生产构建通过。
六请求 synthetic 演练规划输入最高估算 **8342**、执行最高 **15940 < 16000**；
4096 framing reserve、每次 6000 输出及 150 秒限制均未改变。
可靠性和 RC 浏览器分别 **1/1**，宽度 **1440 / 768 / 390px**，已人工查看桌面/手机截图。
可靠性记录 27 mock；RC 另 12 Question / 3 Memo mock，均 realModelCalls=0 / externalRequests=[]。
缺材料往返、历史/未保存保护、同标识重发、待处理状态、确认框、键盘焦点顺序、
原始失败/导出、专业 pending 和无页面横向溢出通过。
最终普通 CI 链接和附件在 PR 交付追加，以实际结果为准。
浏览器另核对原误分类历史读取/导出不被重写、不自动执行、无页面横向溢出。
六次上限、预算/SHA/attempt 门禁、首失败停止、秘密字段和字符串变体拦截继续保留。
未读取或测试 S-07；未修改生产、密钥、审验窗口；未合并或部署。

## 停止点

本批未通过，当前不能声明比赛现场可靠。修复的新 SHA 必须普通 CI 完成后，
由负责人明确授权新的一次固定最多六请求批次。原 SHA 的授权已执行，不能重复使用；
“尽快通过”不能作为无限循环付费授权。原 $0.26928 / 含余量 $0.33660 非平台硬上限。
K-07 A/B、EG-01/EG-02、实际内容接受、合并、部署和有效现场会话仍待相应决定。
