import { notFound } from "next/navigation";
import Link from "next/link";
import { Gift, Sparkles, Ticket } from "lucide-react";
import {
  getCampaignByPublicToken,
  getContributorDashboard,
  getOrCreateContributor,
} from "@/lib/queries";
import { readViewerToken } from "@/lib/viewer";
import { Badge, ProgressBar, PlatformBadge } from "@/components/ui";
import { ShareActionButton } from "@/components/ShareActionButton";
import { tierProgress } from "@/lib/domain/reward";
import { formatDateTime, yuan } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyContributionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getCampaignByPublicToken(token);
  if (!data) notFound();

  const { campaign } = data;
  const viewer = await readViewerToken();
  const contributor = await getOrCreateContributor(viewer);
  const dash = await getContributorDashboard(campaign.id, contributor.id);
  if (!dash) notFound();

  const progress = tierProgress(dash.contributor.campaignPoints, campaign.rewardTiers);

  return (
    <div className="space-y-4 px-4 pb-8 pt-4">
      {/* 我的贡献值 */}
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{dash.contributor.avatarEmoji}</span>
          <div>
            <div className="text-sm font-semibold text-ink-900">{dash.contributor.nickname}</div>
            <div className="hint">本次活动累计贡献</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tabular-nums text-brand-600">
            {dash.contributor.campaignPoints}
          </span>
          <span className="text-xs text-ink-500">贡献值</span>
        </div>

        <div className="mt-3">
          <ProgressBar value={progress.current} max={campaign.rewardTiers.at(-1)?.threshold ?? 1} />
          <div className="mt-2 flex items-center justify-between text-[12px]">
            <span className="text-ink-500">
              {progress.achieved ? `已解锁：${progress.achieved.name}` : "还没有解锁档位"}
            </span>
            <span className="text-ink-500">
              {progress.next ? `距「${progress.next.title}」还差 ${progress.remaining}` : "已解锁全部福利 🎉"}
            </span>
          </div>
        </div>
      </div>

      {/* 我的福利 */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Gift className="h-4 w-4 text-brand-500" />
          我的店铺福利
        </h2>
        {dash.rewards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 p-5 text-center text-[13px] text-ink-500">
            还没有解锁福利，继续贡献就能拿到
          </div>
        ) : (
          <div className="space-y-2">
            {dash.rewards.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-3.5"
              >
                <div>
                  <div className="text-[13px] font-medium text-ink-900">{r.title}</div>
                  <div className="hint mt-0.5">
                    {r.tierName}
                    {r.value > 0 ? ` · 价值 ¥${yuan(r.value)}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-ink-700">{r.code}</div>
                  <div className="mt-1">
                    {r.status === "redeemed" ? (
                      <Badge tone="gray">已核销</Badge>
                    ) : r.status === "expired" ? (
                      <Badge tone="red">已失效</Badge>
                    ) : (
                      <Badge tone="green">
                        <Ticket className="h-3 w-3" />
                        到店可用
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 我的素材与 AI 产出 */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <Sparkles className="h-4 w-4 text-brand-500" />
          我的共创记录（{dash.submissions.length}）
        </h2>

        {dash.submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 p-5 text-center text-[13px] text-ink-500">
            还没有贡献记录
            <div className="mt-2">
              <Link href={`/c/${token}`} className="btn btn-primary text-xs">
                去贡献第一条
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {dash.submissions.map((s) => (
              <div key={s.id} className="rounded-xl border border-ink-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink-700">
                      {s.answers.feeling ? `「${s.answers.feeling}」` : "（无文字内容）"}
                    </div>
                    <div className="hint mt-1">
                      {formatDateTime(s.createdAt)}
                      {s.answers.recommend ? ` · 推荐 ${s.answers.recommend}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums text-brand-600">
                      +{s.points}
                    </div>
                    {s.status === "rejected" ? (
                      <Badge tone="red">未通过</Badge>
                    ) : s.status === "adopted" ? (
                      <Badge tone="green">已采用</Badge>
                    ) : (
                      <Badge tone="gray">已入库</Badge>
                    )}
                  </div>
                </div>

                {s.riskFlags.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-lg bg-amber-50 p-2">
                    {s.riskFlags.map((f) => (
                      <div key={f.code + f.label} className="text-[11px] leading-relaxed text-amber-800">
                        <span className="font-medium">{f.label}：</span>
                        {f.note}
                      </div>
                    ))}
                  </div>
                )}

                {s.contents.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2.5">
                    {s.contents.map((c) => (
                      <Link
                        key={c.id}
                        href={`/s/${c.shareToken}`}
                        className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] text-ink-600 hover:border-brand-300 hover:text-brand-700"
                      >
                        <PlatformBadge platform={c.platform} />
                        {c.adopted && <span className="text-emerald-600">已采用</span>}
                      </Link>
                    ))}
                    {/* 复制分享文案会记一次 share 事件 —— 工作台的「分享次数」由此变真 */}
                    <ShareActionButton
                      shareToken={s.contents[0].shareToken}
                      title={s.contents[0].title}
                      body={s.contents[0].body}
                    />
                  </div>
                )}
                {s.contents.length > 0 && (
                  <p className="hint mt-2">
                    点开任意一条预览、或直接复制分享文案发出去。别人点进来看就能给你加贡献值
                    （同一访客只计一次，+5/次，封顶 50）。
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 贡献明细 —— 可解释是这套机制能立住的前提 */}
      {dash.contributions.length > 0 && (
        <details className="rounded-xl border border-ink-200 bg-white p-3.5">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900">
            贡献值明细（{dash.contributions.length} 笔）
          </summary>
          <div className="mt-3 space-y-2.5">
            {dash.contributions.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 border-b border-ink-100 pb-2.5 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-800">{c.reason}</div>
                  {c.breakdown.map((b) => (
                    <p key={b.label} className="hint">
                      {b.label}：{b.note}
                    </p>
                  ))}
                  <span className="hint">{formatDateTime(c.createdAt)}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-600">
                  +{c.points}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <Link href={`/c/${token}`} className="btn btn-primary w-full">
        再贡献一条
      </Link>
    </div>
  );
}
