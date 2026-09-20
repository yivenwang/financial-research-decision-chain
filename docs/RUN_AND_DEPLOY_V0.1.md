# 运行与部署方案 V0.1

核对日期：2026-09-14；状态更新：2026-09-16。PR #22 与 #23 已合并到 `main`；本方案未选择付费平台、创建线上服务或修改密钥。应用的 Node.js / Next.js 运行方式及合并后主分支回归已通过；部署平台的实际限制需在选定后核对。

## 三种用途

| 用途 | 运行入口 | 模型与数据行为 |
| --- | --- | --- |
| 只读历史回放 | [离线核对包](DEMO_REPLAY_V0.1.md)的 `index.html` | 展示已归档三份真实输出与决定前的核对建议；当前所有者确认另有 GitHub 绑定记录，不联网生成，不写浏览器版本库 |
| 本地产品操作 | 下列 Node.js 启动命令 | 可以走材料/证据/保存/回滚；模型服务未配置时不能生成。教学样例为合成坐标，不能冒充真实上传 |
| 受控现场真实生成 | 同一应用加服务端环境配置 | 每次由演示者主动发起一次请求；原始返回、失败和内容复核均记录。新的真实调用按实际彩排计划另行批准 |

## 从 GitHub 启动

检出已核验的 `main` 或指定发布提交；人工修订和非视觉收尾均已进入主分支。

```bash
git clone https://github.com/yivenwang/financial-research-decision-chain.git
cd financial-research-decision-chain
git switch main
cd apps/web
npm ci --no-audit --no-fund
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

使用 CI 基线 Node.js 22.16.0 或满足项目要求的 Node 22；浏览器打开 `http://127.0.0.1:3000`。没有真实服务端密钥时，模型配置状态应为未配置；可以核对其他流程及离线回放。保留当前浏览器数据；正式预演使用独立浏览器配置，避免清除已有研究记录。

`npm test` 是 `apps/web` 的定向测试入口；`npm run test:runtime` 校验生产 HTML、CSS、PDF worker。不要执行会读取本轮禁止材料的根目录全量历史测试。主分支已通过人工修订的 42 项验收、非视觉工具独立检查及合并后构建/浏览器回归。

## 服务端配置表

| 变量 | 当前用途与要求 |
| --- | --- |
| `MODEL_PROVIDER` | 当前使用 `deepseek`；不在本轮切换提供方 |
| `DEEPSEEK_API_KEY` | 仅配置在实际运行服务的服务端环境中，不填入浏览器或公开文件 |
| `DEEPSEEK_MODEL` | 当前已核验配置 `deepseek-v4-pro` |
| `RESEARCH_DEMO_TOKEN` | 至少 16 字符；与提供方密钥不同，是受控演示的访问码，不公开写进前端 |
| `RESEARCH_APP_ORIGIN` | 代理部署时设为应用的准确 origin，例如 `https://<已确认域名>`；不带路径或末尾斜杠 |

现有 GitHub Actions Secret 供工作流显式引用；它没有自动配置一个独立的运行服务器。服务端部署仍需设置对应环境变量。不要向所有者索要明文密钥，也不要打印环境值。[GitHub 官方说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

`GET /api/research-memo` 仅返回 configured、provider、model，可作不计费配置检查。POST 才可能调用提供方；因此本轮不以 POST 做部署探活。密钥变量不能使用 `NEXT_PUBLIC_` 前缀；该前缀会使值进入浏览器构建产物。[Next.js 环境变量说明](https://nextjs.org/docs/app/guides/self-hosting#environment-variables)

## 已识别的发布条件

1. **运行平台须支持 Node 服务端路由。** 本应用的 POST 生成逻辑在服务器执行，不能只上传一份静态页面替代服务。
2. **时限必须核对。** `app/api/research-memo/route.ts` 当前声明 `maxDuration = 120`，而提供方请求的中止上限为 150 秒。`maxDuration` 由部署平台使用；若平台按 120 秒终止，就存在早于本应用超时处理截断的风险。发布方案需选择能支持现有调用预算的运行方式，并核对路由/代理处理窗口；建议为 150 秒请求另留处理余量，目标至少 180 秒。这里的 180 秒是部署处理窗口提案，不提高模型的 150 秒请求上限或 token 额度。[Next.js 路由配置](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
3. **代理与 origin 一致。** 公开部署采用 HTTPS，正确设置 origin；在实际地址检查来源拒绝/配置状态。Web Locks 需要安全上下文，人工修订在本机 localhost 可验收。
4. **受控演示与公开互动分开。** 现有访问码和进程内 in-flight 守卫不构成多用户配额/并发系统。观众二维码优先用于简介、演示回放和反馈提案；面向公众开放真实付费生成需另行设计授权与配额。
5. **历史保存在浏览器。** 换域名/设备不会自动迁移研究库，导出是当前已有交接方式；没有多用户同步、账号认证或原生归档导入入口。

拟采用“GitHub 源码 → 审阅通过的提交 → 长驻 Node 服务 → HTTPS 入口”的部署路径，平台/域名/费用待所有者选择。Next.js 官方支持自托管并建议前置反向代理；需依据选定服务商核实时限和配置，不能据本地成功声称已经上线。[自托管说明](https://nextjs.org/docs/app/guides/self-hosting)

## 部署前后的验收记录

| 项目 | 本轮状态 | 发布时需要的证据 |
| --- | --- | --- |
| 源码与运行版本 | PR #22、#23 已合并，主分支构建/浏览器证据通过 | 记录实际部署的 SHA |
| 原文案/人工修订/回滚 | 已有自动化验收 | 在目标 origin 实际操作并导出核对 |
| 服务配置 GET | 方案已给出，不调用模型 | 只保存 configured/provider/model，不能保存密钥 |
| 时限及 HTTPS/origin | 上述条件待实际平台核对 | 平台设置和受控预演结果；若失败先修复，不反复生成碰运气 |
| 正式内容审核 | 三份准确建议版本已获所有者确认；未写入三个独立浏览器台账 | 现场按产品流程录入、审核并导出核对准确版本 |
| 现场失联/调用失败 | 离线回放包已准备 | 人工切换并显著标注历史回放，不伪装新生成 |

本轮没有实施平台修改、部署或新付费调用。平台选择后的必要配置变更可在明确部署任务中一并完成；改变调用预算、Prompt 或业务判断另行同步。
