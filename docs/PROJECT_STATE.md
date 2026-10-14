# Beacon｜研灯：统一项目状态

## 2026-10-10 — PR #35 初始清单归档冲突最小修复（零付费）

起点与远端分支均核实为 `c0153ea893da0bf5bde0a602a563acaa34a9692c`。
manifest 审批元数据改名为 `approvalReference`，凭据/秘密归档拦截完全不变；
新增真实初始清单、六次 NOT-LIVE handler 归档及 27 个泄漏拒绝案例。
[修复与验收报告](PR35_MANIFEST_ARCHIVE_REPAIR.md) 记录本地 137/137 离线测试、
类型/构建及模拟浏览器证据；最终 SHA 与普通 CI 以 PR #35 最新交付记录为准。
真实模型调用 0、未 dispatch/合并/部署；S-07、金融公式、生产窗口及密钥未变。
新 SHA 付费测试须报告通过后由负责人另行批准，旧 SHA 授权不沿用。

## 2026-10-09 — PR #35 付费测试前预算预检（零付费）

固定起点 `d7b34984d9c3e919cbc5e685b6c6cb1245ce866d`。保留 6 次请求与单次
6000 输出，增加提供方实际 wire 的输入估算门禁（16000/次、96000/批），峰值
缓存未命中预算估算 $0.26928，含 25% 余量 $0.33660。**不是金额硬上限**。
新增预算确认与归档凭据检查；[预算预检说明](PR35_QUESTION_BUDGET_PRECHECK.md)。
本轮真实模型请求 0，未改生产窗口；付费执行仍需负责人对最终 SHA 明确批准。

## 2026-10-09 — PR #35 会话隔离与收据恢复修复（未合并、未部署）

以 PR #35 的 `08db9ca09a9a8c86cad2343c41ee9f3c3fb84940` 为固定起点，继续
`codex/reviewer-audit-round-2`。修复独立会话越权与共享 Bearer 绕行，签名草稿
绑定已验证会话；收据 v2 增加 owner，旧 unowned 收据保留但拒绝使用。私有目录、
独立认领索引、容量门禁、跨进程原子写、显式备份/恢复/不确定隔离已实现。
[RC 报告与运维命令](PR35_SESSION_RECOVERY_RC.md) 明确本地测试与生产待验收边界。
本轮真实模型请求 0 次；生产仍保留此前只读核查的 main `d035075...`，未改配置。
重新登录不会接管旧任务；不声称账号体系、被盗 Cookie 服务端吊销或零 RPO 灾备。
Merge / Deploy 发布验收 No-Go：安全修复与普通 CI 不能替代尚未执行的真实模型
Schema/内容验收；付费测试仍需负责人新审批。

## 2026-10-09 — 人工审验后二次技术审计（未部署）

本次从实际 main `d035075fc5c9d7cb9811102177c7e3fe5b7ba0ec` 建立
`codex/reviewer-audit-round-2`。PR #30/#31/#32/#34 的实际状态为 merged，
下方旧日期的未合并记录继续作为历史保留。只读生产核查显示仓库与构建收据
均为该 SHA；公网 HTTPS 匿名问题页 307，证书验证通过。

[二次审计报告](REVIEWER_AUDIT_ROUND_2.md) 记录八项复现分类、精确利润桥、
修复文件、A–T 验收及剩余风险。修复包括标识空白误拒、显式条件推论误拒、
Question 持久幂等收据/状态读取、历史覆盖 API 防护、PDF 资源边界、数字显示和
最小材料/历史 UX。冻结公式、专业关卡、品牌首页、导航与 S-07 排除保持不变。
所有模型测试均 NOT-LIVE；Reviewer 原始输出尚未取得，不把独立构造复现当成
原始事件根因确认。生产运行收据目录尚未配置，新代码未部署；审验窗口不延长。

## 2026-10-05 — C-01 browser secure-context capability preflight

Work started from merged `main` `a9749f894659c2c57abefc32f9b9efdf2328bb74`
on `codex/secure-context-capability-preflight`. The implementation centralizes
the four mandatory browser guarantees (`window.isSecureContext`,
`crypto.subtle`, `crypto.randomUUID`, and `navigator.locks`) and fails closed
before PDF-derived evidence processing, Memo / Question model POSTs, or any
research version, run, review, and human-revision write. The storage APIs also
enforce the same preflight directly, so a caller cannot bypass the UI check.
There is no unlocked, unhashed, or substitute-ID fallback.

Local automated evidence is complete: every missing capability is covered,
blocked callbacks make zero model requests, blocked persistence performs zero
storage reads/writes, the full 99-test Web corpus passes, lint has no errors,
TypeScript and the production build pass, runtime smoke passes, production
dependency audit reports zero vulnerabilities, and the S-05 / S-06 plus
Question and Lighthouse UI browser suites pass using labelled non-live model
transport. The homepage and Lighthouse visual system were not changed. No paid
model call was made and S-07 was not accessed or executed.

C-01 is **not yet complete**. [PR #34](https://github.com/yivenwang/financial-research-decision-chain/pull/34)
is open and unmerged. The code change still requires PR review and merge,
deployment of the resulting main SHA, and the Issue #33 manual target-
environment chain (upload → review → save → task → execute → review → revision
→ export). Automated code evidence and that remaining production acceptance
must continue to be reported separately.

## 2026-10-04 — Parser layout generalization (new stage)

PR #31 merged with owner approval, without deployment, at
`c4a4dc2f028927144fa03ab0c3eb0166fa0ba4a5`. Its Bull first/second-run artifacts
and validation report remain immutable. Parser-only follow-up is on
`codex/parser-layout-generalization` from that main; see
[parser layout report](PARSER_LAYOUT_GENERALIZATION.md) for architecture,
allowed regression corpus, non-blind Bull rerun and actual CI evidence.
No financial research semantics, product company registry, model budget or
professional gate changes are authorized here. S-07 remains excluded; no model
calls, merge of the new PR or deployment.
Local implementation/tests are complete at `c171288`. The initial workflow
credential blocker recorded at `5f0eb51` was resolved by owner-configured GitHub
CLI authentication. The branch is pushed and [PR #32](https://github.com/yivenwang/financial-research-decision-chain/pull/32)
is open; remote CI is being tracked. Final job evidence is recorded on the PR;
successful scope detection must not be counted as an executed regression.
PR #32 remains unmerged and undeployed.

## 2026-10-04 公牛集团跨公司隔离验证（开发分支）

最新 `main` 为 `3499889da8227fc5b5f8b148a286fc1c0c9d70d9`（PR #30 已合并）。分支 `codex/cross-company-bull-2026q1` 从该提交冻结公牛集团 2026Q1 官方原件与实现摘要。首次 untouched probe 因测试 harness 的 PDF.js 销毁对象错误而 `EXECUTION_FAILED`，原始字节已保留；仅修复 harness 后的第二次运行是 `PARTIAL / UNSUPPORTED_FORMAT`，不是盲测 PASS。

第二次运行确认坐标提取、来源留痕、必要利润原值及 F-02 算术桥具有有限复用性；同时暴露表头百分比单位继承和跨页多表段解析缺口。Source registry、C-04、A-03、K-07、估值、Decision、Memo 与 Question 仍是安克案例语义，没有注册公牛为产品能力，没有模型调用或投资判断。详见[公牛集团验证记录](CROSS_COMPANY_VALIDATION_BULL_2026Q1.md)。

## 2026-10-04 Codex 接管与线上 HTTPS 状态

项目工程执行自 2026-10-04 起转为 **Codex 主执行、所有者做目标/权限/金融语义决策**。不再默认要求所有者充当 Terminal 与模型之间的人工中转。Codex 的仓库级操作规范见根目录 `AGENTS.md`。

当前 GitHub 事实：
- `main` = `fe9af2b9450c069fc979cb539cd43454783a95fa`。
- 第一轮审计修复 PR #30 / `fix/audit-round-1` 仍开放；审计时 head `2c2d34e4ba42a168dfb261dda02b9bdfe52cbaa8` 的 Web CI 实际执行并成功。四个金融引擎 workflow 的 scope job 成功，regression job 因本 head 未修改其范围文件而按设计跳过；不能表述为“五套回归全部执行成功”。
- PR #30 处理会话签名、请求边界、生产门禁、Next 依赖、登录跳转、安全响应头、手动验收认证和本地保存失败等；跨端点额度、幂等、服务端恢复、账号/角色、完整 CSP 等仍未关闭。
- **运营者报告：**所有者在 2026-10-04 按既定方案完成了公开 IP 的 HTTPS 安排。
- **机器已验证：**`http://192.144.168.226` 返回 HTTPS 308；公网证书为有效 Let's Encrypt IP 证书且 SAN 包含 `192.144.168.226`；Next 仅监听 `127.0.0.1:3000`；生产仓库仍为旧 `main` `fe9af2b9450c069fc979cb539cd43454783a95fa`，运行 Next 16.2.6，因此 PR #30 尚未部署。
- **机器尚未验证：**Certbot timer、short-lived renewal 配置和成功后的 Nginx reload hook 已存在，但最近一次 timer 运行早于本证书 renewal 配置和 hook 创建，尚无一次成功续期周期的证据；Secure Cookie、secure context、Web Locks 和完整外网登录回跳仍待 PR 部署后的验收。
- 内部审验访问窗口保持至 **2026-10-08 23:59:59（北京时间）**。

Codex 首个接管任务不是继续堆功能，而是先独立审查 PR #30：对照 `docs/AUDIT_REPAIR_ROUND_1.md`、现有测试与实际线上部署，找出遗漏、回归和未验证假设；确认无阻断问题后再给出合并 / 后续修复建议。金融公式、阈值、K-07、Prompt 判断标准、专业关卡、历史记录和 S-07 排除继续冻结。

## 2026-10-04 第一轮审计修复（开发分支）

基于实际 main `fe9af2b9450c069fc979cb539cd43454783a95fa`。此前桌面 UI 与访问门禁已进入 main；main 已将默认审验截止改为 **2026-10-08 23:59:59（北京时间）**，本轮保留该决定。下面较早日期的“尚未合并 / 未部署”是历史状态，不作为当前结论。

`fix/audit-round-1` 处理技术安全与调用可靠性，见 [修复记录和 HTTPS 发布准备](AUDIT_REPAIR_ROUND_1.md)。该分支在 2026-10-04 完成 Web CI；公开 IP HTTPS 随后由所有者在目标服务器操作并由 Codex 做了上述只读机器复核。HTTPS 已存在不等于第一轮审计代码已经合并或部署。财务核心、Prompt、专业关卡、原始历史和 S-07 排除继续保留。

## 2026-09-28 整套桌面 UI（PR #28）

现有 `ui/beacon-light-workbench-v01` 分支正在进行产品级视觉修订：品牌首页采用深海蓝灯塔场景，系统内部保持浅色机构研究工作台，当前版本数据、固定案例和教学样例分别标注。设计范围、实现入口与验收方式见 [整套 UI V1](UI_PRODUCT_DESIGN_V1.md)。对应提交的实际 CI 状态以 PR 为准；本记录不代表已合并、已部署或真实模型验收通过。**独立 Mobile Companion 与二维码反馈自 2026-09-28 起标记为 HOLD，不进入当前桌面 UI 修订。**

## 2026-09-23 审查层增量（开发分支）

所有者确认短期参赛、长期商业化方向并要求继续执行。本分支补充 [开源与商业化边界](OPEN_SOURCE_COMMERCIAL_BOUNDARY.md)、NOTICE 与名称说明：公共核心继续 Apache-2.0，未来商业模块默认私有开发；私有仓库、商业功能、比赛标签、商标及权利清查均未完成。现有公开内容不追溯改许可。

`feat/adversarial-review-v01` 增加独立审查实验模块、官方 Jev SDK 适配器及 Promptfoo 离线判定回放。该层尚未接入正式问题路由、真实 Jev 调用、自动 Commit 或线上版本；现有反证引用检查继续生效。完成条件、成本与误放行评测见 [独立审查 V0.1](ADVERSARIAL_REVIEW_V0.1.md)。此前表格记录仍表示其各自日期的基线。

后续聊天和开发先读取本页，再核对 GitHub 当前分支、PR 与 CI。对话提案、代码实现、普通测试、真实模型内容验收、上线是不同状态；本页不代表所有聊天会自动共享上下文。

## 最新有效决定

- 名称：**Beacon｜研灯**。定位保持“研究更新与决策变更管理”；安克创新为首例。表达：在信息噪声中识别信号，在复杂研究中照亮决策路径。口号：让变化被看见，让影响被理解，让决策有据可循。
- 决赛支持输入研究问题；当前范围为安克创新 / S-05 / 2026Q1 / C-04，三个意图：变化解释、证据核验、决策影响。输入问题后先确认任务，再执行；材料上传仍负责补充可核查证据。
- 用户已同意非 UI 工作一起推进：至多六次请求的一批真实问题验收、发布准备、固定评测、有限迁移验证、参赛材料和专业复核准备。首个失败停止整批，无自动重试。
- UI 方向为浅色研究工作台，主线 Diff → Impact → Review → Commit。品牌首页与五个桌面任务页面已实现并进入当前主线；独立 Mobile Companion 仍为 HOLD。
- 不改变冻结财务定义、公式、阈值、判断及专业关卡，不以 UI 或审计修复暗改金融语义；不读取或测试 S-07。

## 代码与验证基线

| 工作 | 可核查状态 | 依据 |
| --- | --- | --- |
| 人工修订与历史 | 已进入 main | PR #22、#23 |
| 三份 run-10 建议正文 | 用户已确认 18 段（16 改、2 留）；追加绑定记录已合并 | PR #24 |
| 问题入口 | 已进入 main；普通 CI 通过 | PR #25 |
| 桌面 UI / 访问门禁 | 已进入 main；当前线上服务基于其后续部署演进 | 以 main 与生产 SHA 复核为准 |
| 第一轮审计修复 | PR #30 开放；Web CI 实际执行成功；四个金融引擎 regression job 经 scope 判定跳过；尚未合并 | `fix/audit-round-1` / 以 PR 当前 head 为准 |
| HTTPS | 运营者报告已完成；308、可信 IP 证书、loopback upstream、旧生产 SHA / Next 16.2.6 已机器复核；成功续期周期未验证 | live TLS / Nginx / release SHA；renewal 仍 pending |
| 新问题 Prompt 的真实验收 | 待运行与内容复核；已准备手动固定提交的批次工具 | [验收规范](QUESTION_LIVE_ACCEPTANCE_V0.1.md) |
| 多公司 | 尚未验证端到端适用性 | [有限验证协议](CROSS_COMPANY_VALIDATION_V0.1.md)；#20 仍开放 |
| 专业复核 | EG-01 / EG-02 均 pending | [专业材料](PROFESSIONAL_REVIEW_PACKET_V0.1.md) |
| 参赛 | 项目自查 CONDITIONAL PASS | [提交准备](COMPETITION_SUBMISSION_V0.1.md) |

技术测试通过不等于金融内容准确、专业认可、真实模型内容验收或生产环境已验证。历史失败、旧 CI 接受事件和原始输出继续保留。

## 跨聊天同步核查

| 来源 | 已确认 | 差异处理 |
| --- | --- | --- |
| 当前聊天与可检索历史 | Codex 接管、所有者报告 HTTPS 操作完成、访问窗口至 10/08 | 运营者报告与机器事实分列，不把部署操作等同于代码已上线 |
| GitHub 当前代码、分支、PR、CI | main、PR #30；Web CI 成功；四个金融回归 job scoped-out | 后续始终以实时 GitHub 为准 |
| 队员 UI 文档 | UI 方向已落地主线 | 早期“AI 自动决策、偏好学习、万能聊天”等设想不作为已实现需求 |
| “追踪几家公司直到决赛” | 讨论设想 | 不是无人值守交易或无限模型调用授权 |

## 当前交接优先级

1. Codex 独立审查 PR #30 与 live HTTPS / Nginx / release 状态。
2. 修复审查中发现的阻断问题；无阻断后再决定 PR #30 合并与生产同步。
3. 第二轮审计优先处理跨端点额度与幂等、服务端持久任务 / 恢复、台账 schema / 事务一致性；涉及新增存储或成本时先提出方案。
4. 之后再进入真实问题受控验收、多公司有限验证、专业复核和决赛材料收口。
