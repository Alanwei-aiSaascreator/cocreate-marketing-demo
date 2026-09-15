import { NextResponse } from "next/server";
import { MERCHANT_COOKIE, merchantAuthRequired, merchantToken, merchantTokenFor } from "@/lib/merchant-auth";

/**
 * 商家口令验证 / 退出。
 *
 * 这是 `/api/merchant/*` 下唯一不需要口令的接口（在 middleware 的放行名单里），
 * 所以这里自己必须做完整校验，不能依赖上游。
 */
export async function POST(request: Request) {
  let body: { password?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(MERCHANT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  if (!merchantAuthRequired()) {
    return NextResponse.json({
      ok: true,
      note: "本部署未设置 MERCHANT_PASSWORD，商家接口处于开放状态（演示模式）。",
    });
  }

  const input = (body.password ?? "").trim();
  if (!input) {
    return NextResponse.json({ error: "请输入口令" }, { status: 400 });
  }

  const [expected, actual] = await Promise.all([merchantToken(), merchantTokenFor(input)]);
  if (actual !== expected) {
    return NextResponse.json({ error: "口令不正确" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(MERCHANT_COOKIE, expected, {
    // httpOnly：脚本读不到，减少 XSS 场景下的影响面
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
