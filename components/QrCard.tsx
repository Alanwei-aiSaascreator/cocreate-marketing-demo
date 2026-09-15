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
}: {
  path: string;
  title: string;
  desc?: string;
}) {
  const h = await headers();
  const lanUrl = toLanUrl(h.get("host"), path);
  const dataUrl = await QRCode.toDataURL(lanUrl, {
    width: 480,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0f172a", light: "#ffffff" },
  });

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
