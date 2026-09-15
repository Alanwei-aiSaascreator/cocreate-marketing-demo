/**
 * 贡献结算。
 *
 * 提交素材、内容被采用、内容带来点击回流 —— 三条路径都会改变贡献值，
 * 但「重算累计 → 更新缓存 → 补齐奖励档位」这套逻辑只能有一份。
 * 所以全部收口到这里，避免三处各写一遍导致分数和券对不上。
 */
import { prisma } from "../db";
import { parseJson } from "../json";
import { tiersToGrant } from "./reward";
import type { RewardTier } from "../types";

export interface SettleResult {
  campaignPoints: number;
  totalPoints: number;
  granted: { tierName: string; title: string; type: string; value: number; code: string }[];
}

export async function settleContributor(
  campaignId: string,
  contributorId: string,
): Promise<SettleResult> {
  const [campaignAgg, globalAgg, campaign, granted] = await Promise.all([
    prisma.contribution.aggregate({
      where: { campaignId, contributorId },
      _sum: { points: true },
    }),
    prisma.contribution.aggregate({
      where: { contributorId },
      _sum: { points: true },
    }),
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { rewardTiers: true } }),
    prisma.reward.findMany({
      where: { campaignId, contributorId },
      select: { tierName: true },
    }),
  ]);

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

  for (const r of toGrant) {
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
  }

  return { campaignPoints, totalPoints, granted: toGrant };
}
