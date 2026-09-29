"use client";

import { usePathname } from "next/navigation";
import { CircleHelp, FileSearch, GitCompareArrows, History, House, MessageCircleQuestion, PanelsTopLeft } from "lucide-react";
import styles from "./suite.module.css";

const nav = [
  { href: "/workspace", label: "研究概览", icon: PanelsTopLeft, n: "01" },
  { href: "/questions", label: "研究提问", icon: MessageCircleQuestion, n: "02" },
  { href: "/changes", label: "变更审核", icon: GitCompareArrows, n: "03" },
  { href: "/evidence", label: "证据核验", icon: FileSearch, n: "04" },
  { href: "/versions", label: "版本记录", icon: History, n: "05" },
  { href: "/help", label: "使用说明", icon: CircleHelp, n: "06" },
  { href: "/", label: "品牌首页", icon: House, n: "↗" },
];
export function BeaconNavigation() {
  const pathname = usePathname();
  return <nav aria-label="产品导航" className={styles.nav}>{nav.map(({ href, label, icon: Icon, n }) => <a key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={styles.navLink}><Icon aria-hidden="true" />{label}<small>{n}</small></a>)}</nav>;
}
