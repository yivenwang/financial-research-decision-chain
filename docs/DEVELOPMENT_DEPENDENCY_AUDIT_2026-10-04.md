# 开发与构建依赖漏洞分类（2026-10-04）

本页记录 PR #30 lockfile 在 2026-10-04 npm advisory 快照下的可达性分类。没有运行 `npm audit fix`、强制升级、降级或自动改写 lockfile。

## 结论

- `npm audit --omit=dev`：生产依赖 **0** 个已知漏洞；20 个 high 均不在 `npm start` 使用的 Next 生产依赖图中。
- 完整 `npm audit`：26 项（20 high、5 moderate、1 low）。其中 high 为 6 个直接 dev 依赖和 14 个传递依赖；全部标记为 dev/tooling。
- 代码没有导入这些 high 项；当前 Next 部署不执行 `build:site`、Vite、Wrangler、Miniflare 或开发服务器。
- 没有 high 项是仅由测试框架引入；浏览器 CI 的 Playwright 是隔离安装，不在本 lockfile 审计结果中。
- 因此这些发现**不阻断 PR #30 合并**，但它们仍是 CI、开发机和未来 Sites/Cloudflare 构建的工具链风险。启用 `build:site` 或公开任何 dev server 前必须重新升级和验证。

## High 项分类

| 类别 | 包 | 可达性与处置 |
| --- | --- | --- |
| 直接 dev 工具 | `@cloudflare/vite-plugin`、`eslint-config-next`、`react-server-dom-webpack`、`vinext`、`vite`、`wrangler` | 6 个均不属于生产依赖。`eslint-config-next` 在 CI lint 执行；其余主要服务于未部署的 `build:site` / Cloudflare 路径。逐项兼容升级，不做自动降级。 |
| lint-only 传递项 | `@next/eslint-plugin-next`、`brace-expansion`、`js-yaml` | 由 ESLint / TypeScript ESLint 读取仓库配置或 glob；不处理线上请求。CI 仍应只运行受审代码，并后续升级上游。 |
| lint 与替代构建共享传递项 | `braces`、`browserslist`、`fast-glob`、`micromatch` | 由 ESLint、Webpack peer 或 Vinext glob 链引入；不在 Next runtime。恶意 glob / stats / build input 可影响开发或 CI，因此属于传递式工具链风险。 |
| Sites / Cloudflare 传递项 | `image-size`、`miniflare`、`sharp`、`undici`、`vite-plugin-commonjs`、`vite-plugin-dynamic-import`、`ws` | 仅从 Vinext、Wrangler、Miniflare 或 Cloudflare Vite 链进入。报告中的 vulnerable `sharp` 是 dev 链的 0.34.5；Next 的可选 0.35.5 节点不是该 high finding。当前生产不启动这些服务。 |

上述三类传递项共 14 个 high；加 6 个直接 dev high，与完整审计的 20 个 high 一致。

## 合并与后续条件

PR #30 的当前目标是修复 Next 生产访问边界，生产审计为 0，故开发工具 high 不单独阻断合并。后续依赖维护应使用小批次显式升级并分别验证 `npm run lint`、`npm run build` 和 `npm run build:site`；在该工作完成前，不把 Cloudflare / Vinext 构建链用于生产，也不向不可信网络开放 Vite、Wrangler、Miniflare 或相关开发服务。
