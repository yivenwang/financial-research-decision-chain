# 赛前真实问题专项复审与 Question v3

本轮由负责人要求高规格审查、解决真实测试问题。工程起点为
`0614a90d98f7ed10695b488caf75b28377308f1a`；继续独立 RC 分支与
[PR #36](https://github.com/yivenwang/financial-research-decision-chain/pull/36)，
base / PR #35 仍为 `3328bcc95fa9a3b9f8ed38c45b2664901038d8b2`，未扩大 PR #35。
开始时本地工作树干净，远端两分支与预期一致，普通 CI 通过。

## 原始失败及根因

[真实运行 38062132788](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38062132788)
在负责人批准起点 SHA 后发送两次，第二次失败即停止，余下四次未发送。
[原始分析](https://github.com/yivenwang/financial-research-decision-chain/pull/36#issuecomment-6098985804)
与[原始附件](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38062132788/artifacts/11673366767)
保留。该批已消耗授权，不补发、不重跑。

提供方接口完整返回，失败发生在内容门禁，不能通过延长等待或增加 token 解决：

| 问题 | 原行为 | 修复后要求 |
| --- | --- | --- |
| 反证遗漏 | 只写未知比较期及规则限制，未陈述、引用已提供的归母同比下降 | 从冻结方向生成 `counterEvidenceIds`，指令与对应 Schema 段明确同段陈述和引用；未知项不能替代 |
| 同比归因 | 把本期负向调整、利润桥解释成同比变化的原因 | 明确拆开本期口径与上年同期变化；缺少非经常性损益比较期时，同比原因待核验 |
| 仅补引用的漏洞 | 加反证 ID 仍没有反向事实文字 | v3 增加 `COUNTER_FACT_NOT_STATED`，核对该引用对应的指标是否在反证段陈述 |
| 模糊限定词 | 同一长句末尾的“待复核”可能掩盖前面的确定归因 | v3 按因果词前的同一分句检查限定；支持明确否定、条件推论，测试长距离否定以避免误拦 |

这是既有证据要求的明确化，未修改投资判断标准。规则仍是保守模式匹配，
不构成一般语义证明；未识别的错误仍需要人工内容审核，不能承诺模型永不失败。

## 实现与历史保护

- Question 解释指令升级为 `question-explanation.v3`；规划仍为 `question-contract.v2`，Memo 不变。
- 原 v1/v2 指令原文、hash 和当时校验规则继续可用，历史记录与审核事件不重新评定。
- Schema 结构和存储结果结构不变，只增加对应段落描述。没有自动添引用、修文、合成生产答案或失败回退答案。
- 本次原始 `request-02.json` 按 bytes 纳入测试，只作负例；SHA-256 为
  `ea5322c8f25bc48771c841c0a8378915c4e781658638b519169906171b2bc308`。
  原文 SHA-256 为 `a7a4a0253119e1afcd794ca2a4b1b1fc0040f7909c3868b9931faabcf0e89806`。
- 为保持原预算，模型输入省去合同的 schemaVersion/requestId/createdAt/capabilityVersion/status，
  及 context 的 schemaVersion/snapshotSha256。这七个追踪字段完整保留在签名运行、事件、答案与导出中。
  其他任务字段、权限、来源、引用、事实、计算、影响和限制完全相同，有独立逐字段断言。
- UI 补充新阻断原因说明，并提示 v1/v2 历史规则；无配色、品牌或页面重构。

## 零付费证据

`apps/web/tests/question-live-v3.test.mjs` 独立验证：原始失败 bytes / Prompt hash / BLOCKED / answer=null；
只补反证引用、只修反证文字分别仍受控失败；三类问题各有明确标记的 synthetic 正例；
反向指标和无反证输入；原事实与冻结结果不变；六请求归档/验收/预算闭环；
原失败两请求回放立即停止，复用原幂等请求仅读取结果，不再次请求。

完整合法引用、160 个四字节 Unicode reason、较长合法公司别名下，三类 execute
完整 wire bytes + 原 4096 reserve 最高 **15923**，低于原 **16000/次**。
较长或不合规输入仍可能被门禁受控阻断；本结果只覆盖所列固定验收范围。
没有提高输出、超时、预算估算或六次上限。

本地检查：Web 单元/集成 **164/164**；Question **41/41**；TypeScript 无错误；
lint 0 errors / 4 个既存 warnings；production build；76 个迁移文件未改；
生产依赖审计 0 vulnerabilities。浏览器使用真实服务端 handler 的 synthetic transport，
在 **1440 / 768 / 390px** 验证原失败阻断、原文导出、键盘提交、历史保存、下一次任务与专业待审核，
并阻止非本机浏览器网络。普通 CI 的精确 SHA、最终结果与截图附件在 PR 交付记录中追加，
以实际成功运行为准，不把旧 CI 算作新 SHA 的验收。

### 安全复核

| 约束 | 证据与结论 |
| --- | --- |
| 六次上限 / 首失败即停 / 无自动重试 | 原 batch 实现不变；全部六位置故障测试及本次两调用失败回放通过 |
| SHA / 预算确认 / attempt=1 | workflow、环境门禁及预算算法不变，普通 tests 覆盖错误输入；本报告不是授权 |
| 秘密字段归档 | 现有 Cookie/API Key/session secret/ticket/authorization 与编码变体拦截测试保留，新原始负例通过 archive guard |
| 幂等 / 会话 / 持久任务 | 原实现不变；失败完成结果可重复读取但调用数不增长 |
| 金融 / 专业关卡 | 冻结事实、计算、影响不变；formalRecommendation=null、professional=pending；H-01/H-02/H-05 回归仍通过 |
| S-07 / 生产 | 未读取或测试 S-07；无生产密钥、审验窗口、DeepSeek 配置变更；无合并或部署 |

**本轮新增真实模型调用 0，所有生成测试均为 synthetic/mock。**
此前 38062132788 实际两次、估算 $0.018403（非账单），更早 38047109824 另三次；
不得宣称项目累计零调用，原失败与未验收状态继续保留。

## 比赛现场停止点

修复候选须先通过普通 CI，再由负责人对最终精确 SHA 另行授权最多六次固定真实请求。
三类问题真实执行及逐条内容审阅完成前，结论为 **真实内容验收未通过 / 不可宣称现场就绪**。
若仍失败，保留首个失败并停止，不切换新批次绕过。成功接口或离线正例不能替代真实内容。
原理论 $0.26928、含 25% 余量 $0.33660 仍非平台硬上限。

现场使用还需最终候选部署及有效审验会话，这是与代码验收分开的授权事项。
本轮不合并、不部署、不延长生产审验窗口。K-07 A/B、EG-01/EG-02 和投资结论仍待负责人/专业审核；
不能为了现场连续演示而放松门禁、静默重试或把阻断输出当成功。
