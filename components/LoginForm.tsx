"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

/**
 * 商家口令页。
 * 只在部署设置了 MERCHANT_PASSWORD 时才会被 middleware 拦到这里。
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/merchant";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/merchant/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "验证失败");
        return;
      }
      // 用 replace 而不是 push：避免用户按返回键又回到口令页
      router.replace(next);
      router.refresh();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto mt-16 max-w-sm p-6">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-brand-500" />
        <h1 className="text-base font-semibold text-ink-900">商家后台</h1>
      </div>
      <p className="hint mt-1.5">
        本部署设置了 <code className="rounded bg-ink-100 px-1">MERCHANT_PASSWORD</code>，
        需要先验证口令才能访问商家工作台。
      </p>

      <label className="label mt-5">口令</label>
      <input
        className="field"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="请输入商家口令"
        autoFocus
      />

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <button type="submit" disabled={!password.trim() || busy} className="btn btn-primary mt-4 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {busy ? "验证中…" : "进入后台"}
      </button>

      <p className="hint mt-3">
        这是 Demo 的最简保护，能挡住「随手一个 curl 就核销别人的券」。
        生产环境还需要商家账号体系、资源归属校验与写接口限流。
      </p>
    </form>
  );
}
