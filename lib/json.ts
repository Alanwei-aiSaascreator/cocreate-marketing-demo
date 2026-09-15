/**
 * SQLite 不支持 Json 类型，所有结构化字段以 String 存 JSON。
 * 这里做一层类型化出入口，避免到处写 try/catch 的 JSON.parse。
 *
 * 写入侧故意**不**提供 stringify 包装：全仓统一用 `JSON.stringify(x)`，
 * 多一层同名包装只会让人以为它有额外语义。读取侧的 parseJson 则必须有，
 * 因为它承担了「脏数据不能炸页面」这个职责。
 */

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
