# 研究更新备忘录 V0.1

更新：2026-09-07。衔接已合并的网页引擎 PR #12 和模型备忘录 PR #13。PR #14 默认接入 DeepSeek V4 Pro；真实调用已返回内容，但第 4 次手动验收因输出结构错误被阻断。当前格式补丁仍待新的真实 API 整链验收，不能用测试替身结果证明已经满足比赛的大模型要求。

## 模型承担的工作

从已保存且通过证据审核的研究版本出发，模型解释支持与反证的关系，提出待验证的替代解释和后续研究问题。它不是只给数字润色；模型的推论质量仍须通过人工评测确认。

财务指标、证据方向、系统信号、假设状态、失效条件、利润桥和估值输入继续使用冻结引擎。备忘录接口不具备修改这些业务对象或批准专业关卡的入口。

产品入口：材料更新并保存 → 版本历史 → 选择该版本 → AI 研究备忘录 → 生成 → 核对引用 → 接受或退回 → 导出 Markdown 和 JSON 审计记录。

## 输入与引用

`buildMemoContext` 检查材料登记、版本库、解析版本、完整指标、必要证据与署名，并重新执行冻结决策链核对快照。允许的材料仍只有 Source 记录中的 S-05 / S-06。S-06 仅进入回归版本库；S-07 不读取、不测试。

模型输入为三项已审核事实、派生增速差和四个冻结规则节点。可编辑标签、文件名、审核人姓名和 PDF 文件不发送给模型。正文采用定性解释，数值与来源由固定事实表展示。

输出必须符合 JSON Schema，所有段落引用本次输入中的编号；支持和反证段落各有相应方向的证据，整体覆盖三项原始事实；替代解释必须标注为可能或待验证；专业关卡只能为 pending。未知引用、遗漏事实、无效结构、正文中的数字/网址和关卡改写均阻断输出。任何层级的对象内出现重复字段也会阻断，避免 JSON 解析只保留最后一个值；保留原始文本，不自动拼接、改写或补齐模型内容。

这属于结构、引用存在性与覆盖检查，**不是论证正确性或引用蕴含关系的证明**。服务端也没有重新鉴证 PDF 或审核人身份；来源仍为浏览器快照。需要人工审查是否把相关性写成因果、是否将假设当作事实、是否夸大跨公司适用性。

## 调用和版本记录

- 默认使用 DeepSeek Responses API（`https://api.deepseek.com/responses`），模型 `deepseek-v4-pro`，可选 `deepseek-v4-flash`。设置 `MODEL_PROVIDER=openai` 可使用 OpenAI 对照通道及 `OPENAI_MODEL`。提供方固定到对应官方端点，每条通道只读取自己的密钥。两条通道使用相同 Prompt、JSON Schema 和本地引用校验。固定 4,000 最大输出 token、low reasoning、90 秒超时；一次操作只发一次请求，无自动重试或模拟兜底。
- Prompt 在 `apps/web/lib/research-memo.ts` 中版本化；记录 Prompt、请求、响应和研究快照的 SHA-256，以及请求/响应编号、模型实际返回名、时间、用量、最终输出与校验错误。记录最终备忘录，不采集隐藏推理过程。
- 当前 Prompt 版本为 `research-update-v1-format-2`：在原始研究指令后追加数组/对象类型、字段唯一性及返回前格式核对说明。原始研究指令单独保留为 `MEMO_RESEARCH_INSTRUCTIONS`，其 SHA-256 与提交 `c96be3d` 的研究指令一致。金融判断要求、输出 Schema、引用与专业关卡规则未修改。
- OpenAI 请求设置 `store:false`；DeepSeek 是无状态 Responses API，本地不发送其不支持的 `store` 参数。不应将此解释为超出提供方政策的零保留承诺。
- 备忘录与审核事件追加到独立本机版本库。原研究快照不改写；回滚产生新研究版本及新绑定，不能自动继承旧备忘录为当前版本结论。
- 哈希用于关联和复查，不是数字签名。本机记录可由设备持有人修改；CI 来源记录和人工专业审阅应一并保留。
- 未配置、认证失败、来源不匹配、格式超限时在请求模型前停止；模型拒绝、超时、限流、截断、无效 JSON 和引用失败产生失败/阻断记录，不展示预写文本冒充模型输出。

## 配置与使用

普通浏览与 PDF 流程无需模型凭据。需要模型时，在 `apps/web/.env.local` 中参考 `.env.example` 配置：

```dotenv
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=<自己的 DeepSeek API Key>
DEEPSEEK_MODEL=deepseek-v4-pro
RESEARCH_DEMO_TOKEN=<至少16字符的私有演示访问码>
# 反向代理需要时填写公开 origin，不带尾斜杠或路径
RESEARCH_APP_ORIGIN=
```

这些值只用于服务器运行环境；不使用 `NEXT_PUBLIC_`，不提交真实密钥。重启应用后，在备忘录区域输入演示访问码。访问码不写入本机版本库。

OpenAI 对照运行使用 `MODEL_PROVIDER=openai`、`OPENAI_API_KEY` 和 `OPENAI_MODEL`（默认 `gpt-5.6-sol`），不再将 DeepSeek 密钥复制到 OpenAI 环境变量。配置状态接口只返回是否就绪、提供方和模型；界面与导出记录展示实际提供方。

这是私有演示的共享访问码保护。服务端校验同源请求，限制请求为 128 KiB，并限制每个服务进程同时处理一个模型请求。公开多人产品所需的账号、持久化配额和权限体系不在本次交付范围。

直接运行 Next.js 时，来源按请求协议和 `Host` 核对，支持内部 URL 被规范为 `localhost` 而浏览器使用 `127.0.0.1` 的情况。反向代理可通过服务器环境中的 `RESEARCH_APP_ORIGIN` 指定公开 origin；任意请求中的 `X-Forwarded-*` 不作为信任依据。

## GitHub 中的一次真实验收

1. 仓库 Actions Secret 名称为 `DEEPSEEK_API_KEY`；项目所有者已经配置，无需重复添加。存在性检查不等于提供方认证或余额验证。
2. 打开 [真实验收工作流](https://github.com/yivenwang/financial-research-decision-chain/actions/workflows/llm-live.yml) → Run workflow。PR #14 合并前选择 `dev/deepseek-provider-v02`，模型选择 `deepseek-v4-pro`；合并后才选择 `main`。界面在合并前可能仍显示旧名 **Live research memo acceptance**，补丁内名称为 **Live DeepSeek research memo acceptance**。
3. 工作流用正式构建的网页上传官方 S-05 PDF，执行一次真实模型请求、引用校验、备忘录审核交互、导出、重载和回滚。演示访问码由测试程序临时随机生成，无需额外配置。
4. 下载 `live-deepseek-research-memo-<run_id>` 审计包，检查真实 Response ID、提供方、模型、token 用量、版本/PDF 摘要、备忘录、审核记录及截图。自动化署名仅说明交互测试完成，不构成专家认可；模型内容需另行审阅。

失败时先检查 `live-provider-configuration.json` 和 `S-05-live-deepseek-model-http.json`（HTTP 状态、错误码、具体校验错误及调用编号）。若接口产生调用记录，`S-05-live-deepseek-model-call.json` 在成功断言前保存。浏览器失败断言及服务端摘要日志包含 `audit.validation` 错误码，不记录正文、请求头或密钥。

2026-09-07 第 4 次真实运行 [34134238598](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34134238598) 使用提交 `c96be3d` 和 `deepseek-v4-pro`。应用返回 HTTP 422 / `MEMO_VALIDATION_FAILED`，具体错误为 `MEMO_SECTION_SCHEMA`。四个应为数组的字段分别重复出现为对象；标准 JSON 解析只保留每个字段的最后一个对象，现有结构校验因此正确阻断。

原始失败保留于 [GitHub 验收附件](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34134238598/artifacts/10023382597) 与项目负责人下载的原件中。仓库回归使用既有测试文案合成相同的重复字段结构，不复制真实模型正文或附件中的财务证据。新补丁会更早以 `MODEL_JSON_DUPLICATE_KEY` 阻断这类结构；回归通过不能改写原始失败或计为新真实调用。

结构和引用校验通过后，研究内容仍须人工核对；不能据此认定因果解释或会计判断已经获得专业认可。EG-01、EG-02 保持待复核。

更早的失败运行 [34105014901](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34105014901) 同样保留。合并条件仍为最新代码的普通 CI 和真实 S-05 运行均通过；当前补丁未完成新的真实验收。

该工作流只手动触发，不会在普通 push 或 PR 测试时产生模型调用费用。安装依赖及构建步骤不接收 API Key；仅预检及最终运行步骤使用配置的 secret。

## 自动测试的证明范围

`npm test` 包括原有三项解析 fixture、六项引擎集成测试及十一项模型边界测试。检查覆盖提供方/密钥选择、Next.js 来源规范化、代理 origin、伪造转发头阻断和 OpenAI/DeepSeek 历史记录共存；本次新增相同错误结构的合成回归、转义或嵌套的重复字段、合法独立对象与字符串内标点的区分。回归还核对原始研究指令的 SHA-256。模型单元测试使用显式注入的传输替身；生产代码没有模拟模式。

普通 Web CI 继续真实上传 S-05 / S-06 PDF，并检查未配置时禁用模型。随后 S-05 通过浏览器网络拦截测试备忘录呈现、审核、导出和重载，返回模型名称明确为 `test-transport-not-live`，输出文件带 `stub-model-NOT-LIVE`。这验证 UI 与存储交互，不证明提供方接入成功。

只有手动真实验收工作流以真实 API Key 运行并通过，才可将本阶段状态改为“真实调用验收通过”。该模式只请求一次 S-05；其他 PDF 负向回归在普通 Web CI 运行，跳过不能算通过。

官方接口依据：[DeepSeek Responses API](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)、[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)。
