"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

function post(shareToken: string, type: "view" | "click") {
  return fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareToken, type }),
    keepalive: true,
  }).catch(() => undefined);
}

/** 记录一次浏览 */
export function ShareTracker({ shareToken }: { shareToken: string }) {
  useEffect(() => {
    void post(shareToken, "view");
  }, [shareToken]);
  return null;
}

/**
 * 有效回流 CTA。
 *
 * 这一点是「奖励绑定真实引流效果」在界面上的体现：
 * 访客真的从分享内容点进店铺/活动页，贡献者才会加那 5 分。
 */
export function TrackedCta({
  shareToken,
  href,
  children,
  className,
}: {
  shareToken: string;
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const [clicked, setClicked] = useState(false);

  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        if (clicked) return;
        setClicked(true);
        void post(shareToken, "click");
      }}
    >
      {children}
    </a>
  );
}
