# RC 问题工作流：真实失败摸排与零付费修复

日期：2026-10-10。分支 `codex/pre-submission-finance-ui-rc`，
[PR #36](https://github.com/yivenwang/financial-research-decision-chain/pull/36)，
仍以 `codex/reviewer-audit-round-2` 为 stacked base，不修改 PR #35。
本次修复起点 `39a41d5cbbf080cb0f7506efa1ab2d192f3c41ce`；
完整赛前起点仍是 `3328bcc95fa9a3b9f8ed38c45b2664901038d8b2`。
写入前工作区干净，已核对 PR 最新 HEAD 一致并读取适用 AGENTS.md。
负责人要求严格摸排并修复；本次仅落实现有证据、范围及专业边界，不改变金融判断标准。

## 实际发生了什么

获精确起点 SHA 授权后，仅 dispatch 一次
[live run 38047109824 / attempt 1](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38047109824)，
[原始 artifact 11668745225](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38047109824/artifacts/11668745225)。
批次实际发送 **3 次**，在第 3 次首次失败后终止，剩余 3 次未发送，无重试。

| 请求 | 原结果 | 复核发现 |
| --- | --- | --- |
| Q-LIVE-01 plan | CONTRACT_DRAFTED，技术完成 | 公司、期间、变化解释及三个指标识别成功 |
| Q-LIVE-01 execute | PARTIAL，技术完成，专业 pending | 仅凭本期利润桥声称同比分化原因；增速差段缺归母底层引用；反证段提核心经营缺 A-03；缺口段提扣非缺 ADJ |
| Q-LIVE-02 plan | OUT_OF_SCOPE，验收 CONTRACT_NOT_READY | 输出 `referenceIds=["S-05"]`，把材料 ID 当成证据引用 ID；本地范围门禁正确拒绝 |
| Q-LIVE-02 execute、Q-LIVE-03 两阶段 | 未运行 | 首失败停止生效 |

这不是提供方超时、截断或财务勾稽失败。主要缺口在接口契约：规划 Schema 曾允许任意字符串，
输入只展示 Source 列表而没有准确的引用目录，模型和本地门禁使用的 ID 约束不一致。
普通 CI 的理想 synthetic 回包一直使用合法引用，所以未覆盖真实失败形态。
解释校验原来主要检查全篇引用集合及推论/反证标记，未检查每段派生结果的底层引用与已观察到的因果越界。

原批次用量全部已知：输入 **4467**、输出 **8361**、合计 **12828 tokens**；
按原获批单价估算 **$0.039006**，不是账单金额。原始失败与原记录不改、不回填成功。
原输出仍待内容审阅，技术完成不等于内容或专业通过。

## 摸排与修复清单

| 问题 | 修复及失败行为 | 回归证据 |
| --- | --- | --- |
| 规划引用/指标不受约束 | Schema 与本地使用同一现有 enum/catalog；明确 Source ID 非引用 ID，非法回包 BLOCKED，无 ID 猜测/修补；公司和期间保留开放识别，范围外请求不强转 | 原 Q-LIVE-02 原文、全部允许 ID、非法/重复/空项、Unicode 长度及范围外字面量 |
| 逐段引用及同比归因 | `question-explanation.v2` 明确原有逐段原则；F-02 依赖 ATTR/ADJ/NR，SPREAD 依赖 ATTR/ADJ；提及指标、假设及规则需同段引用；缺非经常性损益比较期时拒绝已观察到的确定性同比归因 | 原 Q-LIVE-01 逐项负例、底层引用缺失、重复引用、条件性表述正例 |
| 披露范围/假设/专业边界 | 拒绝已观察到的“输入缺失→报告未披露”、核心经营假设被说成已证实、买卖建议或专业通过声明；BLOCKED，无部分可信答案 | 分句反例、否定/条件表达；界面无接受入口，原文可导出 |
| Question 独立同比与可选数值 | Question 复用 `finiteChange`，零/缺失/非有限基数不除法；共享上下文检查可选比较值和披露变化有限；正常算式精确保留 | 自洽零比较基数快照、非有限值、NaN 的既有证据拒绝及上下文拒绝；正常同比精确相等 |
| 提供方回包契约 | 校验 envelope、模型身份、用量安全整数/总和/正输出/单次输出限额及预算模式实际输入；失败只保留一次调用与原回包记录 | 错模型、null、缺用量、负/不安全/矛盾用量、零/过量输出、超输入估算；同 ID 重放不新增请求 |
| 历史兼容与来源绑定 | v1 指令原文保留，按原版本验证历史；未知版本拒绝；提示历史校验差异；原始 JSON、调用日志、Prompt 摘要、计划/执行绑定与答案逐项核对；复用同一拒绝重复 JSON key 的解析器 | 两份原档案 SHA 及 v1 Prompt 摘要；重算部分 hash 仍不能脱离原输出/确认计划；历史 bytes、状态及专业 pending 保留 |
| 字符串里的凭据字段 | 未知值的 JSON 字符串旧检查存在可复现漏检；现在解码嵌套 JSON/转义、NFKC 与分隔符变体后查凭据 key；同时保留已知秘密值检查 | Cookie/API Key/session secret/ticket/authorization，嵌套/前置文本/转义/全角 key；非有限数值、循环及超复杂结构拒绝 |
| 归档/检查点失败 | 归档失败留安全终止 receipt，去除失败内容与 audit，不继续请求；检查点失败受控停止，未成功持久化请求预留前不调用；异常/巨大用量不污染汇总 | 归档失败一请求即停、预留落盘失败零请求、无效用量 unknown、所有六位置首失败停止 |
| 失败诊断 | batch 区分 CONTRACT_SCHEMA_INVALID、PLAN_SCOPE_BLOCKED 与解释阻断代码；UI 给出可理解原因 | 浏览器导出和负例，未新增后台请求 |

两个修复提交分别为 `7d0b8d8`（Question 契约、证据、历史与浏览器）和
`a7650b4`（归档与批次终止）；文档另列提交。金融安全和 UI 交互仍可在先前 RC 独立提交中审查。

## 零付费验收

| 检查 | 最终本地结果 |
| --- | --- |
| 完整 Web 单元与集成 `npm test` | **158 / 158**，较原 RC 新增 10 个测试组，含大量独立反例；H-01/H-02 5、H-05 4 继续通过 |
| 允许的根 V0.4 Parser | **3 / 3**，不运行被排除材料的 suite |
| TypeScript、lint、production build | 通过；lint 0 错误，4 个起点已有 warning |
| V5 迁移核对 | **76 个原文件字节不变**，既有 V0.4 明示 adaptation 保留 |
| 生产依赖 audit | **0 vulnerabilities** |
| production runtime smoke | **1 / 1** |
| S-05/S-06 PDF 上传、证据逐条审核及回滚 | **3 / 3**，NOT-LIVE 模型 |
| 问题、并发审核台账、全 UI、RC 交互 | 各 **1 / 1** |
| 新可靠性浏览器 | **1 / 1**，1440/768/390px；错误 Source 引用、因果越界、阻断导出、无接受入口、历史兼容、专业 pending、键盘 Enter、无横向页面溢出 |

本次所有生成测试均注入 synthetic/mock transport，浏览器服务器显式清空 DeepSeek/OpenAI key。
新浏览器还拒绝非 localhost 请求：`artifacts-web/question-reliability/acceptance.json`
记录 **realModelCalls=0**、15 次 synthetic 回包、外部请求和 page errors 均为空。
截图 `plan-blocked-{1440,768,390}.png`、`safe-pending-*.png` 与原始阻断导出同目录。
既有 `artifacts-web/rc/acceptance.json` 覆盖缺材料往返、历史切换、未保存保护、焦点顺序、确认框、
同 ID 重发、结束等待及状态导出；全 UI 继续覆盖 1440/1366/768/390px。
CI 会将这些文件作为 `web-research-audit-*` artifact 保存。
本地日志在 `/private/tmp/beacon-question-repair-*.log`。
七页 UI 首次验收与构建重叠出现加载超时，构建完成后独立重跑通过；最终检查无该干扰。

精确全 wire（含 Schema、输入、Prompt），使用原注册 PDF 快照和最大合法引用集合/160 字 reason：

| 意图 | Plan wire bytes / 输入估算 | Execute wire bytes / 输入估算 |
| --- | --- | --- |
| CHANGE_EXPLAIN | 3265 / 7361 | 11670 / 15766 |
| EVIDENCE_AUDIT | 3268 / 7364 | 11673 / 15769 |
| DECISION_IMPACT | 3248 / 7344 | 11654 / 15750 |

估算仍为全 UTF-8 wire bytes + 4096，**不是提供方 tokenizer 或金额硬上限**。
三类固定问题均未超过原 16000/次限制；更长输入仍先走原预算门禁，可在 provider fetch 前阻断。
未提高输入/输出、时间、调用次数、预算金额或 DeepSeek 配置。

## 历史证据与限制

原 manifest SHA：`79ab2a4cab7a1070e1b6cf9eba9afc8ed9eb88959279ad35468b99503063217e`。
原输入快照 SHA：`27f0d92d5b9a3694cbe48ae70eea381d5d8a33c6d7bcf23028283590e675ab95`。
两份公开原输出作为离线失败重放输入，来源/文件/原文摘要详见
[fixture 说明](../apps/web/tests/fixtures/question-live-38047109824/README.md)；仓库复制仅追加末尾 LF，原 artifact 不变。
旧 v1 结果不按 v2 回写状态，既有 review 不变；测试内修订例子只是未批准的建议，未写入产品台账。

这些本地词句检查是对可复现问题的保守门禁，**不是自然语言推理正确性的完整证明**，
仍可能漏检新表达或阻断需人工确认的表达。Hash 验证保证记录内部一致，不鉴证浏览器身份、原 PDF 或专家资格。
新 v2 的普通测试通过不代表它已完成真实输出内容验收；没有凭 mock 宣称内容或专业通过。

## 安全边界与停止点

**本次修复新增真实模型调用 0；此前获批失败批次实际调用 3，不是项目累计 0。**
最多六次、首失败停、无自动重试、manual dispatch、attempt=1、预算确认与精确 Commit SHA 门禁均保留并回归。
`question-live.yml`、预算模块、提供方配置、Memo 指令、金融公式、阈值、K-07 信号/判断、生产密钥及审验窗口均未改。
没有重新 dispatch 或 rerun 付费 workflow，没有合并、部署、生产操作或 S-07 访问/测试。

本报告与旧 `approvalReference` 都不是对新提交的 live authorization。
最终 SHA 和普通 CI 链接以 PR #36 交付记录为准；修复后停在该 SHA，需负责人明确授权才能另行申请付费验收。
最多六次的理论峰值 **$0.26928**、25% 余量 **$0.33660** 边界保留，金额不是平台硬上限。
待负责人事项：新精确 SHA 的真实批次授权及内容复核；[K-07 A/B 决策](K07_DECISION_RC.md)；
EG-01/EG-02 的专业支持；PR 审查/合并及独立部署批准。

## 相对赛前起点的完整路径清单（51 个）

```text
.github/workflows/web.yml
apps/web/app/changes/page.tsx
apps/web/app/help/page.tsx
apps/web/components/beacon/workspace-dashboard.tsx
apps/web/components/research/memo-panel.tsx
apps/web/components/research/memo-revision-panel.tsx
apps/web/components/research/question-workflow.tsx
apps/web/components/research/update-workflow.tsx
apps/web/components/research/use-confirm-action.tsx
apps/web/components/research/use-unsaved-guard.tsx
apps/web/components/research/version-history.tsx
apps/web/lib/dashboard-presentation.ts
apps/web/lib/material-handoff.ts
apps/web/lib/model-json.ts
apps/web/lib/parser-v04.ts
apps/web/lib/question-content-validation.ts
apps/web/lib/question-presentation.ts
apps/web/lib/research-engine.ts
apps/web/lib/research-memo.server.ts
apps/web/lib/research-memo.ts
apps/web/lib/research-question-storage.ts
apps/web/lib/research-question.server.ts
apps/web/lib/research-question.ts
apps/web/package.json
apps/web/scripts/run-question-batch.mjs
apps/web/tests/browser-e2e.test.mjs
apps/web/tests/dashboard-rc.test.mjs
apps/web/tests/finance-rc.test.mjs
apps/web/tests/fixtures/question-live-38047109824/README.md
apps/web/tests/fixtures/question-live-38047109824/request-02.json
apps/web/tests/fixtures/question-live-38047109824/request-03.json
apps/web/tests/interaction-rc-browser.test.mjs
apps/web/tests/interaction-rc.test.mjs
apps/web/tests/question-batch.test.mjs
apps/web/tests/question-browser.test.mjs
apps/web/tests/question-reliability-browser.test.mjs
apps/web/tests/question-reliability.test.mjs
apps/web/tests/question-test-helpers.mjs
apps/web/tests/research-question.test.mjs
apps/web/tests/reviewer-audit-browser.test.mjs
apps/web/tests/ui-suite-browser.test.mjs
docs/K07_DECISION_RC.md
docs/PRE_SUBMISSION_RC_REPORT.md
docs/PROJECT_STATE.md
docs/RC_QUESTION_RELIABILITY_REPAIR.md
lib/chain-v01.ts
lib/financial-numbers.ts
lib/parser-v04.ts
lib/parser-v05.ts
lib/parser-v06.ts
snapshots/web-v5-migration.json
```
