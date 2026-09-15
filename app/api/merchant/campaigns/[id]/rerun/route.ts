import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { generateBlueprint } from "@/lib/ai";
import type { Platform } from "@/lib/types";

/** 重新生成活动蓝图：商家对 AI 产出不满意时，一键换一版 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { merchant: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  const startedAt = Date.now();
  const blueprint = await generateBlueprint(
    {
      name: campaign.merchant.name,
      category: campaign.merchant.category,
      city: campaign.merchant.city,
      address: campaign.merchant.address,
      avgPrice: campaign.merchant.avgPrice,
      tones: parseJson<string[]>(campaign.merchant.tones, []),
      sellingPoints: parseJson<string[]>(campaign.merchant.sellingPoints, []),
      bannedWords: parseJson<string[]>(campaign.merchant.bannedWords, []),
    },
    {
      title: campaign.title,
      objective: campaign.objective,
      platforms: parseJson<Platform[]>(campaign.platforms, []),
      brief: campaign.brief,
    },
  );

  await prisma.campaign.update({
    where: { id },
    data: {
      frames: JSON.stringify(blueprint.frames),
      taskCard: JSON.stringify(blueprint.taskCard),
      rewardTiers: JSON.stringify(blueprint.rewardTiers),
      aiMode: blueprint.aiMode,
      aiNote: blueprint.note,
      degraded: blueprint.degraded,
    },
  });

  return NextResponse.json({
    ok: true,
    aiMode: blueprint.aiMode,
    aiNote: blueprint.note,
    degraded: blueprint.degraded,
    elapsedMs: Date.now() - startedAt,
  });
}
