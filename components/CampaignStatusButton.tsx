"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Play } from "lucide-react";

/**
 * 开启 / 结束活动。
 * 结束不删除任何数据，只影响"老客能不能继续提交"。
 */
export function CampaignStatusButton({
  campaignId,
  status,
}: {
  campaignId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const closing = status === "active";

  async function toggle() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch(`/api/merchant/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: closing ? "closed" : "active" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "操作失败");
        return;
      }
      setMsg(data.message ?? "");
      router.refresh();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={closing ? "btn btn-ghost text-xs" : "btn btn-primary text-xs"}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : closing ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {busy ? "处理中…" : closing ? "结束活动" : "重新开启"}
      </button>
      {(msg || error) && (
        <span className={`text-xs ${error ? "text-red-600" : "text-ink-500"}`}>
          {error || msg}
        </span>
      )}
    </span>
  );
}
