import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * 开启 / 结束共创活动。
 *
 * 为什么需要这个接口：`Campaign.status` 的 `closed` 分支原先**永远走不到** ——
 * 建活动时写死 `active`，没有任何地方能改它。于是：
 *   · 界面上没有"结束活动"的入口
 *   · H5 的 `status !== "active"` 判断成了一行死代码
 *   · 面试官一问"活动结束后老客再扫码会怎样"就答不顺
 *
 * 结束活动**不删除任何数据**：素材、内容、贡献、福利都保留。
 * 老客仍然能看到并核销自己已拿到的券 —— 结束的是"能不能继续提交"，
 * 不是"之前攒的东西还算不算数"。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "closed") {
    return NextResponse.json({ error: "status 只能是 active 或 closed" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, title: true, status: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "活动不存在" }, { status: 404 });
  }

  if (campaign.status === body.status) {
    return NextResponse.json({
      ok: true,
      status: campaign.status,
      unchanged: true,
      message: body.status === "closed" ? "活动已经是结束状态" : "活动已经是进行中",
    });
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: body.status },
  });

  return NextResponse.json({
    ok: true,
    status: updated.status,
    message:
      body.status === "closed"
        ? "活动已结束：老客不能再提交新素材，但已有的贡献与福利全部保留。"
        : "活动已重新开启：老客可以继续提交素材。",
  });
}
