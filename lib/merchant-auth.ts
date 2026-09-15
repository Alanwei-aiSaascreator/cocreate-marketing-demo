/**
 * 商家后台的最简保护。
 *
 * 这是 Demo 里唯一一道「商家侧」的门，刻意做得很薄：
 * - **没设 `MERCHANT_PASSWORD` 时完全放开**（演示模式），但界面和文档都会明确标出来 ——
 *   安全缺口最危险的状态不是"存在"，而是"存在但没人知道"。
 * - 设了之后，`/merchant/*` 与 `/api/merchant/*` 都需要先通过口令页。
 *
 * 它能挡住「随手一个 curl 就核销掉别人的券」，但**不是生产方案**。生产至少还需要：
 * 商家账号体系、资源归属校验（核销时确认这张券属于当前商家）、写接口限流。
 *
 * 用 Web Crypto 而不是 node:crypto —— middleware 跑在 edge runtime，
 * 那里没有 node:crypto 的同步 API。
 */
export const MERCHANT_COOKIE = "cc_merchant";

const SALT = "cocreate:merchant:v1";

/** 是否开启商家鉴权。默认关闭，保持演示零门槛。 */
export function merchantAuthRequired(): boolean {
  return (process.env.MERCHANT_PASSWORD ?? "").length > 0;
}

/**
 * 口令 → cookie 值：只存哈希，不存明文口令。
 *
 * 比对方式是普通字符串相等 —— 对 Demo 足够。
 * 生产应换成定时安全比较（避免按字符泄露信息）+ 正式会话与过期策略。
 */
export async function merchantTokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}|${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 当前部署口令对应的 cookie 值 */
export async function merchantToken(): Promise<string> {
  return merchantTokenFor(process.env.MERCHANT_PASSWORD ?? "");
}

/** 该请求是否已通过商家口令 */
export async function isMerchantAuthorized(cookieValue: string | undefined): Promise<boolean> {
  if (!merchantAuthRequired()) return true;
  if (!cookieValue) return false;
  return cookieValue === (await merchantToken());
}
