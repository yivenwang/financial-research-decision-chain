# 金融语义校验测试资产

核对日期：2026-10-24。代码基线为 GitHub `main`
[`27bea038028ddd3b1455df3e1623fe5a192f72ce`](https://github.com/yivenwang/financial-research-decision-chain/commit/27bea038028ddd3b1455df3e1623fe5a192f72ce)
（PR #45 合并提交）；基线 [Web CI](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/39575325398) 成功。
本资产只增加本文和 `question-live-v10.test.mjs` 的三组测试，不修改生产代码、校验规则、正则、版本开关、Prompt、金融定义或 EG-01/02。

## 如何解释覆盖

- **负例**：应拒绝的表述，测试须断言对应错误码；不能把任意异常都算成该错误码已覆盖。
- **正例**：限定充分、证据齐全的表述，测试须 `assert.doesNotThrow`；放行只表示通过该版本的技术校验，不表示经济因果、投资结论或专业门禁获批。
- **已覆盖**：已有可执行的正例和负例，不表示穷尽自然语言。下表的 **GAP** 是尚无专项断言的具体维度；七大类没有整类完全空白。
- 表内短句必须放在合法答案中，保留其余段落、正确证据和 `sufficiency`。缺比较的因果问题使用 `partial`；否则可能先被结构、引用或充分性校验挡住，无法检验目标语义。

**当前入口与历史语义必须分开计数。** 当前版本为 `question-explanation.v11`。
[`question-explanation-contract.ts`](../apps/web/lib/question-explanation-contract.ts) 的
`controlledQuestionPoints` / `validateControlledPoint` 限定文本及引用组；
`statementKey` 只允许等价空白/分隔符差异，原输出保留。
[`research-question.ts`](../apps/web/lib/research-question.ts) 的
`validateQuestionOutput` / `validateQuestionExplanation` 在 v11 使用这些定义，**不调用自由文本的 `validateQuestionContent` 分支**。
所以任意改写通常在 `ANSWER_CONTRACT_MISMATCH` 停止，不能记作 `ASSUMPTION_PROMOTED` 等语义错误码通过。

下文语义正负例主要显式使用 **v10**，保留历史版本能力与原始失败；v11 另由 **QC** 测试所有三意图的受控段落组合、引用、条件篡改、空白等价、原文保留和失败停止。
v10 正例不代表 v11 允许模型自由改写，也不授权增加 enum 文本。

## 三份真实失败的证据账

| 证据 | 实际失败与原因 | 已有可复现资产及证明边界 |
| --- | --- | --- |
| [Question v9 → v10 审查](RC_LIVE_V10_REVIEW.md)；[run 38501083398](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38501083398)，代码 `b30d7e49ebe1baa3e559c1267076a654938d2e74` | 两次 HTTP 200，规划 v4 / 解释 v9 均为完整 JSON；解释先报 `ASSUMPTION_PROMOTED`，`BLOCKED / answer=null`。条件推论“在…前提下，扣非可视为核心经营代理”被逗号切掉条件，是已确认的本地误拦截。 | **Q10** 校验 manifest、两请求原文件 hash、旧 Prompt hash、原失败与首失败停止。原目录为 `apps/web/tests/fixtures/question-live-38501083398/`。v10 隔离条件句放行；原整份回答仍因反证段混淆已核验增长事实与核心经营假设而报 `VERIFIED_FACT_CONDITIONED_ON_ASSUMPTION`。修复误报不等于整份真实答案合格。当前 v11 mock 重放该旧自由文本会先报 `ANSWER_CONTRACT_MISMATCH`。 |
| [Memo run 6 诊断](MEMO_LIVE_RUN_6_DIAGNOSIS.md)；[run 34211479879](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34211479879)，代码 `4cc6a554924055de16dc16774b7d19915ec44e58` | HTTP 502 / `PROVIDER_INCOMPLETE`，`failed / memo=null`；输入 2,650、输出 4,000 token 恰达当时上限；77.229 秒未达当时 90 秒超时。尚未执行 JSON/引用/内容校验。 | 达到上限**高度提示**预算耗尽，但旧记录缺 `incomplete_details.reason`，不能记为已取得 `max_output_tokens` 原因，也不能从 `validation=[]` 推导语义通过。**M** 用合成提供方响应覆盖 incomplete 即使带合法 JSON 也失败、原因缺失不猜测、文本边界、不保存推理正文、一次调用不重试。它们不是 run 6 原响应逐字重放；诊断记录称完整响应封装未导出。 |
| [Memo run 8 诊断](MEMO_LIVE_RUN_8_DIAGNOSIS.md)；[run 34310296285](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34310296285)，代码 `eb06b4c5d9e46c172d2a9de803d886a21279bb39` | 提供方 completed，4,985 输出 token / 70.443 秒，应用 HTTP 422 / `MEMO_VALIDATION_FAILED`，唯一校验码 `COUNTER_REFERENCE_MISSING`。`counter[2]` 只有支持方向 NR 和中性 K-07，前两条反证不能替该段满足要求。 | **M** 的 `a valid counter paragraph cannot cover another paragraph citing only support and a neutral rule` 用合成文案重现引用结构，覆盖旧多段与当前紧凑形状、一次传输、原文保留、空 memo、不能导出及快照不变。不能把该 Memo 错误码写成 Question 的 `COUNTER_FACT_NOT_STATED`，也不能把指标值为负当作 direction 为反证。 |

本轮不重新下载或补造历史附件，不倒填旧响应原因，不重写原记录。新增真实模型调用 **0**。

## 失败模式 → 错误码 → 逻辑 → 正负例 → GAP

表内测试代号在下一节链接到具体文件及测试名。文件/函数定位按上述 main 基线核对。

| 类别与失败模式 | 应拦截错误码 | 校验逻辑位置（文件 + 函数） | 已有负例（应拦截） | 已有正例（应放行） | 当前覆盖与缺口 |
| --- | --- | --- | --- | --- | --- |
| **a 条件丢失 / 假设升级**：切分丢前提产生误杀；或把扣非直接当作核心经营 | `ASSUMPTION_PROMOTED`；前者正确修复后不应报该码 | `question-content-validation.ts`：`financialScopes`、`hasExplicitPremise`、`validateQuestionContent`（`extendedContract` / `premiseScope`）；`research-question.ts`：`validateQuestionExplanation` 的推论标记检查 | Q7：扣非直接被称为核心口径；QS：`没有证据证明核心经营，已证明核心经营改善。`；Q10：前提结束后 `扣非代表核心经营。` | Q10：原条件推论、`在调整分类和持续性已经核验的条件下，扣非可视为核心经营代理。`、`如果…`、`若…则…`；Q7：`扣非能否代表核心口径仍待会计复核。` | **已覆盖；本轮增强。** A1 增加中/英文逗号多分句放行及句号、分号、问叹号、换行、六种转折边界后的升级拒绝。GAP：非句首或嵌套前提未有专项成对测试，不能假定通用自然语言作用域受支持。 |
| **b 无证据因果归因**：从本期负调整直接解释同比下降；会计条件或句尾“待核验”掩盖独立因果断言 | `UNSUPPORTED_YOY_ATTRIBUTION` | `question-content-validation.ts`：`validateQuestionContent`（`missingComparison`、`independentClaims`、`yoyClause` / `unsafeCause`）；`assertionNegated` / 作用域辅助函数 | Q3：`归母与扣非同比分化来自非经常性损益，但仍待复核。`；Q8：`归母同比下降受本期非经常性损益拖累，仍待核验。`；Q10：会计前提不能豁免下降归因 | Q3：`本期口径差异来自非经常性损益的剔除；其比较期未提供，同比原因待核验。`（与同比事实分别陈述）；Q8：`无法断言归母同比下降受本期非经常性损益拖累，原因待核验。`、`…是否受…影响…` | **已覆盖。** 同期勾稽、同比原因、否定/疑问与独立条件均有对照。GAP：尚无专项对照证明“有比较值”也不等于取得经济因果证据；当前该语义分支以比较缺失为条件，不可据测试通过声称一般因果审查完备。 |
| **c 事实被假设错误条件化**：把已核验的扣非增长事实说成只在核心经营假设成立时才成立 | `VERIFIED_FACT_CONDITIONED_ON_ASSUMPTION` | `question-content-validation.ts`：`validateQuestionContent` 的 `independentClaims` 及 `premiseScope` / `previousClaim` 指代追踪，`assertionNegated` | Q8：原增长条件化段落；Q10：原 `调整后口径改善，但该判断以…为条件` 的独立拒绝，修复 a 后仍拒绝整份原答案 | Q8：`扣非同比上升不依赖核心经营假设，但其能否代表核心经营仍待会计复核。`；Q10：`扣非同比为正，该事实不依赖核心经营假设成立。`，以及将增长事实与带自身条件的经济推论分开陈述 | **已覆盖。** GAP：`该事实是否依赖…` 的疑问与同字面肯定尚无直接最小对照。 |
| **d 引用闭合缺失 / 反证遗漏**：只引派生结果、借别段引用，或有反证 ID 却没陈述反证事实 | `PARAGRAPH_EVIDENCE_OMITTED` / `COUNTER_FACT_NOT_STATED`；ID 本身缺失另有 `COUNTER_EVIDENCE_OMITTED`；Memo 为 `COUNTER_REFERENCE_MISSING` | `question-citation-policy.ts`：`questionCitationPolicy`、`questionCitationChoices`、`expandQuestionCitationChoices`；`question-content-validation.ts`：`questionCitationDependencies` / `validateQuestionContent` 的 `requireCitations` / `strictCounter`；`research-question.ts`：`validateQuestionExplanation`；v11 `question-explanation-contract.ts`：`validateControlledPoint`；Memo `research-memo.ts`：`validateMemo` 内 `checkPoint` | QR：只引 F-02，或 SPREAD 缺 ATTR；Q4：逐项删掉本段指标/规则 ID；Q3：只加反证 ID 仍报 `COUNTER_FACT_NOT_STATED`；Q4：纯“未知会计性质”不能冒充反证；M：支持 NR + 中性 K-07 不能跨段凑反证 | Q4：同句全部引用先放行，再逐个删除验证拒绝；Q5：各段引用完整的合成答案；Q3：三意图有真实反证事实的合成答案及反向 ADJ 场景；QS：每个 enum 引用组闭合、无损展开；QC：v11 所有批准组合；M：合法 counter / 完整 memo | **已覆盖。** GAP：没有“全部四段 × 每个被提及指标/依赖”的逐项删除矩阵；现有逐指标正负对主要在 directAnswer，另有多个原始段落失败。 |
| **e 时间期间混淆 / 无依据跨期趋势**：把本期增速差说成跨期扩大，或同比任务缺比较期/年度季度混比 | 趋势为 `UNSUPPORTED_SPREAD_TREND`；规划期间不合法为 contract `OUT_OF_SCOPE`，不是该趋势错误码 | `question-content-validation.ts`：`validateQuestionContent` 的 `extendedContract` 趋势检查；`research-question.ts`：`comparablePeriod` / `makeResearchContract` | Q7：`增速差扩大，仍待核验。`、`若会计假设成立，则增速差扩大…`；Q10：`在分类经核验的条件下，增速差扩大。`；RQ：年度季度比较；QS：同比问题缺 comparisonPeriod | Q7：`不能断言增速差扩大，仍待核验。`、`若未来增速差扩大，则需要核验。`；QS：同一同比问题配合法 comparisonPeriod 进入 `CONTRACT_DRAFTED`；RQ：三意图合法期间任务 | **已覆盖。** GAP：`收窄/缩小` 没有与 `扩大` 同等的专项正负对；不能把“未扩大”通过理解为跨期事实已获证实。 |
| **f 机械年化 / 专业边界越界**：把占位算术升为预测/目标价，给交易指令或声称专业已通过 | `MECHANICAL_ANNUALIZATION_PROMOTED` / `PROFESSIONAL_BOUNDARY_VIOLATION` | `question-content-validation.ts`：`validateQuestionContent` 的 `financialBoundaries` 年化检查、`currentContract` 专业规则及 `assertionNegated`；v11 由受控契约约束 | P：`机械年化就是已验证的全年预测。`；QR：`核心经营可能更强，建议买入。`、`会计复核已通过…`；QS：`不能建议买入，推荐卖出。`；A2：把年化当预测/目标价、风险提示后再升级 | P：`机械年化不是盈利预测，估值仍待复核。`；QS：`不能据此建议买入，仍需专业复核。`、`不提供投资建议，专业审核尚未通过。`；A2：`不是` / `不等于` / `不得` 的限定表达 | **已覆盖；本轮增强年化正负对。** GAP：`无需专业复核` 与禁止豁免的表述、加仓/减仓等交易动词尚无逐项最小对照。 |
| **g “披露了”与“已证实”混淆 / 披露范围过度断言**：输入缺口被写成整份报告未披露，或披露的增长被升级为核心经营已证实 | 范围过度断言为 `DISCLOSURE_SCOPE_OVERCLAIM`；增长事实升级成核心经营已证实归 **a** 的 `ASSUMPTION_PROMOTED`，不能统一标为披露范围码 | `question-content-validation.ts`：`validateQuestionContent` 的 `currentContract` 披露/假设规则、`financialBoundaries` 的“报告/公司没有解释”及 `assertionNegated` | QR：`报告未披露非经常性损益比较期…`；QS：先承认输入范围再说 `但报告未披露…`；P：`本次输入缺少明细，但报告没有解释。`；A3：`报告披露扣非同比增长，已证实核心经营改善。` → 假设升级码 | QR：`本次结构化输入未提供…不能断言报告未披露…`；QS：`缺失仅限本次输入，不代表报告未披露。`；A3：`本次受控输入缺少明细，不能推定报告没有解释。`，以及披露增长事实 + 核心经营仍是假设 | **已覆盖；本轮补充两种错误码的明确对照。** GAP：“公司没有解释”与同句否定尚无专项成对断言。该层不证明任意“披露了所以证实了”的自然语言推理均能识别。 |

所有 `question-*.ts` 路径均在 `apps/web/lib/`。税前范围归因虽不单列为七类之一，也有 P 的
`PRETAX_SCOPE_ATTRIBUTION_UNSUPPORTED` 负例（归因所得税/少数股东）与“不能归因”正例；本轮保留。

## 测试定位索引

以下测试属于现有资产；标题按 main 实际内容列示，文件名中的旧版本号或标题中的 current 不代表当前默认版本。
这些历史测试多数用文件内 wrapper 将默认显式固定为 v10。

| 代号 | 文件 | 关键测试名 / 断言 |
| --- | --- | --- |
| Q3 | [question-live-v3.test.mjs](../apps/web/tests/question-live-v3.test.mjs) | `actual failure, citation-only patch and causal patch are independently blocked with no repair`；`v3 qualified uncertainty cannot excuse a separate asserted causal attribution`；`model input preserves semantic contract and engine outputs while making counter and comparison requirements explicit` |
| Q4 | [question-live-v4.test.mjs](../apps/web/tests/question-live-v4.test.mjs) | `every mentioned metric, missing input, rule and derived result still requires local citations`；`archived v3 counter guard remains active after v4 is current` |
| Q5 | [question-live-v5.test.mjs](../apps/web/tests/question-live-v5.test.mjs) | `three independent citation omissions remain blocked under both original and current contracts`（实际 v4 / v10）；`v5 selects paragraph evidence before text without adding output fields or weakening checks` |
| Q7 | [question-live-v7.test.mjs](../apps/web/tests/question-live-v7.test.mjs) | `the actual spread-expansion sentence is independently blocked even with a different conditional assumption`；`core-basis assertion cannot silently promote the pending accounting assumption`；旧 v6 趋势重放不回写 |
| Q8 | [question-live-v8.test.mjs](../apps/web/tests/question-live-v8.test.mjs) | `a conditional accounting hypothesis cannot excuse the unrelated unsupported decline attribution`；`verified adjusted-profit growth does not depend on accepting the pending core-basis hypothesis` |
| Q10 | [question-live-v10.test.mjs](../apps/web/tests/question-live-v10.test.mjs) | `actual v9 first failure, original hashes and two-request stop remain immutable`；`explicit leading conditions govern a proxy hypothesis across commas without changing source text`；`a premise is not permission for independent unsupported claims or a later unconditional hypothesis`；`the original counter conditions a verified fact on a proxy; scope repair never repairs the archived output into success` |
| QR | [question-reliability.test.mjs](../apps/web/tests/question-reliability.test.mjs) | `actual causal overclaim and missing comparison-side citation are independent controlled failures`；`paragraph dependency, disclosure, assumption and professional boundaries block known adversarial claims` |
| QS | [question-system-reliability.test.mjs](../apps/web/tests/question-system-reliability.test.mjs) | `a disclaimer cannot license a later trading recommendation or full-report assertion`；`mixed assertions fail locally while conditional and negated statements retain scope`；`all provider citation enums are closed selections with actual counter and professional limits`；`an explicitly year-on-year question cannot execute a plan without its comparison period` |
| QC | [question-controlled-contract.test.mjs](../apps/web/tests/question-controlled-contract.test.mjs) | `all three intents and every approved paragraph combination share the exact schema, dependencies and raw text`；`whitespace and equivalent punctuation do not stop the workflow or rewrite raw/stored prose`；`a small edit cannot change a financial assertion, condition, citation or professional boundary`（多数坏文本只断言 throws，不算特定语义码覆盖） |
| RQ | [research-question.test.mjs](../apps/web/tests/research-question.test.mjs) | `scope rejects other companies, unsupported periods/metrics/nodes and annual-quarter comparison`；三意图完整合成链、坏答案 `BLOCKED / answer=null` |
| P | [professional-review-rc.test.mjs](../apps/web/tests/professional-review-rc.test.mjs) | `current financial negative examples remain blocked without repairing text or selected evidence`（直接运行 v10 负例与正例；由 `test:rc` 收录，不在 `test:question`） |
| M | [research-memo.test.mjs](../apps/web/tests/research-memo.test.mjs) | `memo validation rejects invented citations, omitted counter-evidence, numeric claims and changed gates`；`a valid counter paragraph cannot cover another paragraph citing only support and a neutral rule`；`incomplete responses preserve bounded diagnostics but never accept even structurally valid final text`；`missing or unknown diagnostics remain explicit and token exhaustion never invents a provider reason`；`incomplete final text is kept verbatim only as one bounded message, without joining, repair or reasoning` |

其余相关测试的用途也已区分：

- `question-plan-v3.test.mjs` 保留最早规划意图失败与历史契约；`question-batch.test.mjs` / `memo-batch.test.mjs` 保证有界顺序、首失败停止、无补发；它们不能代替语义正负对。
- `memo-revisions.test.mjs` 保证合法修订保存/审核、坏引用或门禁篡改被拒绝、原账本不变；`memo-storage-concurrency.test.mjs` 保证并发与配额失败；`memo-owner-review.test.mjs` 绑定历史所有者批准和 pending 专业状态，不是专家签署。
- `question-pending.test.mjs` 保证未决请求多标签一致性；不计语义覆盖。
- `question-browser.test.mjs` / `question-reliability-browser.test.mjs` / `question-live-archive-browser.test.mjs` 检查页面、历史原文、刷新、导出与阻断。v11 浏览器坏自由文本报 `ANSWER_CONTRACT_MISMATCH`；原 v9 归档回放无答案、无伪造审核、模型 POST 为零。不能替代 Q10 的历史语义定位。

## 本轮最值得补的三组测试（已补并通过）

均追加在 Q10 文件，没有改写已有测试或原始 fixture。`assertSemanticExamples` 使用完整引用，
显式调用 v10，负例逐项断言精确 `Error.message`，正例断言不抛错，并核对输入答案与上下文未被修改。
三组共 **26 个合成案例（8 正 / 18 负）**，不是新的真实模型样本。

| 代号 / 新测试名 | 内容与原因 |
| --- | --- |
| **A1** `semantic assets: a comma retains the premise while sentence and contrast boundaries end it` | 2 个逗号正例 + 11 个边界负例。直接守住 v9 的“条件被切丢”教训，同时防止前提越过句末或转折而豁免新断言。 |
| **A2** `semantic assets: a bounded annualization statement passes while a forecast or target promotion fails` | 3 个限定正例 + 4 个升级负例。原先只在 P 中有很短的年化对照，补齐预测/全年预测/目标价与风险提示后再升级；避免有“年化”就误杀，也避免提示语掩盖升级。 |
| **A3** `semantic assets: missing input and disclosed growth do not establish full-report absence or core economics` | 3 正 + 3 负。正例保留输入缺口与披露事实的研究价值；负例区分整份报告范围过断言与增长升为核心经营已证实，分别断言披露码/假设码。 |

## 剩余 GAP 的最小候选测试

以下是**尚未添加、尚未运行的候选**，不是已证实的引擎缺陷或新增产品要求。若现有行为与人工确认的期望不一致，
应记录失败及作用域，不能为了通过而修改本轮引擎、Prompt 或历史版本。

| GAP | 最小案例形状 | 预期证明范围 |
| --- | --- | --- |
| a 非句首 / 嵌套条件 | 正候选：`就代理口径而言，在分类经核验的前提下，扣非可视为核心经营代理。`；负候选：移除真实前提，保留 `扣非代表核心经营。` | 正候选需先确认该句式是否属于支持范围，再建立测试；不能只把“存在条件词”当作条件适用证明。 |
| b 比较值不等于因果证据 | 合成 context 显式标为已提供比较值，但没有经济原因证据；输出仍声称 `归母同比下降来自非经常性损益。`；正候选保留 `比较值可核对，同比原因仍待核验。` | 不把当前 `missingComparison` 分支或 v11 未命中测试当作一般因果验证。须先定义受支持的证据前提；不伪造真实比较值或公司解释。 |
| c 指代疑问 / 肯定对照 | 完整合法 counter 先保留归母反证，再分别追加 `扣非同比上升是事实，该事实是否依赖核心经营假设成立仍需澄清。` 与 `扣非同比上升是事实，该事实依赖核心经营假设成立。` | 疑问表述的技术非误报与独立肯定断言的拒绝；疑问放行不认可其金融立场。 |
| d 四段逐指标删除矩阵 | 以有完整来源引用的合法答案为基底；逐段提及扣非、选齐引用应放行；仅从本段删除 ADJ、保留其他段 ADJ，应报 `PARAGRAPH_EVIDENCE_OMITTED`。派生 F-02 / SPREAD 另逐个删依赖。 | 证明每段本地闭合，而不是全答案 `used` 集合碰巧覆盖。 |
| e 趋势收窄 / 缩小 | 推论段完整引 SPREAD、比较双方和 A-03；正：`不能断言增速差收窄，仍待核验。`；负：`增速差收窄，仍待核验。`；“缩小”同组 | 应分别放行与报 `UNSUPPORTED_SPREAD_TREND`，只针对本期 spread 的有限输入。 |
| f 专业豁免 / 交易动词 | 正：`不能认为无需专业复核，仍需人工审核。`；负：`无需专业复核。`；加仓/减仓另做明确否定与肯定对照 | 专业边界精确码与否定作用域，不改变 EG-01/02。 |
| g 公司解释范围 | 正：`本次输入缺少明细，不能断言公司没有解释。`；负：`本次输入缺少明细，但公司没有解释。` | 确认 `DISCLOSURE_SCOPE_OVERCLAIM` 对“公司”主体的正负对，与“报告”保持一致的测试资产。 |

## 复现与本轮结果

在从上述 main 建立的独立工作区，进入 `apps/web/`；用锁文件安装依赖，不复用旧分支代码：

```sh
npm ci --no-audit --no-fund
node --experimental-strip-types --test tests/question-live-v10.test.mjs
npm run test:question
npm run test:memo
node --experimental-strip-types --test tests/professional-review-rc.test.mjs
npx --no-install tsc --noEmit
npx --no-install eslint tests/question-live-v10.test.mjs
```

本轮本地 Node `v26.0.0`；GitHub Web CI 配置使用 Node `22.16.0`，远端结果以本 PR 检查为准。
所有模型传输为明确标记的合成替身，未 dispatch 真实验收、未读取密钥、未访问/运行 S-07。

| 检查 | 本轮结果 |
| --- | --- |
| `test:question`（包含 Q10 三组新增测试） | **95/95**，无跳过；覆盖原失败 hash 和历史兼容 |
| `test:memo` | **31/31**，无跳过 |
| 专业边界专项 P | **7/7**，无跳过 |
| `tsc --noEmit` | 通过 |
| 新增测试所在文件 ESLint | 通过 |

首轮 Question 检查发生在新工作区安装依赖之前，且沙箱拒绝 provider-boundary 的回环 HTTP 监听；
对应缺包和 `listen EPERM` 不是语义回归。按锁文件安装后，在允许本地回环监听的环境重跑，得到上述 95/95。
本轮仅文档与测试变更，本地没有另外运行全量 build、浏览器或金融广域回归；不能将基线 CI 或 scope 跳过算成本轮执行。
`test:question` 在普通 Web workflow 中已有收录，无需新增工作流、包脚本或付费调用。
