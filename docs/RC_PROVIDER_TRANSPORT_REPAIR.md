# DeepSeek 通信边界：复现后定点修复

2026-10-11，基于 `2434ae2d480c70dd2b895fdc479fc04f17841710`，继续同一 PR #36。
工作区开始干净，远端 head 与本地一致，普通 CI 成功；PR #35 与金融起点不变。
本次只排查并修复可复现的通信/验证缺陷，不新增功能，不改变 Prompt、模型配置、
财务公式、专业规则、历史状态、收费预算、审验窗口或部署。

## 先纠正根因归类

当前请求为非流式 `POST https://api.deepseek.com/responses`，模型 `deepseek-v4-pro`。
现行 [官方 Responses 契约](https://api-docs.deepseek.com/api/create-response/) 支持该模型、
`reasoning.effort=low`、`max_output_tokens`、system/user input 与 `text.format=json_schema`。
不应强行改成旧模型名或 Chat Completions 字段；当前没有 SSE chunk / reasoning_content 解析路径。
`finalOutput` 仅取最终 message/output_text，reasoning/null item 不会成为答案。
Schema 形状约束也不能代替意图正确、逐段引用和金融内容校验。

已付费历史的规划误分类、反证/专业引用遗漏与不支持的同比归因，是完整模型返回后的语义验收失败；
不能伪装成 BaseURL、HTTP 或超时问题。这些原始失败继续保留，既有 Prompt 修复须新的真实输出验证。
本次通信修复不证明三题真实内容已经通过，不通过去掉门禁来制造成功。

## 本次复现和修复

| 缺陷 | 旧行为 / 复现证据 | 修复 |
| --- | --- | --- |
| 提前拒绝未取消响应体 | Content-Length 超限和 HTTP 503 的底层 cancel 调用数为 0 | 提前拒绝即 cancel；已开始读取的失败在 finally 统一取消和释放，不等待可能卡住的取消回调 |
| 错误协议误报网络 | Memo JSON null 访问属性，非法 JSON/UTF-8、空 body、超长 body 被误报 PROVIDER_UNAVAILABLE | 检查顶层非空对象；解析错误带内部 code，两个调用入口归为 PROVIDER_RESPONSE_INVALID，网络/超时/HTTP 仍各自归类 |
| Memo 错误信任模型/用量 | 用完整合法 synthetic 正文重放旧 2434ae2：unrelated-model、usage=null、output=6001、total 不一致均返回 completed | 接受内容前核对返回模型、safe integer/非负用量、输出上限和 token 总和，受控 failed / memo=null |

`readBoundedJson` 去掉仅包装 code/name 的自定义 Error 类，改用标准 Error 标签。
访问入口仅相应改为按 code 映射 413/408/400，原权限、限流、Cookie、截止时间不变。
没有新网络 SDK、适配器类、重试状态机、流式功能或自动内容修补。
规划/执行分离、会话归属、签名绑定、原始输出和幂等持久任务继续保留；
这些负责防止重复计费与绕过审核，不能为了缩短代码删除。

## 验证

新增 provider-boundary 五项回归覆盖：六种非法提供方响应在两条路径单次失败；
HTTP 错误取消；错误模型/五种用量异常；reasoning/null item 与最终 JSON 分离；
原生 fetch 在响应头前和响应体停顿时两次本地模拟 HTTP 超时。
新增 body 超限测试要求底层恰好一次取消，即使取消 Promise 永不完成仍及时退出。
修复前测试失败、修复后通过；旧 SHA 的 Memo false-completion 已单独以合法正文零付费复现。

本地 Web 单元/集成 **183/183**，Question **57/57**、access/security **52/52**、RC **11/11**；
TypeScript 通过，lint 0 errors / 四个既存 warnings。输入估算和六请求 synthetic 演练继续通过。
所有新模拟 transport 仅 synthetic 或 127.0.0.1 native HTTP，真实模型请求 **0**。
生产构建通过；S-05/S-06 实际 PDF 浏览器 **3/3**，可靠性 **1/1**、RC **1/1**，
宽度 1440 / 768 / 390px，缺材料往返、未保存/历史保护、等待状态、同标识恢复、
原始导出、专业 pending、键盘与无横向溢出保留。模型始终 labelled synthetic/mock。
最终 clean build receipt 与普通 CI/附件在 PR 交付追加，以实际结果为准。

四个旧 Memo 正例 fixture 的返回模型/用量调整为匹配请求的 synthetic envelope；
transport/response ID 继续明确 NOT-LIVE，不把 mock model 标签当提供方身份豁免。
原始真实 JSON、历史哈希、模型内容、历史接受/拒绝事件均未改写。

没有访问或测试 S-07，没有生产/密钥/配置改动、合并或部署。
最多六次、预算确认、精确 SHA/attempt=1、首失败即停和秘密字段归档拦截仍有效。
本次修复真实调用 **0**；不能复用已执行旧 SHA 的 live authorization。
