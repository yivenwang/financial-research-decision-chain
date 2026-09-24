import { HomeEntry } from "@/components/beacon/home-entry";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beacon｜研灯 · 让研究变化有据可循",
  description: "从问题出发，核对证据和变化，保留人工审核与研究版本。当前验证范围：安克创新 2026Q1。",
  icons: { icon: "/beacon-mark.svg", shortcut: "/beacon-mark.svg" },
};

export default function Home() {
  return <HomeEntry />;
}
