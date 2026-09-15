import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import { shareToken } from "@/lib/ids";
import { composeContents } from "@/lib/ai";
import { detectRisks } from "@/lib/domain/risk";
import { scoreSubmission } from "@/lib/domain/scoring";
import { settleContributor } from "@/lib/domain/settle";
import { getOrCreateContributor } from "@/lib/queries";
import { readViewerToken } from "@/lib/viewer";
import type { Platform, PlatformFrame, TaskField } from "@/lib/types";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * 老客提交共创素材。
 *
 * 这是整个闭环里最重的一步，一次请求串完五件事：
 *   风控 → 计分 → AI 多平台加工 → 内容入库 → 结算发券
 * AI 加工失败不会让提交失败 —— 会降级到规则引擎，老客照样拿得到福利。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { publicToken: token },
    include: { merchant: true },
  });
  if (!campaign) {
    // 和「活动已结束」严格区分：这是链接本身失效（数据被重置 / 活动被删），
    // 提示老客「你的素材没丢、换最新链接进来」，而不是一句含糊的「不存在或已结束」。
    return NextResponse.json(
      {
        error:
          "这个共创链接已失效：活动可能已被重置或删除。你的内容没有丢失，换一个最新的入口链接重新进来即可。",
      },
      { status: 404 },
    );
  }
  if (campaign.status !== "active") {
    return NextResponse.json({ error: "活动已结束，感谢你的参与。" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const taskCard = parseJson<TaskField[]>(campaign.taskCard, []);
  const frames = parseJson<PlatformFrame[]>(campaign.frames, []);
  const platforms = parseJson<Platform[]>(campaign.platforms, []);
  const bannedWords = parseJson<string[]>(campaign.merchant.bannedWords, []);

  // 1. 解析并按任务卡清洗答案（防超长、防脏数据）
  let rawAnswers: Record<string, unknown> = {};
  try {
    rawAnswers = JSON.parse(String(form.get("answers") ?? "{}"));
  } catch {
    return NextResponse.json({ error: "答案格式不正确" }, { status: 400 });
  }

  const answers: Record<string, string> = {};
  for (const field of taskCard) {
    const value = rawAnswers[field.id];
    if (value === undefined || value === null) continue;
    let text = String(value).trim();
    if (field.maxLength) text = text.slice(0, field.maxLength);
    if (text) answers[field.id] = text;
  }

  // 2. 图片：可选但影响分数，类型和大小严格校验
  let imageUrl: string | null = null;
  let imageHash: string | null = null;
  const imageField = taskCard.find((f) => f.type === "image");
  const rawImage = form.get("image");

  if (rawImage && typeof rawImage === "object" && "arrayBuffer" in rawImage) {
    const file = rawImage as File;
    if (file.size > 0) {
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "图片太大了，请压缩到 8MB 以内" }, { status: 400 });
      }
      const ext = ALLOWED_MIME[file.type];
      if (!ext) {
        return NextResponse.json(
          { error: "只支持 JPG / PNG / WebP / GIF 格式的图片" },
          { status: 400 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      imageHash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);

      const dir = join(process.cwd(), "public", "uploads");
      await mkdir(dir, { recursive: true });
      const filename = `${randomUUID()}.${ext}`;
      await writeFile(join(dir, filename), bytes);
      imageUrl = `/uploads/${filename}`;
    }
  }

  // 3. 必填校验（图片是必填项时单独给一句人话提示）
  const missing = taskCard
    .filter((f) => f.required && f.type !== "image" && !answers[f.id])
    .map((f) => f.label);
  if (missing.length > 0) {
    return NextResponse.json({ error: `还差：${missing.join("、")}` }, { status: 400 });
  }
  if (imageField?.required && !imageUrl) {
    return NextResponse.json({ error: "传一张实拍图就能提交了，随手拍就行" }, { status: 400 });
  }

  // 4. 老客身份（免登录）
  const viewer = await readViewerToken();
  const contributor = await getOrCreateContributor(viewer);
  const nicknameInput = String(form.get("nickname") ?? "").trim().slice(0, 20);
  if (nicknameInput && nicknameInput !== contributor.nickname) {
    await prisma.contributor.update({
      where: { id: contributor.id },
      data: { nickname: nicknameInput },
    });
    contributor.nickname = nicknameInput;
  }

  // 5. 反刷数据：同活动内的历史图片 hash 与文本
  const [priorCount, priorSubs] = await Promise.all([
    prisma.submission.count({
      where: { campaignId: campaign.id, contributorId: contributor.id },
    }),
    prisma.submission.findMany({
      where: { campaignId: campaign.id },
      select: { imageHash: true, answers: true },
    }),
  ]);

  const riskFlags = detectRisks({
    answers,
    imageHash,
    existingImageHashes: priorSubs.map((s) => s.imageHash).filter((h): h is string => !!h),
    existingAnswerTexts: priorSubs
      .map((s) =>
        Object.values(parseJson<Record<string, string>>(s.answers, {}))
          .filter(Boolean)
          .join("|"),
      )
      .filter(Boolean),
    priorSubmissions: priorCount,
    bannedWords,
  });

  // 实拍图不在 answers 里，必须和必填文字项分开传给计分器
  const requiredTextFields = taskCard
    .filter((f) => f.required && f.type !== "image")
    .map((f) => ({ id: f.id, label: f.label }));
  const imageRequired = !!taskCard.find((f) => f.type === "image")?.required;

  const score = scoreSubmission({
    answers,
    imageUrl,
    riskFlags,
    priorSubmissions: priorCount,
    requiredTextFields,
    imageRequired,
  });

  const blocked = riskFlags.some((f) => f.level === "block");

  // 6. 落库
  const submission = await prisma.submission.create({
    data: {
      campaignId: campaign.id,
      contributorId: contributor.id,
      answers: JSON.stringify(answers),
      imageUrl,
      imageHash,
      status: blocked ? "rejected" : "processed",
      riskFlags: JSON.stringify(riskFlags),
      points: score.points,
    },
  });

  // 7. 被风控拦下的素材不进内容库，也不产生贡献值
  if (blocked) {
    return NextResponse.json({
      ok: false,
      blocked: true,
      submissionId: submission.id,
      points: 0,
      breakdown: score.breakdown,
      riskFlags,
      contents: [],
      rewards: [],
      message: "这条内容被风控拦下了，没有进入内容库。修改后可以重新提交。",
    });
  }

  // 8. AI 多平台加工（失败自动降级到规则引擎，不影响老客拿福利）
  const merchantLike = {
    name: campaign.merchant.name,
    category: campaign.merchant.category,
    city: campaign.merchant.city,
    address: campaign.merchant.address,
    avgPrice: campaign.merchant.avgPrice,
    tones: parseJson<string[]>(campaign.merchant.tones, []),
    sellingPoints: parseJson<string[]>(campaign.merchant.sellingPoints, []),
    bannedWords,
  };
  const campaignLike = {
    title: campaign.title,
    objective: campaign.objective,
    platforms,
    brief: campaign.brief,
  };

  const composed = await composeContents(
    merchantLike,
    campaignLike,
    { id: submission.id, answers },
    frames,
    imageUrl ? "老客已提供一张实拍图，封面建议请基于这张图来写。" : "老客未提供实拍图。",
  );

  for (const item of composed.contents) {
    await prisma.generatedContent.create({
      data: {
        campaignId: campaign.id,
        submissionId: submission.id,
        platform: item.platform,
        title: item.title,
        body: item.body,
        tags: JSON.stringify(item.tags),
        coverHint: item.coverHint,
        complianceNote: item.complianceNote,
        aiMode: composed.aiMode,
        degraded: composed.degraded,
        aiNote: composed.note,
        shareToken: shareToken(),
      },
    });
  }

  // 9. 贡献值 + 结算发券
  await prisma.contribution.create({
    data: {
      campaignId: campaign.id,
      contributorId: contributor.id,
      submissionId: submission.id,
      breakdown: JSON.stringify(score.breakdown),
      points: score.points,
      reason: score.reason,
    },
  });

  await prisma.trackEvent.create({
    data: {
      type: "submit",
      campaignId: campaign.id,
      submissionId: submission.id,
      meta: JSON.stringify({ sourceChannel: contributor.sourceChannel }),
    },
  });

  const settled = await settleContributor(campaign.id, contributor.id);

  const contents = await prisma.generatedContent.findMany({
    where: { submissionId: submission.id },
    orderBy: { platform: "asc" },
  });

  return NextResponse.json({
    ok: true,
    blocked: false,
    submissionId: submission.id,
    points: score.points,
    breakdown: score.breakdown,
    riskFlags,
    aiMode: composed.aiMode,
    degraded: composed.degraded,
    aiNote: composed.note,
    contents: contents.map((c) => ({
      id: c.id,
      platform: c.platform,
      title: c.title,
      body: c.body,
      tags: parseJson<string[]>(c.tags, []),
      coverHint: c.coverHint,
      complianceNote: c.complianceNote,
      shareToken: c.shareToken,
    })),
    campaignPoints: settled.campaignPoints,
    totalPoints: settled.totalPoints,
    rewards: settled.granted,
  });
}
