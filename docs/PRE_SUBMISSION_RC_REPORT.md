# 赛前 RC：金融输入安全与交互闭环

日期：2026-10-10。已审核起点 `3328bcc95fa9a3b9f8ed38c45b2664901038d8b2`。
独立分支 `codex/pre-submission-finance-ui-rc`，stacked base 为
`codex/reviewer-audit-round-2`；不扩大 PR #35。开始及推送前均核对远端起点一致，
原工作区干净，已读取根 AGENTS.md（仓库没有更深层适用文件）。

## 修复与行为边界

- **H-01**：共享有限数值同比校验，先拒绝零比较基数、缺失、非有限值和隐式字符串强转，再执行原 `(current - comparison) / abs(comparison)`。
  溢出返回不可计算；Parser V0.4/V0.5/V0.6、迁移的 V0.4 和人工证据复核均失败关闭。
  比率行仍沿各原入口的口径处理；冻结引擎的百分点差保持减法。
  原有正常有限同比、负比较基数及容差不变。
- **H-02**：统一验证盈利有限、股本/年化因子/倍数有限且正、`bear <= base <= bull`；
  年化、情景市值、每股结果全部验证有限。任一数值或桥校验失败时 `scenarios=null`，
  不返回部分情景，非法因子和计算输出清空，不把 NaN 经 JSON 转成 null 后当成功。
  专业门禁仍独立阻塞：已满足数值条件的历史情景可以保持原 provisional 计算，但不能发布。
  缺少股本/倍数的上传不会显示年化估值中间结果；正值、有限负盈利、公式、年化推断、舍入和金融口径保留。
- **H-05**：Dashboard 根据当前证据、系统信号、F-02 与专业门禁生成标题、语气、方向、风险和下一步。阻断时旧 F-02 闭合与历史影响均标为待重审，不显示为本次有效计算。
  证据不足/阻断/待签署不会显示“判断维持成立”的固定结论。证据核验进入证据页或材料提交；
  EG-01/EG-02 进入使用说明的专业复核准备区，可取得快照、证据及真实复核模板，不能在材料页关闭专业门禁。
- **K-07**：只提交 [负责人决策说明](K07_DECISION_RC.md)。首次非正已使 C-04 系统信号削弱，
  但 Kill Criterion 当前首次 watch、连续两期 triggered，后者才切换估值盈利口径。
  说明逐项比较方案 A / B 对历史、UI、测试、Claim 与投资结论的影响，推荐评估 B 以保持当前实现与历史连续性，
  **推荐尚未采纳**。本轮不改 K-07 或任何投资判断。

## 交互闭环

- Run 切换、新任务操作、Memo 历史、父版本切换与离页前保护未提交的审核人、意见及修订正文。
  确认框默认聚焦安全操作，支持键盘焦点顺序和取消，菜单选项消失后恢复焦点到稳定的材料选择控件；确认放弃后清空原表单。
  审核区持续显示当前 Run ID、问题/研究摘要与创建时间。保存审核后清空已提交字段。
- 待处理状态区分发送、检查、处理中、网络结果不确定和明确阻塞。
  唯一推荐下一步为等待或只读状态检查；不自动轮询/重发模型。
  重发只有网络不确定状态可用，折叠显示并要求确认，复用原 ID 和原 body；
  409/404/服务端明确失败不开放重发。结束等待说明损失与保留内容并确认，
  只留 ID/phase/结束时间，不归档 ticket 或请求正文，也不取消服务端任务。
- 材料切换、重新选择、文件替换、开始下一更新、修订页离开与主动放弃均有未保存修改保护。
  未提供未经验证的草稿恢复；刷新/关闭使用浏览器原生未保存提醒，页内操作使用明确二选一。
- 问题→材料→保存→返回仅接受固定内部 `/questions?resume=materials`。
  问题文本存于当前标签页 sessionStorage，匹配的原任务草稿仍受服务端签名与会话核验。
  返回恢复问题/安全草稿，不自动规划或执行，不新增模型请求。
- 被阻断、范围外、缺材料、待确认、待审核、已审核与退回记录采用相应导出名称。
  “生成 Graph Diff”改为“预览研究影响”，步骤统一为提交材料→人工核验→预览影响→保存版本→继续研究。
  长结果和材料页提供轻量章节导航与下一步。无品牌、Logo、字体或配色更改。

## 本地验收（全部零付费）

在与 CI 相同的 Node 22 运行；提供方密钥显式为空，浏览器请求由 synthetic/mock handler/transport 接管。

| 检查 | 结果 / 证据 |
| --- | --- |
| 完整 Web 单元与集成 `npm test` | **148 / 148**；含三意图模拟、六次受控批次与档案秘密检查 |
| 允许的根 V0.4 Parser 回归 | **3 / 3**；S-05/S-06 与缺失字段；不执行含被排除材料的广域 suite |
| H-01/H-02 新金融回归 | **5 / 5**：零值、负值、缺失、字符串变体、非有限、溢出、无序倍数、非正因子；S-05/S-06 情景值精确保留，有限负盈利策略不改 |
| H-05 新回归 | **4 / 4**：反方向、阻断、证据不足、事实与专业队列分流 |
| TypeScript / lint / production build | 通过；lint 0 错误，保留 4 个起点已有 warning |
| 迁移校验 | 76 个原文件字节未变；V0.4 parser 的 H-01 修复列为明示 adaptation，保留原 checksum 来源，不伪称字节未变 |
| 生产依赖 audit | 0 vulnerabilities |
| production runtime smoke | **1 / 1** |
| 已登记真实 S-05/S-06 PDF 浏览器 | **3 / 3**：上传、逐条审核、保存、刷新、回滚与异常材料；模型 NOT-LIVE |
| 问题 UI、刷新/并发台账、完整 UI、RC 交互 | 各 **1 / 1**；模型 NOT-LIVE |
| RC 交互宽度 | **1440 / 768 / 390px**：缺材料往返、历史切换、更新/修订保护、焦点顺序、确认、同 ID 重发、结束等待、阻断/范围导出、无页面横向溢出 |
| 既有七页 UI 宽度 | **1440 / 1366 / 768 / 390px**；错误/空态、证据查看、版本导出、回滚对话框、secure-context 阻塞 |

浏览器证据位于 CI 的 `web-research-audit-*` artifact：
`artifacts-web/rc/acceptance.json` 声明 `realModelCalls=0`、外部浏览器请求为空、console/page errors 为空。
其 12 次问题和 3 次 Memo **synthetic** 回包是测试响应，不是付费调用，不能误读为真实批次。
截图包括 `question-result-{1440,768,390}.png`、`update-discard-*`、`revision-discard-*`、
`material-saved-*`、`pending-end-*`、`pending-blocked-*`、`dashboard-blocked-*` 和 `dashboard-insufficient-*`。
本地日志在 `/private/tmp/beacon-rc-*.log`；完整 CI、精确最终 SHA 与 PR 链接在交付记录/PR Checks。
金融和主 UI 提交分别为 `9d3ecff` 与 `8282078`；随后截图复核补齐阻断时旧 F-02/历史影响的展示保护及专项回归。最终 SHA 应以交付的完整 40 位值为准。

## 安全复核与停止点

`question-live.yml`、`run-question-batch.mjs`、预算模块、DeepSeek 配置、Prompt、生产访问窗口和密钥均未改。
既有离线回归证明：最多 6 次请求、首失败立即停、无自动重试；手动 workflow_dispatch、
attempt=1、精确 Commit SHA、审批标识及预算确认门禁；输入/输出/全批预算仍生效。
Cookie、API Key、session secret、ticket、authorization 字段与嵌套/JSON 字符串变体仍被禁止归档。
本轮说明不是 live authorization；没有 dispatch 任何真实工作流。没有访问 S-07 原材料、真值或首输出，也未运行其测试。
没有合并、部署、修改生产或回写历史。

**真实模型调用 = 0。** 最终 RC 通过普通 CI 后，仍须项目负责人对其**精确 SHA**另行明确授权。
最多六次 DeepSeek V4-Pro 的 `$0.26928` 峰值估算 / `$0.33660` 含余量方案只是预算提案边界，
不是平台金额硬上限，不允许复用旧 SHA 授权。
待负责人事项：K-07 A/B 选择和可比期间定义；最终 SHA 的一次付费批次授权；实际输出内容审阅；
EG-01/EG-02 的真实专业复核；PR 审查/合并与独立部署批准。通过技术验收不等于完成这些事项。

## 相对起点的完整变更清单（34 个路径）

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
apps/web/lib/parser-v04.ts
apps/web/lib/question-presentation.ts
apps/web/lib/research-engine.ts
apps/web/package.json
apps/web/tests/browser-e2e.test.mjs
apps/web/tests/dashboard-rc.test.mjs
apps/web/tests/finance-rc.test.mjs
apps/web/tests/interaction-rc-browser.test.mjs
apps/web/tests/interaction-rc.test.mjs
apps/web/tests/question-browser.test.mjs
apps/web/tests/reviewer-audit-browser.test.mjs
apps/web/tests/ui-suite-browser.test.mjs
docs/K07_DECISION_RC.md
docs/PRE_SUBMISSION_RC_REPORT.md
docs/PROJECT_STATE.md
lib/chain-v01.ts
lib/financial-numbers.ts
lib/parser-v04.ts
lib/parser-v05.ts
lib/parser-v06.ts
snapshots/web-v5-migration.json
```

Web CI 增加 stacked base 与 RC 测试，并显式设 NOT-LIVE/空提供方密钥。
正常 main 的广域金融 workflow 未改，本轮 stacked PR 只触发明确允许 corpus 的完整 Web CI；
不得将未触发的广域金融 workflow 描述为通过。
