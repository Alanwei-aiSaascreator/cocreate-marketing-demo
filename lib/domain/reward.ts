/**
 * 奖励发放。
 *
 * 两条产品判断落在代码里：
 * 1. 奖励只用**店铺福利**（券、赠品），不出现现金 —— 现金会把共创变成廉价刷稿。
 * 2. 按贡献值**跨档位只发一次**，且可核销、可追溯 —— 商家要算得清这笔账。
 */
import { couponCode } from "../ids";
import type { RewardTier } from "../types";

export interface GrantableReward {
  tierName: string;
  type: "coupon" | "gift";
  title: string;
  value: number;
  code: string;
}

/**
 * 算出这次应该新发哪些奖励。
 * @param currentPoints 结算后的累计贡献值
 * @param tiers 活动配置的奖励阶梯
 * @param alreadyGrantedTierNames 该老客在本活动已拿过的档位名
 */
export function tiersToGrant(
  currentPoints: number,
  tiers: RewardTier[],
  alreadyGrantedTierNames: string[],
): GrantableReward[] {
  return tiers
    .filter((t) => currentPoints >= t.threshold)
    .filter((t) => !alreadyGrantedTierNames.includes(t.name))
    .sort((a, b) => a.threshold - b.threshold)
    .map((t) => ({
      tierName: t.name,
      type: t.type,
      title: t.title,
      value: t.value,
      code: couponCode(t.type === "gift" ? "GIFT" : "CC"),
    }));
}

export interface TierProgress {
  current: number;
  /** 已达成的最高档位 */
  achieved: RewardTier | null;
  /** 下一档；已满档则为 null */
  next: RewardTier | null;
  /** 距下一档还差多少分 */
  remaining: number;
  /** 已达成档位占全部档位的比例，用于 H5 进度条 */
  ratio: number;
}

export function tierProgress(currentPoints: number, tiers: RewardTier[]): TierProgress {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  const achieved = [...sorted].reverse().find((t) => currentPoints >= t.threshold) ?? null;
  const next = sorted.find((t) => currentPoints < t.threshold) ?? null;
  const top = sorted[sorted.length - 1]?.threshold ?? 1;

  return {
    current: currentPoints,
    achieved,
    next,
    remaining: next ? next.threshold - currentPoints : 0,
    ratio: Math.min(1, top > 0 ? currentPoints / top : 0),
  };
}
