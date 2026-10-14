# 2026-10-11：真实 API 已连通，逐段引用失败后的定点修复

## 本次实际执行

负责人在收到候选精确 SHA 后明确要求直接修改和真实验收。
仅对 `364b7afb44f78fe7be6e84e0fcda6d162cd7c7b1` dispatch 一次现有手动工作流：
[run 38138604171](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38138604171)，
[artifact 11702113315](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38138604171/artifacts/11702113315)，attempt 1。
未移除预算或设置无限循环；最多六次，首失败停止，原失败不 rerun。

普通测试、生产构建、真实 S-05/S-06 PDF 与问题浏览器预检通过。
实际两次 DeepSeek V4 Pro 请求都完整返回 HTTP 200，模型及用量校验通过，
没有 HTTP、网络、超时、流式或反序列化错误。规划 v3 正确识别 CHANGE_EXPLAIN，耗时 4.322 秒；
解释 v4 完整 JSON 耗时 22.776 秒，但 PARAGRAPH_EVIDENCE_OMITTED 阻断。
余四次未发送。已知 input 4448 / output 2346，unknown=0，估算 USD 0.015162（非账单）。
不能据此声明完整三题验收成功或比赛现场可靠性保证。

## 原文的独立缺口

| 段落 | 原文涉及的内容 | 本地可复现缺口 |
| --- | --- | --- |
| inference | 扣非与增速差、核心经营待复核假设 | SPREAD 的依赖 ATTR 未引；只引 ADJ/SPREAD/A-03 |
| counterEvidence | 归母下降与扣非的否定比较 | 提及扣非而未引 ADJ；只引 ATTR。非经常项目的引用也需人工内容复核 |
| uncertainty | 非经常损益比较期缺失，扣非代核心经营假设 | 提及扣非而未引 ADJ；只引 A-03/NR |

各段单独回退到原引用均能触发同一阻断；补其他段不能掩盖。
原始模型字节、产品 BLOCKED、answer=null、批次停止与 pending 内容复核保持。
新增 fixtures 保存 plan、execute、manifest 原文及 hash；没有将合成引用示例写回真实记录。

## 最小修复

解释 Prompt 版本化为 v5，保留 v4 原文/hash 与严格校验。
让每段先选择 citations，再写只由本段引用支撑的 text；Schema 属性及 required 顺序同样先引用后正文。
明确既有指标/规则引用和 citationDependencies，包括条件句、否定句及输入缺口。
去掉重复 Schema 描述，保留所有数据、字段、范围与语义约束，适配原有 wire 预算。

未改校验标准、模型输出内容、投资判断、金融公式、阈值、专业门禁或 DeepSeek 参数。
没有自动补引用、修补正文、再请求、SDK、流式或新任务状态。
浏览器暴露历史提示硬编码仅含 v1-v3，会遗漏新的旧 v4；改为与当前实际 Prompt 版本比较。
该改动仅修正既有历史提示，原文、失败状态、审核与导出不变。
这改善输入约束，不能保证随机模型永远遵循；v5 的真实内容接受仍待新输出。

## 验证与停止点

新增四个回归覆盖原 v4/hash/停止清单、三段独立缺口、先引用契约与历史失败幂等复放。
六请求离线演练使用真实已审核快照、三意图、最大引用和最长 reason；
最高输入估算 15938 < 16000，预算、输出 6000、150 秒、low 保持。
历史 v1/v2/v3/v4 仍按原指令/hash 与原校验验证；浏览器补充旧 v4 阻断展示及完整导出。
本次测试只有 synthetic/mock 与 localhost HTTP；修复之后新增真实调用零次。
本地全量 **187/187**（Question **61/61**、access/security **52/52**、RC **11/11**），
TypeScript、lint（0 errors / 四个既存 warnings）、生产构建通过；
问题浏览器 **1/1**、可靠性 **1/1**，1440 / 768 / 390px 的新旧原始导出、
历史 v4 提示、阻断与专业 pending、键盘及无横向溢出均通过。
最终精确 SHA 的普通 CI 与 clean build receipt 以 PR #36 追加交付为准。

本轮真实调用为两次，不宣称累计零。没有读或测试 S-07，未改生产密钥、窗口或部署。
六次上限、预算确认、精确 SHA、attempt=1、首失败停止与秘密归档拦截保留。
新 SHA 需要独立明确授权，不把本说明、旧批准或 approvalReference 当作新 live authorization。
K-07、EG-01/EG-02、合并/部署仍未决定，不通过删除门禁制造 SUCCESS。
