import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** 到店核销：商家在后台把券置为已核销，账本上留下时间点 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const reward = await prisma.reward.findUnique({ where: { id } });
  if (!reward) {
    return NextResponse.json({ error: "奖励不存在" }, { status: 404 });
  }
  if (reward.status === "redeemed") {
    return NextResponse.json({ error: "这张券已经核销过了" }, { status: 400 });
  }

  const updated = await prisma.reward.update({
    where: { id },
    data: { status: "redeemed", redeemedAt: new Date() },
  });

  await prisma.trackEvent.create({
    data: {
      type: "redeem",
      campaignId: reward.campaignId,
      meta: JSON.stringify({ rewardId: reward.id, code: reward.code }),
    },
  });

  return NextResponse.json({
    ok: true,
    code: updated.code,
    status: updated.status,
    redeemedAt: updated.redeemedAt,
  });
}
