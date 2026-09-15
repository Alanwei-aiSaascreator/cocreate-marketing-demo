import { cookies, headers } from "next/headers";

const COOKIE = "cc_viewer";

/**
 * 读取当前访客的老客身份 token。
 * 优先读 middleware 注入的请求头（首次访问时 cookie 还没回到请求上），
 * 退化读 cookie（例如不经过 middleware 的 API 调用）。
 */
export async function readViewerToken(): Promise<string> {
  const h = await headers();
  const fromHeader = h.get("x-cc-viewer");
  if (fromHeader) return fromHeader;

  const c = await cookies();
  return c.get(COOKIE)?.value ?? "";
}
