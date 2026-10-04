# 公牛集团 2026Q1 跨公司盲测记录

状态：**基线已冻结，首次运行尚未执行**。

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
