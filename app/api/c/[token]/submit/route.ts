import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
import { detectImageFormat, describeUnsupportedFormat } from "@/lib/image-server";
import type { Platform, PlatformFrame, TaskField } from "@/lib/types";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
  // 3. 图片：读进内存 + 用魔数校验真实格式，**但先不落盘**。
  //
  // 两个刻意的顺序决定（原来都做错了）：
  // a) 落盘必须等到「确认要入库」那一刻。原来先落盘再校验必填，
  //    老客漏填一个字段就会在 public/uploads/ 留下没有任何记录引用的孤儿图，且没有回收路径。
  // b) 格式以文件头为准，不信任客户端声明的 Content-Type（它由请求方随便填，
  //    把任意二进制标成 image/png 就能穿过白名单）。
  //    顺带给出 HEIC 的明确提示 —— 那正是手机拍照最常见的失败原因。
  const rawImage = form.get("image");
  const imageField = taskCard.find((f) => f.type === "image");
  let imageBytes: Buffer | null = null;
  let imageExt: string | null = null;
  let imageHash: string | null = null;
  let imageUrl: string | null = null;

  if (rawImage && typeof rawImage === "object" && "arrayBuffer" in rawImage) {
    const file = rawImage as File;
    if (file.size > 0) {
      if (file.size > MAX_IMAGE_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        return NextResponse.json(
          { error: `图片有 ${mb}MB，超过了 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 上限。请换一张，或先用手机截屏再上传。` },
          { status: 400 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const format = detectImageFormat(bytes);
      if (!format) {
        const kind = describeUnsupportedFormat(bytes);
        return NextResponse.json(
          {
            error: kind
              ? `这张图是 ${kind} 格式，浏览器没能转成通用格式。请在手机相册里先截图，再上传截图。`
              : "没能识别这张图的格式。请换一张图片试试。",
          },
          { status: 400 },
        );
      }

      imageBytes = bytes;
      imageExt = format.ext;
      imageHash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    }
  }

  // 4. 必填校验（图片是必填项时单独给一句人话提示）
  const missing = taskCard
    .filter((f) => f.required && f.type !== "image" && !answers[f.id])
    .map((f) => f.label);
  if (missing.length > 0) {
    return NextResponse.json({ error: `还差：${missing.join("、")}` }, { status: 400 });
  }
  if (imageField?.required && !imageBytes) {
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
    // 此刻文件还没落盘（见上面第 3 步），只传"有没有图"
    hasImage: !!imageBytes,
    riskFlags,
    priorSubmissions: priorCount,
    requiredTextFields,
    imageRequired,
  });

  const blocked = riskFlags.some((f) => f.level === "block");

  // 7. 到这一步才真正把图片落盘 —— 前面的格式校验、必填校验、风控都可能提前 return，
  //    提前落盘就会在这些路径上留下没有任何记录引用的孤儿文件。
  let writtenImagePath: string | null = null;
  if (imageBytes && imageExt && !blocked) {
    const dir = join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${imageExt}`;
    writtenImagePath = join(dir, filename);
    await writeFile(writtenImagePath, imageBytes);
    imageUrl = `/uploads/${filename}`;
  }

  // 8. 落库。写盘之后若发生任何异常，把刚写的文件删掉，不留孤儿。
  let submission;
  try {
    submission = await prisma.submission.create({
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
  } catch (err) {
    if (writtenImagePath) await unlink(writtenImagePath).catch(() => undefined);
    throw err;
  }

  // 9. 被风控拦下的素材不进内容库，也不产生贡献值
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

  // 10. AI 多平台加工（失败自动降级到规则引擎，不影响老客拿福利）
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
        // 逐条写真实来源。写成 composed.aiMode 是错的 —— 模型可能只给了部分平台，
        // 其余是规则引擎补的，整批写同一个值会让那条模板内容在库里被标成「大模型产出」。
        aiMode: item.source,
        degraded: item.fallback,
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
      // 逐条如实返回来源，前端才能显示「这条是模板拼的」而不是笼统标一个整批状态
      source: c.aiMode,
      fallback: c.degraded,
    })),
    campaignPoints: settled.campaignPoints,
    totalPoints: settled.totalPoints,
    rewards: settled.granted,
  });
}
