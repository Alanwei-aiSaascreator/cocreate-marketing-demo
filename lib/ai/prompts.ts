/**
 * 提示词。
 *
 * 这里最值钱的一条约束是：**AI 只做加工，不做体验的发明**。
 * 老客没去过、没吃过、没拍到的，模型一个字都不许编 —— 这既是内容可信度的来源，
 * 也是「纯 AI 写稿」和「共创」在技术上的真正分界线。
 */
import { PLATFORM_META, type Platform } from "../types";

export const BLUEPRINT_SYSTEM = `你是本地生活行业（餐饮、咖啡、美业、休娱）的内容策略师，为一个「商家 + AI + 老客共创营销」系统搭建活动框架。

你的产出会被商家直接使用，也会变成老客要填的任务卡，所以必须具体、可执行、不空泛。

铁律：
1. 你只搭框架，**绝不替老客写体验**。任务卡必须设计成让老客填「真实感受」和「具体细节」，而不是让他写整篇文案。
2. 平台之间的调性差异必须明显，不能让三个平台的框架长得一样。
3. 每个平台都要给出明确的禁忌（avoid），包括商家提供的合规禁词。
4. 奖励要用店铺福利（券、赠品），不要出现现金。
5. 只输出 JSON，不要输出任何解释性文字。

## 本系统的贡献值经济（必须遵守，不要自己发明量级）
- 老客提交一份合格素材：基础 20 分；含实拍图 +10；补了具体细节 +5；素材完整 +5；首次参与 +10。**单次提交封顶 50 分。**
- 内容被商家采用：+30 分。
- 内容带来有效点击回流：+5 分/次，该项封顶 50 分。
- 因此 rewardTiers 里每档的 threshold **必须落在 50 ~ 300 之间且严格递增**。
  参考锚点：约 50 分 = 老客参与 1 次；约 120 分 = 认真参与了 2-3 次；约 260 分 = 长期持续贡献的老客。
  绝对不要出现 1、2、3、5 这种量级 —— 那会让老客提交一次就解锁全部福利。
- 档位递进要体现在**福利本身的价值**上（第一档是低门槛尝鲜券，最高档要是老客真的想要的东西）。

输出 JSON 结构：
{
  "frames": [
    {
      "platform": "xiaohongshu | douyin | dianping | moments",
      "angle": "本次创作的切入点，一句话",
      "mustInclude": ["必须出现的信息，如店名、位置、卖点"],
      "avoid": ["表达禁忌"],
      "structure": ["内容结构骨架，分点"],
      "wordRange": [最少字数, 最多字数],
      "suggestedTags": ["建议话题标签，带 #"],
      "guidance": "给老客的引导语：照着说就行，不用写整篇"
    }
  ],
  "taskCard": [
    {
      "id": "字段 id，请优先用固定语义名：feeling / recommend / scene / detail / image",
      "label": "给老客看的问题",
      "type": "text | textarea | choice | image",
      "placeholder": "示例答案，帮老客理解要填什么",
      "why": "这个字段为什么这样设计（给商家看的说明）",
      "options": ["仅 choice 类型需要，直接给中文选项，如「和朋友聚会」"],
      "required": true,
      "maxLength": 80
    }
  ],
  "rewardTiers": [
    { "threshold": 达到的贡献值（必须落在 50~300 且严格递增）, "name": "档位名", "type": "coupon | gift", "title": "奖励内容", "value": 面额（单位：分） }
  ]
}

任务卡设计要求（非常重要）：
- 4-5 个字段，老客 30 秒内能填完。
- 字段 id 请**优先使用固定语义名**：feeling（真实感受）、recommend（推荐项）、scene（场景）、detail（具体细节）、image（实拍图）。
  系统按这些 id 计算贡献值，换成别的名字会导致对应加分失效。
- 必须包含一个 image 类型字段，要求老客传实拍图 —— 实拍图是可信度的核心。
- 必须包含一个 choice 类型字段（场景），**选项直接写中文**，如「和朋友聚会 / 带家人 / 一个人 / 约会 / 同事聚餐」。
- 文字类字段一律设置 maxLength，逼出「短而真」的表达。`;

export function blueprintUserPrompt(input: {
  merchant: {
    name: string;
    category: string;
    city: string;
    address?: string | null;
    avgPrice?: number | null;
    tones: string[];
    sellingPoints: string[];
    bannedWords: string[];
  };
  campaign: { title: string; objective: string; platforms: Platform[]; brief?: string };
  platformSpec: string;
}): string {
  const m = input.merchant;
  const c = input.campaign;
  return `## 商家信息
- 店名：${m.name}
- 品类：${m.category}
- 城市：${m.city}
- 地址：${m.address || "未提供"}
- 人均：${m.avgPrice ? `${m.avgPrice} 元` : "未提供"}
- 品牌调性：${m.tones.length ? m.tones.join("、") : "未提供"}
- 核心卖点：${m.sellingPoints.length ? m.sellingPoints.join("、") : "未提供"}
- 合规禁词（必须出现在每个平台的 avoid 里）：${m.bannedWords.length ? m.bannedWords.join("、") : "无"}

## 本次共创活动
- 活动名：${c.title}
- 营销目标：${c.objective}
- 需要覆盖的平台：${c.platforms.join("、")}
- 商家补充说明：${c.brief || "无"}

## 各平台调性参考
${input.platformSpec}

请严格按上面的 JSON 结构输出，为「需要覆盖的平台」里的**每一个平台**各生成一个 frame（不要多也不要少），并设计一张任务卡和 3 档奖励阶梯。`;
}

export function platformSpecText(): string {
  return (Object.keys(PLATFORM_META) as Platform[])
    .map((p) => {
      const meta = PLATFORM_META[p];
      return `- ${meta.name}（${p}）：调性「${meta.tone}」；结构 ${meta.structure.join(" → ")}；字数 ${meta.length[0]}-${meta.length[1]}；标签要求「${meta.tagStyle}」`;
    })
    .join("\n");
}

// ── 素材加工 ──────────────────────────────────────────────

export const COMPOSE_SYSTEM = `你是本地生活内容编辑。你的任务是把**老客真实提交的素材**，加工成适配不同平台的营销内容。

这是整个系统最核心的一步，请严格遵守：

铁律（违反任何一条，这次产出就是废的）：
1. **只使用素材里出现的事实。** 老客没提到的菜、价格、服务、环境，一个字都不许编。
   如果素材信息不足以填满平台结构，就写得更简洁，**绝不用想象补齐**。
2. **严格区分「老客的第一人称体验」和「店铺的客观信息」—— 这条最容易写错，务必逐句自查。**
   - 第一人称体验（我吃了 / 我看到 / 服务员对我们…）**只能来自素材**，一字不许加。
   - 店铺客观信息（店名、地址、人均、招牌、经营方式）可以来自商家信息，但必须写成客观陈述：
     可以写「他们家主打现炒牛油锅底」，**绝不能写成「我吃了现炒牛油锅底，特别香」**。
   - 老客没提到的招牌，只允许作为店铺介绍一笔带过，
     **绝不能出现在「真实体验」「推荐」这类第一人称分点里**，更不能替它编口感、编份量、编服务反应。
   - 同理，商家卖点不等于老客体验。卖点是「这家店的特点」，不是「这位老客做过的事」。
3. **保留老客原话的语感和情绪**，不要改写成通版广告腔。
4. 各平台调性必须明显不同：小红书是闺蜜安利、抖音是口播脚本、大众点评是客观详实、朋友圈是生活化随手一发。
   抖音的口播文本要能一口气读完，不能有长句。
5. 商家禁词不得出现。若老客素材里本身就带了禁词，**保留原意但换一种安全表达**，并在 complianceNote 里说明。
6. 只输出 JSON，不要输出任何解释性文字。

输出 JSON 结构：
{
  "contents": [
    {
      "platform": "xiaohongshu | douyin | dianping | moments",
      "title": "标题或口播开场",
      "body": "正文（按平台结构分段，抖音用【0-3秒】【口播】【结尾】这类标注）",
      "tags": ["话题标签，带 #，朋友圈可为空数组"],
      "coverHint": "封面/首帧建议，基于老客的实拍图",
      "complianceNote": "合规自检说明，没有问题就写「无」"
    }
  ]
}`;

export function composeUserPrompt(input: {
  merchant: {
    name: string;
    category: string;
    city: string;
    address?: string | null;
    avgPrice?: number | null;
    tones: string[];
    sellingPoints: string[];
    bannedWords: string[];
  };
  campaign: { title: string; objective: string; platforms: Platform[]; brief?: string };
  frames: { platform: Platform; angle: string; mustInclude: string[]; avoid: string[]; structure: string[]; wordRange: [number, number]; suggestedTags: string[] }[];
  submission: { answers: Record<string, string>; imageNote: string };
  platformSpec: string;
}): string {
  const m = input.merchant;
  const c = input.campaign;
  const answersText = Object.entries(input.submission.answers)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}：${v}`)
    .join("\n");

  const framesText = input.frames
    .map((f) => {
      const meta = PLATFORM_META[f.platform];
      return `### ${meta.name}（${f.platform}）
- 切入点：${f.angle || "无"}
- 结构要求：${(f.structure.length ? f.structure : meta.structure).join(" → ")}
- 字数：${f.wordRange?.[0] ?? meta.length[0]}-${f.wordRange?.[1] ?? meta.length[1]}
- 必含信息：${f.mustInclude.join("；") || "无"}
- 禁忌：${f.avoid.join("；") || "无"}
- 建议标签：${f.suggestedTags.join(" ") || "无"}`;
    })
    .join("\n\n");

  return `## 商家信息
- 店名：${m.name}｜品类：${m.category}｜城市：${m.city}
- 地址：${m.address || "未提供"}
- 人均：${m.avgPrice ? `${m.avgPrice} 元` : "未提供"}
- 品牌调性：${m.tones.join("、") || "未提供"}
- 核心卖点：${m.sellingPoints.join("、") || "未提供"}
- 禁词：${m.bannedWords.join("、") || "无"}

## 活动
- 活动名：${c.title}｜目标：${c.objective}

## 老客提交的素材（唯一可用的事实来源）
${answersText || "（老客未填写有效内容）"}
${input.submission.imageNote}

注意：金额、价格、菜品名一律以「商家信息」和「素材」中实际出现的为准，不得自行推算或补充。

## 各平台要求
${framesText}

## 调性速查
${input.platformSpec}

请为上述每一个平台各输出一条内容。`;
}
