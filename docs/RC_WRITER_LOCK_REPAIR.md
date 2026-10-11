# RC 无付费预检失败：跨进程写入锁修复

## 本次获批运行的实际结果

负责人对 `cb4bb75b467a778826aa0bc1cbb3ae2ac419a195` 的固定批次授权后，
只 dispatch 一次 [run 38103389908](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/38103389908)，
attempt=1，2026-10-11 北京时间 09:54:20 创建，09:55:19 job 结束。
精确 SHA 门禁通过；`Ordinary checks without provider credentials` 失败。
真实六请求步骤、构建及浏览器步骤均 skipped。本次运行无上传附件，失败日志仍在 GitHub。
**新增真实模型请求 0，没有本次模型用量或内容结果。** 原失败不可改写为成功。
该运行不代表此前两次获批批次也零调用；历史 38047109824 实际三次、38062132788 实际两次。

## 根因与最小修复

`research-operation-security.test.mjs` 的独立进程同 ID 认领测试报 `ENOENT`：
进程 B 的 `mkdir(.writer-lock)` 得到 EEXIST 后，进程 A 释放并删除锁；
B 随后 `lstat(.writer-lock)` 发现目录不存在，错误被直接抛出。
这是生产存储的竞争窗口，可能误阻断正常任务，不能用重复运行或降低测试要求掩盖。

现在只在 **EEXIST 后检查这一临时锁** 时容许 ENOENT，返回原有有界获取循环。
仍为最多 200 次、每次间隔 25ms；不会删除他人的锁或自动清理僵死锁。
稳定存储目录、索引、收据缺失仍失败关闭；权限、所有者、符号链接、其他 I/O 错误继续拒绝。
这只是获取本地互斥锁，不是模型请求重试；模型认领及持久化在锁内完成，提供方请求在认领后才允许。

增加内部 `beforeLockInspection` 调度测试接缝，只由代码内依赖注入，
不能通过 HTTP 输入、环境变量或工作流配置设置。与既有 `beforeWrite` 故障注入用途相同。
通过暂停实际 owner 写收据、让 contender 确认锁存在、再释放 owner，确定性覆盖竞争窗口。
旧实现加同一调度接缝后稳定复现 ENOENT；修复实现得到 `null`，原 owner 的 running 收据保持一致。

## 回归证据

- 新确定性释放竞争测试：原有任务只认领一次、原收据不变、没有提供方 transport 请求。
- 新锁权限/符号链接负例：继续拒绝，提供方请求 0。
- 独立 Node 进程竞争从两个扩展到六个：一个 claimed、五个 exists；完成后新进程读取完全一致的结果。
- 原 SIGKILL、磁盘空间/配额、写盘失败、恢复 hold、归档篡改、跨会话所有权及重复计费测试全部保留并通过。
- 完整 Web 单元/集成 **166/166**（其中 access/security **51/51**、Question **41/41**、RC **11/11**）；TypeScript 通过；lint 0 errors / 4 个既存 warnings；production build 通过。
- 本地 RC 浏览器与 Question 可靠性浏览器各 **1/1**，production runtime **1/1**。
  在 **1440 / 768 / 390px** 验证缺材料往返、历史审核切换、修改保护、待处理状态、同 ID 重发、
  上下文导出、键盘焦点/确认对话框、无页面横向溢出，以及原失败阻断与恢复。
  `artifacts-web/rc/acceptance.json` 记录 12 次 Question / 3 次 Memo synthetic 调用、realModelCalls=0、externalRequests=[]；
  可靠性证据 `artifacts-web/question-reliability/acceptance.json` 单独记录其 mock 调用。
  桌面与手机 `rc/question-result-{1440,390}.png` 已人工检查，测试不会发送真实模型请求。
- 精确新提交的普通 CI、浏览器结果与附件将追加在同一 [PR #36](https://github.com/yivenwang/financial-research-decision-chain/pull/36) 的交付记录；旧 SHA 的绿 CI 不代替新 SHA 验收。

H-01/H-02 金融安全、H-05 数据驱动与原 RC UI 见 [原 RC 报告](PRE_SUBMISSION_RC_REPORT.md)；
Question v3 与此前真实失败见 [专项复审](RC_LIVE_V3_REVIEW.md)。
本轮修复不修改这两类功能、金融公式、阈值、舍入、K-07、Prompt 或 DeepSeek 配置。
六次上限、预算/SHA/attempt 门禁、首失败即停、无自动重试与秘密字段拦截仍由完整测试验证。
不访问或运行 S-07，不修改生产密钥、审验窗口，不合并或部署。

## 停止点

保留本次预检失败；不 rerun、不补发，不用 cb4 的授权 dispatch 新提交。
修复后的精确 SHA 通过普通 CI 后交付，再等待负责人对该 SHA 授权一次固定最多六请求批次。
原估算 $0.26928、含 25% 余量 $0.33660 不变，该金额不是平台硬上限。
真实内容验收仍未完成，尚不能宣称比赛现场就绪。
K-07 A/B、专业门禁及实际输出内容审阅仍待相应负责人决定；现场部署和有效审验会话另需授权。
