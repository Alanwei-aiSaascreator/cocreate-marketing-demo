import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishSchema } from "@/lib/validators";

/**
 * 标记 / 取消「已发布」。
 *
 * ── 为什么这不是「一键发布」──
 * 小红书、抖音、点评、朋友圈**都没有**面向第三方的内容发布接口
 * （有的只是给签约服务商、且要过平台审核的企业通道）。
 * 所以这里不假装能自动发出去，只做两件能兑现的事：
 *   1. 把发布真正需要的东西备齐 —— 文案、标签、配图、平台创作页入口；
 *   2. 如实记录商家到底发没发出去，让他看得见「哪些素材还躺在库里没用上」。
 *
 * 在 Demo 里写一个「一键同步全平台」的假按钮很容易，
 * 但那是一句兑现不了的承诺，面试官一追问「你调的是哪个开放平台接口」就穿了。
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

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "published 必须是布尔值" }, { status: 400 });
  }
  const { published } = parsed.data;

  const content = await prisma.generatedContent.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!content) {
    return NextResponse.json({ error: "内容不存在" }, { status: 404 });
  }

  const updated = await prisma.generatedContent.update({
    where: { id },
    data: { publishedAt: published ? new Date() : null },
    select: { publishedAt: true },
  });

  return NextResponse.json({ ok: true, published, publishedAt: updated.publishedAt });
}
