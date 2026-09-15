import QRCode from "qrcode";
import { headers } from "next/headers";
import { toLanUrl } from "@/lib/lan";

/**
 * 活动 H5 入口二维码。
 * 服务端直接出图（data URL），不依赖第三方二维码服务 —— 离线也能生成。
 */
export async function QrCard({
  path,
  title,
  desc,
  compact = false,
}: {
  path: string;
  title: string;
  desc?: string;
  /**
   * 紧凑模式：只出图 + 一行说明，用于「我的福利」这类需要一票一码的地方。
   * 老客在店里是要**当场把码递过去**的，所以码必须直接可见，
   * 不能藏在展开层里 —— 那会变成「你先点一下我再扫」的尴尬流程。
   */
  compact?: boolean;
}) {
  const h = await headers();
  const lanUrl = toLanUrl(h.get("host"), path);
  const dataUrl = await QRCode.toDataURL(lanUrl, {
    width: compact ? 320 : 480,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  if (compact) {
    return (
      <div className="mt-2.5 flex items-center gap-2.5 border-t border-ink-100 pt-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`${title} 核销码`}
          width={84}
          height={84}
          className="shrink-0 rounded-md border border-ink-100 bg-white"
        />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-ink-700">{title}</div>
          {desc && <p className="hint mt-0.5">{desc}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 sm:flex-row sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="活动二维码"
        width={148}
        height={148}
        className="shrink-0 rounded-lg border border-ink-100"
      />
      <div className="min-w-0 text-center sm:text-left">
        <div className="text-sm font-semibold text-ink-900">{title}</div>
        {desc && <p className="hint mt-1">{desc}</p>}
        <div className="mt-2 break-all rounded-md bg-ink-50 px-2 py-1.5 font-mono text-[11px] text-ink-600">
          {lanUrl}
        </div>
        <p className="hint mt-2">
          手机扫码即可进入老客 H5（需与本机同一局域网）。二维码里已经是局域网地址，
          不是 localhost，所以手机能直接打开。
        </p>
      </div>
    </div>
  );
}
