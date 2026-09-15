import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "cc_viewer";

/**
 * 老客免登录认人。
 *
 * 关键点：cookie 要在**本次请求**里就能被服务端组件读到，否则第一次访问
 * 拿不到身份、提交时才知道自己是谁。所以除了写 response cookie，
 * 还要把 token 塞进请求头转发下去，服务端优先读头、退化读 cookie。
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(COOKIE)?.value;
  const token = existing || crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-cc-viewer", token);

  const response = NextResponse.next({ request: { headers } });

  if (!existing) {
    response.cookies.set(COOKIE, token, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: ["/c/:path*", "/s/:path*", "/api/c/:path*", "/api/track/:path*"],
};
