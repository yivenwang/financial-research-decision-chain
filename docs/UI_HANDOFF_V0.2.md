# Beacon｜研灯 UI 接入基线 V0.2

日期：2026-09-20。继承已批准的浅色研究工作台方向；此文件完成数据交接，不是视觉定稿。旧 [V0.1 对应表](UI_DATA_STATE_MAP_V0.1.md)继续提供材料、Memo、修订字段细节。

| 设计页面 | 可复用的代码 / 数据 | 当前能支持 | 必须标出的缺口 |
| --- | --- | --- | --- |
| Ask / Home | `/questions`、`ResearchContract`、`QuestionRun.status` | 聚焦研究问题的输入、三意图、能力边界、先确认后执行 | 不是任意公司/行业的聊天入口；视觉首屏待定 |
| Research Workspace | `ResearchVersion`、`UpdateWorkflow`、版本库 | PDF → 候选证据 → 人工审核 → 固定传播 → 快照 | localStorage；无跨设备、账号或团队共享 |
| Change Review | `answer.evidence.graphDiff`、`chain`、`formula`、`blockedGates` | 冻结路径、规则信号、计算及影响说明 | `changedNodeIds` 不等于逐字段 old/new diff；不得补造旧值或真实变化比例 |
| Evidence Inspector | `evidence[]`、`MemoContext.references`、来源页码 | 原始/审核值、期间单位、引用、反证、PDF 定位 | 侧栏的最终布局待接；服务端未独立鉴证 PDF 字节或审核身份 |
| Version / Commit | `VersionHistory`、`MemoRevision`、各类 review、导出 | 独立审核、追加版本、回滚、Markdown / JSON | Commit 是研究记录，不是正式投资决定；问题答案目前可接受/退回，不能套用 Memo 的人工改稿能力 |
| Mobile Companion | 已有导出/说明素材可用于设计 | 计划承载简介、回放、反馈 | 当前没有完整移动工作台；现场只展示已实现交互 |

导航使用 Workspace 表达研究空间；避免默认七列铺满、主观 A/B 分级、浮动全局聊天和按个人投资偏好自动改判断。Research Health 若保留，应展示有出处的阻断/待审事项；当前没有可直接连接的综合可信分数。

## 问题入口状态契约

| 后端 / 本地状态 | 显示含义 | 下一动作 |
| --- | --- | --- |
| `CONTRACT_DRAFTED` | 公司、期间、意图与材料范围待确认 | 确认执行或重新输入；不能偷偷发第二次请求 |
| `MATERIALS_REQUIRED` | 尚无符合要求的已审核快照 | 进入材料工作流；保留问题 |
| `OUT_OF_SCOPE` | 当前能力范围不支持 | 展示具体边界；不生成看似成功的答案 |
| `BLOCKED` | 结构、证据、模型或校验失败 | 显示留档原因；不自动重试 |
| `ANSWER_READY` | 结构校验通过、内容待人工审核 | 查事实/反证/引用，接受或退回研究草稿 |
| `PARTIAL` | 明确证据不足的部分回答 | 展示缺口，不升级成完整结论 |
| 存储 / 快照绑定失败 | 保存或审核没有完成 | 保留当前数据，核对版本；不清库修复 |

每个页面显示同一份公司、期间、versionId、snapshotSha256 与审核状态。V-01 基线不可画成已全文解析的年度财报；同名 V-02 的不同快照也不能混合。同比为 2026Q1 对 2025Q1。

## 最终设计交付与实现验收

交付五页桌面与 Mobile Companion 的布局、字体颜色、组件和空/加载/失败/缺材料/待审状态；可直接提供 Figma 链接或设计文件。拿到定稿后复用现有接口，不重写冻结引擎。验收以真实 S-05 上传、问题确认执行、来源核查、内容审核、导出及刷新回读为主，另核对阻断与窄屏；截图只记录实际运行版本。专业 pending、年化占位与正式建议为空须在 UI 中保留。
