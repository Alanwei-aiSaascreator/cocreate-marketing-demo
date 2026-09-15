"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, PlatformBadge, EmptyState } from "@/components/ui";
import { AdoptButton, CopyButton } from "@/components/actions";
import { cn } from "@/lib/utils";
import { PLATFORM_META, VARIANT_HINT, VARIANT_LABEL, type ContentVariant, type Platform } from "@/lib/types";
import type { DecodedContent } from "@/lib/queries";

export function ContentLibrary({ contents }: { contents: DecodedContent[] }) {
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [onlyAdopted, setOnlyAdopted] = useState(false);
  /**
   * 每张卡片当前展示哪一版产出。
   * 有对比版时可以在「大模型 / 规则引擎」之间切换 —— 同一份素材、同一个平台、
   * 两份产出并排看，才能直观说明规则引擎差在哪（标题截断、分点撞车、病句）。
   */
  const [shownVariant, setShownVariant] = useState<Record<string, ContentVariant>>({});
  const comparableCount = useMemo(() => contents.filter((c) => c.compare).length, [contents]);

  const counts = useMemo(() => {
    const map = new Map<Platform | "all", number>();
    map.set("all", contents.length);
    for (const c of contents) {
      map.set(c.platform, (map.get(c.platform) ?? 0) + 1);
    }
    return map;
  }, [contents]);

  const filtered = useMemo(
    () =>
      contents.filter(
        (c) => (platform === "all" || c.platform === platform) && (!onlyAdopted || c.adopted),
      ),
    [contents, platform, onlyAdopted],
  );

  if (contents.length === 0) {
    return (
      <EmptyState
        title="内容库还是空的"
        desc="等老客提交素材后，AI 会自动把素材加工成各平台内容落到这里。"
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlatform("all")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs",
            platform === "all"
              ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
              : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
          )}
        >
          全部 {counts.get("all")}
        </button>
        {Object.values(PLATFORM_META).map((meta) => {
          const n = counts.get(meta.id) ?? 0;
          if (n === 0) return null;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => setPlatform(meta.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs",
                platform === meta.id
                  ? "border-brand-400 bg-brand-50 font-medium text-brand-700"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
              )}
            >
              {meta.emoji} {meta.name} {n}
            </button>
          );
        })}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={onlyAdopted}
            onChange={(e) => setOnlyAdopted(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-brand-500)]"
          />
          只看已采用
        </label>
      </div>

      {comparableCount > 0 && (
        <p className="mb-4 text-[11px] leading-relaxed text-ink-500">
          其中 <span className="font-semibold text-ink-700">{comparableCount}</span> 条
          <strong className="font-medium">同时存了两种产出</strong>（同一份素材、同一个平台），
          卡片上可以切换对比 —— 切到「规则引擎产出」能直接看到它是怎么机械拼装的：
          标题被硬截断、分点撞车、偶尔出病句。
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="这个筛选下没有内容" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((c) => {
            // 有对比版时可以在两版产出之间切换 —— 纯客户端切换，不重新请求
            const shown = shownVariant[c.id] ?? c.variant;
            const usingCompare = shown !== c.variant && !!c.compare;
            const d = usingCompare && c.compare ? c.compare : c;

            return (
            <div key={c.id} className="card p-4">
              {/* 头部：平台 + 老客 + 生成方式 */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={c.platform} />
                  <span className="text-xs text-ink-500">
                    {c.contributor.avatarEmoji} {c.contributor.nickname}
                  </span>
                  {c.adopted && <Badge tone="green">已采用</Badge>}
                  {c.compare && (
                    <Badge tone={usingCompare ? "amber" : "blue"}>可对比两版</Badge>
                  )}
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-400"
                  title={d.aiMode === "llm" ? "由大模型加工" : "由规则引擎加工"}
                >
                  <Sparkles className="h-3 w-3" />
                  {VARIANT_LABEL[d.variant]}
                  {d.degraded && <span className="text-amber-600">· 降级</span>}
                </span>
              </div>

              {/* 两版切换 —— 同一份素材的两种产出并排对比 */}
              {c.compare && (
                <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-1.5">
                  <div className="flex gap-1">
                    {[c.variant, c.compare.variant].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setShownVariant((prev) => ({ ...prev, [c.id]: v }))
                        }
                        className={cn(
                          "flex-1 rounded-md px-2 py-1.5 text-[11px] transition",
                          shown === v
                            ? "bg-white font-medium text-ink-900 shadow-sm"
                            : "text-ink-500 hover:text-ink-700",
                        )}
                      >
                        {VARIANT_LABEL[v]}产出
                      </button>
                    ))}
                  </div>
                  <p className="px-2 pb-0.5 pt-1.5 text-[11px] leading-relaxed text-ink-500">
                    {VARIANT_HINT[d.variant]}
                  </p>
                </div>
              )}

              {/* 老客原话 —— 让商家一眼看到内容的「事实来源」 */}
              <div className="mt-3 rounded-lg bg-ink-50 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-ink-500">老客提交的原始素材</span>
                </div>
                <div className="space-y-0.5 text-xs text-ink-600">
                  {c.answers.feeling && <div>「{c.answers.feeling}」</div>}
                  {c.answers.recommend && <div>推荐：{c.answers.recommend}</div>}
                  {c.answers.detail && <div>细节：{c.answers.detail}</div>}
                </div>
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt="老客实拍图"
                    className="mt-2 h-16 w-16 rounded-md border border-ink-200 object-cover"
                  />
                )}
              </div>

              {/* AI 产出（按当前选中的版本渲染） */}
              <h3 className="mt-3 text-sm font-semibold text-ink-900">{d.title}</h3>
              <div className="content-body mt-2 max-h-72 overflow-y-auto rounded-lg border border-ink-100 bg-white p-3 text-[13px] text-ink-700">
                {d.body}
              </div>

              {d.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {d.tags.map((t) => (
                    <span key={t} className="text-xs text-blue-600">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {d.coverHint && (
                <p className="hint mt-2">
                  <span className="font-medium text-ink-600">封面建议：</span>
                  {d.coverHint}
                </p>
              )}

              {d.complianceNote && d.complianceNote !== "无" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {d.complianceNote}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                <AdoptButton submissionId={c.submissionId} adopted={c.adopted} compact />
                <CopyButton text={`${d.title}\n\n${d.body}\n\n${d.tags.join(" ")}`} label="复制全文" />
                <Link
                  href={`/s/${d.shareToken}`}
                  target="_blank"
                  className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  分享落地页
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
