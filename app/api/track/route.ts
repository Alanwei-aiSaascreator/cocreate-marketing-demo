import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleContributor } from "@/lib/domain/settle";
import { CLICK_CAP, CLICK_POINT, clickPointItem } from "@/lib/domain/scoring";
import { readViewerToken } from "@/lib/viewer";

/**
 * 行为上报：view（看了）/ click（有效回流）/ redeem（核销）。
 *
 * 这是「奖励绑定真实引流效果」唯一真正的技术落点。
 * 关键判断：**只有 click 才加分**，而且同一个访客对同一条内容只计一次 ——
 * 自己反复刷新页面刷不出来分，这条规则是防刷稿的第一道闸。
 */
export async function POST(request: Request) {
  let body: { shareToken?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { shareToken: st, type } = body;
  if (!st || (type !== "view" && type !== "click")) {
    return NextResponse.json({ error: "参数不合法" }, { status: 400 });
  }

  const content = await prisma.generatedContent.findUnique({
    where: { shareToken: st },
    select: {
      id: true,
      campaignId: true,
      submissionId: true,
      submission: { select: { contributorId: true } },
    },
  });
  if (!content) {
    return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  }

  const viewer = (await readViewerToken()) || "anonymous";
  const contributorId = content.submission.contributorId;

  if (type === "view") {
    await prisma.trackEvent.create({
      data: {
        type: "view",
        campaignId: content.campaignId,
        submissionId: content.submissionId,
        contentId: content.id,
        meta: JSON.stringify({ viewer }),
      },
    });
    return NextResponse.json({ ok: true, type: "view", credited: false });
  }

  // click：同一访客 + 同一内容只计一次有效回流
  const already = await prisma.trackEvent.findFirst({
    where: {
      contentId: content.id,
      type: "click",
      meta: { contains: viewer },
    },
    select: { id: true },
  });

  if (already) {
    return NextResponse.json({
      ok: true,
      type: "click",
      credited: false,
      message: "同一个访客对同一条内容只计一次有效回流。",
    });
  }

  // 贡献者自己点自己的分享，不算引流 —— 否则这条链路的分数毫无意义
  const [contentOwner, selfClicks] = await Promise.all([
    prisma.contributor.findFirst({
      where: { id: contributorId, viewerToken: viewer },
      select: { id: true },
    }),
    prisma.contribution.findMany({
      where: { submissionId: content.submissionId, reason: { startsWith: "内容带来" } },
      select: { points: true },
    }),
  ]);

  if (contentOwner) {
    await prisma.trackEvent.create({
      data: {
        type: "click",
        campaignId: content.campaignId,
        submissionId: content.submissionId,
        contentId: content.id,
        meta: JSON.stringify({ viewer, self: true }),
      },
    });
    return NextResponse.json({
      ok: true,
      type: "click",
      credited: false,
      message: "自己点自己的分享不计入引流贡献。",
    });
  }

  await prisma.trackEvent.create({
    data: {
      type: "click",
      campaignId: content.campaignId,
      submissionId: content.submissionId,
      contentId: content.id,
      meta: JSON.stringify({ viewer }),
    },
  });

  // 点击加分有封顶，避免一条爆款内容把商家的福利预算打穿
  const gainedSoFar = selfClicks.reduce((sum, c) => sum + c.points, 0);
  let creditedPoints = 0;

  if (gainedSoFar < CLICK_CAP) {
    creditedPoints = Math.min(CLICK_POINT, CLICK_CAP - gainedSoFar);
    const totalClicks = await prisma.trackEvent.count({
      where: { submissionId: content.submissionId, type: "click" },
    });
    const item = clickPointItem(totalClicks);
    await prisma.contribution.create({
      data: {
        campaignId: content.campaignId,
        contributorId,
        submissionId: content.submissionId,
        breakdown: JSON.stringify([{ ...item, points: creditedPoints }]),
        points: creditedPoints,
        reason: `内容带来第 ${totalClicks} 次有效点击回流`,
      },
    });
  }

  const settled = await settleContributor(content.campaignId, contributorId);

  return NextResponse.json({
    ok: true,
    type: "click",
    credited: creditedPoints > 0,
    gainedPoints: creditedPoints,
    capped: gainedSoFar >= CLICK_CAP,
    campaignPoints: settled.campaignPoints,
    granted: settled.granted,
    message:
      creditedPoints > 0
        ? `贡献者 +${creditedPoints} 贡献值`
        : `点击已记录，该内容引流加分已达封顶 ${CLICK_CAP}`,
  });
}
