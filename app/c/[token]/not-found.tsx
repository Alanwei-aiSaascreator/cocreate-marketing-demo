import Link from "next/link";

/**
 * 失效的共创链接落地页。
 *
 * 这不是凑数的 404：演示过程中「重置数据导致已发出的链接失效」是高频事件，
 * 老客这时候应该看到一句人话 + 一个下一步，而不是 Next.js 的默认 404。
 */
export default function H5NotFound() {
  return (
    <div className="px-5 py-12">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-base font-semibold text-amber-900">这个共创链接已失效</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-amber-800">
          常见原因是商家重置了演示数据、或者活动已被删除。
          你的素材没有丢失 —— 换一个最新的入口链接重新进来即可。
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-ink-200 bg-white p-5">
        <div className="text-[13px] font-medium text-ink-800">下一步</div>
        <p className="hint mt-1.5">
          让商家把最新的二维码或链接发给你；商家可以在「商家后台 → 活动 → 任务卡与二维码」里找到。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/merchant" className="btn btn-primary">
            去商家后台看当前活动
          </Link>
          <Link href="/" className="btn btn-ghost">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
