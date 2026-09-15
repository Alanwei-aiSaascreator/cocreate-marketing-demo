/**
 * SQLite 不支持 Json 类型，所有结构化字段以 String 存 JSON。
 * 这里做一层类型化出入口，避免到处写 try/catch 的 JSON.parse。
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

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** 把 DB 行里的 JSON 字段一次性解开成对象 */
export function hydrate<T extends Record<string, unknown>>(
  row: T,
  keys: (keyof T)[],
  fallbacks: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of keys) {
    const k = String(key);
    out[k] = parseJson(row[key] as unknown as string, fallbacks[k] ?? null);
  }
  return out;
}
