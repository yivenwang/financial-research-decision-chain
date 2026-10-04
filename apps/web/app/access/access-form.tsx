"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeReviewReturnPath } from "@/lib/review-security";

export function AccessForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "暂时无法进入系统。");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(safeReviewReturnPath(next, window.location.origin));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法进入系统。"); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-8 space-y-4">
    <label className="block space-y-2 text-sm text-slate-300"><span>审验访问码</span><Input aria-label="审验访问码" type="password" autoComplete="current-password" value={code} onChange={(event) => setCode(event.target.value)} autoFocus /></label>
    <Button type="submit" disabled={busy || code.length < 16} className="w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"><LockKeyhole />{busy ? "正在验证" : "进入 Beacon"}</Button>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </form>;
}
