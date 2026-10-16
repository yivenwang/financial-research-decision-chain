# Beacon｜研灯 V1.0 提交前技术审计

审计日期：2026-10-16（北京时间）。仓库：`yivenwang/financial-research-decision-chain`。

## 1. 最终状态：NOT READY（当前公开部署）

**现有公开部署存在两个已确认的 P0：匿名模型接口缺少跨请求总额度保护；金额单位/币种不一致可静默生成错误金额证据。修复已在本 PR 完成并通过本地回归，但尚未获批合并或部署，线上仍存在原缺陷。** 不能因候选代码编译或 CI 成功宣称公开系统 READY。

候选修复的工程回归通过；新 Question explanation v11 的完整真实三意图内容验收仍 **BLOCKED**。本轮真实模型请求 **0**，没有重跑旧失败批次、生产压力测试、生产写入、密钥轮换、合并或部署。没有访问或执行 S-07 原材料、真值、首输出或相关广域回归。

现有产品正式研究范围仍为安克创新 / S-05 / 2026Q1；S-06 为隔离回归，公牛为解析器迁移验证。任意两家公司完整产品研究不是现成功能。估值底稿不足时维持 null/受阻，EG-01/02 pending；这些边界没有因审计而放宽。

证据总览：[verification-summary.json](docs/audit-20261016/verification-summary.json)。以下 `PASS` 只覆盖明确写出的环境与范围；当前线上失败、候选修复与未执行项分别记录。

## 2. 仓库、PR、部署及历史基线

| 项目 | 实际核查结果 |
| --- | --- |
| 原本地工作目录 | `feature/beacon-brand-ui`，`b0214e4`，另有未跟踪 competition-materials；完整保留 |
| 审计分支 | `codex/pre-submission-audit-20261016`，从实际 `origin/main` 建立独立工作区 |
| main / 线上基线 | `80786b5df92d4eada1fe238e96c04ccc6e88e52e`；提交前再次 fetch 核实 main 未变化 |
| PR #35 | 已合并，原 head `3328bcc95fa9a3b9f8ed38c45b2664901038d8b2`，merge `e2cace9e46d8ec7848ae6e472473327e49ab70d8` |
| 后续已合并 | #36 赛前 RC、#37 直接访问、#38 去内部水印；没有回退品牌/UI |
| 原有未合并 PR | 仅 #5（S-07 历史保留），未读取其内容或执行其测试 |
| main 普通 CI | [38550901070](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38550901070) success |
| 本轮修复代码 commit | `7de6f76a3d4d1c4009ea3b7f5d0b6af908e18c6f`；后续报告提交不改变执行代码 |
| 本轮 PR | [#39](https://github.com/yivenwang/financial-research-decision-chain/pull/39)，未合并 |
| 本轮 CI | 修复代码提交的 [Web CI 38855347136](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38855347136) **success**，[允许语料解析回归 38855347161](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38855347161) **success**；5 个 scope 成功，4 个广域 job 按范围 skipped，不计作执行通过。后续仅报告提交的最终检查见 [PR checks](https://github.com/yivenwang/financial-research-decision-chain/pull/39/checks)。 |

已读取 PROJECT_STATE、两轮历史审计、PR35 预算/归档/会话恢复报告、PR36 可靠性与契约收敛记录。历史失败原样保留；旧文件中“未合并/未部署”是当时状态，不能代替本次实时核查。

## 3. 十项测试结果

### TEST 01 — 多访客数据隔离：BLOCKED（要求的两家公司完整流程）；支持范围内 PASS

- **方法/环境**：代码检查 localStorage、sessionStorage、文件和收据存储；本地 Next 生产构建 + Chromium 的两个完全独立 context，open 模式自动签发不同的服务端签名 Cookie。两人同时导入同名 `report.pdf`，分别使用固定哈希 S-05/S-06 原件，审核、计算、保存、刷新、关闭重开；另测中断未保存操作及同 profile 多标签页。
- **实际结果**：两个 context 的文件 SHA、期间、审核人、版本/研究范围独立；双方看不到另一 scope 的私有版本。服务端资源 ID 双向替换 GET 404、外国草稿执行 422、用他人 idempotency ID POST 404，均没有额外 provider 请求。
- **隔离方案**：PDF 在浏览器解析，没有服务器 PDF 上传目录或共享数据库。研究版本/Memo/审核在该浏览器 profile 的 origin localStorage；问题服务端收据绑定签名 session nonce 派生的 owner HMAC，资源 UUID 本身不授予访问权限。公开登记样例与 V-01 研究基线为预期共享内容。
- **问题/修复**：未发现跨独立访客泄漏；发现同 profile 两标签可覆盖未完成任务恢复指针的 P1，已改为 Web Lock 原子认领、按 phase/id 清理，浏览器回归通过。
- **证据**：[observations.json](docs/audit-20261016/observations.json)、[submission-audit-browser.test.mjs](apps/web/tests/submission-audit-browser.test.mjs)、[submission-context.test.mjs](apps/web/tests/submission-context.test.mjs)、既有 research-operation-security/reviewer-audit 测试。
- **剩余风险**：同浏览器 profile 的标签页有意共享同一工作区，不构成两个人的安全隔离；换 Cookie 不清空该设备 localStorage。共享电脑应使用独立浏览器 profile/隐私会话。Cookie 是匿名凭据，不验证人的身份。公司 B 的正式研究被 OUT_OF_SCOPE 拒绝，不能把拒绝说成完成两家公司研究/估值/决策。

### TEST 02 — AI 上下文污染：PASS（实际 Mock 出站消息）；真实模型抗指令能力 BLOCKED

- **方法/环境**：直接截获两个实际 handler 发送给 Mock fetcher 的 JSON wire。A 安克，B 公牛；检查 system/user 内容、conversation/history/tools 字段、引用目录。将恶意指令植入上传来源名、审核名、证据 label/snippet/sourceExcerpt/location，再执行 Question 和 Memo。
- **结果**：出站只含当前问题与当前获准结构化证据；A/B 私有问题不交叉。B 公司安全地 OUT_OF_SCOPE。没有共享会话历史、previous_response_id、conversation 或模型工具授权。上传的恶意展示文本在 canonical context 重建时排除，不能指示模型读取别人的资源或获得工具权限。异步任务由固定 ID、快照 hash 和有归属收据绑定，刷新不另发模型请求。
- **证据**：[security-baseline.json](docs/audit-20261016/security-baseline.json)、submission-context 2 项动态测试、question/provider/operation 回归。
- **修复状态/风险**：该项未确认 P0；无 Prompt 或模型判断标准修改。Mock 证明消息构造与工具边界，不能证明真实模型一定服从指令或当前 v11 内容验收成功。

### TEST 03 — 公开访问与 API 滥用：FAIL（线上）；PASS（候选保护回归）

- **原缺陷 P0-01**：默认未设 acceptance budget 时，同一签名访客顺序 8 次 Memo（即使 503）及 8 次 Question 都各到达一次 Mock provider。原有全局变量仅限制单进程同时一条调用；Nginx 当前可读配置没有 limit_req/limit_conn 声明；Question 的 1000 收据容量不覆盖 Memo 或统一费用预算。
- **修复**：两个端点统一 fetch 前 wire UTF-8 bytes + 4096 ≤ 32768；共享私有持久 ledger，生命周期最多 **240** 次 provider 尝试，**24/访客滚动小时、30/全局滚动分钟、跨进程同时 1 次**。先 fsync 预留再发送；失败、429、5xx、超时、未知计费不退款。Cookie 重新签发、跨日、重启均不恢复总额度；没有 HTTP/env 生产绕过开关。
- **验证**：另在 `NODE_ENV=production` 对两个真实 handler 使用默认目录选择（无注入 budgetStore）和 Mock fetch，确认缺 ledger 为503且提供方调用0，初始化后两个端点共享同一计数；见 [production-mode-mock.json](docs/audit-20261016/production-mode-mock.json)。真实执行 240 次本地持久预留后，重启实例/换 owner 的第 241 次拒绝；六个进程原子竞争仅一条预留。损坏、非私有权限、未初始化、落盘失败均 fail closed。Memo POST 仅接受验证签名访客，配置 GET 保留原兼容方式；没有增加评委登录步骤。
- **服务器输入边界**：实际流式请求体 Memo 128 KiB、Question 512 KiB、读取超时、1000 字问题；下游回包 256 KiB。PDF 不上传服务器，其 25 MiB/500 页/25 万文本项/400 万字符/45 秒限制保护本机解析，不能冒称服务器上传限流。
- **证据**：security-baseline、[model-budget.test.mjs](apps/web/tests/model-budget.test.mjs) 11 项、request-security、[生产保护说明](docs/PRODUCTION_MODEL_BUDGET.md)。
- **剩余风险**：未部署，线上原缺陷仍在。新签名会话可绕过“每访客”额度，因此全局生命周期限制是必要总保护；攻击者仍可能耗尽有限公共额度导致付费能力暂停。没有宣称抵御网络层 DDoS。

### TEST 04 — DeepSeek 调用与费用：FAIL（线上缺统一保护）；候选 Mock PASS，真实 API/Billing BLOCKED

- **PR35 四层核查**：代码存在且已经合并；生产 SHA 包含它；但六请求批次、首失败停、16000/次与 96000/批输入估算、6000/次与 36000/批输出主要由手动 `run-question-batch` 及可选 `QUESTION_ACCEPTANCE_BUDGET_MODE` 约束。它没有为所有生产访客提供累计费用保护，Memo 原来没有统一输入预检。
- **本轮验证/修复**：两个生产路径统一持久预算；DeepSeek 6000 输出/150 秒、OpenAI 4000/90 秒保持。请求后 input/output/total、模型身份与上限检查；输入估算超限请求前拒绝，无内容截断、自动修补或重试。429/5xx 保留失败、未知用量与已占预留；原生本地 HTTP 头/正文超时、响应取消与锁释放已动态验证。结算落盘失败不得返回成功。
- **取消边界**：浏览器断开不撤销已派发的 provider 工作，服务端继续在既有超时内完成/记录；不会把断开解释为免费，也不自动重发。进程崩溃后的未知预留继续阻断，需要运营者核账；没有未经授权的自动解锁或退款。
- **金额估算**：2026-10-16 只读核验 [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing/) 的 V4 Pro 峰值未命中输入 $1.32/M、输出 $3.96/M。旧六次预算 $0.26928，加 25% 为 $0.33660，与 PR35 参数一致。新公共 ledger 的极端请求预留为 7,864,320 输入估算和 1,440,000 输出，按该价估算 $16.0833024，加 25% 为 $20.104128。**这是暴露估算，不是账单硬金额上限，也不是本轮付费授权。** 精确 tokenization、失败计费、未来价格及供应商账户硬限均属外部依赖；OpenAI 不能套用 DeepSeek 价格。
- **证据**：model-budget/provider-boundary/question-batch/memo-batch 全量回归；历史 PR35 预算报告保留。手动 Question harness 增加新 ledger 初始化，未执行 live workflow。
- **剩余风险**：线上尚无本轮 ledger；真实 provider schema/当前 v11 内容、账户余额/硬限和账单均未在本轮验证。历史已消耗的固定 SHA 预算不用于本轮。

### TEST 05 — 金融数据准确性：FAIL（线上单位负例）；PASS（候选受限语料）

- **P0-02 复现**：将现有 S-05 金额格同除 10000 并标“万元”，同比与利润桥仍闭合；旧 parser 仍 `canPromoteToEvidence=true`，扣非金额从应为 546.7588969 CNY mn 误记为 0.05467588969，差 10000 倍。美元标签也被放行。
- **修复**：仅在当前 V06 导入校验中拒绝相关表段/行/金额格的不支持或冲突单位、币种、金额百分比；保持首个原始候选供诊断，禁止提升/执行，人工点击接受也不能绕过。不新增万元/外币转换，不改冻结公式、舍入、阈值或历史 parser。
- **动态覆盖**：缺失/零/负/极大/极小/非有限/重复字段、零分母、季度/半年比较、ROE 百分点、EPS 单位、估值输入不足与伪造 gate 放行。没有以 missing=0；数据不足不生成确定估值；模型不写金融事实。新增 9 项金融测试包含多组参数化负例，均通过。
- **三份真实财报**：对固定 SHA 原件重新提取 PDF 坐标并核对十项指标、页码、同比/ROE 与 F-02；非盲 rerun，3/3 PASS。详细原值/计算/结果见 [finance-cases.json](docs/audit-20261016/finance-cases.json)。

| 案例 | 原页 | 归母 / 扣非 / 非经常性（CNY mn） | F-02 差额 |
| --- | --- | --- | --- |
| 安克 S-05 2026Q1 | 2–3 | 471.59418971 / 546.75889690 / -75.16470719 | 0 |
| 安克 S-06 2026H1 | 7–8 | 1702.03721539 / 1438.77516582 / 263.26204957 | 0 |
| 公牛 2026Q1 迁移样本 | 1–3 | 1058.24402462 / 983.60487744 / 74.63914718 | 0 |

- **剩余风险**：线上未部署单位修复；三案例不证明所有财报均适用。公牛不注册为产品研究公司、不套用安克假设。EG-01/02 未关闭。

### TEST 06 — PDF 解析与证据链：FAIL（线上歧义负例）；PASS（候选已测范围）

- **方法/结果**：真实 PDF fresh extraction + 受限布局语料，覆盖跨页/多层表头/百分比继承/重述比较列/第二公司；逐项核对 sourceId、文件 hash、页码、指标、值、单位、期间、原文片段与 canonical 引用。解析失败会清除候选并显示失败，不静默切到教学数据。
- **P1-01**：非经常性区段第二条冲突“合计”原来被忽略。新 V06 有界扫描检测冲突、保留第一值并阻断；相同重复、无关后续表格、跨页原件回归通过。首次实现误扫 S-06 无关第 55 页单位表导致失败，随后收窄到实际贡献指标的表段，并保留防回归测试；最终三原件均通过。
- **文件关联**：实际 UI 在 PDF.js 消费字节前 SHA-256 原文件；snapshot 携带该 hash。两访客同名不同 PDF 不共享文件路径/缓存 key；scope、本地版本与服务端 owner 分离。PDF loading task 在 finally 销毁。
- **证据**：[finance-negative-observations.json](docs/audit-20261016/finance-negative-observations.json)、finance-submission-audit、parser-layout-pdf、browser-e2e 与新增双访客测试。
- **剩余风险/P1**：文件 hash 提供内容留痕，**不是官方原件鉴证**。来源登记靠公司/期间文本和固定 URL，服务端不重新接收/认证 PDF；仅格式正确的 64hex hash 不能证明官方字节。现有文案明确此边界，原文真实性仍需人核对。未引入不安全的匿名 ID 或 hash 权限机制。

### TEST 07 — 评委真实研究工作流：BLOCKED（当前真实 provider 内容）；Mock 浏览器完整流程 PASS

- **实际执行**：真实浏览器首页/工作台 → S-05 原 PDF 上传 → 三条逐项核验 → 冻结复算/影响 → 保存 → 三意图任务规划及确认 → 解释/事实/引用 → 人工接受/退回 → 备忘录/人工修订 → 历史/导出/回滚；四宽度 1440/1366/768/390。S-06 仅回归范围。模型使用真实 handler + 明确 NOT-LIVE transport。
- **结果**：15 项浏览器测试全部通过（6 PDF、1 Question、2 reliability/archive、3 refresh/UI/RC、3 新提交审计）；2 项 runtime smoke 通过。无白屏、pageerror、核心按钮遮挡或水平溢出；材料不足、错误文件、受阻输出、未知请求状态均有反馈与恢复路径。估值/决策是现有链路结果，底稿不全时正确受阻；未伪造估值或正式投资结论。
- **线上只读**：单个 Chromium context 访问七个实际路由均 200，无访问码/登录步骤；PDF worker 200、没有 localhost 链接、pageerror 或 POST。不是生产收费流程验收。
- **证据**：[production-browser.json](docs/audit-20261016/production-browser.json)、Web CI 上传的 artifacts-web 截图/审计记录、browser suites。
- **剩余风险**：v11 仍缺新的明确授权真实输出及逐段内容审阅；旧真实失败不因 Mock 变绿而变成通过。任意公司、正式估值发布和额外账户功能未扩展。

### TEST 08 — 并发与稳定性：PASS（隔离本地无费用负载）；生产容量 BLOCKED

- **方法**：本地生产构建，每批 2/5/10 独立 Chromium context 并发七路由导航 + 样例审核/冻结计算/保存 + 证据/版本/配置 GET；另有两真实同名 PDF 并发导入、六进程预算认领、刷新/同任务多标签恢复。没有向生产施压或向真实 provider 发请求。

| 访客 | 导航次数 | 批次耗时 ms | 导航 p50 / p95 / max ms | Next RSS KiB 前→后 |
| --- | --- | --- | --- | --- |
| 2 | 14 | 1032 | 64 / 122 / 122 | 156512 → 191920 |
| 5 | 35 | 2253 | 178 / 279 / 285 | 191968 → 226672 |
| 10 | 70 | 4886 | 387 / 747 / 776 | 226672 → 225200 |

- **结果/证据**：pageerror、console.error、HTTP ≥400、意外外发请求均 0；server 未崩溃。见 observations。原始字节/同名文件 hash 不混淆，任务没有自动重复执行。预算在同一文件系统多进程仅允许一个真实尝试，其余应有界拒绝而非无限排队。
- **剩余风险**：短时 RSS 不是长期内存泄漏证明；没有运行长时间 soak、生产压测、真实 AI 十人吞吐或故障重启演练。不据此承诺线上支持某人数同时生成。

### TEST 09 — 安全与隐私：PASS（已审范围），仍有列明限制

- **静态/动态**：审查所有三个 API 路由、proxy、文件与持久路径、同源判断、签名会话、输入/响应流量界限、引用重建、导出及 React 文本渲染；路径只允许服务端目录与规范 UUID。provider 地址固定，用户不传 URL/tool；无公开数据库/恢复/文件写 API。没有任意文件读取、服务端 PDF 上传路径或模型工具执行入口。
- **测试证据**：请求来源/伪造 forwarded header/坏 UTF-8/超长/慢流/超时/重复 JSON key/跨会话资源/恶意文本/导出凭据拦截回归；源码/配置当前树及相关 Git 历史模式扫描。当前代码未发现真实密钥模式；相关历史没有 key 模式候选或被提交的 `.env/.env.local/.env.production`。详见 [secrets-scan.json](docs/audit-20261016/secrets-scan.json)。扫描不证明任意二进制及所有归档绝无秘密。
- **依赖**：实时 npm audit `--omit=dev` 漏洞 0；全依赖另有 26 项（20 high、5 moderate、1 low），归属开发/Sites 工具链，未以删测试或大规模升级“修绿”，登记赛后处理。当前生产使用 Next 16.3.8 / React 19.2.6，并非旧 metadata 的 16.2.6。
- **修复/风险**：匿名收费滥用已作为 TEST03 的 P0 单列，线上尚未关闭；本项 PASS 不覆盖它。签名 Cookie 被盗后的服务器吊销、完整账号、严格 script nonce CSP、网络层 DDoS 等未实现；Cookie 不代表真实审核人。没有发现须本轮立即轮换的密钥证据，没有擅自轮换。报告不包含真实 key、Cookie 或 ticket。

### TEST 10 — 部署与运行环境：BLOCKED（发布/故障恢复）；可执行检查 PASS

- **本地**：Node 26.0.0（项目要求 ≥22.13）、Next 16.3.8/React 19.2.6；259 项完整单元/集成通过，3 原 PDF通过，TypeScript、lint（0 error/4 既有 warning）、生产构建、76 个 V5 源文件迁移校验及 runtime smoke 通过。最终干净 SHA 构建回执见交付记录；本地成功不等于生产升级成功。
- **生产只读**：PM2 `beacon` 单 fork online；运行目录 `beacon-no-watermark-80786b5`、Git SHA 和 `.next/beacon-build-receipt.json` 同为 `80786b5`、回执 clean=true；只多一份部署时 internal-smoke.log，未见源码修改。Nginx active，upstream `127.0.0.1:3000`、proxy_read_timeout 300s、client_max_body_size 100M。环境文件 0600；required key/签名值仅检查 presence 布尔，不输出内容；收据目录 0700，claims 索引存在。本轮预算 ledger 不存在，符合尚未部署的事实。
- **HTTPS**：可信 TLS1.3，HTTP 308 → HTTPS，七页面/静态 worker正常。只读时证书有效至 **2026-10-19 02:38:34 北京时间**，覆盖 10/18 锁定日但剩余时间短；certbot renewal timer 存在，成功续期周期尚无本轮执行证明。
- **证据**：[production-config.json](docs/audit-20261016/production-config.json)、[production-tls-nginx.json](docs/audit-20261016/production-tls-nginx.json)、production-browser、verification-summary、CI。
- **剩余风险**：没有重启/kill 生产进程、恢复数据库、部署代码、运行续期/重载或验证灾备；这些不能标 PASS。当前 PM2 有历史 restart 计数，但不当成故障恢复验收。新预算目录需发布前一次初始化并保持跨 release/rollback 不回退；崩溃未知调用需核账，自动失效会破坏费用边界，因此未实现。

## 4. 修复清单与回归

| 文件 | 修改/原因 | 级别 | 对应验证与结果 |
| --- | --- | --- | --- |
| `apps/web/lib/model-budget.server.ts` | 独立私有持久 ledger、先预留、总量/速率/在途、失败不退、拒损坏与未知恢复 | P0-01 | 11 项专用回归、240 次完整预留、6 进程竞争；PASS |
| `apps/web/lib/research-{memo,question}.server.ts` | 所有生产 fetch 前统一 wire/额度检查、usage核对、失败落盘；Memo只接受签名会话 | P0-01 | 两端共享额度、429/503/timeout、结算失败不成功、完整回归；PASS |
| `apps/web/scripts/model-budget-store.mjs`、`.env.example`、`docs/PRODUCTION_MODEL_BUDGET.md` | init/inspect 运维入口、部署/回滚与账单边界；无 reset/refund API | P0配套 | CLI init/inspect/拒reset；PASS；生产未执行 |
| `apps/web/scripts/run-question-batch.mjs` | 孤立手动批次在生产模式启动前初始化新 ledger | P0配套 | 现有六请求归档/预算/首失败停止回归；PASS；未dispatch |
| `lib/parser-v06.ts` | 拒绝不支持单位/币种/金额百分比；NR冲突合计有界检测，保留首值并阻断 | P0-02 / P1-01 | 9项新金融测试、3原PDF、原布局/计算/链路；PASS |
| `apps/web/lib/research-question-pending.ts`、QuestionWorkflow | 同profile未决恢复指针原子认领、按phase/id清理，防覆盖/误删 | P1-02 | 双tab实际浏览器只有1 POST、刷新仅GET恢复、并发单测；PASS |
| `apps/web/tests/{model-budget,finance-submission-audit,question-pending,submission-context,submission-audit-browser}.test.mjs` | 增加必要负例、消息构造、隔离、并发与恢复证据 | 回归配套 | 已纳入 package scripts / Web CI；本地全部PASS |
| 原 Memo/request/reviewer 测试 | 改用合法签名访客覆盖原慢流/来源/并发断言；保留未授权Bearer拒绝负例 | 安全兼容 | 未删有效断言，完整259项PASS |
| `.github/workflows/web.yml` | 增加3项无费用访客浏览器验收，继续归档截图/记录 | CI配套 | 当前PR CI见上；没有增付费触发器 |

没有新增依赖、重做UI/存储架构、改金融引擎/Prompt/专业关卡或覆盖旧输出。旧 parser-v04/v05/v05-strict/v06-strict、chain-v01、Bull历史验证目录无差异。新的 fail-closed 校验影响不支持/歧义输入；三份已登记/已复核原件数值保持不变。

## 5. 生产部署差异与发布要求

| 项目 | 当前公开生产 | 审计候选 |
| --- | --- | --- |
| SHA | `80786b5df92d4eada1fe238e96c04ccc6e88e52e` | 执行代码 `7de6f76a3d4d1c4009ea3b7f5d0b6af908e18c6f`；最终报告提交见PR HEAD |
| 是否一致 | **否** | 本轮修复未部署 |
| 访问方式 | open，无访问码，至10/31 | 保持原方式 |
| 模型总额度 | 无两个接口共享持久额度 | 240总尝试、24/访客小时、30/全局分钟、单在途 |
| 解析/恢复修复 | 未包含 | 包含单位/币种、冲突合计、pending保护 |

距离可公开提交还需要：

1. 审查并批准本 PR，然后按现有流程合并/发布；本轮未执行。发布前由服务 UID 在持久 `RESEARCH_RUN_DIRECTORY.model-budget` 运行一次 init，保留原收据/claims 和新 ledger，不在 rollback 中回退累计额度。未初始化时付费调用会安全503，不能漏掉此步骤。
2. 发布后重核精确 SHA、clean构建回执、open会话、静态资源与费用 guard；不能把本地通过写成已上线通过。保留原 release 和最新 ledger，但旧版代码不读取新 ledger，回滚旧公开版本会恢复 P0。安全回退须在另行批准的发布操作中暂停收费生成、保留本地确定性研究，直到恢复含保护的版本；本轮未改生产配置。
3. 当前 v11 的真实模型内容验收需要负责人对最终精确 SHA 和一次明确有界预算另行授权；最多六请求、首失败即停、无自动重试，逐条审核真实输出。若不能完成，只能把未验证AI生成能力如实标为未验收，并经负责人确认使用已审核历史/确定性研究演示，不能宣称完整AI现场 READY。
4. 在评审使用期前复核短期证书续期结果；现有证书仅证明当前可信及覆盖锁定日，不能代替未来续期证明。

发布、额度初始化/变更、真实付费验收、生产故障演练均没有在本报告中偷偷执行。不能用关闭访问控制、放开输入校验或预填专业通过作为降级方案。

## 6. 自动化以外的人工验收（4项）

1. **真实内容审阅**：在单独获批的固定SHA有界批次完成后，逐段对照原件/两侧引用、同比期间、因果边界、反证、A-03/K-07与EG限制。标准：三意图实际输出均存在且逐项可核实，任何首次失败保留，不以HTTP200代替内容通过。
2. **评委设备与网络**：用将交给评委的公开链接，在全新浏览器profile及实际比赛网络打开并完成S-05原件核验/保存/历史查看。标准：无需访问码、注册、软件安装或本地开发环境，重要按钮可用；多人共享设备时使用独立profile，不把本机旧历史当另一访客隔离。
3. **专业意见与材料措辞**：负责人检查展示/PPT/视频/帮助说明；确需专业认证的判断由真实专业人员签认。标准：未有签名的EG-01/02保持pending，不宣称估值发布、AI自动投资或任意多公司已验收。
4. **提交材料一致性**：负责人核对最终URL/版本号、原财报来源与允许演示数据、备份/值守联系方式。标准：演示版本与最终审计/发布记录一致；材料和录屏不含真实密钥/会话/私有研究数据，历史演示明确标注日期及边界。

## 7. 最终提交建议

**截至本次审计，不建议把当前公开部署直接标为可提交 READY。** 真正已确认的阻断是线上仍未部署的公开模型累计滥用保护和金额单位/币种错误；它们已在候选代码修复并有回归证据。另一个关键未验证条件是最新 v11 的真实内容验收，以及发布后的精确版本/保护检查。

完成获批发布、私有预算初始化与上线核验，并取得规定范围的真实内容证据后，才能重新评定 READY；未完成时只能保留 NOT READY / 按实际剩余条件评为 CONDITIONAL，不能仅凭编译和Mock测试改成READY。金融专业pending、任意多公司与账户系统不通过临时扩功能来解决，保持已批准产品边界。
