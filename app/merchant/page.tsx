import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { listCampaigns } from "@/lib/queries";
import { AiModeTag, Badge, Card, EmptyState, PlatformBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MerchantPage() {
  const campaigns = await listCampaigns();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink-900">共创活动</h1>
        <p className="hint mt-1">
          新建活动时 AI 会按店铺信息和营销目标，生成各平台内容框架、老客任务卡和奖励阶梯。
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="还没有共创活动"
          desc="先跑一次 `pnpm db:seed` 载入演示数据，或者直接新建一个活动。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c) => (
            <Card key={c.id} hover className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink-900">{c.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {c.merchant.city} · {c.merchant.name}
                    </span>
                    <span>{c.merchant.category}</span>
                    {c.merchant.avgPrice ? <span>人均 ¥{c.merchant.avgPrice}</span> : null}
                  </div>
                </div>
                {/* 别再直接渲染原始状态字符串 —— 那会在界面上显示英文 "closed"。
                    这个分支以前从没被走到过（种子里所有活动都是 active），
                    现在有了已结束的活动才暴露出来。 */}
                <Badge tone={c.status === "active" ? "green" : "gray"}>
                  {c.status === "active" ? "进行中" : "已结束"}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="brand">{c.objective}</Badge>
                {c.platforms.map((p) => (
                  <PlatformBadge key={p} platform={p} />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
                <div>
                  <div className="text-lg font-semibold tabular-nums text-ink-900">
                    {c.counts.submissions}
                  </div>
                  <div className="text-xs text-ink-500">老客素材</div>
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums text-ink-900">
                    {c.counts.contents}
                  </div>
                  <div className="text-xs text-ink-500">AI 内容</div>
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums text-brand-600">
                    {c.counts.rewards}
                  </div>
                  <div className="text-xs text-ink-500">已发福利</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
                <div className="flex items-center gap-2">
                  <AiModeTag mode={c.aiMode} />
                  <span className="text-xs text-ink-400">{formatDateTime(c.createdAt)}</span>
                </div>
                <Link
                  href={`/merchant/campaigns/${c.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  工作台
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
