import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleContributor } from "@/lib/domain/settle";
import { adoptPointItem } from "@/lib/domain/scoring";
import { adoptSchema } from "@/lib/validators";

const ADOPT_REASON = "内容被商家采用";

/**
 * 商家采用 / 撤销采用一条共创内容。
 *
 * 这是「质量导向」的落点：只有被商家真正用起来的内容，老客才拿这一档分。
 * 幂等处理 —— 反复点采用不会重复加分，撤销会把这一档分收回。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = adoptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "adopted 必须是布尔值" }, { status: 400 });
  }
  const { adopted } = parsed.data;

  const submission = await prisma.submission.findUnique({
    where: { id },
    select: { id: true, campaignId: true, contributorId: true, status: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "素材不存在" }, { status: 404 });
  }
  if (submission.status === "rejected") {
    return NextResponse.json(
      { error: "这条素材已被风控拦截，不能采用" },
      { status: 400 },
    );
  }

  if (adopted) {
    await prisma.generatedContent.updateMany({
      where: { submissionId: id },
      data: { adopted: true, adoptedAt: new Date() },
    });
    await prisma.submission.update({ where: { id }, data: { status: "adopted" } });

    const exists = await prisma.contribution.findFirst({
      where: { submissionId: id, reason: ADOPT_REASON },
      select: { id: true },
    });
    if (!exists) {
      const item = adoptPointItem();
      await prisma.contribution.create({
        data: {
          campaignId: submission.campaignId,
          contributorId: submission.contributorId,
          submissionId: id,
          breakdown: JSON.stringify([item]),
          points: item.points,
          reason: ADOPT_REASON,
        },
      });
    }
  } else {
    await prisma.generatedContent.updateMany({
      where: { submissionId: id },
      data: { adopted: false, adoptedAt: null },
    });
    await prisma.submission.update({ where: { id }, data: { status: "processed" } });
    await prisma.contribution.deleteMany({ where: { submissionId: id, reason: ADOPT_REASON } });
  }

  const settled = await settleContributor(submission.campaignId, submission.contributorId);

  return NextResponse.json({
    ok: true,
    adopted,
    ...settled,
  });
}
