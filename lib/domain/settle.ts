/**
 * 贡献结算。
 *
 * 提交素材、内容被采用、内容带来点击回流 —— 三条路径都会改变贡献值，
 * 但「重算累计 → 更新缓存 → 补齐奖励档位」这套逻辑只能有一份。
 * 所以全部收口到这里，避免三处各写一遍导致分数和券对不上。
 *
 * 并发保护：老客双击提交、或提交与点击结算同时到达时，两个请求都会读到
 * 「该档位尚未发放」并各自插入一张券。应用层的先查后插挡不住这个竞态，
 * 真正的兜底是 Reward 上的 @@unique([campaignId, contributorId, tierName])
 * —— 后到的那个会撞唯一约束，被下面的 catch 吞掉即可。
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { parseJson } from "../json";
import { tiersToGrant } from "./reward";
import type { RewardTier } from "../types";

/** 券的三种状态。issued = 可用，redeemed = 已到店核销，expired = 贡献值回落作废 */
export const REWARD_STATUS = { issued: "issued", redeemed: "redeemed", expired: "expired" } as const;

export interface GrantedReward {
  tierName: string;
  title: string;
  type: string;
  value: number;
  code: string;
}

export interface SettleResult {
  campaignPoints: number;
  totalPoints: number;
  /** 本次**实际新增**的券（被唯一约束挡下的不算） */
  granted: GrantedReward[];
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function settleContributor(
  campaignId: string,
  contributorId: string,
): Promise<SettleResult> {
  const campaignAgg = await prisma.contribution.aggregate({
    where: { campaignId, contributorId },
    _sum: { points: true },
  });
  const globalAgg = await prisma.contribution.aggregate({
    where: { contributorId },
    _sum: { points: true },
  });
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { rewardTiers: true },
  });
  const granted = await prisma.reward.findMany({
    where: { campaignId, contributorId },
    select: { tierName: true },
  });

  const campaignPoints = campaignAgg._sum.points ?? 0;
  const totalPoints = globalAgg._sum.points ?? 0;

  await prisma.contributor.update({
    where: { id: contributorId },
    data: { totalPoints },
  });

  const tiers = parseJson<RewardTier[]>(campaign?.rewardTiers, []);
  const toGrant = tiersToGrant(
    campaignPoints,
    tiers,
    granted.map((g) => g.tierName),
  );

  const actuallyGranted: GrantedReward[] = [];
  for (const r of toGrant) {
    try {
      await prisma.reward.create({
        data: {
          campaignId,
          contributorId,
          tierName: r.tierName,
          type: r.type,
          title: r.title,
          value: r.value,
          code: r.code,
          status: "issued",
        },
      });
      actuallyGranted.push(r);
    } catch (err) {
      // 并发同伴已经发过这一档了，属于预期内，跳过即可。
      // 其它错误必须往上抛 —— 静默吞掉数据库故障会让"券没发出去"变得无声无息。
      if (!isUniqueViolation(err)) throw err;
    }
  }

  return { campaignPoints, totalPoints, granted: actuallyGranted };
}

/**
 * 贡献值回落时，把已经不再够格的券置为失效。
 *
 * 为什么必须有：商家「撤销采用」会让老客的贡献值回落（采用 +30 被收回），
 * 但他可能已经靠这 30 分越过了档位、拿到了券。如果只收回分数不收回券，
 * 账本上就会出现一张没有对应贡献支撑的券 —— 而界面上明确写着
 * 「每张券可追溯到是哪一笔贡献换来的」，那就成了假话。
 *
 * 只处理 issued 的券：已核销的（老客已经到店用掉了）不能追溯作废。
 */
export async function expireDowngradedRewards(
  campaignId: string,
  contributorId: string,
): Promise<{ expired: number }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { rewardTiers: true },
  });
  const tiers = parseJson<RewardTier[]>(campaign?.rewardTiers, []);
  if (tiers.length === 0) return { expired: 0 };

  const agg = await prisma.contribution.aggregate({
    where: { campaignId, contributorId },
    _sum: { points: true },
  });
  const points = agg._sum.points ?? 0;

  const thresholdByTier = new Map(tiers.map((t) => [t.name, t.threshold]));
  const candidates = await prisma.reward.findMany({
    where: { campaignId, contributorId, status: "issued" },
    select: { id: true, tierName: true },
  });

  const toExpire = candidates.filter((r) => {
    const threshold = thresholdByTier.get(r.tierName);
    // 找不到对应档位（奖励阶梯被重新生成过）时不擅自作废，交给商家判断
    return threshold !== undefined && points < threshold;
  });

  if (toExpire.length > 0) {
    await prisma.reward.updateMany({
      where: { id: { in: toExpire.map((r) => r.id) } },
      data: { status: "expired" },
    });
  }

  return { expired: toExpire.length };
}
