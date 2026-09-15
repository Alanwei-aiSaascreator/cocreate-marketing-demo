/**
 * postinstall。
 *
 * 目的：让「clone → pnpm install → pnpm db:push → pnpm db:seed → pnpm dev」
 * 这条路少一个坑。
 *
 * 以下都是实测过的事实，不要凭直觉改：
 * - `prisma generate` **不需要** DATABASE_URL，没有 .env 也能正常跑完。
 * - 但 `prisma db push` 和 `pnpm db:seed` **需要**，缺了会报
 *   `P1012 Environment variable not found: DATABASE_URL`；
 *   这个错发生在「schema 校验」阶段，很难让人联想到是漏了 .env。
 * - README 第 2 步是 `cp .env.example .env`，而漏掉这一步非常常见。
 *
 * 所以这里在装依赖时就把 .env 补好。key 留空不影响运行 —— AI 层会自动降级到规则引擎。
 *
 * 一个已知冲突：`pnpm install` 时如果 dev server 正在跑，Prisma 的 native engine
 * 被它锁住，generate 会报 `EPERM: rename ...query_engine-windows.dll.node`。
 * 这不是配置问题，停掉 dev server 再装即可 —— 下面的提示里会写明。
 */
import { existsSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ENV = ".env";
const EXAMPLE = ".env.example";

if (!existsSync(ENV) && existsSync(EXAMPLE)) {
  copyFileSync(EXAMPLE, ENV);
  console.log("");
  console.log("  已从 .env.example 创建 .env");
  console.log("  AI key 默认留空 —— 不填也能跑，AI 层会自动降级到内置规则引擎。");
  console.log("  想用真模型，把 LLM_API_KEY 填进 .env 即可。");
  console.log("");
}

// stdio: inherit —— 不通过管道抓子进程输出，避免在受限环境里被 EPERM 拦掉
const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error("");
  console.error("  ⚠ prisma generate 没成功。最常见的原因是 dev server 正在运行，");
  console.error("    锁住了 Prisma 的 native engine DLL（报错形如");
  console.error("    `EPERM: rename ...query_engine-windows.dll.node`）。");
  console.error("    处理办法：停掉 `pnpm dev`，再重新执行 `pnpm install`。");
  console.error("");
}

process.exit(result.status ?? 1);
