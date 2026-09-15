import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { settleContributor, expireDowngradedRewards } from "@/lib/domain/settle";
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

    // 幂等：先查一次是快速路径，真正的保证是 Contribution 上的
    // @@unique([submissionId, reason]) —— 并发双击时两个请求都会查不到，
    // 后到的那个会撞唯一约束，被下面的 catch 吞掉。
    const exists = await prisma.contribution.findFirst({
      where: { submissionId: id, reason: ADOPT_REASON },
      select: { id: true },
    });
    if (!exists) {
      const item = adoptPointItem();
      try {
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
      } catch (err) {
        // 只吞唯一约束冲突（并发同伴已经加过分了），其它错误照抛
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
          throw err;
        }
      }
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

  // 撤销采用会让贡献值回落。如果老客已经靠这部分分数越过了档位、拿到了券，
  // 那几张还没核销的券必须一并作废 —— 否则账本上会出现没有贡献支撑的券。
  const expired = await expireDowngradedRewards(submission.campaignId, submission.contributorId);

  return NextResponse.json({
    ok: true,
    adopted,
    ...settled,
    expiredRewards: expired.expired,
  });
}
