# PR #35：会话隔离与收据恢复 Release Candidate

日期：2026-10-09。固定修复起点 `08db9ca09a9a8c86cad2343c41ee9f3c3fb84940`。
分支 `codex/reviewer-audit-round-2`；[PR #35](https://github.com/yivenwang/financial-research-decision-chain/pull/35)。
本轮真实模型请求 **0 次**；未合并、未部署、未修改生产配置或密钥。
本文补充此前审计，不改写原始失败或历史专业审核结论。

## 已确认根因与修复

原实现只验证共享访问许可，持久收据没有创建者；知道任务 ID 的另一审验会话
可以查询或重放。签名研究草稿仅绑定内容，未绑定创建会话；共享 Bearer 也可以
进入 Question 执行路径。这是真实跨会话越权，不是模型输出问题。

现实现先验证服务端签发的 v2 Cookie，再对会话随机 nonce 作域分离 HMAC 得到
`ownerSha256`。相同访问码的不同登录仍是不同 owner；客户端 userId 不参与身份。
GET 与 POST 重放先验证 owner，未知/非本人返回相同 404；草稿签名 v2 绑定 owner，
跨会话确认 422 且不调用模型。共享 Bearer 仅能读取 Question 的无敏感配置 GET，
不能创建、查询私有任务或执行；代理与服务端均限制。收据不存 Cookie、访问码或密钥。
旧版无归属收据不迁移、不公开、不删除：原字节保留，安全停止并要求维护者处理。

原存储没有独立最新认领索引，旧备份替换目录可丢失后续执行事实。现在以
`DIRECTORY.claims` 为最新权威索引，运行 claim 和结果 hash 均独立、排他写入并 fsync。
收据与索引必须一致；丢失、回退、残留未完成写入、权限异常均停止新模型调用。
客户端省略幂等键时，服务端生成的 ID 同时用于返回任务和持久收据，能按返回 ID
恢复并手动精确重放。跨进程文件锁只覆盖收据操作，模型请求前已持久认领，同 ID 不重复调用；文件锁
没有过期自动清理。不确定认领只能追加 uncertain 标记，不能重新调用或覆盖原稿。

## 会话、退出与恢复边界

- 同一 Cookie 的刷新、多标签页、服务进程重启可读取自己的持久结果；正在运行返回
  202，超过原 180 秒观察窗的未完成认领返回 409，不自动重新执行。
- 退出清除本浏览器 Cookie；重新登录产生新 nonce，旧任务不会自动转移。过期、访问码
  或会话签名密钥轮换也不能接管旧任务。本机历史与导出保留，须保护共享电脑上的
  localStorage；本轮不是账号系统或本机历史加密功能。
- 当前退出没有服务端 nonce 吊销清单。被盗的旧 Cookie 在原窗口内仍是凭证，不能
  宣称实现了被盗会话吊销。HTTPS、HttpOnly、SameSite 和现有窗口规则继续生效。
- 会话所有权不是实名认证或专业签署；`identityVerified:false` 保留。
- 草稿仍有原有一小时有效期，提供方密钥轮换也会使旧草稿失效。完整结果可按 owner
  查询；过期草稿不允许再次确认。旧 v1 签名不能继续执行。
- Memo 的原有 Bearer 路径没有在本轮扩为持久 Question 身份；不得宣称所有端点已经
  完成账号级隔离。Question 收据和草稿不能从 Memo 路径重放。

## 私有持久目录与容量

生产必须显式设置绝对 `RESEARCH_RUN_DIRECTORY`，放在 checkout、`.next`、public、
发布目录之外；父目录不得允许其他用户任意写入（受保护的系统 sticky 临时目录除外）。
Node 服务 UID 拥有 root、相邻 `.claims`、操作子目录，目录严格 0700，JSON 严格 0600，
拒绝最终目录符号链接、文件符号/硬链接、错误 UID 与开放权限。两目录同一文件系统，
所有 Node worker 共用它们；不支持仅具弱文件锁/fsync 语义的网络存储、独立副本或
无持久挂载的 serverless 多实例。目录不能由静态文件服务或 Nginx alias 暴露。

限额：最多 1000 项 plan/execute 操作；收据总量含运行中每项 2 MiB 预留不超过
1 GiB；每个 JSON 最大 2 MiB；剩余至少 128 MiB 加当前 2 MiB 预留，至少 1024 inode。
低空间、inode 耗尽、写入失败均安全停止。空间检查不能替代磁盘配额：其他进程仍可能
抢占空间；模型返回后磁盘写失败时账单/结果可能不确定，认领继续阻断重复执行。
达限应暂停接入、扩容和审计；本工具不自动清理、不删除运行中或历史收据。

## 可执行运维流程（本轮仅在隔离临时目录演练）

以下命令在 `apps/web` 下使用生产 Node 服务 UID 执行。示例路径不是现有生产配置，
所有真实生产操作仍需后续批准。命令既不加载提供方密钥，也不调用模型。
部署前确认本地 Linux 文件系统支持 mkdir/O_EXCL、rename、文件与目录 fsync；独立
持久磁盘/挂载与服务 UID 配置由运维验收，不能仅凭本地演练标为生产通过。

首次空目录初始化（父目录须已私有创建，不能对已有历史目录重新 init）：

```sh
node --experimental-strip-types scripts/research-operation-store.mjs init /srv/beacon-private/runs
node --experimental-strip-types scripts/research-operation-store.mjs verify /srv/beacon-private/runs
```

备份到新的私有目录（已有目标不覆盖；文件 hash、实例标识写入 manifest；运行中
认领也包含，不能被当成“可重新执行”）：

```sh
node --experimental-strip-types scripts/research-operation-store.mjs backup /srv/beacon-private/runs /srv/beacon-backups/rc35-unique-backup
```

备份持有同一写锁获得一致切面；源目录与索引完整时可在线执行。加密异地保存备份及
manifest，不上传公开服务，不将签名草稿提交 Git。监控备份成功时间、剩余字节/inode、
操作数、锁阻断、存储错误；安排定期恢复演练。RPO/RTO 尚未在生产实测，需明确承认
认领索引只保存在同磁盘时无法承受整盘损失；生产需独立保留最新索引/认领事件及
提供方账单核对信息，不能声称周期备份保证零丢失。

恢复前停止 **所有** Node worker，保留故障原盘/目录只读副本和日志。`--services-stopped`
是操作者声明，不会替你停服务；不得带着活跃 worker 恢复。不得恢复或覆盖较新的
`runs.claims`。恢复自动设置 admission hold，即使失败也保留 hold：

```sh
node --experimental-strip-types scripts/research-operation-store.mjs restore /srv/beacon-private/runs /srv/beacon-backups/rc35-unique-backup --services-stopped
node --experimental-strip-types scripts/research-operation-store.mjs verify /srv/beacon-private/runs
```

存在的新收据按最新索引保存，缺失收据只接受 hash 与最新索引一致的备份。
旧备份缺少较新收据返回 `RESTORE_MISSING_LATEST_RECEIPT`，禁止忽略、重置索引或重发。
先寻回正确新收据，再复核。若运行中认领的结果/计费无法确认，逐项保留原文件并追加
隔离记录（reason 不含密钥、Cookie 或访问码）：

```sh
node --experimental-strip-types scripts/research-operation-store.mjs quarantine /srv/beacon-private/runs execute 00000000-0000-4000-8000-000000000000 "已停止所有 worker；提供方结果仍不确定，保留原认领禁止重发" --services-stopped
node --experimental-strip-types scripts/research-operation-store.mjs verify /srv/beacon-private/runs --acknowledge-recovery --services-stopped
```

最后一步必须所有 running 项已核对/隔离，才把 hold 移入不可覆盖的审计事件目录并
恢复新任务接入；uncertain 原任务仍不可再执行。工具不会将不确定结果伪装成功。
若孤立文件锁的原进程已经死亡，可执行：

```sh
node --experimental-strip-types scripts/research-operation-store.mjs unlock /srv/beacon-private/runs "全部 worker 已停；原锁持有进程死亡，开始人工核对" --services-stopped
```

仍活跃或 PID 被复用时拒绝释放。先留下 hold 与解锁事件，才移除锁文件（不移除收据）。
随后 verify、核对/隔离、acknowledge；禁止按锁年龄自动删除。若在认领或完成写入中
崩溃导致缺文件/`completed.tmp`/结果 anchor 冲突，工具保持冻结；保留全目录证据，
由维护者根据最新索引和提供方记录提出逐项恢复方案，不能通过删文件“修好”。
两份目录同时丢失、同时恢复为旧快照时，本机无法证明后续不存在新调用；禁止直接
init/启动服务。需要独立最新索引/离线证据与账单核对；目前没有自动灾难重建功能。

## 修改文件

| 文件 | 原因 |
| --- | --- |
| reviewer-access.ts | 从已验证 nonce 导出 owner HMAC |
| research-question.server.ts | 所有权先于重放、会话绑定签名、安全存储失败 |
| proxy.ts | 限制 Question 共享 Bearer |
| research-operation.server.ts | v2 收据、私有权限、原子锁/索引/容量、恢复冻结 |
| research-operation-maintenance.server.ts（新增） | 备份、恢复、核对、追加隔离 |
| scripts/research-operation-store.mjs（新增） | 零模型运维命令 |
| scripts/run-question-batch.mjs | 后续手动批次先初始化私有目录并登录隔离会话 |
| tests/research-operation-security.test.mjs（新增） | 17 项攻击与故障/CLI 测试 |
| tests/reviewer-audit-browser.test.mjs | 独立浏览器会话攻击、实际代理 Bearer 拒绝 |
| tests/question-test-helpers.mjs、request-security.test.mjs、reviewer-audit.test.mjs | 现有 mock 改为真实签名的合成 Cookie；保留原测试 |
| package.json、.gitignore、.env.example | CI 纳入新测试，索引不提交，运维约束 |
| question-workflow.tsx | 明示刷新、多 Tab、重新登录历史策略 |
| 本文、PROJECT_STATE.md、README.md | 记录修复证据与未验收的生产边界 |

## 验证结果与分类

测试均没有真实模型网络请求；API 传输测试标记 NOT-LIVE，公开 PDF 测试是真实
报告解析，不等于真实模型能力。S-07 原文、truth、首次输出和测试均未访问/执行。
冻结金融公式、Prompt 判断标准、提供方预算、敏感材料规则和专业关卡无改动。

| 检查 | 本地结果 |
| --- | --- |
| 完整 Web npm test | 132/132（含新增 17 项安全/恢复；未删除原测试） |
| 新攻击与持久性测试 | 17/17；owner/Bearer/userId/签名/重放/冲突/legacy/权限/容量/ENOSPC/跨进程/SIGKILL/备份/CLI/锁/回退 |
| TypeScript | 通过 |
| Lint | 0 error；4 个原有 unused 警告 |
| 生产构建 | 通过；提交后另作干净 SHA 构建收据核查 |
| 本地生产运行 smoke | 1/1；首次沙箱端口 EPERM，获准复跑通过 |
| 独立会话、刷新、多 Tab 浏览器 | 1/1；实际代理 Bearer 拒绝、模拟模型仅 2 请求 |
| S-05/S-06 真实 PDF 浏览器 | 通过上传→审核→冻结链→保存→刷新→回滚 |
| S-05/S-08 原有真实 PDF chain | 2/2；首次 DNS 沙箱失败，获准复跑通过 |
| 五个关键 Evidence/F-02/期间/推论/不可变历史 | 完整 Web 与真实 PDF/browser 回归通过 |
| Question 三意图浏览器 | 1/1，NOT-LIVE |
| 四视口 UI 浏览器 | 1/1，NOT-LIVE |
| 生产依赖漏洞审计 | 0 vulnerabilities |
| V5 migration | 77 文件未变 |
| GitHub CI | `19f1010` Web integration 通过；补充 ID 修复的新 head 另行核查，精确结果见交付记录 |
| 生产目录配置/实际权限/备份/重启/空间演练 | 未执行；未部署 |
| 新 Schema 真实提供方兼容性、引用/推论真实输出 | 未执行，0 次请求；mock 通过不能标 live 通过 |

首次失败保留：安全测试的故障夹具误放存储命名空间，已移到外部；浏览器夹具
读取草稿早于规划完成，已等待确认按钮；未删除测试。端口/DNS 沙箱失败与修复后
实际复跑分别记录。本地日志在 `/private/tmp/beacon-rc35-repair/`，远端 CI 保留工件。
本轮未重新运行会涉及 S-07 的广域 root regression；对应 scope job 绿灯/回归 skipped
必须分开报告。允许的 parser/layout/chain、五条 Evidence、F-02 已执行。

## 准入、生产接入与回滚

已验证修复：跨会话越权、Bearer 绕行、跨会话签名草稿、私有目录/索引恢复安全。
合理限制：会话不是账号、重新登录不接管、模糊计费结果人工隔离、周期备份非零 RPO。
建议延期：账号级历史恢复/服务端会话吊销、完整异地灾难恢复自动化、收据归档治理。
仍阻断生产：目标目录/备份未配置或演练、原审验窗口已截止、真实模型内容尚未验收。

本地技术条件支持进入**待负责人批准的**固定 SHA、有限真实模型测试；现有手动批次
仍最多 6 个提供方请求（三问题×plan/execute）、单请求 6000 输出 token/150 秒，
首失败即全批停止、无自动重试。新 runner 只在 localhost 创建随机访问会话与 30 分钟
隔离测试窗口，不改变生产窗口。不要把历史审批字符串当成本轮付费批准；本轮不
触发 workflow，未来执行前必须另报调用数、最大输入/输出预算与费用措施并获批准。
改写、范围外、原阻断针对性 live 方案如需额外请求须独立纳入同一次审批预算。
现有真实模型已验证能力：**本轮无新增**。

Merge 发布验收 **No-Go**：安全修复和普通 CI 可独立审阅，但 PR 原有新增 Schema 的
真实提供方兼容性及内容验收仍未执行。普通 CI 不能替代它们，也不是合并授权。
Deploy **No-Go**。部署前必须：同 UID 私有目录初始校验、共享本地盘/fsync 演练、
最新索引独立备份与故障恢复、目标 HTTPS 两个登录会话攻击/刷新/多 Tab/退出策略
复测、合规延长审验窗口另行批准、有限 live 三意图与改写/范围外/引用/推论/原阻断
复测、逐输出人审，专业关卡 EG-01/EG-02 仍按原要求待支持。

批准部署时先备份代码/配置及运行目录，暂停新 Question 接入，准备私有目录并核对
最新索引，再启用新 SHA；部署和验收不得覆盖历史。回滚应用保留 v2 全部收据和索引。
不得让旧版无 owner 的读取器重新公开 v2 结果：回滚到旧 reader 时必须继续阻断
Question 接口，待有 owner 校验的兼容版本再恢复。不能将代码回滚等同于收据回滚。
