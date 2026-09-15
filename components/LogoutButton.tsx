"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/** 退出只清 cookie，不校验口令 —— 否则口令输错的人会被困在后台里 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/merchant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      router.replace("/merchant/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={logout} disabled={busy} className="btn btn-ghost text-xs">
      <LogOut className="h-3.5 w-3.5" />
      {busy ? "退出中…" : "退出"}
    </button>
  );
}
