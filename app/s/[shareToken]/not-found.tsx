import Link from "next/link";

/** 失效的内容分享链接（重置数据后旧链接会走到这里） */
export default function ShareNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-white px-5 py-12 sm:my-8 sm:min-h-0 sm:rounded-2xl sm:border sm:border-ink-200">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-base font-semibold text-amber-900">这条分享内容已失效</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-amber-800">
          内容可能已被删除，或者商家重置了演示数据。
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/merchant" className="btn btn-primary">
          去商家后台看当前活动
        </Link>
        <Link href="/" className="btn btn-ghost">
          返回首页
        </Link>
      </div>
    </main>
  );
}
