# 真实付费批次 38108168529：引用要求对齐与 Question v4

2026-10-11，负责人要求继续完成真实付费测试。对已交付精确 SHA
`7af0c7c160d0d07b1c4b68defbc5126cd412a019` 只 dispatch 一次
[run 38108168529](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38108168529)，attempt=1。
无凭据单元预检、构建、S-05/S-06 PDF 与问题浏览器流程全部通过；
实际调用 DeepSeek V4-Pro **两次**，第二次内容门禁失败后立即停止，余四次未发送。
[原始附件 11690576102](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38108168529/artifacts/11690576102)
与失败日志保留，不 rerun、不补发、不修补真实原文。

## 实际用量与结论

| 请求 | 结果 | input / output tokens |
| --- | --- | --- |
| Q-LIVE-01 plan | CONTRACT_DRAFTED；意图、期间与合法证据 ID 正确 | 897 / 970 |
| Q-LIVE-01 execute | HTTP 200、模型完整返回；PROFESSIONAL_LIMIT_OMITTED，BLOCKED / answer=null | 3335 / 1744 |
| Q-LIVE-02 / Q-LIVE-03 | 未运行，不给内容结论 | 无请求 |

已知输入 **4232**、输出 **2714**，unknown usage=0。
按既有估算算法约 **$0.016334**，不是实际账单；本批未超既有请求/用量界限。
网络、身份、提供方模型及格式完整返回，不能把内容拒绝误报为网络或超时问题。
原版 v3 Prompt hash、合同重放、运行/事件校验及失败门禁已独立只读重放；新增提供方请求 0。

## 不只修首个错误：逐段检查

| 段落 | 原始问题 | 结论 |
| --- | --- | --- |
| directAnswer | 引用了两侧及本期桥，明确比较期缺失及同比原因待核验 | 本段未触发既有校验错误，不据此接受整篇 |
| inference | 提到归母与扣非两侧，却只引 A-03 / 扣非 | 缺归母引用；条件推论仍需引用双方 |
| counterEvidence | 提到扣非及非经常性损益比较期，却只引归母 | 缺扣非与非经常性损益引用；需进一步人工核对“拖累”的本期/同比范围 |
| uncertainty | 专业限制段没有 A-03 | 触发既有 PROFESSIONAL_LIMIT_OMITTED；在其他段引用 A-03 不能代替 |

内容初审结论：**阻断，不接受**。模型原文与拒绝原因保留。
即使技术引用补齐，也不能据此断言经营因果或取得专业认可。

## 最小修复与历史保护

- 当前解释指令升级 `question-explanation.v4`，规划仍为 `question-contract.v2`。
  明说 uncertainty 必引 A-03；逐段引用所提指标、缺口、比较双方与规则，包括条件/否定句。
- Schema 根描述明确逐段引用；uncertainty 描述单列专业待复核与必需引用。
  wire constraints 增加 `uncertaintyCitations=[A-03]`，与本地校验共用常量。
  A-03 必须位于该段及逐段引用要求原已存在；不新增、降低或绕过判断标准。
- 没有自动添引用、模型内容补写、接受部分输出或提供生产回退答案；Schema 输出形状和存储形状不变。
- v1/v2/v3 原指令和校验行为保留，包括 v3 的严格反证检查；历史 hash、状态和审阅事件不重新评定。
  UI 明示 v3 历史版本，并更准确说明专业引用阻断。
- 原 request-01 / request-02 按 bytes 纳入负例，hash 见 [fixture 说明](../apps/web/tests/fixtures/question-live-38108168529/README.md)。
  合成引用补齐示例只用来隔离错误，永不保存成真实接受记录。

## 离线验收

新增 v4 回归 **6/6**：原 v3 bytes/hash/拒绝状态，独立专业与段落遗漏，
指令/Schema/约束/校验一致，全部所提指标/缺口/规则/派生依赖，v3 反证规则保护，
实际失败两 mock 请求停止与同幂等请求不重复调用。
三意图完整六请求演练继续使用 synthetic transport。
最大合法引用、160 个四字节 Unicode reason 与较长公司别名下，最高估算 **15940 < 16000**；
原 4096 reserve、6000 输出、150 秒/次、low、费用与六次上限不变。

完整 Web 单元/集成 **172/172**，Question **47/47**、access/security **51/51**、RC **11/11**；
TypeScript 通过，lint 0 errors / 4 个既存 warnings。生产构建、浏览器与最终普通 CI 的实际证据在 PR #36 交付记录追加；
不能用旧 SHA 的 CI 或 synthetic 正例替代真实内容验收。

本地生产构建通过，RC 和可靠性浏览器各 **1/1**。最新构建在 **1440 / 768 / 390px**
重放本次专业引用失败，禁止接受、导出原始 bytes、保留历史 v3，随后可由用户开始新的独立研究任务；
专业状态始终 pending。可靠性证据记录 **27 mock**、realModelCalls=0、externalRequests=[]，
RC 另 **12 Question / 3 Memo mock**，键盘、确认框、缺材料往返、历史/未保存保护、无横向页面溢出通过。
截图与 JSON 在新提交的普通 CI 附件再次核对，不把本地 synthetic 演练当作真实采样成功。

保留 H-01/H-02/H-05、K-07 决策待定、金融公式/阈值/舍入、专业关卡、Memo 与 DeepSeek 配置；
首失败即停、精确 SHA/attempt、预算确认、秘密字段及字符串/编码变体拦截继续有效。
本批真实两次；此后修复及验收新增真实请求 **0**。
更早两次有实际付费的失败批次分别三次与两次，另一次预检失败零次；不宣称项目累计零调用。
未访问/测试 S-07，未修改生产、密钥或审验窗口，未合并或部署。

## 比赛现场停止点

本固定批次尚未通过真实内容验收，不宣称比赛现场就绪。
新修复候选须普通 CI 通过，再由负责人对最终精确 SHA 明确授权一次最多六请求批次；
不能把“直到跑通”变成无限付费重试，不能沿用已执行 SHA 的授权。
原 $0.26928 / 含余量 $0.33660 仍非平台硬上限。
现场还需要获批候选的部署与有效审验会话，这是独立于 GitHub 隔离测试的验收。
K-07 A/B、EG-01/EG-02、实际内容接受、合并和部署仍待相应负责人决定。
