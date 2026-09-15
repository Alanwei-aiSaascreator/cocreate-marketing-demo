/**
 * 服务端图片格式识别。
 *
 * 以**文件头（魔数）**为准，不信任客户端声明的 `Content-Type` ——
 * 那个字段由请求方随便填，把任意二进制标成 `image/png` 就能穿过白名单。
 *
 * 顺带解决一个演示现场的真实痛点：iPhone 直出的是 HEIC，
 * 后端原先只回一句「只支持 JPG / PNG / WebP / GIF」，老客完全不知道该怎么办。
 * 这里识别出 HEIC/HEIF/AVIF 并给出可行动的提示。
 */

export interface ImageFormat {
  ext: string;
  mime: string;
  label: string;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");
const GIF = Buffer.from("GIF", "ascii");
const FTYP = Buffer.from("ftyp", "ascii");

export function detectImageFormat(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg", label: "JPEG" };
  }

  // PNG: 8 字节固定签名
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ext: "png", mime: "image/png", label: "PNG" };
  }

  // WebP: RIFF....WEBP
  if (bytes.subarray(0, 4).equals(RIFF) && bytes.subarray(8, 12).equals(WEBP)) {
    return { ext: "webp", mime: "image/webp", label: "WebP" };
  }

  // GIF: GIF87a / GIF89a
  if (bytes.subarray(0, 3).equals(GIF)) {
    return { ext: "gif", mime: "image/gif", label: "GIF" };
  }

  return null;
}

/**
 * 认出「能认出来但明确不支持」的格式，好给一句有用的提示。
 * 认不出来时返回 null，由调用方给通用的提示。
 */
export function describeUnsupportedFormat(bytes: Buffer): string | null {
  if (bytes.length > 12 && bytes.subarray(4, 8).equals(FTYP)) {
    const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand.startsWith("avif")) return "AVIF";
    // heic / heix / hevc / hevx / mif1 / msf1 都是 HEIF 家族
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(brand)) return "HEIC/HEIF";
    return "HEIF 系列格式";
  }
  return null;
}
