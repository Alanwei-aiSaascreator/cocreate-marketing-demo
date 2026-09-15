import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { settleContributor, expireDowngradedRewards } from "@/lib/domain/settle";
import { CLICK_CAP, CLICK_POINT, clickPointItem } from "@/lib/domain/scoring";

/**
 * 行为上报：view（看了）/ share（分享）/ click（有效回流）。
 *
 * 这是「奖励绑定真实引流效果」唯一真正的技术落点。三条防刷规则：
 *   1. 同一访客对同一条内容只计一次 —— 靠 TrackEvent 的
 *      @@unique([contentId, type, viewerKey]) 在数据库层面挡，而不是先查后插。
 *   2. 自己点自己的分享不计分。
 *   3. 单项封顶 CLICK_CAP，用事务保证并发下不会超发。
 *
 * ── 关于访客身份（这里踩过一个大坑）──
 * 最初用 middleware 注入的 `x-cc-viewer` 当身份。但那个 token 在 cookie 缺失时
 * 是**每次请求现场新生成的 UUID** —— 脚本只要不带 cookie，每次都能拿到全新身份，
 * 「同访客只计一次」形同虚设，连发 10 次就能刷满封顶。
 *
 * 所以这里只认**稳定的**身份来源：真实 cookie（浏览器会自动带上），
 * 没有 cookie 就退化用 IP + User-Agent 的哈希。
 */

/** 从原始 cookie 里取稳定身份；取不到就退化到 IP+UA 指纹 */
function stableViewerKey(request: Request): string {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)cc_viewer=([^;]+)/);
  if (m && m[1]) return `cookie:${m[1]}`;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown-ip";
  const ua = request.headers.get("user-agent") || "unknown-ua";
  const digest = createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24);
  return `fp:${digest}`;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function POST(request: Request) {
  let body: { shareToken?: string; type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { shareToken: st, type } = body;
  if (!st || (type !== "view" && type !== "click" && type !== "share")) {
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

  const viewerKey = stableViewerKey(request);
  const contributorId = content.submission.contributorId;

  // view / share 只记录、不计分。靠唯一约束天然去重：同一访客重复看只留一条，
  // 这也让「浏览量」变成「独立访客数」，比累加更有意义，同时挡住刷量。
  if (type === "view" || type === "share") {
    try {
      await prisma.trackEvent.create({
        data: {
          type,
          campaignId: content.campaignId,
          submissionId: content.submissionId,
          contentId: content.id,
          viewerKey,
          meta: JSON.stringify({ kind: type }),
        },
      });
      return NextResponse.json({ ok: true, type, credited: false, first: true });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json({ ok: true, type, credited: false, first: false });
      }
      throw err;
    }
  }

  // ── click：先落事件，唯一约束负责「同访客同内容只计一次」──
  try {
    await prisma.trackEvent.create({
      data: {
        type: "click",
        campaignId: content.campaignId,
        submissionId: content.submissionId,
        contentId: content.id,
        viewerKey,
        meta: JSON.stringify({ kind: "click" }),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({
        ok: true,
        type: "click",
        credited: false,
        message: "同一个访客对同一条内容只计一次有效回流。",
      });
    }
    throw err;
  }

  // 贡献者自己点自己的分享不计分 —— 否则这条链路的分数毫无意义
  const viewerToken = viewerKey.startsWith("cookie:") ? viewerKey.slice(7) : null;
  if (viewerToken) {
    const owner = await prisma.contributor.findFirst({
      where: { id: contributorId, viewerToken },
      select: { id: true },
    });
    if (owner) {
      return NextResponse.json({
        ok: true,
        type: "click",
        credited: false,
        message: "自己点自己的分享不计入引流贡献。",
      });
    }
  }

  // 加分放进事务：并发下两个请求都读到同一个 gained，写入被事务串行化，不会超发
  const credited = await prisma.$transaction(async (tx) => {
    const rows = await tx.contribution.findMany({
      where: { submissionId: content.submissionId, reason: { startsWith: "内容带来" } },
      select: { points: true },
    });
    const gainedSoFar = rows.reduce((sum, r) => sum + r.points, 0);
    if (gainedSoFar >= CLICK_CAP) return 0;

    const points = Math.min(CLICK_POINT, CLICK_CAP - gainedSoFar);
    const totalClicks = await tx.trackEvent.count({
      where: { submissionId: content.submissionId, type: "click" },
    });
    const item = clickPointItem(totalClicks);
    await tx.contribution.create({
      data: {
        campaignId: content.campaignId,
        contributorId,
        submissionId: content.submissionId,
        breakdown: JSON.stringify([{ ...item, points }]),
        points,
        reason: `内容带来第 ${totalClicks} 次有效点击回流`,
      },
    });
    return points;
  });

  const settled = await settleContributor(content.campaignId, contributorId);
  await expireDowngradedRewards(content.campaignId, contributorId);

  return NextResponse.json({
    ok: true,
    type: "click",
    credited: credited > 0,
    gainedPoints: credited,
    capped: credited === 0,
    campaignPoints: settled.campaignPoints,
    granted: settled.granted,
    message:
      credited > 0
        ? `贡献者 +${credited} 贡献值`
        : `点击已记录，该内容引流加分已达封顶 ${CLICK_CAP}`,
  });
}
