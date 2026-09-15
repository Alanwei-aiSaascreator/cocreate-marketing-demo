import { NextResponse, type NextRequest } from "next/server";
import { MERCHANT_COOKIE, isMerchantAuthorized, merchantAuthRequired } from "@/lib/merchant-auth";

const VIEWER_COOKIE = "cc_viewer";

/** 免鉴权的商家路径：口令页本身和它的提交接口 */
const MERCHANT_PUBLIC = ["/merchant/login", "/api/merchant/login"];

function isMerchantPath(pathname: string): boolean {
  return pathname === "/merchant" || pathname.startsWith("/merchant/") || pathname.startsWith("/api/merchant/");
}

/**
 * 两件事：老客免登录认人 + 商家后台口令。
 *
 * ── 老客侧 ──
 * cookie 要在**本次请求**里就能被服务端组件读到，否则第一次访问拿不到身份、
 * 提交时才知道自己是谁。所以除了写 response cookie，还要把 token 塞进请求头转发下去，
 * 服务端优先读头、退化读 cookie。
 *
 * ── 商家侧 ──
 * 未设 MERCHANT_PASSWORD 时完全放开（演示模式，界面会明确标注）；
 * 设了之后，页面未授权就跳口令页，接口未授权直接 401。
 * 注意**只拦写接口和页面**：如果连 API 也只回 401 而没有可读的提示，
 * 前端会拿到一个 JSON 报错、用户完全不知道发生了什么。
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isMerchantPath(pathname) && !MERCHANT_PUBLIC.includes(pathname)) {
    if (merchantAuthRequired()) {
      const authorized = await isMerchantAuthorized(request.cookies.get(MERCHANT_COOKIE)?.value);
      if (!authorized) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "需要先通过商家口令验证（本部署已设置 MERCHANT_PASSWORD）" },
            { status: 401 },
          );
        }
        const loginUrl = new URL("/merchant/login", request.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
    // 商家路径不需要老客身份，直接放行
    return NextResponse.next();
  }

  // ── 老客侧：下发/透传 viewer token ──
  const existing = request.cookies.get(VIEWER_COOKIE)?.value;
  const token = existing || crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-cc-viewer", token);

  const response = NextResponse.next({ request: { headers } });

  if (!existing) {
    response.cookies.set(VIEWER_COOKIE, token, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/c/:path*",
    "/s/:path*",
    "/api/c/:path*",
    "/api/track/:path*",
    "/merchant",
    "/merchant/:path*",
    "/api/merchant/:path*",
  ],
};
