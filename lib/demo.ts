/**
 * 演示数据的固定入口短码。
 *
 * 抽成独立模块而不是各自写死：`prisma/seed.ts` 和 `scripts/compare-engines.ts`
 * 都要用它，而 seed.ts 有顶层副作用（直接跑 main），**不能被 import**。
 * 所以常量必须放在一个没有副作用的地方。
 *
 * 固定而非随机，这样反复重跑种子数据也不会让已经发出去的演示链接失效。
 */
export const DEMO_PUBLIC_TOKEN = "demo-cocreate";
