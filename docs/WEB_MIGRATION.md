# V5 网页迁入 GitHub

日期：2026-09-05。开发基线：`cf1516d9b4b0dc3fa5a2e082f0cc9e5d19ebdfc1`。

## 本次完成的范围

原始完整源码 ZIP 的 SHA-256 为 `ed26da236bac068e0c08341f686c2fca416bcb1777849fa62285f08018137ec0`，与 `snapshots/site-v5-manifest.json` 相符，共 105 个文件。

将实际网页代码、全部原有 UI 组件、样式、静态资源、V5 解析器、版本管理和 fixture 测试迁入 `apps/web/`。保留原有页面结构、业务定义和数据。主线根目录的 Parser V0.6 与 Chain V0.1 文件保持不变。

运行命令改用源码包已声明的 Next.js 16.2.6。依赖版本与全部 lockfile 解析记录保留。未增加框架依赖，未将已合并引擎替换为旧版本。

PDF.js 的 Vite 专用 `?url` 导入改为同源静态 worker。`predev` 和 `prebuild` 从本应用安装的同一份 `pdfjs-dist` 拷贝 worker，避免主程序和 worker 版本错配。生成文件不提交，构建时再生成。

排除原 Site 的身份配置、部署脚本、Cloudflare Worker/D1 示例和未使用的 ChatGPT 认证辅助代码；这些文件的完整名单保存在 `snapshots/web-v5-migration.json`。原始 ZIP 的身份与内容不变。这份 GitHub 网页没有 Sites 的部署或登录依赖。

## 验证口径

1. 原 V5 的三项 fixture 测试：S-05、S-06、缺失/不一致数据阻断。
2. 哈希核对：未适配的原始文件保持字节一致；适配项逐一记录原因。
3. GitHub `Web app migration`：干净安装、Next.js 生产构建、HTML/CSS/同版本 PDF worker HTTP 检查。

这些检查不等于真实浏览器上传 PDF 的端到端验收，不等于视觉验收，也不表示主线决策链已经接入网页。对应状态见实际 Actions 结果。下个引擎集成 PR 应补充真实入口、证据、Graph Diff、保存与回滚验收。

现有引擎工作流增加变更范围判断：PR 只有触及根目录 `lib/`、`tests/`、依赖清单或 Chain 业务规格时才运行原引擎测试；原有开发分支 push 仍执行原流程。网页迁移使用独立工作流，不触发包含冻结 S-07 的历史回归。工作流本身的变更需要审阅，不能将跳过的引擎任务声称为测试通过。

迁移清单是本次来源证明。后续修改原 UI 文件时，应将该文件从 `unchanged_files` 移到 `adapted_files`，保留原始哈希并说明原因；不得以更新哈希掩盖未审阅的业务变更。

## 历史和运行数据

源代码中的历史报告、版本结构与本地存储键均保留。浏览器 localStorage 受域名限制，GitHub 中的源码不能自动带走旧 Site 域名下的用户数据。需要迁移实际历史数据时，应先实现并验收版本导出/导入，再切换正式演示入口。

旧 Site 生产/保存版本仍以其原记录为准，本次未保存或部署 Site。网页发布和仓库公开各有独立动作，本次只提交 GitHub 分支与 PR。

技术依据：[Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next)、[PDF.js worker 配置示例](https://mozilla.github.io/pdf.js/examples/)。
