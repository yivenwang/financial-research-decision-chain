import type { Metadata } from "next";
import { BeaconShell } from "@/components/beacon/shell";
import styles from "@/components/beacon/suite.module.css";

export const metadata: Metadata = { title: "使用说明 · Beacon｜研灯", icons: { icon: "/beacon-mark.svg" } };

export default function HelpPage() {
  return <BeaconShell eyebrow="Guide & boundaries" title="开始之前，先把边界说清楚。" description="如何开始研究、保护记录，以及理解模型和人工审核的职责。这些说明描述当前版本，不代表未来能力已经实现。">
    <div className={styles.helpGrid}>
      <article className={`${styles.panel} ${styles.helpArticle}`}><p className={styles.eyebrow}>01 / START HERE</p><h2>从问题出发，也可以先准备材料</h2><p>在<a href="/questions">研究提问</a>中填写问题并生成研究任务，确认公司、期间、意图后才执行。如果缺少已审核材料，系统会停止并提示补充。</p><p>在<a href="/changes">变更审核</a>中上传可复制文字的 PDF（最大 25 MB），逐项核对证据、查看规则影响，再由人保存新版本。样例模式是教学合成数据，不是上传了真实财报。</p></article>
      <article className={`${styles.panel} ${styles.helpArticle}`}><p className={styles.eyebrow}>02 / LOCAL RECORDS</p><h2>记录仅保存在当前浏览器</h2><p>当前没有账号同步、团队共享或跨设备存储。清理浏览器网站数据、切换设备或使用无痕窗口，可能无法找到原来的记录。</p><p>建议在<a href="/versions">版本记录</a>导出研究材料和审核记录。回滚会追加一个新版本，不覆盖旧版本。读取异常时，不要通过清空数据“修复”。</p></article>
      <article className={`${styles.panel} ${styles.helpArticle}`}><p className={styles.eyebrow}>03 / MODEL ACCESS</p><h2>模型配置与访问码</h2><p>模型服务由部署者在服务端配置，访问码仅用于进入内部审验系统。不要把模型 API Key 填入问题、意见或公开文档。</p><p>生成研究任务与确认执行是两个独立动作；需要模型时各至多发起一次请求。失败不会自动重试。页面会明确显示服务未配置、缺少材料、范围外或阻断状态。</p></article>
      <article className={`${styles.panel} ${styles.helpArticle}`}><p className={styles.eyebrow}>04 / HUMAN JUDGEMENT</p><h2 id="professional-review">专业判断复核准备</h2><p>EG-01 由会计专业人员核对调整性质与 A-03；EG-02 由估值专业人员核对盈利口径、股本、倍数和情景。材料更新页只能完成事实核验，不能关闭专业门禁。</p><p>下一步：在<a href="/versions">版本记录</a>导出当前快照和完整版本库，附上<a href="/evidence">逐条证据来源</a>，按<a href="https://github.com/yivenwang/financial-research-decision-chain/blob/codex/pre-submission-finance-ui-rc/docs/PROFESSIONAL_REVIEW_PACKET_V0.1.md" target="_blank" rel="noreferrer">专业复核材料模板</a>填写专业意见并交项目负责人核验。当前页面不录入专业批准；专家签署和门禁更新仍须单独支持与审核。</p><h3>通过测试，不等于专业认可</h3><ul><li>当前问题范围为安克创新 / S-05 / 2026Q1 / C-04；S-06 仅供独立回归演示。</li><li>EG-01 / EG-02 仍待真实专业复核。人工审核人由本机自行填写，身份未经服务端验证。</li><li>规则影响节点不等于任意版本的逐字段差分。V-01 只是研究基线，不代表解析过完整年度财报。</li><li>保存研究版本不是交易指令；系统不会自动下单或给出正式投资建议。</li></ul></article>
    </div>
  </BeaconShell>;
}
