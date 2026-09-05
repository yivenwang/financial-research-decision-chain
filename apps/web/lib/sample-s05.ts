import type { PdfTextItem } from "./research-engine.ts";

// Reviewed values from official S-05, P2–P3. Coordinates are a synthetic
// teaching fixture, not a claim that the PDF upload path was executed.
// https://static.cninfo.com.cn/finalpage/2026-04-30/1225260221.PDF
const row = (label: string, current: string, comparison: string, change: string, y: number): PdfTextItem[] => [
  { str: label, x: 80, y, page: 2 },
  { str: current, x: 390, y, page: 2 },
  { str: comparison, x: 550, y, page: 2 },
  { str: change, x: 710, y, page: 2 },
];
export const verifiedSampleItems: PdfTextItem[] = [
  ...row("项目", "本报告期", "上年同期", "本报告期比上年同期增减（%）", 700),
  ...row("营业收入（元）", "7,607,645,545.67", "5,993,381,106.11", "26.93%", 665),
  ...row("归属于上市公司股东的净利润（元）", "471,594,189.71", "495,761,205.29", "-4.87%", 630),
  ...row("归属于上市公司股东的扣除非经常性损益的净利润（元）", "546,758,896.90", "439,558,407.22", "24.39%", 595),
  ...row("经营活动产生的现金流量净额（元）", "-450,631,808.74", "-287,656,970.90", "-56.66%", 560),
  ...row("基本每股收益（元/股）", "0.8796", "0.9329", "-5.71%", 525),
  ...row("稀释每股收益（元/股）", "0.8714", "0.9312", "-6.42%", 490),
  ...row("加权平均净资产收益率", "4.35%", "5.41%", "-1.06%", 455),
  ...row("总资产（元）", "20,228,357,751.74", "20,066,892,453.86", "0.80%", 420),
  ...row("归属于上市公司股东的所有者权益（元）", "11,170,909,982.81", "10,527,603,265.38", "6.11%", 385),
  { str: "（二）非经常性损益项目和金额", x: 80, y: 300, page: 2 },
  { str: "合计", x: 80, y: 700, page: 3 },
  { str: "-75,164,707.19", x: 420, y: 700, page: 3 },
];
