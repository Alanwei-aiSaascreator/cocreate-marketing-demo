import type { NextConfig } from "next";

/**
 * `pnpm build` 与 `pnpm dev` 用**不同的输出目录**，互不覆盖。
 *
 * 原因是一次真实的踩坑：生产构建会清空 `.next`，
 * 而正在运行的 dev server 的 webpack 运行时还指着里面的 chunk，
 * 结果 dev server 立刻全线 500（`Cannot find module './787.js'`）。
 * 演示前顺手 build 一下是很自然的动作，所以这里从结构上杜绝，
 * 而不是靠"记得先关 dev server"这种自觉。
 *
 * 注意 `start` 也必须走同一个目录，否则 `pnpm build && pnpm start` 会在 `.next` 里
 * 找不到生产构建（那里只有 dev 产物），直接报
 * `Could not find a production build in the '.next' directory`。
 *
 * npm_lifecycle_event 由 npm/pnpm 注入当前脚本名，跨平台可用，不需要引入 cross-env。
 */
const BUILD_DIST = ".next-build";
const isProductionLifecycle =
  process.env.npm_lifecycle_event === "build" || process.env.npm_lifecycle_event === "start";

const nextConfig: NextConfig = {
  distDir: isProductionLifecycle ? BUILD_DIST : ".next",
};

export default nextConfig;
