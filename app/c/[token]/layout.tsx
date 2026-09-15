import Link from "next/link";
import type { ReactNode } from "react";

export default async function H5Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-ink-100 py-0 sm:py-8">
      {/* 移动优先：手机上铺满，桌面上呈现手机宽度便于演示 */}
      <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm sm:min-h-0 sm:rounded-2xl sm:border sm:border-ink-200">
        <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-ink-100 bg-white/90 px-4 backdrop-blur sm:rounded-t-2xl">
          <Link href={`/c/${token}`} className="text-sm font-semibold text-ink-900">
            老客共创
          </Link>
          <Link href={`/c/${token}/me`} className="text-xs text-brand-600 hover:text-brand-700">
            我的贡献
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
