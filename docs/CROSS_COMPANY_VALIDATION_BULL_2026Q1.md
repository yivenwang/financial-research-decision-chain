# 公牛集团 2026Q1 跨公司盲测记录

状态：**基线已冻结；首次运行 FAIL（测试基础设施失败，parser 未执行）**。

## 选例

- 公司：公牛集团股份有限公司（603195.SH）。
- 材料：[公牛集团股份有限公司 2026 年第一季度报告](https://static.cninfo.com.cn/finalpage/2026-04-30/1225265153.PDF)。
- 原件 SHA-256：`38a09fe6b0c81e26a04207f9e0396f8e20c2d1d2e94b852946f67bf4b4a099e6`；155,979 bytes；PDF 1.7；12 页。
- 选择原因：这是既有协议锁定但从未实际执行的 holdout；仓库没有公牛集团 / 603195 的 parser fixture、映射、预期数值或运行产物。其上交所模板、页面布局以及国内电工产品和经销业务与安克的深交所模板、全球消费电子业务存在实质差异，同时仍披露当前 parser 所需的法定利润指标。

## 运行前冻结基线

- `main`：`3499889da8227fc5b5f8b148a286fc1c0c9d70d9`。
- parser：`V0.6-strict`；chain：`V0.1`。
- Memo Prompt：`research-update-v3-compact-1`；Memo contract：`research-memo-output.v2-compact`。
- Question capability：`anker-c04.v1`。
- 逐文件摘要和机器可读边界见 [`baseline.json`](../validation/cross-company/bull-group-2026q1/baseline.json)。

## 运行前预期边界

1. 现有 parser 接收注入的 `SourceMeta`，所以只允许运行隔离的 parser-only probe；正式 Source registry 仍只有安克材料。
2. `runC04Chain`、C-04、A-03、K-07、F-02、Valuation-B5、Decision 以及 Memo / Question 上下文都是安克研究语义，不得移植到公牛集团来制造闭环。
3. parser 放行最多只能得到 `PARSED_REVIEW_PENDING`，还必须独立核对页码、单位、本期/同期列、符号、同比和利润桥。
4. 首跑不调用模型、不注册公司、不形成投资判断、不修改冻结规则，也不读取或测试 S-07。

首次输出将单独追加保存；本段和机器基线不因后续修复或复跑而改写。

## 首次运行结果（永久保留）

- 结果：**FAIL**。
- 时间：2026-10-04T09:20:15.941Z 至 2026-10-04T09:20:17.007Z。
- 锁定执行提交：`21f48d3e91fd9531ce88f25f053d64aa3c00ddd4`；运行前工作树 clean；模型请求 0。
- 分类：**test infrastructure failure**。
- 现象：`run-transfer-probe.mjs` 抛出 `TypeError: doc.destroy is not a function`。
- 原因：脚本丢弃了 `PDFDocumentLoadingTask`，却在 `PDFDocumentProxy` 上调用 `destroy()`。锁定的 `pdfjs-dist` 6.3.289 在 loading task 上提供 `destroy()`，document proxy 只提供 `cleanup()`。
- 影响：异常发生在文本提取后的 `finally`，coordinates 尚未写盘，`parseFinancialReportV06Strict` 尚未调用；因此本次没有 parser 兼容性结论，也不得改记为材料或财务失败。
- 定性：这是 probe 生命周期管理 bug，不是缺配置、缺财务能力或有意 scope boundary。将销毁调用绑定到 loading task 不改变任何 parser、公式、阈值、Claim、Assumption、Kill Criteria、估值、Decision 或 Prompt，属于现有批准范围内的常规测试基础设施修复，不需要额外所有者批准。

原始字节见 `validation/cross-company/bull-group-2026q1/first-run/`；摘要见其中 `artifact-manifest.json`。后续修复后的运行只能称为第二次运行，不能改称盲测首跑。
