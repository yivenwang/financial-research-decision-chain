import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const lockBytes = await readFile(resolve(root, "package-lock.json"));
const lock = JSON.parse(lockBytes); const pkg = JSON.parse(await readFile(resolve(root, "package.json")));
const dependencies = Object.entries(lock.packages).filter(([path]) => path).map(([path, p]) => ({ path,
  version: p.version ?? null, license: p.license ?? "REVIEW_REQUIRED", source: p.resolved ?? null,
  integrity: p.integrity ?? null, development: p.dev === true, optional: p.optional === true }));
const out = resolve(root, "artifacts-release"); await mkdir(out, { recursive: true });
await writeFile(resolve(out, "dependency-inventory.json"), JSON.stringify({ schemaVersion: "dependency-inventory.v1",
  packageLockSha256: createHash("sha256").update(lockBytes).digest("hex"), dependencies,
  limitation: "Lockfile declarations; not a legal clearance or proof that every declared package ships in the application." }, null, 2));
if (process.argv.includes("--write-doc")) {
  const lines = ["# 第三方与依赖清单", "", "生成依据：apps/web/package-lock.json。下表是直接声明依赖，不代表每个包均被运行路径使用。完整传递依赖、来源、版本、integrity 与声明许可证由 CI 保存为 artifacts-release/dependency-inventory.json；未知许可证保持 REVIEW_REQUIRED。", "",
    "| 名称 | 锁定版本 | 声明许可证 | 来源 | 使用范围 |", "| --- | --- | --- | --- | --- |"];
  for (const [name, kind] of [...Object.keys(pkg.dependencies).map(n => [n, "应用/继承 UI 依赖；实际调用以源码为准"]), ...Object.keys(pkg.devDependencies).map(n => [n, "开发/构建声明；不表示部署启用"])] .sort(([a], [b]) => a.localeCompare(b))) {
    const p = lock.packages[`node_modules/${name}`];
    lines.push(`| ${name} | ${p?.version ?? "REVIEW_REQUIRED"} | ${p?.license ?? "REVIEW_REQUIRED"} | [npm 包](https://www.npmjs.com/package/${name}) | ${kind} |`);
  }
  lines.push("", "核心实际用途：Next.js 为应用与服务端路由，React 为界面，pdfjs-dist 为 PDF 文本/坐标解析，TypeScript 为类型与构建。Playwright 1.62.1 由 CI 单独安装用于浏览器验收，不是生产模型。工具版本与用法见工作流。", "",
    "模型：DeepSeek V4 Pro，商业托管 Responses API；任务规划、证据约束解释及 Memo，不再分发模型权重。模型服务条款独立于本仓库 Apache-2.0。OpenAI 路径为已有可配置提供方，本批固定使用 DeepSeek。", "",
    "可选实验：@typesafe-ai/sdk 0.6.0（MIT）用于独立 Jev 审查，未接入正式路由；TypeSafe 托管服务条款独立适用。Promptfoo 0.123.1 通过固定版本 npx 运行合成离线判定回放，不在应用锁文件内；其依赖不包含在上述应用清单。正式分发评测工具前须另行保存其完整依赖与许可证。", "",
    "数据：安克创新 S-05 / S-06 法定披露报告，原始链接和期间见 source-records.ts。公开披露不等于可把原件或第三方内容统一重许可为本项目 Apache-2.0。", "",
    "现有 UI 导出及迁移归属见 docs/WEB_MIGRATION.md；保留 apps/web/vendor/shadcn-tailwind-4.13.0.LICENSE.md。研究链、任务合同、审核与验收编排的本项目改动依仓库许可证管理。AutoResearch 文章仅为设计讨论背景，本轮没有引入其代码或声称复现其实验成绩。", "",
    "提交前按实际锁文件重生成清单，并随完整源码保留各第三方必需的许可证/NOTICE。上述清单记录来源，不替代逐项许可证合规审查。", "");
  await writeFile(resolve(root, "../../docs/THIRD_PARTY_INVENTORY.md"), lines.join("\n"));
}
console.log(JSON.stringify({ declaredPackages: dependencies.length, missingLicense: dependencies.filter(p => p.license === "REVIEW_REQUIRED").length, modelRequests: 0 }));
