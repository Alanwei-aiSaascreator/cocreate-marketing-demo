"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

/** 对 AI 产出不满意时，一键换一版活动框架 */
export function RerunButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function rerun() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/merchant/campaigns/${campaignId}/rerun`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "重新生成失败");
        return;
      }
      setMsg(
        `${data.aiMode === "llm" ? "大模型" : "规则引擎"}重新生成完成（${(data.elapsedMs / 1000).toFixed(1)}s）`,
      );
      router.refresh();
    } catch {
      setMsg("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={rerun} disabled={busy} className="btn btn-ghost text-xs">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {busy ? "生成中…" : "重新生成框架"}
      </button>
      {msg && <span className="text-xs text-ink-500">{msg}</span>}
    </span>
  );
}
