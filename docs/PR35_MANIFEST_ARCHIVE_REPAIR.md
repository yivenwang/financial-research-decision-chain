# PR #35：初始清单归档冲突最小修复与零付费验收

2026-10-10，分支 `codex/reviewer-audit-round-2`。
开始及提交前分别核对 GitHub PR / 远端分支，均为固定起点
`c0153ea893da0bf5bde0a602a563acaa34a9692c`；使用普通快进推送，不覆盖并发更新。

## 根因与修复

[首次运行 #38018489076](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38018489076)
保留为失败。堆栈为 `assertArchiveSafe → persist → runBoundedQuestionBatch:53`，
即保存初始 manifest 时触发 `ARCHIVE_CREDENTIAL_FIELD_BLOCKED`，尚未进入
请求预留循环或执行回调，因此该次真实模型请求为 0。

唯一执行代码改动：将 manifest 的非敏感审批标识字段从 `authorization` 改为
`approvalReference`，值保持原审批引用。它不是 HTTP Authorization 或凭据。
`assertArchiveSafe` 字节不变；Cookie、authorization、ticket、apiKey、sessionSecret
字段及已知秘密值的归档拦截均保留。手动工作流输入、审批/SHA 门禁及生产配置不改。

## 可复现回归

新增两项回归纳入 `npm test` / 普通 Web CI：

- 直接调用真实 `runBoundedQuestionBatch`，将真实初始 manifest、全部 14 个
  checkpoint 和 6 个请求归档交给生产 `assertArchiveSafe`。三意图使用实际
  Question handler、明确标记 NOT-LIVE 的注入 transport、验收 verifier 与完整
  wire 输入预算检查。审批引用、SHA、空初始请求、预算、状态、6 请求/36,000 输出、
  150 秒限制及最终 96,000 输入预留均断言。重建旧字段的同一清单仍被拒绝。
- 27 个嵌套泄漏案例：12 个凭据字段大小写变体，以及 5 种已知秘密字符串
  （含双引号、反斜杠、换行/制表符、中文）各自原文、Bearer 和 Cookie 包装。
  使用真实 JSON 序列化归档检查，每例均在初始持久化拒绝，执行回调为 0。
  不宣称覆盖任意编码、未知秘密或通用 DLP。

现有六个失败位置首失败停止、checkpoint/archive 写入失败停止、无 usage/超预算
停止、固定 SHA/attempt/审批门禁回归继续通过。模拟成功不等于真实模型内容认可。

## 本地证据

使用与 CI 相同的 Node 22.16.0；真实模型密钥置空，浏览器显式 `LIVE_MODEL_E2E=0`。

| 检查 | 结果 |
| --- | --- |
| 完整 Web 离线测试 `npm test` | 137/137，0 fail / 0 skipped |
| 批次专项 | 10/10，含上述两项新增回归 |
| TypeScript | 构建后独立 `tsc --noEmit` 通过 |
| Lint | 0 error，4 个既有 warning |
| Next 构建 | 通过，生成本地构建收据 |
| Runtime smoke | 1/1 |
| S-05/S-06 PDF 上传、审核、保存、回滚及拒绝路径 | 3/3，模型 NOT-LIVE |
| Question 浏览器任务、执行、导出、审核与历史 | 1/1，模型 NOT-LIVE |
| V5 文件冻结检查 | 77 个文件未变 |
| 生产依赖审计 | 0 vulnerabilities |

初次类型检查与构建并行导致 `.next/types` 重建期间缺文件；构建完成后单独检查通过，
未修改类型配置或忽略错误。初次浏览器/运行检查受沙箱网络/监听限制，允许相应
环境能力后重跑通过。原始本地日志保留于 `/private/tmp/beacon-pr35-manifest-fix/`。
最终新 SHA、普通 CI 执行结果与工件链接在 PR #35 交付记录中核对；旧 SHA 的绿灯
不替代新提交。范围检查成功及 scoped-out 回归分别报告。

## 边界与后续审批

本轮真实付费请求 0；未触发 live workflow、重跑原失败、合并或部署。
最多 6 请求、16,000/次与 96,000/批输入估算、6,000/次与 36,000/批输出及
首次失败立即停止、无自动重试均保持。既有 $0.26928 / 含余量 $0.33660 为估算，
不是账单金额硬上限；本轮没有重新定价或授权付费。
冻结金融公式、Prompt、专业关卡、生产密钥与审验窗口不变；S-07 未访问或执行。
对新 SHA 的真实模型测试仍须在报告通过后由负责人单独明确批准；不得复用旧 SHA
授权。金融内容验收及 Merge / Deploy No-Go 状态继续保留。
