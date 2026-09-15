import Link from "next/link";
import type { ReactNode } from "react";

export default function MerchantLayout({ children }: { children: ReactNode }) {
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
          </div>
          <Link href="/merchant/campaigns/new" className="btn btn-primary">
            新建共创活动
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </div>
  );
}
