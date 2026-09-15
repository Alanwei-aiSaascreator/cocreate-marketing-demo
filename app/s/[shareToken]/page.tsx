import { notFound } from "next/navigation";
import { MapPin, Sparkles, Users } from "lucide-react";
import { getCampaignByShareToken } from "@/lib/queries";
import { ShareTracker, TrackedCta } from "@/components/ShareTracker";
import { PLATFORM_META } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 内容分享落地页。
 *
 * 三个作用：
 * 1. 别人打开分享链接，看到的是老客真实体验 + AI 加工后的成品，而不是硬广。
 * 2. 页面加载记 view，点 CTA 记 click —— 这是「有效引流」的判定口径。
 * 3. 把「看内容的人」转化成「参与共创的人」，闭环才能自己转起来。
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const data = await getCampaignByShareToken(shareToken);
  if (!data) notFound();

  const { content, contributor, campaign, merchant } = data;
  const meta = PLATFORM_META[content.platform];

  return (
    <main className="min-h-screen bg-ink-100 py-0 sm:py-8">
      <ShareTracker shareToken={shareToken} />

      <div className="mx-auto w-full max-w-md bg-white shadow-sm sm:rounded-2xl sm:border sm:border-ink-200">
        {/* 平台标识条 */}
        <div
          className="flex items-center gap-2 px-4 py-3 text-white sm:rounded-t-2xl"
          style={{ background: meta.accent }}
        >
          <span className="text-base">{meta.emoji}</span>
          <span className="text-sm font-semibold">{meta.name}内容预览</span>
          <span className="ml-auto text-[11px] opacity-80">
            由老客真实素材 + AI 加工生成
          </span>
        </div>

        <div className="p-4">
          {/* 老客实拍图 */}
          {content.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content.imageUrl}
              alt="老客实拍图"
              className="mb-3 h-52 w-full rounded-xl border border-ink-200 object-cover"
            />
          )}

          <h1 className="text-[15px] font-bold leading-snug text-ink-900">{content.title}</h1>
          <div className="content-body mt-2.5 text-[14px] leading-relaxed text-ink-700">
            {content.body}
          </div>

          {content.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {content.tags.map((t) => (
                <span key={t} className="text-xs text-blue-600">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* 贡献者署名 —— 「共创」要有名字 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2.5">
            <span className="text-base">{contributor.avatarEmoji}</span>
            <div className="text-xs text-ink-600">
              <span className="font-medium text-ink-800">{contributor.nickname}</span> 的真实体验
            </div>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-400">
              <Sparkles className="h-3 w-3" />
              共创贡献者
            </span>
          </div>
        </div>

        {/* 店铺信息 + 转化 CTA */}
        <div className="border-t border-ink-100 p-4">
          <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
            <div className="text-base font-bold text-ink-900">{merchant.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {merchant.address || merchant.city}
              </span>
              {merchant.avgPrice ? <span>人均 ¥{merchant.avgPrice}</span> : null}
            </div>

            <TrackedCta
              shareToken={shareToken}
              href={`/c/${campaign.publicToken}`}
              className="btn btn-primary mt-3 w-full !py-3"
            >
              <Users className="h-4 w-4" />
              我也去过这家，去贡献一条
            </TrackedCta>

            <p className="hint mt-2 text-center">
              点这个按钮会产生一次有效回流 —— 如果你是第一次从这条分享点进来，
              上面那位老客的贡献值会 +5（同一访客只计一次，自点不计）。
            </p>
          </div>

          <p className="hint mt-3 text-center">
            内容由老客真实素材经 AI 按 {meta.name} 调性加工，未编造老客未提到的体验。
          </p>
        </div>
      </div>
    </main>
  );
}
