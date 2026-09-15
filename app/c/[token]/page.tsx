import { notFound } from "next/navigation";
import { MapPin, Sparkles } from "lucide-react";
import { getCampaignByPublicToken, getContributorCampaignPoints, getOrCreateContributor } from "@/lib/queries";
import { readViewerToken } from "@/lib/viewer";
import { SubmitForm } from "@/components/SubmitForm";
import { PlatformBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function H5Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getCampaignByPublicToken(token);
  if (!data) notFound();

  const { campaign, merchant } = data;
  const viewer = await readViewerToken();
  const contributor = await getOrCreateContributor(viewer);
  const currentPoints = await getContributorCampaignPoints(campaign.id, contributor.id);

  return (
    <div className="px-4 pt-4">
      {/* 店铺卡片 */}
      <div className="rounded-xl border border-ink-200 bg-gradient-to-br from-brand-50 to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-ink-900">{merchant.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {merchant.address || merchant.city}
              </span>
              {merchant.avgPrice ? <span>人均 ¥{merchant.avgPrice}</span> : null}
            </div>
          </div>
        </div>

        {merchant.sellingPoints.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {merchant.sellingPoints.map((s) => (
              <span
                key={s}
                className="rounded-md border border-brand-200 bg-white px-2 py-0.5 text-[11px] text-brand-700"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 活动说明 */}
      <div className="mt-4">
        <h2 className="text-[15px] font-semibold text-ink-900">{campaign.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
          {campaign.brief || "用你的真实体验，帮更多人发现这家店。"}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {campaign.platforms.map((p) => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </div>
      </div>

      {/* 玩法说明 —— 先讲清楚「不用写作文」，降低参与门槛 */}
      <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-3.5">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-800">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
          你只需要做这三件事
        </div>
        <ol className="mt-2 space-y-1 text-[12px] leading-relaxed text-ink-600">
          <li>1. 填几个空：一句真实感受 + 你推荐的一个东西</li>
          <li>2. 传一张随手拍的图（不用修）</li>
          <li>3. AI 会自动帮你写成各平台的文案，你不用写一个字</li>
        </ol>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-500">
          贡献真实内容可以累积贡献值，兑换店铺福利。
        </p>
      </div>

      {/* 活动已结束：必须在**渲染时**就拦下来。
          原来这里不看 status，老客会把表单填完、照片传完，
          提交那一刻才被告知活动结束了 —— 最糟的一种体验。 */}
      {campaign.status !== "active" ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[14px] font-semibold text-amber-900">本次活动已结束</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800">
            商家已经关闭了这次共创，暂时不能再提交新素材。
            <strong className="font-medium">但你之前贡献的成果和拿到的福利都还在</strong>
            —— 已发的券仍然可以到店核销。
          </p>
          <a href={`/c/${token}/me`} className="btn btn-primary mt-3 w-full">
            查看我的贡献与福利
          </a>
        </div>
      ) : (
        <div className="mt-5">
          <SubmitForm
            token={token}
            taskCard={campaign.taskCard}
            rewardTiers={campaign.rewardTiers}
            nickname={contributor.nickname}
            currentPoints={currentPoints}
          />
        </div>
      )}
    </div>
  );
}
