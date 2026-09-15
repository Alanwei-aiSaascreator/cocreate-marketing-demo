/**
 * 客户端图片压缩。
 *
 * 为什么必须有（这是演示现场最容易翻车的一环）：
 * - 手机直出照片常见 3–12MB，而后端原先限制 8MB。超了老客只看到一句
 *   「图片太大了」，在 H5 里**没有任何办法自己压** —— 这条路是死的。
 * - iPhone 默认拍 HEIC，部分 Android 浏览器会原样上传 HEIC，
 *   后端白名单里没有它 → 直接被拒。
 *
 * 用 canvas 重新编码一次，两个问题一起解决：体积通常降到 200–600KB，
 * 格式统一成 JPEG。压缩失败时**原样返回**，把判断权交回给后端，
 * 不能因为压缩失败就把老客堵在这一步。
 */

/** 长边上限。1600px 对「内容配图」足够，再大平台也会压 */
const MAX_EDGE = 1600;
/** JPEG 质量。0.82 是肉眼几乎无损、体积明显下降的平衡点 */
const QUALITY = 0.82;
/** 小于这个体积就不折腾，直接原样上传 */
const SKIP_BELOW = 1.2 * 1024 * 1024;
/** 后端接受的格式（压缩后会统一成 jpeg） */
const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  /** 是否真的压了 */
  compressed: boolean;
  /** 给用户看的一句话说明 */
  note: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function loadSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  // createImageBitmap 带 imageOrientation:"from-image" 能正确处理手机照片的 EXIF 旋转，
  // 避免竖拍的照片被画成横的。部分浏览器不支持，退化到 <img>（现代浏览器渲染时也会应用 EXIF 方向）。
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // 落到 <img> 分支
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("图片解码失败"));
      });
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function compressImage(file: File): Promise<CompressResult> {
  const originalSize = file.size;
  const passthrough = (note: string): CompressResult => ({
    file,
    originalSize,
    compressedSize: originalSize,
    compressed: false,
    note,
  });

  if (typeof document === "undefined") return passthrough("");

  // 已经够小且格式合规，没必要重新编码（重新编码反而可能因为丢掉原压缩而变大）
  if (originalSize <= SKIP_BELOW && PASSTHROUGH_TYPES.includes(file.type)) {
    return passthrough("");
  }

  let loaded: Awaited<ReturnType<typeof loadSource>> | null = null;
  try {
    loaded = await loadSource(file);
    const { source, width, height, release } = loaded;

    if (!width || !height) throw new Error("读不到图片尺寸");

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 canvas");

    // JPEG 不支持透明，先铺白底，避免 PNG 透明区域变黑
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(source, 0, 0, targetW, targetH);
    release();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("图片编码失败");

    // 压完反而更大就别用（小图重新编码常见这种情况）
    if (blob.size >= originalSize) {
      return passthrough("");
    }

    const ext = file.name.replace(/\.[^.]+$/, "") || "photo";
    return {
      file: new File([blob], `${ext}.jpg`, { type: "image/jpeg", lastModified: Date.now() }),
      originalSize,
      compressedSize: blob.size,
      compressed: true,
      note: `已压缩 ${formatBytes(originalSize)} → ${formatBytes(blob.size)}`,
    };
  } catch (err) {
    loaded?.release();
    const msg = err instanceof Error ? err.message : String(err);
    // 压缩失败不阻断：原样交给后端判断，后端会给出明确提示
    return passthrough(`压缩未生效（${msg}），将按原图上传`);
  }
}
