"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * 老客的分享动作。
 *
 * 为什么要有这个组件：工作台上有一个「分享次数」指标，但它原来**只由种子数据产生** ——
 * 应用里没有任何代码路径会写 `share` 事件，所以真实活动的这个数字恒为 0。
 * 一个永远不动的指标比没有指标更糟：它会让人以为链路已经打通。
 *
 * 这里把「复制分享文案」这个真实动作接上：老客复制一次，就记一次 share 事件。
 * 上报失败不阻断复制 —— 打点不该影响老客要办的事。
 */
export function ShareActionButton({
  shareToken,
  title,
  body,
}: {
  shareToken: string;
  title: string;
  body: string;
}) {
  const [done, setDone] = useState(false);
  const [tip, setTip] = useState("");

  async function share() {
    const url = `${window.location.origin}/s/${shareToken}`;
    const text = `${title}\n\n${body}\n\n${url}`;

    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 非 https 或浏览器拒绝剪贴板权限时给出可行动提示，而不是静默失败
      copied = false;
    }

    setTip(copied ? "已复制，去粘贴分享吧" : "复制失败，请长按下方链接手动复制");
    setDone(true);
    setTimeout(() => setDone(false), 2200);

    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken, type: "share" }),
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={share} className="btn btn-ghost !px-2.5 !py-1.5 text-[11px]">
        {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Share2 className="h-3 w-3" />}
        {done ? "已复制" : "复制分享文案"}
      </button>
      {tip && <span className="text-[11px] text-ink-500">{tip}</span>}
    </span>
  );
}
