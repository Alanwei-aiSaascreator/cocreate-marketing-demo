import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { merchantAuthRequired } from "@/lib/merchant-auth";

export const dynamic = "force-dynamic";

export default function MerchantLoginPage() {
  // 没开口令的部署不该看到这个页面 —— 直接回后台，避免让人以为"这里有门"
  if (!merchantAuthRequired()) redirect("/merchant");

  return (
    <div className="min-h-screen bg-ink-50 px-5">
      <Suspense fallback={<div className="mx-auto mt-16 max-w-sm text-center text-sm text-ink-400">加载中…</div>}>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-center text-xs text-ink-400">
        <Link href="/" className="hover:text-ink-600">
          返回首页
        </Link>
      </p>
    </div>
  );
}
