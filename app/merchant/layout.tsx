import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { merchantAuthRequired } from "@/lib/merchant-auth";

export default function MerchantLayout({ children }: { children: ReactNode }) {
  const gated = merchantAuthRequired();

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-xs font-bold text-white">
                共
              </div>
              <span className="text-sm font-semibold text-ink-900">共创营销</span>
            </Link>
            <span className="text-xs text-ink-400">商家后台</span>
            {gated ? (
              <span className="hidden items-center gap-1 text-[11px] text-emerald-700 sm:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                已通过口令验证
              </span>
            ) : (
              <span className="hidden items-center gap-1 text-[11px] text-amber-700 sm:inline-flex">
                <ShieldAlert className="h-3 w-3" />
                演示模式 · 未鉴权
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {gated && <LogoutButton />}
            <Link href="/merchant/campaigns/new" className="btn btn-primary">
              新建共创活动
            </Link>
          </div>
        </div>
      </header>

      {/* 未鉴权这件事不能是隐形的：安全缺口最危险的状态是「存在但没人知道」 */}
      {!gated && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl items-start gap-2 px-5 py-2.5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-[12px] leading-relaxed text-amber-800">
              <span className="font-medium">演示模式：商家接口未鉴权。</span>
              任何人访问 <code className="rounded bg-white/70 px-1">/api/merchant/*</code> 都能核销券、
              采用内容、重建活动框架，因此这个部署不能直接放到公网。在{" "}
              <code className="rounded bg-white/70 px-1">.env</code> 里设置{" "}
              <code className="rounded bg-white/70 px-1">MERCHANT_PASSWORD</code> 即可开启口令验证。
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </div>
  );
}
