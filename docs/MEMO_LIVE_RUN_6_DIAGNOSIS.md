# 第 6 次真实备忘录验收诊断

核对时间：2026-09-08。对应 [PR #16](https://github.com/yivenwang/financial-research-decision-chain/pull/16) 的判断表达修订。第 6 次结论保持：提供方未完成响应，应用正确停止，没有完整正文可供本轮内容评审。所有者随后批准下述恢复方案，代码与本地验证现已完成；新真实验收尚待执行。原始失败和诊断证据保留。

## 已核实的运行与停止位置

| 核对项 | 记录 |
| --- | --- |
| GitHub 运行 | [34211479879，第 6 次，attempt 1](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34211479879)；手动触发，失败 |
| 运行代码 | `dev/memo-judgement-v02` / `4cc6a554924055de16dc16774b7d19915ec44e58` |
| 失败步骤 | [job 102013266623](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34211479879/job/102013266623) 中的单次真实 S-05 模型请求；预检、安装、构建和 Chromium 准备均成功 |
| 应用响应 | HTTP 502；`PROVIDER_INCOMPLETE`；`run.status = failed`；`memo = null` |
| Prompt | `research-update-v2-judgement-1`；SHA-256 `9c734ab46ccac7ecee7b7e20ce3faed22f9195f2b5fd5994e64129a2ce4de0f3` |
| 请求 / 返回模型 | DeepSeek / `deepseek-v4-pro`，两者一致 |
| 应用调用编号 | `04bfcbd2-8eae-463d-bda5-2ec147998292` |
| 提供方响应编号 | `7f2ffc14-c7a3-4d9e-b024-4d6581f6fcc0` |
| 单次调用时间 | UTC 09:44:15.530—09:45:32.759；77.229 秒，小于当时的 90 秒超时 |
| 用量 | 输入 2,650；输出 4,000；合计 6,650 token；输出恰好达到请求上限 |
| 请求 SHA-256 | `5baad84994298826d75af3717adabc07bebdece091f76dceedc3c7bc8758bf31`，按运行代码和保存的 context 重建后吻合 |
| 响应 SHA-256 | `a6b2a237024c211b70641bf8c04f574d0b5fb01bc49c8ae1e23aef2bbbd7a5f0`；完整响应封装未导出，无法独立复算 |
| 失败归档 | [artifact 10050080110](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34211479879/artifacts/10050080110)，6 个文件，2,205,692 字节 |
| ZIP SHA-256 | `df43f4cd70f77f277df242905392fca4ff0d5da16098728ee708dea7fc2663df`；下载后按字节核对，与 GitHub digest 一致 |

六个文件是提供方配置、HTTP 摘要、调用记录、已审核决策链截图、失败截图和失败文本。运行在 HTTP 成功断言处停止，未进入备忘录接受、Markdown/完整审计导出及后续回滚断言。缺失的成功产物没有补造；本次不是盲测，也不改变第 5 次的历史成功或内容审阅结论。

## 原因与证据边界

运行代码先记录模型、响应编号和用量，再在 `data.status !== "completed"` 时返回 `PROVIDER_INCOMPLETE`。因此，这次没有进入 JSON、引用或判断表达的校验。`validation = []` 表示没有执行到相应校验，不能记为内容通过。Node.js 20 的弃用提示是非阻塞警告。

输出 4,000 token 恰好用满当时的上限，**高度提示输出预算耗尽**。[DeepSeek 官方 Responses API](https://api-docs.deepseek.com/zh-cn/api/create-response/) 说明该上限同时包括最终输出与 reasoning token，并提供 `incomplete_details.reason` 区分中断原因。第 6 次的应用没有保留该字段、原始 provider status 或 reasoning token 计数，因此仍不能把 `max_output_tokens` 写成已取得的服务端原因，也不能判断预算具体消耗在推理还是正文。

当前 `rawOutput = null` 的原因是未完成分支在提取最终文本之前就返回。它不证明提供方完全没有生成文本。归档中没有可读正文，本轮假设状态、引用支撑和归因要求的内容验收继续待完成。

## 已完成的一致性核对

除 ZIP 摘要外，以下八项离线核对通过，没有再次请求模型：

1. HTTP 摘要与调用记录的运行编号、失败状态和错误码一致。
2. Prompt 版本及完整有效指令哈希与运行代码一致。
3. 第 5、6 次保存的 context 除研究快照哈希外，所有字段完全相同，包括来源、八项引用、冻结状态及限制；未更换财务证据或规则。
4. 按本次 context、模型、Prompt、Schema、4,000 上限和 low reasoning 重建的请求 SHA-256 与记录一致。
5. 记录中的 PDF 哈希与此前已核验的官方 S-05 PDF 原始字节一致：`88d2ab7c603a94b7e0943ef07e219235ee59b9048e1dfa8e38bd6ebac99b6d03`。
6. `memo`、`rawOutput` 均为空，未取得内容校验结果。
7. token 加总和时间差与审计记录一致，耗时未达到当前超时上限。
8. 请求与返回模型一致；冻结状态仍为系统信号“增强”、人工状态“成立”、动作“继续研究”，EG-01 / EG-02 仍阻塞。

本次未导出完整浏览器研究快照，因此无法独立重建快照或复算其哈希；也未取得完整提供方响应封装。上述核对不等于重新鉴证运行时上传的 PDF、审核人身份或专业意见。

## 获批恢复方案：有限调整调用预算并补齐诊断

按 [协作约定](../AGENTS.md) 先提案后执行，所有者已批准以下调整与一次新真实验收。PR #16 保持草稿，不能因普通 CI 通过而合并。

| 项目 | 第 6 次行为 | 已批准的调整 |
| --- | --- | --- |
| DeepSeek 最大输出 | 4,000 token，包含推理和最终正文 | 调到 6,000，保持有限上限；单次输出预算增加 50%，实际费用按用量结算 |
| DeepSeek 服务端等待 | 90 秒 | 150 秒；为新增输出留出时间，仍有硬超时 |
| 真实浏览器等待 | 响应 110 秒，整条用例 180 秒 | 仅真实验收改为响应 170 秒、整条用例 300 秒；普通替身测试沿用原等待 |
| 中断诊断 | 只有统一失败码，缺少提供方细分原因 | 记录允许的 provider status、中断原因、reasoning token 计数及实际调用上限；缺失或未知值明确标记，不补猜 |
| 失败文本 | 未完成时直接返回，最终文本未保留 | 若返回最终文本，按既有大小限制原样保留为诊断字段；不采集推理正文，不补齐、不拼接、不作为可接受备忘录 |
| 验收次数 | 第 6 次已停止 | 离线及普通 CI 通过后，手动启动新的运行一次；无自动重试，再逐段复核输出 |

OpenAI 通道仍沿用原上限与超时。Prompt 的版本、内容和哈希保留本版；财务定义、输入、Schema、引用校验、专业关卡和人工决策边界均沿用当前实现。未完成响应继续判失败，即使其中的部分文本恰好能解析成 JSON。旧审计记录按原样读取，新诊断字段采用兼容方式增加，不能倒填第 6 次缺失的数据。

实现范围为提供方调用和审计类型、相关回归测试、真实浏览器等待及文档。验证用合成响应覆盖中断、达到上限、原因缺失和正常完成，核对没有自动重试或接受部分输出；不复制真实原文为测试样本，不触及 S-07。新的真实运行仍可能失败，6,000 只是一次有界调整，不能预先称为已解决。

## 恢复实现与验证

- DeepSeek 调用采用 6,000 输出 token / 150,000 ms 硬超时，OpenAI 保留 4,000 / 90,000；真实 DeepSeek 浏览器响应等待 170 秒、整条用例 300 秒。普通替身及 OpenAI 的浏览器等待保持原值。
- 在审计类型中增加可选 `requestLimits`、`providerStatus`、`incompleteReason`、`reasoningTokens`。记录允许的状态/原因，未提供为 null，未知值为 unknown；有效推理用量必须为非负整数且不超过总输出。旧记录不补填字段。
- 未完成响应仍返回 failed / `PROVIDER_INCOMPLETE`，`memo = null`。只在最终 message 有唯一、无拒绝标记、长度不超过 24,000 字符的文本时保存原文到 `audit.rawOutput`；其他情况不拼接、不截断后冒充原文。没有推理正文写入返回值或日志，未完成文本不能被接受或导出为备忘录。
- 本地解析 3 项、引擎集成 6 项、模型 14 项，合计 23 项通过。新增三项合成响应测试，覆盖可解析 JSON 仍失败、用满上限也不补猜原因、未知诊断、文本边界及不保存推理正文；既有版本库测试验证旧字段缺失仍兼容、原记录保持一致、未完成调用无法接受。没有新增真实模型调用。
- Prompt 版本、有效指令及原始研究指令哈希分别核验未变。上下文、Schema、引用校验、Markdown 导出、财务引擎与审核流程继续沿用原实现。

当前提交的 GitHub 构建和浏览器回归结果记录于 [PR #16](https://github.com/yivenwang/financial-research-decision-chain/pull/16)。通过后，在既有 `llm-live.yml` 使用 `dev/memo-judgement-v02` / `deepseek-v4-pro` 手动新建一次运行，并核对实际提交。不要重跑第 6 次旧提交；取得新产物后按 [V0.2 逐段标准](MEMO_PROMPT_V0.2.md) 复核。此次批准无需再次询问，但失败后不能自动重试。

本次阻塞属于通用模型调用环节。项目仍以研究更新系统及参赛完整演示为目标，安克是首个案例；UI、命名、K-07 展示一致性和有限跨公司验证依原计划分别推进。
