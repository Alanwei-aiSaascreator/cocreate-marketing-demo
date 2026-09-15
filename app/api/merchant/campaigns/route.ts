import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { campaignToken } from "@/lib/ids";
import { generateBlueprint } from "@/lib/ai";
import { campaignCreateSchema, firstIssue } from "@/lib/validators";

/**
 * 建共创活动。
 * 这一步是「商家定框架」的落点：商家给信息和目标，AI 产出平台框架 + 任务卡 + 奖励阶梯。
 * 返回耗时和生成方式，让商家（和面试官）看得见 AI 到底做了什么、花了多久。
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const parsed = campaignCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const { merchantId, merchant: m, campaign: c } = parsed.data;

  try {
    // 1. 商家基础信息（新建或更新）
    const merchant = merchantId
      ? await prisma.merchant.update({
          where: { id: merchantId },
          data: {
            name: m.name,
            category: m.category,
            city: m.city,
            address: m.address || null,
            avgPrice: m.avgPrice ?? null,
            tones: JSON.stringify(m.tones),
            sellingPoints: JSON.stringify(m.sellingPoints),
            bannedWords: JSON.stringify(m.bannedWords),
          },
        })
      : await prisma.merchant.create({
          data: {
            name: m.name,
            category: m.category,
            city: m.city,
            address: m.address || null,
            avgPrice: m.avgPrice ?? null,
            tones: JSON.stringify(m.tones),
            sellingPoints: JSON.stringify(m.sellingPoints),
            bannedWords: JSON.stringify(m.bannedWords),
          },
        });

    // 2. AI 生成活动蓝图（走模型；失败自动降级到规则引擎，不会让建活动失败）
    const startedAt = Date.now();
    const blueprint = await generateBlueprint(
      {
        name: merchant.name,
        category: merchant.category,
        city: merchant.city,
        address: merchant.address,
        avgPrice: merchant.avgPrice,
        tones: m.tones,
        sellingPoints: m.sellingPoints,
        bannedWords: m.bannedWords,
      },
      { title: c.title, objective: c.objective, platforms: c.platforms, brief: c.brief },
    );
    const elapsed = Date.now() - startedAt;

    // 3. 落库
    const created = await prisma.campaign.create({
      data: {
        merchantId: merchant.id,
        title: c.title,
        objective: c.objective,
        platforms: JSON.stringify(c.platforms),
        brief: c.brief,
        frames: JSON.stringify(blueprint.frames),
        taskCard: JSON.stringify(blueprint.taskCard),
        rewardTiers: JSON.stringify(blueprint.rewardTiers),
        aiMode: blueprint.aiMode,
        aiNote: blueprint.note,
        publicToken: campaignToken(),
        status: "active",
      },
    });

    return NextResponse.json({
      campaignId: created.id,
      publicToken: created.publicToken,
      aiMode: blueprint.aiMode,
      aiNote: blueprint.note,
      elapsedMs: elapsed,
      frames: blueprint.frames.map((f) => ({ platform: f.platform, angle: f.angle })),
      taskFields: blueprint.taskCard.map((t) => ({ id: t.id, label: t.label, type: t.type })),
      rewardTiers: blueprint.rewardTiers,
    });
  } catch (err) {
    console.error("[campaigns:create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建活动失败" },
      { status: 500 },
    );
  }
}
