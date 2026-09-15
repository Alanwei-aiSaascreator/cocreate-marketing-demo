"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, PlatformBadge, EmptyState } from "@/components/ui";
import { AdoptButton, CopyButton } from "@/components/actions";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "@/lib/types";
import type { DecodedContent } from "@/lib/queries";

export function ContentLibrary({ contents }: { contents: DecodedContent[] }) {
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [onlyAdopted, setOnlyAdopted] = useState(false);

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

      {filtered.length === 0 ? (
        <EmptyState title="这个筛选下没有内容" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((c) => (
            <div key={c.id} className="card p-4">
              {/* 头部：平台 + 老客 + 生成方式 */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={c.platform} />
                  <span className="text-xs text-ink-500">
                    {c.contributor.avatarEmoji} {c.contributor.nickname}
                  </span>
                  {c.adopted && <Badge tone="green">已采用</Badge>}
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-400"
                  title={c.aiMode === "llm" ? "由大模型加工" : "由规则引擎加工"}
                >
                  <Sparkles className="h-3 w-3" />
                  {c.aiMode === "llm" ? "大模型" : "规则引擎"}
                </span>
              </div>

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

              {/* AI 产出 */}
              <h3 className="mt-3 text-sm font-semibold text-ink-900">{c.title}</h3>
              <div className="content-body mt-2 max-h-72 overflow-y-auto rounded-lg border border-ink-100 bg-white p-3 text-[13px] text-ink-700">
                {c.body}
              </div>

              {c.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {c.tags.map((t) => (
                    <span key={t} className="text-xs text-blue-600">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {c.coverHint && (
                <p className="hint mt-2">
                  <span className="font-medium text-ink-600">封面建议：</span>
                  {c.coverHint}
                </p>
              )}

              {c.complianceNote && c.complianceNote !== "无" && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {c.complianceNote}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                <AdoptButton submissionId={c.submissionId} adopted={c.adopted} compact />
                <CopyButton text={`${c.title}\n\n${c.body}\n\n${c.tags.join(" ")}`} label="复制全文" />
                <Link
                  href={`/s/${c.shareToken}`}
                  target="_blank"
                  className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  分享落地页
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
