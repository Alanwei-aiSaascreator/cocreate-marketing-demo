import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Gift, Store } from "lucide-react";
import { getRewardByCode } from "@/lib/queries";
import { RedeemButton } from "@/components/actions";
import { formatDateTime, yuan } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 扫码核销页。
 *
 * 老客在「我的福利」里出示券码对应的二维码 → 商家用手机扫 → 落到这一页 → 点核销。
 *
 * 为什么值得单独做一个页面：原来只能在后台奖励列表里翻到那一张券再点核销，
 * 老客站在柜台前干等商家找列表，这不像一笔真实交易该有的节奏。
 * 扫码直达把核销压缩成「扫一下、点一下」。
 *
 * 这一页在 `/merchant/*` 下，所以**继承商家口令保护** ——
 * 没通过验证的人扫到这个链接也核销不了（演示模式下才会直接放行）。
 */
export default async function RedeemByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const reward = await getRewardByCode(decodeURIComponent(code));

  if (!reward) {
    return (
      <div className="mx-auto max-w-md">
        <div className="card p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="mt-3 text-base font-semibold text-ink-900">没找到这张券</h1>
          <p className="hint mt-2">
            券码「{code}」不在本系统里。可能是扫错了码，或者这个活动已经被重置过
            （重置会清空所有历史券）。
          </p>
          <Link href="/merchant" className="btn btn-ghost mt-4 w-full">
            <ArrowLeft className="h-4 w-4" />
            回工作台
          </Link>
        </div>
      </div>
    );
  }

  const stateMap = {
    issued: { tone: "green" as const, label: "到店可用", icon: Gift },
    redeemed: { tone: "gray" as const, label: "已核销", icon: CheckCircle2 },
    expired: { tone: "red" as const, label: "已失效", icon: Clock },
  };
  const state = stateMap[reward.status as keyof typeof stateMap] ?? stateMap.issued;
  const Icon = state.icon;

  return (
    <div className="mx-auto max-w-md">
      <Link
        href="/merchant"
        className="mb-3 inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        回工作台
      </Link>

      <div className="card overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-4 py-3">
          <Store className="h-4 w-4 text-ink-500" />
          <span className="text-sm font-semibold text-ink-900">{reward.merchantName}</span>
          <span className="ml-auto text-[11px] text-ink-400">{reward.campaignTitle}</span>
        </div>

        <div className="p-5 text-center">
          <div className="text-[11px] text-ink-500">{reward.tierName}</div>
          <h1 className="mt-1.5 text-lg font-bold text-ink-900">{reward.title}</h1>
          {reward.value > 0 && (
            <div className="mt-1 text-2xl font-bold tabular-nums text-brand-600">
              ¥{yuan(reward.value)}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3">
            <div className="text-[11px] text-ink-500">券码</div>
            <div className="mt-1 font-mono text-base font-semibold tracking-wide text-ink-900">
              {reward.code}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 text-[13px]">
            <Icon
              className={
                state.tone === "green"
                  ? "h-4 w-4 text-emerald-600"
                  : state.tone === "red"
                    ? "h-4 w-4 text-red-500"
                    : "h-4 w-4 text-ink-400"
              }
            />
            <span className="text-ink-700">{state.label}</span>
          </div>

          <div className="mt-4 space-y-1 border-t border-ink-100 pt-4 text-left text-[12px] text-ink-600">
            <div className="flex justify-between">
              <span className="text-ink-500">贡献者</span>
              <span>
                {reward.contributor.avatarEmoji} {reward.contributor.nickname}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">发放时间</span>
              <span>{formatDateTime(reward.issuedAt)}</span>
            </div>
            {reward.redeemedAt && (
              <div className="flex justify-between">
                <span className="text-ink-500">核销时间</span>
                <span>{formatDateTime(reward.redeemedAt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink-500">福利类型</span>
              <span>{reward.type === "gift" ? "赠品" : "券"}</span>
            </div>
          </div>

          <div className="mt-5">
            <RedeemButton rewardId={reward.id} status={reward.status} />
          </div>

          {reward.status === "expired" && (
            <p className="hint mt-3">
              这张券失效的原因是：对应的贡献值后来回落了（比如商家撤销了「采用」）。
              已经核销过的券不会被追溯作废。
            </p>
          )}
          {reward.status === "issued" && (
            <p className="hint mt-3">
              核销后不可撤销 —— 老客那边会立刻显示「已核销」。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
