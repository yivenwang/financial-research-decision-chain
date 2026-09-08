# Financial Research Decision Chain

面向金融人工智能比赛的可追溯研究更新原型。新材料进入后，解释哪些论点受到影响、哪些假设需要复核，以及变化如何传到计算和人工决策，并保留证据与版本。

`Source → Evidence → Claim → Assumption / Kill Criteria → Formula → Valuation → Decision → Human Review → Version`

安克创新是首个验证案例。项目的验收对象是完整研究更新流程，而非对一家公司的报表适配数量。

当前已实现与尚待验证的范围见 [系统方向与案例边界](docs/SYSTEM_SCOPE.md)。模型输入和自动传播仍限定安克 / C-04，跨公司适用性尚未验收。

## 在 GitHub 开发

GitHub 是代码、修改记录和评测记录的主入口。开发使用分支和 PR；网页预览与正式发布分别记录。旧 Site V5 是迁移来源，后续修改在本仓库进行。

| 位置 | 内容与范围 |
| --- | --- |
| `apps/web/` | 从完整 V5 源码迁入的网页；使用独立 Next.js 运行命令 |
| `lib/`、`tests/` | 主线 Parser V0.6 和 Chain V0.1 引擎及历史回归 |
| `docs/` | 冻结说明、参赛计划与 UI 验收安排 |
| `snapshots/` | 原始源码与迁移校验记录 |

网页已通过 [PR #12](https://github.com/yivenwang/financial-research-decision-chain/pull/12) 接入根目录 Parser V0.6 Strict 与 Chain V0.1，并完成真实 S-05 / S-06 上传至保存、回滚验收。新增模型备忘录接口、引用校验、人工审核和导出；[PR #14](https://github.com/yivenwang/financial-research-decision-chain/pull/14) 接入默认 DeepSeek V4 Pro，保留 OpenAI 对照选项；**真实 DeepSeek S-05 技术闭环已通过**：[24 项普通 CI](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34140531680) 与[第 5 次真实验收](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/34142444878) 均成功，备忘录的研究质量及 EG-01 / EG-02 仍待人工专业复核。见 [模型备忘录](docs/RESEARCH_MEMO_V0.1.md) 与 [网页引擎接入](docs/WEB_ENGINE_V0.1.md)。旧盲测失败报告保留为历史。

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

## 已核实进度（2026-09-08）

| 项目 | 状态 |
| --- | --- |
| Parser V0.6 | 已合并；见 [冻结记录](docs/V0.6_FREEZE.md) |
| Chain V0.1 | 已合并，仅覆盖 C-04 及关联传播；见 [冻结记录](docs/CHAIN_V0.1_FREEZE.md) |
| Parser V0.7 | `dev/v0.7-adjusted-label` 待修复；[S-10 新回归失败记录](https://github.com/yivenwang/financial-research-decision-chain/actions/runs/33939654582) |
| 网页 | PR #12 已合并；真实 S-05 / S-06 上传、审核、保存、回滚通过 |
| 模型备忘录 | PR #14 的旧 Prompt 真实 S-05 技术验收通过；[原文初审](docs/MEMO_CONTENT_REVIEW_2026-09-08.md)建议修订。[判断表达 V0.2](docs/MEMO_PROMPT_V0.2.md)的第 6 次真实运行失败；[获批恢复调整](docs/MEMO_LIVE_RUN_6_DIAGNOSIS.md)已实现，DeepSeek 为 6,000 token / 150 秒，补充中断诊断，本地 23 项测试通过。当前 CI 见 [PR #16](https://github.com/yivenwang/financial-research-decision-chain/pull/16)，新真实输出及专业复核待完成 |
| UI | 保留原布局；与用户一起优化的时点和标准已列入 [UI 验收](docs/UI_ACCEPTANCE.md) |
| 参赛整合 | [演示脚本 V0.1](docs/COMPETITION_DEMO_SCRIPT_V0.1.md)已整理，待 UI 共同评审、预演与录制；见 [参赛路线图](docs/COMPETITION_ROADMAP.md) |

产品命名正在共同讨论，首选建议及备选见 [命名候选](docs/NAMING_CANDIDATES.md)。

## 变更边界

项目所有者于 2026-09-07 要求：每个新阶段先提案并获批；核心逻辑变更须说明改前/改后及影响并获得确认。PR #14 的接入收尾、测试、文档同步和验收通过后合并已获批，见 [协作约定](AGENTS.md)。

2026-09-08 的真实备忘录审阅与演示脚本已由 PR #15 合并。所有者随后批准修订模型指令中的假设状态和归因要求，并复核一次新真实输出；财务规则、专业关卡和人工决策边界保持原定义。其他核心改动仍须先确认。

- Claims、Assumptions、Kill Criteria、Formula、Valuation、Decision 的业务定义不能为了测试通过而修改。
- 保留已有版本、首次盲测失败与回滚记录；回归通过不能改写首次盲测结果。
- 本轮继续遵守 S-07 冻结限制，不读取原始材料、真值或首次输出，不运行相关测试。历史冻结文档中的测试记载不构成本轮授权。
- 财务计算使用确定性代码；模型判断需要证据；专业关卡未关闭时不发布正式投资建议。
- 当前仓库为 private。公开后 Star 可反映关注度；评测、可运行演示和贡献记录承担作品能力证明。Star 数不是准确率或用户采用率。
