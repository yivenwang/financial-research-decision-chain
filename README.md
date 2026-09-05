# Financial Research Decision Chain

面向金融人工智能比赛的可追溯研究更新原型。新材料进入后，解释哪些论点受到影响、哪些假设需要复核，以及变化如何传到计算和人工决策，并保留证据与版本。

`Source → Evidence → Claim → Assumption / Kill Criteria → Formula → Valuation → Decision → Human Review → Version`

安克创新是首个验证案例。项目的验收对象是完整研究更新流程，而非对一家公司的报表适配数量。

## 在 GitHub 开发

GitHub 是代码、修改记录和评测记录的主入口。开发使用分支和 PR；网页预览与正式发布分别记录。旧 Site V5 是迁移来源，后续修改在本仓库进行。

| 位置 | 内容与范围 |
| --- | --- |
| `apps/web/` | 从完整 V5 源码迁入的网页；使用独立 Next.js 运行命令 |
| `lib/`、`tests/` | 主线 Parser V0.6 和 Chain V0.1 引擎及历史回归 |
| `docs/` | 冻结说明、参赛计划与 UI 验收安排 |
| `snapshots/` | 原始源码与迁移校验记录 |

**网页迁移与引擎集成是两个里程碑。** 当前网页保留 V5 界面和其 Parser V0.4 基线；尚未接入根目录 Parser V0.6、Chain V0.1 或真实模型调用。网页中的旧盲测失败记录保留为历史，不能用来判断整个仓库的最新进度。

## 运行网页

Node.js 22.16.0（CI 版本）或兼容的 Node 22 版本：

```bash
cd apps/web
npm ci
npm run dev
```

生产构建与迁移验证：

```bash
cd apps/web
npm test
npm run build
npm run test:runtime
npm start
```

开发页面默认位于 `http://localhost:3000`。PDF 在浏览器中读取；研究版本沿用设备本地存储。不同域名的浏览器历史不会自动迁移；源码 ZIP 不包含用户浏览器里的版本数据。

更多范围说明见 [网页迁移说明](docs/WEB_MIGRATION.md)。

## 已核实进度（2026-09-05）

| 项目 | 状态 |
| --- | --- |
| Parser V0.6 | 已合并；见 [冻结记录](docs/V0.6_FREEZE.md) |
| Chain V0.1 | 已合并，仅覆盖 C-04 及关联传播；见 [冻结记录](docs/CHAIN_V0.1_FREEZE.md) |
| Parser V0.7 | `dev/v0.7-adjusted-label` 待修复；[S-10 新回归失败记录](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/33939654582) |
| 网页 | 本次迁入 V5 源码基线；最新引擎、模型与完整任务演示待集成 |
| UI | 保留原布局；与用户一起优化的时点和标准已列入 [UI 验收](docs/UI_ACCEPTANCE.md) |
| 参赛整合 | 见 [参赛路线图](docs/COMPETITION_ROADMAP.md) |

## 变更边界

- Claims、Assumptions、Kill Criteria、Formula、Valuation、Decision 的业务定义不能为了测试通过而修改。
- 保留已有版本、首次盲测失败与回滚记录；回归通过不能改写首次盲测结果。
- 本轮继续遵守 S-07 冻结限制，不读取原始材料、真值或首次输出，不运行相关测试。历史冻结文档中的测试记载不构成本轮授权。
- 财务计算使用确定性代码；模型判断需要证据；专业关卡未关闭时不发布正式投资建议。
- 当前仓库为 private。公开后 Star 可反映关注度；评测、可运行演示和贡献记录承担作品能力证明。Star 数不是准确率或用户采用率。
