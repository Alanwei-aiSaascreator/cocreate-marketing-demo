"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Send,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "@/lib/types";

/**
 * 半自动发布面板。
 *
 * ── 为什么是「半自动」而不是「一键发布」──
 * 小红书、抖音、点评、朋友圈都没有面向第三方的内容发布接口。
 * 在 Demo 里放一个「一键同步全平台」的按钮非常容易，但那是一句兑现不了的承诺 ——
 * 面试官只要追问一句「你调的是哪个开放平台接口」，当场就穿了。
 *
 * 所以这里把**真实可行的流程**压缩到最短，每一步都真的有用：
 *   1. 文案、标签、配图都备好，点一下复制到剪贴板；
 *   2. 打开平台的网页创作页（没有网页入口的平台会如实说明只能走 App）；
 *   3. 粘贴发布，回来点「标记已发布」，商家就能看见哪些素材还躺在库里没用。
 *
 * 第 3 步这个标记不是装饰：没有它，商家永远不知道内容到底发出去了没有。
 */
export function PublishPanel({
  contentId,
  platform,
  title,
  body,
  tags,
  imageUrl,
  published,
  onPublishedChange,
}: {
  contentId: string;
  platform: Platform;
  title: string;
  body: string;
  tags: string[];
  imageUrl: string | null;
  published: boolean;
  /** 本地同步状态用，避免为了一个徽标整页 refresh 造成卡片闪动 */
  onPublishedChange?: (v: boolean) => void;
}) {
  const router = useRouter();
  const meta = PLATFORM_META[platform];
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"all" | "tags" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localPublished, setLocalPublished] = useState(published);
  const [, startTransition] = useTransition();

  // 朋友圈不加话题标签，拼进去反而像营销号
  const fullText =
    platform === "moments"
      ? `${title}\n\n${body}`
      : [`${title}`, body, tags.join(" ")].filter(Boolean).join("\n\n");

  async function copy(kind: "all" | "tags", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // 剪贴板可能在非安全上下文里被拒绝，如实告诉用户去手动选中复制
      setError("浏览器拒绝了剪贴板访问，请手动选中文字复制");
    }
  }

  async function togglePublished() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/merchant/contents/${contentId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !localPublished }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "操作失败");
        return;
      }
      setLocalPublished(data.published);
      onPublishedChange?.(data.published);
      startTransition(() => router.refresh());
    } catch {
      setError("网络异常");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-xs font-medium text-ink-700"
      >
        <Send className="h-3.5 w-3.5" />
        准备发布到{meta.name}
        {localPublished ? (
          <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            已发布
          </span>
        ) : (
          <span className="ml-1 rounded bg-ink-200 px-1.5 py-0.5 text-[10px] text-ink-600">
            未发布
          </span>
        )}
        <span className="ml-auto text-[11px] text-ink-400">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="mt-2.5 space-y-2 border-t border-ink-200 pt-2.5">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              <strong className="font-medium text-ink-600">本站不调用任何平台接口</strong>
              —— 四个平台都未开放第三方发布能力。下面是真实流程，不是占位按钮。
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => copy("all", fullText)}
              className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
            >
              {copied === "all" ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied === "all" ? "已复制全文" : "① 复制全文"}
            </button>

            {tags.length > 0 && platform !== "moments" && (
              <button
                type="button"
                onClick={() => copy("tags", tags.join(" "))}
                className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
              >
                {copied === "tags" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === "tags" ? "已复制标签" : "复制标签"}
              </button>
            )}

            {imageUrl && (
              // 配图就是老客的实拍图 —— 直接下载，省掉「右键另存为」那一步
              <a
                href={imageUrl}
                download
                className="btn btn-ghost !px-2.5 !py-1.5 text-xs"
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                下载实拍图
              </a>
            )}

            {meta.publishUrl && (
              <a
                href={meta.publishUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary !px-2.5 !py-1.5 text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                ② 打开{meta.name}创作页
              </a>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-ink-500">{meta.publishNote}</p>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-2">
            <button
              type="button"
              onClick={togglePublished}
              disabled={busy}
              className={cn("btn !px-2.5 !py-1.5 text-xs", localPublished ? "btn-ghost" : "btn-primary")}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : localPublished ? (
                <Undo2 className="h-3.5 w-3.5" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {localPublished ? "取消已发布标记" : "③ 我发好了，标记已发布"}
            </button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
