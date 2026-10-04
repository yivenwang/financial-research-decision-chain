# 公牛集团 2026Q1 跨公司盲测记录

状态：**基线已冻结；首次运行 FAIL（测试基础设施失败，parser 未执行）**。

## 选例

- 公司：公牛集团股份有限公司（603195.SH）。
- 材料：[公牛集团股份有限公司 2026 年第一季度报告](https://static.cninfo.com.cn/finalpage/2026-04-30/1225265153.PDF)。
- 原件 SHA-256：`38a09fe6b0c81e26a04207f9e0396f8e20c2d1d2e94b852946f67bf4b4a099e6`；155,979 bytes；PDF 1.7；12 页。
- 选择原因：这是既有协议锁定但从未实际执行的 holdout；仓库没有公牛集团 / 603195 的 parser fixture、映射、预期数值或运行产物。其上交所模板、页面布局以及国内电工产品和经销业务与安克的深交所模板、全球消费电子业务存在实质差异，同时仍披露当前 parser 所需的法定利润指标。

## 运行前冻结基线

- `main`：`3499889da8227fc5b5f8b148a286fc1c0c9d70d9`。
- parser：`V0.6-strict`；chain：`V0.1`。
- Memo Prompt：`research-update-v3-compact-1`；Memo contract：`research-memo-output.v2-compact`。
- Question capability：`anker-c04.v1`。
- 逐文件摘要和机器可读边界见 [`baseline.json`](../validation/cross-company/bull-group-2026q1/baseline.json)。

## 运行前预期边界

1. 现有 parser 接收注入的 `SourceMeta`，所以只允许运行隔离的 parser-only probe；正式 Source registry 仍只有安克材料。
2. `runC04Chain`、C-04、A-03、K-07、F-02、Valuation-B5、Decision 以及 Memo / Question 上下文都是安克研究语义，不得移植到公牛集团来制造闭环。
3. parser 放行最多只能得到 `PARSED_REVIEW_PENDING`，还必须独立核对页码、单位、本期/同期列、符号、同比和利润桥。
4. 首跑不调用模型、不注册公司、不形成投资判断、不修改冻结规则，也不读取或测试 S-07。

首次输出将单独追加保存；本段和机器基线不因后续修复或复跑而改写。

## 首次运行结果（永久保留）

- 结果：**FAIL**。
- 时间：2026-10-04T09:20:15.941Z 至 2026-10-04T09:20:17.007Z。
- 锁定执行提交：`21f48d3e91fd9531ce88f25f053d64aa3c00ddd4`；运行前工作树 clean；模型请求 0。
- 分类：**test infrastructure failure**。
- 现象：`run-transfer-probe.mjs` 抛出 `TypeError: doc.destroy is not a function`。
- 原因：脚本丢弃了 `PDFDocumentLoadingTask`，却在 `PDFDocumentProxy` 上调用 `destroy()`。锁定的 `pdfjs-dist` 6.3.289 在 loading task 上提供 `destroy()`，document proxy 只提供 `cleanup()`。
- 影响：异常发生在文本提取后的 `finally`，coordinates 尚未写盘，`parseFinancialReportV06Strict` 尚未调用；因此本次没有 parser 兼容性结论，也不得改记为材料或财务失败。
- 定性：这是 probe 生命周期管理 bug，不是缺配置、缺财务能力或有意 scope boundary。将销毁调用绑定到 loading task 不改变任何 parser、公式、阈值、Claim、Assumption、Kill Criteria、估值、Decision 或 Prompt，属于现有批准范围内的常规测试基础设施修复，不需要额外所有者批准。

原始字节见 `validation/cross-company/bull-group-2026q1/first-run/`；摘要见其中 `artifact-manifest.json`。后续修复后的运行只能称为第二次运行，不能改称盲测首跑。

## 第二次运行结果（仅修复 harness 后）

- 结果：**PARTIAL / UNSUPPORTED_FORMAT**；程序状态 `BLOCKED_REVIEW_REQUIRED`。
- 执行提交：`a37c3097cb7650ec7cdc481876add26991bcfbf0`；工作树 clean；同一 PDF 和 metadata；模型请求 0；金融规则变更 false。
- parser 提取 10 个 strict 指标中的 7 个；三个必要利润指标均有原值，但合计 9 个 blocker 和 5 个 warning，不能提升为 Evidence。
- 助手独立页图复核确认：本期值、同期值、单位和非经常性损益合计均来自原页；F-02 精确闭合。该复核不是专业认可。

### 第二次运行失败分类

| 分类 | 发生了什么 | 定性 | 保留现有金融语义 | 所有者批准 |
| --- | --- | --- | --- | --- |
| period / unit / column identification failure | 第一页变动列的 `%` 只在表头，单元格为 `3.52` 等无 `%` 文本；parser 将其当作 `3.52` 比率而不是 `0.0352` | parser bug / 缺少表头单位继承 | 可以；只按已识别表头解释单元格单位，不改同比公式或容差 | 修复本身不需要；但 root parser 变更会触发含 S-07 的现有回归，当前排除规则下不应在本分支实施 |
| PDF / layout parsing failure | ROE 是跨页续行；总资产和归母权益在第二页另一个 `本报告期末 / 上年度末` 表头下。现实现仅解析首次 header 所在页 | parser bug / 缺少多表段布局抽象 | 可以；枚举同一法定指标表的已识别 header / continuation，不改变字段定义 | 同上，修复本身属常规 parser 泛化，但当前不能运行其完整既有回归 |
| schema / contract failure | strict gate 因 ROE、总资产、归母权益未解析而阻断 | 正确的 fail-closed 行为，不是应放宽的 bug | 必须保留 | 不需要；不得弱化 |
| hard-coded company-specific logic / missing configuration layer | 正式 Source registry 只有安克，文件名看似通用的 `research-engine` 仍固定调用 C-04 chain | 当前产品 scope boundary；缺公司/研究案例配置层 | 仅配置化 Source 可保持；把新公司登记为产品能力另行决定 | 产品登记和能力扩展需要批准，本轮不实施 |
| Claim / Assumption model mismatch | Evidence ID、Claim C-04、A-03 与 K-07 均是安克研究语义 | 缺 capability，不是 parser bug | 不能在无新研究定义时复用 | 需要批准；本轮不实施 |
| deterministic financial-engine incompatibility | F-02 作为法定利润桥在本材料精确闭合；但信号方向、连续期间、盈利口径选择不因此成为公牛语义 | 公式可复用，决策传播不可直接复用 | 只可声明桥公式兼容 | 任何 Claim / Kill / 估值传播都需要批准 |
| valuation / decision-chain scope limitation | 股数、倍数、专业关卡和投资判断均未为公牛定义 | 有意 scope boundary | 不应自动补值或套安克参数 | 需要批准；本轮不实施 |
| LLM transport / formatting failure | 未进入 Memo / Question，也没有模型请求 | 未发生 | 不适用 | 不适用 |

第二次运行原始字节、坐标、程序输出和助手初审见 `validation/cross-company/bull-group-2026q1/second-run/`。程序输出保持原样，不以初审值回填或修补。

## 可复用与案例特定逻辑清单

### Genuine generic / 可复用

- PDF.js 坐标提取和原始 PDF / coordinates / output 摘要归档；修复后的 loading-task 生命周期与公司无关。
- parser 的 `SourceMeta` 注入、坐标行分组、字段标签匹配、CNY 元转百万元、同比复算、fail-closed issue / blocker 模型。
- 法定三指标之间的 F-02 算术桥；本材料的独立复核差额为 0，但这只证明公式输入闭合。
- Source hash、page/sourceId lineage、审核前 pending、append-only 版本 / Memo / review 台账以及 Web Locks 保存边界。
- 模型 transport、结构化输出验证、引用白名单、无自动重试和专业关卡 pending 等技术边界；本轮没有验证新公司内容生成。

### Company / research-case specific

- `source-records.ts` 的 issuer、sourceId、period、URL 和 development / regression-only 登记目前只有安克。
- `research-engine.ts` 名称通用，但必经 `runC04Chain`，Evidence ID 和 `claimId` 固定 C-04。
- `chain-v01.ts` 的 baseline state、A-03、K-07、证据方向、盈利口径选择、Valuation-B5、Decision 和 graph unchanged nodes 全是安克现有研究图语义。
- `research-question.ts` 的 capability 明示为 `anker-c04.v1`，限定安克、S-05、三个指标和既有节点。
- Memo Prompt 明示生成 C-04 备忘录；`buildMemoContext` 要求登记来源、C-04 evidence、V0.1 chain 和原状态逐字复算。
- `ResearchVersion` 名称通用，但 localStorage key、baseline source、claim shape 与 chain type 保留 `anker` / C-04 行为。
- `parseFinancialReportV06Strict` 名称通用，但行为依赖“首个 header 所在页”和单元格自带 `%`，并把九行 primary schema 当作单一表段；这些是由既有报告布局形成的隐式格式假设。
- 估值计算器的乘法是通用的，但股数、PE 情景、盈利基数和专业关卡不能跨公司复用。

## 实施的修改

仅实施一个与金融语义无关的修复：`run-transfer-probe.mjs` 保留 `PDFDocumentLoadingTask` 并在 `finally` 调用其 `destroy()`；新增离线回归，要求 probe 无论 parser 放行还是阻断都不得再变成生命周期执行失败。没有修改 parser、Source registry、Evidence / Claim、A-03、K-07、F-02、估值、Decision、Prompt、历史记录或产品能力。

## 后续改造提案

| 提案 | 分类 | 处置 |
| --- | --- | --- |
| 从已检测 header 继承 change 列的 `%` 单位，而不是要求每个数值 text item 自带 `%` | safe implementation within existing approval scope | 逻辑上可实施；但 root parser 变更会触发当前含 S-07 的回归，受本轮 S-07 排除约束，暂不实施 |
| 将 primary table detection 抽象为多个 header / page segment，并显式关联跨页续行 | safe implementation within existing approval scope | 同上；先建立不读取 S-07 仍能覆盖安克冻结行为的获批测试路径 |
| 用外部 Source / report-format profile 承载 issuer、period、header unit 与 segment mapping | safe implementation within existing approval scope | 可作为 parser 配置层设计，不等于把公牛注册为产品能力；本轮不提前实现 |
| 把 C-04 / A-03 / K-07 / Valuation-B5 / Decision 参数化后用于公牛 | requires owner approval | 需要新的研究 thesis、失效条件、估值输入和专业复核定义；不能由工程自动迁移 |
| 将公牛加入正式 Source registry、Question capability 或 Memo Prompt | requires owner approval | 属于产品能力和 Prompt 判断范围扩展，本轮不实施 |
| 为了得到 PASS 放宽 strict schema、跳过同比或套用安克阈值 | should not be implemented yet | 会削弱证据 Gate 或伪造泛化，明确不做 |

## 回归、限制与安全结论

- 首次 FAIL 永久保留；第二次运行不覆盖任何首跑文件。
- S-07 原件、truth、输出和测试均未读取或执行。
- 当前证据只覆盖一份 A 股非金融季度报告；没有覆盖银行 / 保险、外币、IFRS、年报、合并范围特殊变动、多币种或非标准利润指标。
- parser / F-02 展示了有限复用性；Source registry、完整 Evidence 传播、Claim / Assumption / Kill、估值、Decision、Memo 和 Question 没有跨公司闭环。
- 没有付费模型调用、产品注册、投资建议、专业通过、生产部署或历史改写。

验证结果：

- 新增 transfer probe 回归 1/1；Web `npm test` 73/73。
- 额外执行不含 S-07 的 root parser / chain 单元回归 7/7；安克 S-05 / S-06 浏览器上传、审核、冻结链、保存和回滚 3/3。
- lint 0 error、4 个既有 warning；TypeScript 通过；Next 16.3.8 production build 通过。
- production runtime smoke 1/1；Question browser NOT-LIVE 1/1；完整 UI browser NOT-LIVE 1/1。
- `npm audit --omit=dev --audit-level=high`：0 个生产漏洞。

## 可安全陈述

> Beacon 的坐标提取、来源留痕和法定利润桥已在第二家公司的一份公开季报上做过隔离验证；当前 parser 仍受表头单位继承和跨页多表段布局限制，而 Claim、Assumption、Kill Criteria、估值、Decision、Memo 与 Question 语义仍是安克案例配置，不能宣称端到端多公司支持。

## 竞赛表述边界

可以说：团队用未调优的第二家公司原件做了可复现 holdout，保留了失败首跑，定位出两类具体 parser 格式边界，并验证 fail-closed 和 F-02 算术闭合。

不能说：Beacon 已支持任意 A 股、已为公牛形成完整研究链、第二家公司已通过内容验收、模型已生成可靠结论、估值 / 决策可跨公司复用，或这次助手初审等于专业认可。

## 唯一下一步建议

先由所有者确认一个继续排除 S-07 的 parser 泛化回归方案：用安克 S-05 / S-06 的冻结期望加本次公牛原件，覆盖“表头百分比单位继承”和“跨页多表段”两项，再实现同一套格式 profile / segment 抽象。没有这项确认，不修改 root parser 或现有金融 workflow。
