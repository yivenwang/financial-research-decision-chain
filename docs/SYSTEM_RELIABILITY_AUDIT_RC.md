# Beacon｜研灯：系统可靠性审查与修复

日期：2026-10-13。继续 PR [#36](https://github.com/yivenwang/financial-research-decision-chain/pull/36)，
本轮起点 `35f7fc0fa57d017683ad6dc128b715eecd0a890e`；
stacked base / PR #35 保持 `3328bcc95fa9a3b9f8ed38c45b2664901038d8b2`。
输入包括负责人提供的《Beacon_真实验收审查报告》、适用 AGENTS、项目状态、
历史 Actions 日志、已有诊断及归档负例。报告中的建议作为审查材料，未作为新的付费授权。
本轮真实模型调用 **0**；没有修改历史真实输出、金融公式、专业门禁、模型配置、审验窗口，
没有读取或执行 S-07 材料/测试，没有合并或部署。

## 历史失败逐项复核

“已有修复”只表示相应代码边界及离线回归通过，不能把历史失败改为成功。
传输完整、结构通过、内容合格和专业批准是不同结果。

### Memo 手动验收：全部十次运行

| Actions 原始证据 | 已证实卡点 / 结果 | 当前结论 |
| --- | --- | --- |
| [34081935987](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34081935987) | 构建时 Provider 不能赋给仅 openai 的类型，未到模型阶段 | 已有 Provider 联合类型和构建回归有效；不重复修复 |
| [34104597618](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34104597618) | runner 未注入 API key，浏览器前置断言失败 | 已有显式 Secret 预检/传递，缺失失败关闭；本轮未读取 Secret |
| [34105014901](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34105014901) | 等待 memo-run 超过 110 秒 | 留存日志不足以证明当时上游原因；当前先检查 API 失败诊断，保持已批准 150 秒请求时限及匹配浏览器等待，不冒称历史根因已证实 |
| [34134238598](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34134238598) | 重复 JSON 字段 / section 结构不符，MEMO_SECTION_SCHEMA | 已有重复 key 拒绝、固定结构及负例；仍拒绝残缺输出 |
| [34142444878](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34142444878) | 技术完成后内容过度断言 | 当时内容审阅保留；后续版本明确假设/专业边界，不能将本次技术通过当成内容通过 |
| [34211479879](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34211479879) | 4,000 输出上限时 PROVIDER_INCOMPLETE，截断原因未完整留存 | 已有获批 6,000 / 150 秒与不完整响应诊断；原失败保留，不再提高限额 |
| [34246383818](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34246383818) | 技术完成，内容仍有引用/披露范围问题 | 后续版本及人工修订处理；原样输出不追认 |
| [34310296285](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34310296285) | 完整 JSON，COUNTER_REFERENCE_MISSING | 已有 compact v0.3 固定六段及反证校验；仍需每份内容审查 |
| [34311995193](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34311995193) | 6,000 输出含 4,883 推理 token，max_output_tokens 截断 | 已有 compact 契约缩短正文，截断仍阻断；没有通过增限额掩盖问题 |
| [34342481369](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34342481369) | 三份技术完成，原内容尚有漏引和表述问题 | 后续 16 段修订、2 段保留获负责人另行认可；原输出/初审不改，EG-01/02 仍 pending |

详证：[run 6](MEMO_LIVE_RUN_6_DIAGNOSIS.md)、[run 8](MEMO_LIVE_RUN_8_DIAGNOSIS.md)、
[run 9](MEMO_RELIABILITY_REVIEW_RUN_9.md)、[run 10 初审](MEMO_CONTENT_REVIEW_RUN_10.md)、
[负责人内容确认](MEMO_OWNER_REVIEW_RUN_10.md)。本轮未改 Memo Prompt/Schema，
仅增加新调用的可选上游 HTTP 状态记录。

### Question 手动验收：全部七次运行

| Actions 原始证据 | 本次历史提供方请求数 | 卡点 / 当前处理 |
| --- | ---: | --- |
| [38018489076](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38018489076) | 0 | ARCHIVE_CREDENTIAL_FIELD_BLOCKED：审批元数据字段撞上归档禁字段；已有 approvalReference 修复，禁字段规则未弱化 |
| [38047109824](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38047109824) | 3 | 首解释 PARTIAL 但内容有越界归因/漏引；第三请求把 Source 当引用，批次 CONTRACT_NOT_READY；原 PARTIAL 与首次失败保留 |
| [38062132788](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38062132788) | 2 | COUNTER_EVIDENCE_OMITTED，另有不支持的同比归因；BLOCKED、answer=null、余四次不发 |
| [38103389908](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38103389908) | 0 | 本地预检锁竞争 ENOENT；已有有限锁获取修复，本轮补 holder 写入失败后自有未使用锁释放 |
| [38108168529](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38108168529) | 2 | PROFESSIONAL_LIMIT_OMITTED，另有逐段证据缺口；原失败及余四次停止保留 |
| [38129833565](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38129833565) | 1 | INTENT_MISMATCH，产品生成合同但批次期望不符；已有规划 v3 意图区分，余五次不发 |
| [38138604171](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38138604171) | 2 | 规划正确、解释完整但 PARAGRAPH_EVIDENCE_OMITTED；本轮共享引用策略与预选完整组，原失败及余四次停止保留 |

上表合计历史 Question 请求 10 次，**本轮新增 0 次**，不能说项目累计零调用。
既有 [v3](RC_LIVE_V3_REVIEW.md)、[v4](RC_LIVE_V4_REVIEW.md)、[v5](RC_LIVE_V5_REVIEW.md)、
[规划](RC_PLANNER_V3_REVIEW.md)、[通信](RC_PROVIDER_TRANSPORT_REPAIR.md)、[锁](RC_WRITER_LOCK_REPAIR.md)
诊断及 fixtures 字节/hash 均保留。旧归档中的应用 HTTP 200 不等于已保留上游 HTTP 200；
完整响应支持“上游成功返回”的判断，但无法回填不存在的历史数值状态。本轮只为新调用记录 providerHttpStatus。

## 共同根因和本轮最小修复

反复漏引不是已有证据表明的 Endpoint 或模型名错误。此前自由正文、逐个引用 ID 的 Schema、
Prompt 说明和本地派生依赖要求分散：模型可以生成结构合法但引用集合不完整的回答，
一次补充 Prompt 不能可靠消除整类失配。现行传输保留原生非流式 Responses，
没有改成另一套模型名、SDK、stream 或自动修补。

1. **引用策略共享、先绑定后生成。** question-citation-policy 统一八个既有证据/规则主题、
   派生依赖和段落选项。解释 v6 的每个 Schema enum 项明确列出完整引用组的所有 ID；
   派生组已列底层事实，反证组选实际反向证据，未知段组显式包含 A-03。
   模型选择完整组后写正文，响应仅将已明确选择的字面 ID 无损展开到原存储结构。
   不补遗漏 ID、不改原文、不把未经选择的证据附到输出、不绕开原反证/逐段引用/专业门禁。
   非法组、未知 token、重复组、超量及正文缺引仍阻断。Prompt/Schema/校验共用策略；
   模型是否真正理解证据仍需人工审查，enum 不能证明语义蕴含。
2. **披露与专业判断逐断言检查。** 已复现同句前半否定让后半买入建议或披露断言逃过校验。
   v6 按语句、转折及逗号分界，否定只约束其直接支配的断言；条件句保持条件性质。
   固定负例包含“不应…但现在建议买入”“本次输入…但报告未披露”及同句多断言；
   合理否定、条件和专业 pending 正例保留。规则是有限的已知风险筛查，不冒充通用语义证明。
3. **比较和完整性同源。** 规划 v4 在用户明确同比而比较期间遗漏时失败关闭；
   对明确询问同比原因且 NR 缺比较值的 CHANGE_EXPLAIN，
   Schema 与本地校验均只允许 partial，不让模型自行声称完整。
   专业 pending 本身不等于所有草稿都 partial，正常证据核验仍可完整。
4. **历史读取与新接受分开。** 原 Prompt v1–v5 / 规划 v1–v3 字符串及原始回放保留；
   历史正常读取按原版本验证，原审核事件不改。
   对旧稿新增“接受”时还须满足当前内容边界，堵住已知越界旧稿被新接受的漏洞；
   拒绝/退回仍可追加，现有快照绑定及版本变化拒绝保留。
5. **自有锁失败清理。** holder 元数据写入发生在 finally 管理范围内；
   写入前失败会释放自己刚取得而未使用的锁，不删除别人的遗留锁，不重发模型。
   故障注入证明失败时处理函数未执行，随后同一目录正常认领可以成功。
6. **归档规则复用到用户导出。** 现有公开批次 guard 提取为纯模块，
   UI JSON/Markdown 导出同时校验原记录及凭据字段（含嵌套 JSON/编码/字符串变体）。
   拦截时显示原因并保留本地原记录，没有读取用户真实 key；不是静默删字段后导出。
7. **保持输入预算。** 仅从模型 wire 移除三条重复的 source 格式化 excerpt；
   同一原始/current/comparison/yoy/unit/period/page/url 和方向仍在结构化事实中，
   派生/规则 excerpt、内部完整 evidence、快照及历史归档均保留。
   六请求最大 Unicode 输入演练最高估算 15,564 < 16,000，预算/输出 6,000/150 秒/low 不变。

相关代码在 apps/web/lib 的 citation-policy、question-content-validation、
research-question/server/storage、research-operation.server、archive-safety，
以及 Question 导出和批次验证。没有引入新的持久化层或产品功能。

## 离线验收及其边界

Node 22.16.0；LIVE_MODEL_E2E=0，真实 provider key 置空。HTTP handlers 注入标记 synthetic-NOT-LIVE
的 transport；原生通信异常测试仅用 localhost。浏览器拦截模型路由、检查外部请求为空。
生产依赖扫描零已知漏洞；不是对未来漏洞或运行环境的保证。

| 检查 | 结果 / 证据 |
| --- | --- |
| 全部单元/集成 | 195/195，8 套测试零失败/跳过；Question 68、access/security 53；历史 hash、未知持久任务、并发唯一认领及首失败停止均覆盖 |
| 金融 RC | H-01/H-02 5/5：零/负/缺失/字符串/非有限/溢出及 S-05/S-06 精确回归；H-05 4/4：反方向/阻塞/数据不足/审核分流 |
| TypeScript、production build | 通过；最终 clean build/preflight 另绑定交付 SHA |
| lint | 0 错误，4 个既存未使用变量警告 |
| 真实 PDF 浏览器 | 3/3：S-05、隔离 S-06、缺失/拒绝/不合法审核及 source mismatch |
| Question / 历史可靠性 / RC 浏览器 | 各 1/1；1440、768、390px；历史切换、确认、未保存保护、缺材料往返、待请求恢复、状态导出、键盘和无横向溢出 |
| 生产 runtime | 1/1；访问门禁、CSS、PDF worker 与模型入口边界 |
| 审核并发与完整 UI | 2/2；刷新/跨标签页恢复一次执行、历史字节保留、完整 UI 四宽度及空/错误态 |

新增同一浏览器完整链路，不通过预填版本绕过财报流程：
实际 S-05 PDF 上传 → 逐条人工核验 → 冻结财务复算/影响预览 → 保存研究版本 →
三意图各规划/显式执行 → 引用验证 → 三个草稿人工审核 →
故障回答 BLOCKED 且 reload 不重发 → 凭据字段导出拦截 → 版本回滚追加历史。
“先保存研究快照再生成/审核回答”是现有流程，不为满足测试文字改变产品顺序。
同一研究快照的 hash 在三意图中一致；8 次模拟请求包含一个规划/执行失败场景，
这些 mock 不属于六次付费额度。Memo 人工修订、审核与回滚由原浏览器链路并行覆盖。

CI 自动上传 apps/web/artifacts-web 和 artifacts-release：
system-chain-acceptance-NOT-LIVE.json、system-chain-1440/768/390.png、
question-reliability/acceptance.json、rc/acceptance.json 及审核/完整 UI 证据。
系统链路导出恶意字段测试不把该审核意见写入验收归档，只留拦截结果和故障前的审核记录。
本地原始日志在本任务持久 audit 目录中，最终 CI 链接与精确 SHA 见 PR #36 的交付说明，
历史旧 CI 不作为本轮最终候选验收证明。

## 已证实解决、尚待验证与保留风险

- 已解决：本轮上述已复现的契约失配、跨断言豁免、比较遗漏、过度 complete、
  holder 写失败未释放、新接受旧越界稿及公开导出漏拦截；原通信/数值/交互修复回归继续通过。
- 尚待真实验证：规划 v4 / 解释 v6 的新 wire、三意图连续六请求的内容表现。
  v6 本轮没有实际模型输出；离线通过不证明比赛现场不会失败，也不改变任何历史验收状态。
- 保留风险：规则筛查无法证明所有自然语言推断；专业 EG-01/02 待处理；
  本地审核身份未认证、浏览器历史不等于服务端完整备份；
  网络断开后的 unknown 任务需要查原状态，不得换 ID 偷重发。
  原 34105014901 上游原因缺证据，当前生产配置/证书续期/审验有效窗口未在本轮实测。
- K-07 A/B 仍待负责人明确选择，见 [决策材料](K07_DECISION_RC.md)；金融语义没有修改。
  付费、发布及回滚条件见 [后续验收与发布方案](SYSTEM_RELIABILITY_RELEASE_PLAN.md)。
