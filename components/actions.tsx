"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Ticket, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy} className="btn btn-ghost !px-2.5 !py-1.5 text-xs">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "已复制" : label}
    </button>
  );
}

/** 采用 / 撤销采用：直接决定老客能不能拿到「被采用 +30」那一档 */
export function AdoptButton({
  submissionId,
  adopted,
  compact = false,
}: {
  submissionId: string;
  adopted: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/merchant/submissions/${submissionId}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adopted: !adopted }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "操作失败");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("网络异常");
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={cn(
          "btn",
          adopted ? "btn-ghost" : "btn-primary",
          compact && "!px-2.5 !py-1.5 text-xs",
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : adopted ? (
          <Undo2 className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {adopted ? "撤销采用" : "采用这条内容"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** 到店核销 */
export function RedeemButton({
  rewardId,
  status,
}: {
  rewardId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (status === "redeemed") {
    return <span className="text-xs text-ink-400">已核销</span>;
  }
  if (status === "expired") {
    return <span className="text-xs text-ink-400">已失效</span>;
  }

  async function redeem() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/merchant/rewards/${rewardId}/redeem`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "核销失败");
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={redeem}
        disabled={busy}
        className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
        核销
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
