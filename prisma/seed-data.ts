/**
 * 种子数据：10 个活动 + 14 位有身份设定的老客 + 约 60 条真实质感的素材提交。
 *
 * 这个文件刻意**不放在 seed.ts 里**：数据是数据，编排是编排。
 * 想看某个活动的素材，直接看这个地方，不用在读流程的时候跳过一堆字面量。
 *
 * ── 设计原则（避免做成"一眼假"的示例数据）──
 *
 * 1. **提交人有一致的身份，不是随机昵称**
 *    每个 persona 有职业、生活阶段、说话方式。同一个人在不同活动里的语气保持一致：
 *    夜班护士永远在讲作息，带娃爸爸永远在讲安全性和母婴室，
 *    老饕周先生永远克制且会挑毛病。
 *
 * 2. **评论有具体细节，不是形容词堆砌**
 *    写到菜名、价格、同行的人、当时的场景、店家怎么回应的。
 *    长度参差 —— 有人写一大段，有人只写"分量足"。
 *
 * 3. **平台按业态选，不是每个活动都铺满 4 个**
 *    面馆不做小红书，美甲不写朋友圈。这是真实的经营判断。
 *
 * 4. **时间按真实作息分布**
 *    夜班族的宵夜在凌晨，同事聚餐在加班后，家庭局在周末。
 *
 * 5. **结果不是全五星全采用**
 *    有差评（毛肚偏老）、有被风控拦下的（留微信）、有灌水的（"还行"+ 没图）、
 *    有写了平台违禁词的、有商家没采用的。这些"坏样本"才是风控和计分的真实检验。
 *
 * 注意：风险标记、贡献值、奖励**都不在这里写死** ——
 * 由 seed.ts 调用真实的 detectRisks / scoreSubmission / tiersToGrant 推导出来。
 * 数据只描述"发生了什么"，规则决定"算多少"。
 */

// ── 商家 ────────────────────────────────────────────────

export interface SeedMerchant {
  key: string;
  name: string;
  category: string;
  city: string;
  district: string;
  address: string;
  avgPrice: number;
  tones: string[];
  sellingPoints: string[];
  bannedWords: string[];
}

export const MERCHANTS: SeedMerchant[] = [
  {
    key: "hotpot",
    name: "椒香里·重庆老火锅",
    category: "火锅",
    city: "成都",
    district: "武侯区",
    address: "成都市武侯区科华北路 12 号",
    avgPrice: 98,
    tones: ["实在", "热闹", "不装"],
    sellingPoints: ["手工现炒牛油锅底", "凌晨四点到的鲜毛肚", "免费续杯的老荫茶"],
    bannedWords: ["最好吃", "第一", "纯天然", "治疗"],
  },
  {
    key: "cafe",
    name: "云栖咖啡·玉林路店",
    category: "咖啡",
    city: "成都",
    district: "武侯区",
    address: "成都市武侯区玉林南路 3 号",
    avgPrice: 45,
    tones: ["安静", "认真", "不吵"],
    sellingPoints: ["自家烘焙的浅烘豆", "每周三换一次手冲单", "靠窗有整面书的座位"],
    bannedWords: ["最好喝", "第一", "纯天然"],
  },
  {
    key: "grillfish",
    name: "江渔·纸包鱼",
    category: "烤鱼",
    city: "成都",
    district: "金牛区",
    address: "成都市金牛区花照壁西顺街 88 号",
    avgPrice: 76,
    tones: ["烟火气", "实在", "接地气"],
    sellingPoints: ["现杀江团", "秘制酸菜", "免费加两份配菜"],
    bannedWords: ["最好吃", "野生", "纯天然"],
  },
  {
    key: "yakitori",
    name: "山野烧鸟居酒屋",
    category: "日式居酒屋",
    city: "成都",
    district: "锦江区",
    address: "成都市锦江区镋钯街 27 号",
    avgPrice: 168,
    tones: ["松弛", "日式", "不喧哗"],
    sellingPoints: ["每日现串的鸡腿肉", "备长炭直火", "清酒可以点单杯"],
    bannedWords: ["第一", "正宗日本", "顶级"],
  },
  {
    key: "nail",
    name: "拾光美甲·春熙路店",
    category: "美甲",
    city: "成都",
    district: "锦江区",
    address: "成都市锦江区中纱帽街 8 号 3 楼",
    avgPrice: 158,
    tones: ["细致", "耐心", "审美在线"],
    sellingPoints: ["日本进口罐装胶", "打磨很轻不伤甲面", "可以画复杂手绘"],
    bannedWords: ["第一", "永久", "绝对不伤甲"],
  },
  {
    key: "petbar",
    name: "毛孩子的家·宠物友好餐吧",
    category: "宠物友好餐厅",
    city: "成都",
    district: "高新区",
    address: "成都市高新区天府三街 199 号",
    avgPrice: 88,
    tones: ["温暖", "爱动物", "松弛"],
    sellingPoints: ["有独立遛狗草坪", "狗狗免费饮水碗", "店家自己养了三只猫"],
    bannedWords: ["第一", "全国首家", "纯天然"],
  },
  {
    key: "gym",
    name: "铁馆健身·24h自助",
    category: "健身房",
    city: "成都",
    district: "高新区",
    address: "成都市高新区益州大道 555 号 B1",
    avgPrice: 199,
    tones: ["硬核", "不推销", "自由"],
    sellingPoints: ["24 小时刷脸进", "全套自由重量到 50kg", "教练不推销私教"],
    bannedWords: ["第一", "包瘦", "治疗"],
  },
  {
    key: "bakery",
    name: "麦野手作烘焙",
    category: "烘焙",
    city: "成都",
    district: "青羊区",
    address: "成都市青羊区奎星楼街 21 号",
    avgPrice: 38,
    tones: ["手作", "清香", "不甜腻"],
    sellingPoints: ["每天现烤两次", "动物性淡奶油", "卖完就收摊"],
    bannedWords: ["第一", "纯天然", "无添加"],
  },
  {
    key: "noodle",
    name: "巷子里·儿时味道小面",
    category: "面馆",
    city: "重庆",
    district: "渝中区",
    address: "重庆市渝中区民生路 55 号",
    avgPrice: 22,
    tones: ["老重庆", "麻辣", "不讲环境"],
    sellingPoints: ["手工碱水面", "每天现炒杂酱", "凌晨五点开锅"],
    bannedWords: ["第一", "最正宗"],
  },
  {
    key: "spring",
    name: "沐云汤泉·亲子水乐园",
    category: "亲子娱乐",
    city: "成都",
    district: "温江区",
    address: "成都市温江区光华大道 1234 号",
    avgPrice: 128,
    tones: ["亲子", "干净", "设施全"],
    sellingPoints: ["恒温 32 度", "独立母婴室", "儿童区限高 1.2 米"],
    bannedWords: ["第一", "最好玩", "绝对安全"],
  },
];

// ── 老客（有身份设定，不是随机昵称）──────────────────────
//
// `voice` 只写给读代码的人看：它是这个人在所有活动里保持一致的语气依据。
// 真正的语气体现在下面每条提交的文案里。

export interface SeedPersona {
  key: string;
  nickname: string;
  avatarEmoji: string;
  sourceChannel: "qr" | "link";
  /** 身份与语气说明（不参与逻辑，只作为写文案的依据） */
  voice: string;
}

export const PERSONAS: SeedPersona[] = [
  {
    key: "xiaolin",
    nickname: "小林爱吃辣",
    avatarEmoji: "🌶️",
    sourceChannel: "qr",
    voice: "25 岁互联网运营，成都本地人，无辣不欢，爱攒局。说话快、爱用「巴适」，短句多。",
  },
  {
    key: "noot",
    nickname: "周末不加班",
    avatarEmoji: "😮‍💨",
    sourceChannel: "link",
    voice: "31 岁 UI 设计，常年加班，探店是解压方式。自嘲式幽默，关注「值不值」。",
  },
  {
    key: "chengxi",
    nickname: "城西吃货日记",
    avatarEmoji: "📓",
    sourceChannel: "qr",
    voice: "29 岁自由摄影师，认真写长评，客观描述，注意出品细节和光线。",
  },
  {
    key: "may",
    nickname: "阿May",
    avatarEmoji: "🌸",
    sourceChannel: "link",
    voice: "36 岁两个孩子的妈，关注孩子能不能吃、座位宽不宽、厕所干不干净。温和务实。",
  },
  {
    key: "laozhang",
    nickname: "老张的饭局",
    avatarEmoji: "🍻",
    sourceChannel: "qr",
    voice: "43 岁销售总监，商务应酬为主，关注包间、停车、上菜速度、能不能谈事。",
  },
  {
    key: "milkcat",
    nickname: "一只牛奶猫",
    avatarEmoji: "🐱",
    sourceChannel: "link",
    voice: "27 岁独居自由职业，猫奴，靠咖啡续命，喜欢安静角落。说话很短。",
  },
  {
    key: "aken",
    nickname: "健身教练阿Ken",
    avatarEmoji: "💪",
    sourceChannel: "qr",
    voice: "33 岁健身教练，关注蛋白质、份量、卫生。说话直接，不客套。",
  },
  {
    key: "xiaoli",
    nickname: "从不下厨的小李",
    avatarEmoji: "🍜",
    sourceChannel: "link",
    voice: "24 岁应届生租房，外卖加探店为生，性价比敏感。说话直白，有时敷衍。",
  },
  {
    key: "xiaolu",
    nickname: "美甲店常客小鹿",
    avatarEmoji: "💅",
    sourceChannel: "qr",
    voice: "28 岁行政，每月固定做一次甲，关注持久度和款式好不好看。",
  },
  {
    key: "babab",
    nickname: "带娃遛弯的爸爸",
    avatarEmoji: "🍼",
    sourceChannel: "qr",
    voice: "38 岁程序员爸爸，周末遛娃，关注安全、母婴室、能不能推车进去。",
  },
  {
    key: "nurse",
    nickname: "夜班护士小周",
    avatarEmoji: "🌙",
    sourceChannel: "link",
    voice: "30 岁夜班护士，作息颠倒，下班吃宵夜。关注营业到几点、上菜快不快。",
  },
  {
    key: "chenayi",
    nickname: "退休的陈阿姨",
    avatarEmoji: "🧧",
    sourceChannel: "qr",
    voice: "62 岁退休，爱跟老姐妹一起逛。句子短、打字慢，关注环境和分量。",
  },
  {
    key: "ajun",
    nickname: "学生党阿俊",
    avatarEmoji: "🎒",
    sourceChannel: "link",
    voice: "21 岁大学生，预算紧，爱用团购。语气活泼，爱用感叹号。",
  },
  {
    key: "zhou",
    nickname: "老饕周先生",
    avatarEmoji: "🥢",
    sourceChannel: "link",
    voice: "52 岁本地老饕，评价克制、会指出问题，但不刻薄。写得像认真做功课。",
  },
];

// ── 活动 ────────────────────────────────────────────────
//
// platforms 按业态选：面馆不做小红书，美甲不写朋友圈。
// launchedDaysAgo 让活动创建时间错开，看起来像是陆续开的。

export interface SeedCampaign {
  merchantKey: string;
  title: string;
  objective: string;
  platforms: ("xiaohongshu" | "douyin" | "dianping" | "moments")[];
  brief: string;
  launchedDaysAgo: number;
  /** active | closed */
  status: "active" | "closed";
  /**
   * 是否是固定演示入口。
   * 只标一个布尔，具体 token 值来自 lib/demo.ts 的 DEMO_PUBLIC_TOKEN ——
   * 不在这里写死字符串，避免同一个常量在两处定义（改一处忘一处）。
   */
  isDemoEntry?: boolean;
}

export const CAMPAIGNS: SeedCampaign[] = [
  {
    merchantKey: "hotpot",
    title: "老客共创 · 招牌菜口碑计划",
    objective: "到店打卡",
    platforms: ["xiaohongshu", "douyin", "dianping", "moments"],
    brief: "请老客用真实体验帮我们把招牌讲出去，重点铺小红书和大众点评。",
    launchedDaysAgo: 30,
    status: "active",
    isDemoEntry: true,
  },
  {
    merchantKey: "cafe",
    title: "老客共创 · 手冲口碑计划",
    objective: "口碑沉淀",
    platforms: ["xiaohongshu", "dianping", "moments"],
    brief: "想请常来的老客讲讲他们为什么反复来这家店。",
    launchedDaysAgo: 27,
    status: "active",
  },
  {
    merchantKey: "grillfish",
    title: "老客共创 · 双人餐团购口碑",
    objective: "团购转化",
    platforms: ["douyin", "dianping", "moments"],
    brief: "套餐刚上，请老客说说值不值，重点讲清楚分量和价格。",
    launchedDaysAgo: 24,
    status: "active",
  },
  {
    merchantKey: "yakitori",
    title: "老客共创 · 深夜食堂计划",
    objective: "新客拉新",
    platforms: ["xiaohongshu", "dianping"],
    brief: "新店开在镋钯街，想让还没来过的人知道这里可以一个人喝一杯。",
    launchedDaysAgo: 21,
    status: "active",
  },
  {
    merchantKey: "nail",
    title: "老客共创 · 款式返图计划",
    objective: "到店打卡",
    platforms: ["xiaohongshu", "douyin"],
    brief: "请老客发自己的手照返图，顺带说说持久度怎么样。",
    launchedDaysAgo: 18,
    status: "active",
  },
  {
    merchantKey: "petbar",
    title: "老客共创 · 带毛孩子来吃饭",
    objective: "口碑沉淀",
    platforms: ["xiaohongshu", "moments"],
    brief: "养宠的人最信养宠的人，请老客讲讲带狗来这儿的真实体验。",
    launchedDaysAgo: 15,
    status: "active",
  },
  {
    merchantKey: "gym",
    title: "老客共创 · 不推销的理由",
    objective: "团购转化",
    platforms: ["douyin", "dianping", "moments"],
    brief: "主打「教练不推销」，请老客说说实际体验是不是真的不烦人。",
    launchedDaysAgo: 12,
    status: "active",
  },
  {
    merchantKey: "bakery",
    title: "老客共创 · 出炉时间表",
    objective: "到店打卡",
    platforms: ["xiaohongshu", "dianping", "moments"],
    brief: "每天现烤两次，卖完收摊。请老客说说抢到过什么。",
    launchedDaysAgo: 9,
    status: "active",
  },
  {
    merchantKey: "noodle",
    title: "老客共创 · 儿时那碗面的味道",
    objective: "口碑沉淀",
    platforms: ["dianping", "moments"],
    brief: "开了十几年，想请老街坊讲讲跟自己记忆里那碗面的关系。",
    launchedDaysAgo: 6,
    status: "active",
  },
  {
    merchantKey: "spring",
    title: "老客共创 · 暑假亲子打卡",
    objective: "新客拉新",
    platforms: ["douyin", "xiaohongshu", "moments"],
    brief: "暑期档，想请带娃来过的家长说说孩子玩得怎么样。",
    launchedDaysAgo: 20,
    // 已结束：用来演示「活动结束后老客扫码会看到什么」
    status: "closed",
  },
];

// ── 素材提交 ────────────────────────────────────────────
//
// `outcome` 只描述意图，实际状态由真实的风控函数决定：
//   ok    → 正常通过（是否被采用看 adopted）
//   dirty → 故意在文案或图片上留下问题，让 detectRisks 自己抓出来
//   none  → 不传图（部分活动里用来制造"素材不完整"的样本）
//
// `clicks` 是引流回流次数，按真实分布给：大多数内容 0-3 次，少数爆款两位数。
// `hoursAgo` 相对活动创建时间往后推，用来还原真实作息。

export interface SeedSubmission {
  campaign: number;
  persona: string;
  answers: {
    feeling: string;
    recommend: string;
    scene: string;
    detail?: string;
  };
  /** 图片编号；null = 不传图；reuse:数字 = 复用某张图（制造重复图） */
  image: number | null | `reuse:${number}`;
  adopted: boolean;
  clicks: number;
  /** 相对活动创建时间过了多少小时才提交 */
  hoursAfterLaunch: number;
}

export const SUBMISSIONS: SeedSubmission[] = [
  // ═══ 1. 椒香里·重庆老火锅（主演示活动，12 条，覆盖各种结果）═══
  {
    campaign: 0,
    persona: "xiaolin",
    answers: {
      feeling: "锅底是真的香，牛油味很正，吃到后面也不发苦",
      recommend: "手工现炒牛油锅底",
      scene: "和朋友聚会",
      detail: "服务员看我们辣得直喝水，主动送了两碗冰粉",
    },
    image: 1,
    adopted: true,
    clicks: 14,
    hoursAfterLaunch: 6,
  },
  {
    campaign: 0,
    persona: "noot",
    answers: {
      feeling: "加班到九点过来，店里还很热闹，吃完感觉整个人活过来了",
      recommend: "鲜毛肚",
      scene: "同事聚餐",
      detail: "毛肚七上八下真的脆，比我在别家吃的都新鲜",
    },
    image: 2,
    adopted: true,
    clicks: 9,
    hoursAfterLaunch: 30,
  },
  {
    campaign: 0,
    persona: "chengxi",
    answers: {
      feeling: "老荫茶免费续，这点很加分，解辣一绝",
      recommend: "老荫茶",
      scene: "带家人",
      detail: "我妈不爱喝饮料，就认这家的茶",
    },
    image: 3,
    adopted: true,
    clicks: 6,
    hoursAfterLaunch: 54,
  },
  {
    campaign: 0,
    persona: "laozhang",
    answers: {
      feeling: "带客户来的，包间安静，谈事不被打扰",
      recommend: "鲜毛肚",
      scene: "同事聚餐",
      detail: "提前一天订的包间，服务员全程没催过我们",
    },
    image: 4,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 78,
  },
  {
    campaign: 0,
    persona: "may",
    answers: {
      feeling: "带孩子来吃，可以要微辣锅底，孩子也吃了两碗饭",
      recommend: "手工现炒牛油锅底",
      scene: "带家人",
      detail: "有儿童椅，服务员还主动给孩子拿了个小碗",
    },
    image: 5,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 102,
  },
  {
    campaign: 0,
    persona: "nurse",
    answers: {
      feeling: "下夜班两点过来还开着，这个对我太重要了",
      recommend: "鲜毛肚",
      scene: "一个人",
      detail: "凌晨店里就两桌人，安安静静吃完回去睡觉",
    },
    image: 6,
    adopted: false,
    clicks: 4,
    // 夜班：凌晨两点，也就是活动开始后约 26 小时
    hoursAfterLaunch: 26,
  },
  {
    campaign: 0,
    persona: "chenayi",
    answers: {
      feeling: "分量足，我们四个老姐妹没吃完",
      recommend: "老荫茶",
      scene: "和朋友聚会",
      detail: "菜上得快，不用等",
    },
    image: 7,
    adopted: false,
    clicks: 1,
    hoursAfterLaunch: 126,
  },
  {
    campaign: 0,
    persona: "aken",
    answers: {
      feeling: "减脂期来吃，清汤锅涮毛肚牛肉，蛋白质够",
      recommend: "鲜毛肚",
      scene: "同事聚餐",
      detail: "问了下锅底能不能不放油，后厨真的给单独做了",
    },
    image: 8,
    adopted: true,
    clicks: 5,
    hoursAfterLaunch: 150,
  },

  // ── 坏样本 1：写了平台违禁词「最好吃」「绝对」→ 风控会给 warn，规则引擎会替换 ──
  {
    campaign: 0,
    persona: "xiaolin",
    answers: {
      feeling: "这家绝对是我在成都吃过最好吃的火锅，没有之一",
      recommend: "手工现炒牛油锅底",
      scene: "和朋友聚会",
      detail: "带了三拨朋友来，都说好吃",
    },
    image: 9,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 174,
  },

  // ── 坏样本 2：留了微信号 → 风控 block，整条不进内容库 ──
  {
    campaign: 0,
    persona: "milkcat",
    answers: {
      feeling: "味道不错，想约的可以加我微信 xiaomi1990 一起拼桌",
      recommend: "鸭血",
      scene: "一个人",
      detail: "我经常组局，人多可以找我",
    },
    image: 10,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 198,
  },

  // ── 坏样本 3：内容过短 + 没传图 → warn，且拿不到图片分和完整度分 ──
  {
    campaign: 0,
    persona: "xiaoli",
    answers: { feeling: "还行", recommend: "鲜毛肚", scene: "一个人" },
    image: null,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 222,
  },

  // ── 真实差评 + 店家处理：不是所有评价都五星，也不是所有内容都该被采用 ──
  {
    campaign: 0,
    persona: "zhou",
    answers: {
      feeling: "锅底不错，但今天的毛肚偏老了一点",
      recommend: "老荫茶",
      scene: "和朋友聚会",
      detail: "跟店家提了一句，经理过来道了歉还送了份鸭血",
    },
    image: 11,
    adopted: false,
    clicks: 7,
    hoursAfterLaunch: 246,
  },

  // ═══ 2. 云栖咖啡（8 条，安静调性）═══
  {
    campaign: 1,
    persona: "milkcat",
    answers: {
      feeling: "周三换了新豆子，坐了一下午没人赶我走",
      recommend: "本周手冲单",
      scene: "一个人",
      detail: "插座在靠窗那排，带电脑来很方便",
    },
    image: 12,
    adopted: true,
    clicks: 8,
    hoursAfterLaunch: 5,
  },
  {
    campaign: 1,
    persona: "noot",
    answers: {
      feeling: "难得周末不加班，在这儿把一本书看完了",
      recommend: "浅烘手冲",
      scene: "一个人",
      detail: "下午三点人最少，靠窗第二张桌子光线最好",
    },
    image: 13,
    adopted: true,
    clicks: 5,
    hoursAfterLaunch: 28,
  },
  {
    campaign: 1,
    persona: "chengxi",
    answers: {
      feeling: "老板拉花不算精致，但豆子是真的讲究",
      recommend: "自家烘焙浅烘豆",
      scene: "一个人",
      detail: "问他能不能买半磅豆子带走，直接从后厨拿了一包给我",
    },
    image: 14,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 52,
  },
  {
    campaign: 1,
    persona: "xiaolu",
    answers: {
      feeling: "做完美甲顺路来的，环境比我想的安静",
      recommend: "燕麦拿铁",
      scene: "一个人",
      detail: "座位间距够宽，不会跟隔壁那桌挨着",
    },
    image: 15,
    adopted: false,
    clicks: 1,
    hoursAfterLaunch: 76,
  },
  {
    campaign: 1,
    persona: "may",
    answers: {
      feeling: "带孩子来的，本来担心吵到别人",
      recommend: "低因美式",
      scene: "带家人",
      detail: "店员主动把我们的位子换到了靠里那桌",
    },
    image: 16,
    adopted: true,
    clicks: 4,
    hoursAfterLaunch: 100,
  },
  {
    campaign: 1,
    persona: "zhou",
    answers: {
      feeling: "出品稳定，但今天这支豆子偏酸，我个人不太喜欢",
      recommend: "浅烘手冲",
      scene: "一个人",
      detail: "跟咖啡师聊了几句，他说下周会换一支中烘的",
    },
    image: 17,
    adopted: false,
    clicks: 6,
    hoursAfterLaunch: 124,
  },
  {
    campaign: 1,
    persona: "nurse",
    answers: {
      feeling: "下夜班顺路买一杯，早上七点就开门这点很好",
      recommend: "热美式",
      scene: "一个人",
      detail: "早班就一个店员，出杯有点慢",
    },
    image: 18,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 148,
  },

  // ── 重复图：复用第 12 张 → 风控 duplicate_image，扣 20 分 ──
  {
    campaign: 1,
    persona: "xiaoli",
    answers: {
      feeling: "环境挺好的，适合拍照",
      recommend: "燕麦拿铁",
      scene: "和朋友聚会",
      detail: "位置在玉林路，不难找",
    },
    image: "reuse:12",
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 172,
  },

  // ═══ 3. 江渔·纸包鱼（7 条，团购导向讲性价比）═══
  {
    campaign: 2,
    persona: "ajun",
    answers: {
      feeling: "两个人点了一套才一百五，吃到最后还剩了！",
      recommend: "蒜香纸包鱼",
      scene: "和朋友聚会",
      detail: "配菜能免费加两份，我们加了土豆和宽粉",
    },
    image: 19,
    adopted: true,
    clicks: 11,
    hoursAfterLaunch: 4,
  },
  {
    campaign: 2,
    persona: "aken",
    answers: {
      feeling: "现杀的鱼确实不一样，肉一夹就整块起来",
      recommend: "酸菜江团",
      scene: "和朋友聚会",
      detail: "问了下是当天现杀，后厨能看见",
    },
    image: 20,
    adopted: true,
    clicks: 6,
    hoursAfterLaunch: 26,
  },
  {
    campaign: 2,
    persona: "xiaoli",
    answers: {
      feeling: "性价比高，比外卖划算多了",
      recommend: "蒜香纸包鱼",
      scene: "一个人",
      detail: "一个人来也点得了小份",
    },
    image: 21,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 50,
  },
  {
    campaign: 2,
    persona: "laozhang",
    answers: {
      feeling: "店里油烟味有点重，谈事不太合适",
      recommend: "酸菜江团",
      scene: "同事聚餐",
      detail: "味道没问题，就是衣服上会沾味",
    },
    image: 22,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 74,
  },
  {
    campaign: 2,
    persona: "xiaolin",
    answers: {
      feeling: "巴适！酸菜那个味道很正，我连汤都喝了",
      recommend: "酸菜江团",
      scene: "和朋友聚会",
      detail: "老板还问我们辣度合不合适，可以调",
    },
    image: 23,
    adopted: true,
    clicks: 9,
    hoursAfterLaunch: 98,
  },
  {
    campaign: 2,
    persona: "chenayi",
    answers: {
      feeling: "鱼很嫩，就是上菜等了二十分钟",
      recommend: "蒜香纸包鱼",
      scene: "和朋友聚会",
      detail: "现做要等，可以理解",
    },
    image: 24,
    adopted: false,
    clicks: 1,
    hoursAfterLaunch: 122,
  },

  // ── 坏样本：写了「纯天然」→ 命中商家禁词 ──
  {
    campaign: 2,
    persona: "ajun",
    answers: {
      feeling: "这家鱼是纯天然的，吃着放心！",
      recommend: "酸菜江团",
      scene: "和朋友聚会",
      detail: "带同学来吃的，都说好吃",
    },
    image: 25,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 146,
  },

  // ═══ 4. 山野烧鸟（6 条，一个人也能喝一杯）═══
  {
    campaign: 3,
    persona: "noot",
    answers: {
      feeling: "一个人坐吧台点了三串一杯清酒，没人来搭话，很放松",
      recommend: "鸡腿肉串",
      scene: "一个人",
      detail: "清酒可以点单杯，这点对独酌的人太友好了",
    },
    image: 26,
    adopted: true,
    clicks: 10,
    hoursAfterLaunch: 7,
  },
  {
    campaign: 3,
    persona: "xiaolin",
    answers: {
      feeling: "串是现串的，鸡皮烤到起泡那个脆感绝了",
      recommend: "鸡皮串",
      scene: "和朋友聚会",
      detail: "老板说每天下午现串，卖完就没了",
    },
    image: 27,
    adopted: true,
    clicks: 7,
    hoursAfterLaunch: 31,
  },
  {
    campaign: 3,
    persona: "zhou",
    answers: {
      feeling: "火候掌握得好，备长炭的香气确实不一样",
      recommend: "鸡腿肉串",
      scene: "和朋友聚会",
      detail: "唯一的问题是位子太少，八点以后要等",
    },
    image: 28,
    adopted: false,
    clicks: 5,
    hoursAfterLaunch: 55,
  },
  {
    campaign: 3,
    persona: "milkcat",
    answers: {
      feeling: "坐吧台看师傅烤串，一个人吃也不尴尬",
      recommend: "鸡皮串",
      scene: "一个人",
      detail: "十点以后人少了，可以慢慢吃",
    },
    image: 29,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 79,
  },
  {
    campaign: 3,
    persona: "laozhang",
    answers: {
      feeling: "带客户来的，环境是安静，但分量对商务局偏少",
      recommend: "鸡腿肉串",
      scene: "同事聚餐",
      detail: "人均下来了不便宜，主要吃个氛围",
    },
    image: 30,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 103,
  },
  {
    campaign: 3,
    persona: "chengxi",
    answers: {
      feeling: "灯光很好，坐吧台拍出来的照片不用修",
      recommend: "鸡皮串",
      scene: "一个人",
      detail: "师傅会告诉你哪串该趁热吃",
    },
    image: 31,
    adopted: true,
    clicks: 4,
    hoursAfterLaunch: 127,
  },

  // ═══ 5. 拾光美甲（6 条，关注持久度和款式）═══
  {
    campaign: 4,
    persona: "xiaolu",
    answers: {
      feeling: "做了一个月了还没翘边，这个持久度我服",
      recommend: "猫眼款式",
      scene: "一个人",
      detail: "在家洗了三次头也没掉，之前别家两周就开始起边",
    },
    image: 32,
    adopted: true,
    clicks: 12,
    hoursAfterLaunch: 5,
  },
  {
    campaign: 4,
    persona: "chengxi",
    answers: {
      feeling: "手绘线条很稳，我提的改动她一次就画对了",
      recommend: "手绘款",
      scene: "一个人",
      detail: "打磨很轻，做完甲面没有发烫的感觉",
    },
    image: 33,
    adopted: true,
    clicks: 6,
    hoursAfterLaunch: 29,
  },
  {
    campaign: 4,
    persona: "may",
    answers: {
      feeling: "带娃来的，店员帮我看着孩子让我做完了",
      recommend: "纯色款",
      scene: "带家人",
      detail: "做的过程中孩子闹了一次，店员给了张纸让他画画",
    },
    image: 34,
    adopted: false,
    clicks: 4,
    hoursAfterLaunch: 53,
  },
  {
    campaign: 4,
    persona: "xiaoli",
    answers: {
      feeling: "第一次做美甲，做完还挺好看的",
      recommend: "纯色款",
      scene: "一个人",
      detail: "价格对学生来说有点贵",
    },
    image: 35,
    adopted: false,
    clicks: 1,
    hoursAfterLaunch: 77,
  },
  {
    campaign: 4,
    persona: "xiaolu",
    answers: {
      feeling: "换季了来换款式，色卡比上次多了几本",
      recommend: "猫眼款式",
      scene: "和朋友聚会",
      detail: "和闺蜜一起做的，两个人还聊得挺开心",
    },
    image: 36,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 101,
  },

  // ── 坏样本：写了「永久」「绝对不伤甲」→ 命中商家禁词 ──
  {
    campaign: 4,
    persona: "xiaolu",
    answers: {
      feeling: "这家的胶是永久不掉的，而且绝对不伤甲",
      recommend: "猫眼款式",
      scene: "一个人",
      detail: "我已经做了半年了，甲面一直很好",
    },
    image: 37,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 125,
  },

  // ═══ 6. 毛孩子的家（5 条，养宠人之间的信任）═══
  {
    campaign: 5,
    persona: "milkcat",
    answers: {
      feeling: "第一次带猫出门吃饭，它全程没应激",
      recommend: "草坪位",
      scene: "一个人",
      detail: "草坪是围起来的，不用担心它跑出去",
    },
    image: 38,
    adopted: true,
    clicks: 13,
    hoursAfterLaunch: 6,
  },
  {
    campaign: 5,
    persona: "babab",
    answers: {
      feeling: "带娃又带狗来的，两边都有地方安置",
      recommend: "草坪位",
      scene: "带家人",
      detail: "孩子跟店家那三只猫玩了一下午，狗在草坪跑",
    },
    image: 39,
    adopted: true,
    clicks: 8,
    hoursAfterLaunch: 30,
  },
  {
    campaign: 5,
    persona: "noot",
    answers: {
      feeling: "冲着他家那三只猫来的，猫比饭更吸引我",
      recommend: "猫窝旁的座位",
      scene: "一个人",
      detail: "有只橘猫一直在睡，摸了两下没醒",
    },
    image: 40,
    adopted: false,
    clicks: 5,
    hoursAfterLaunch: 54,
  },
  {
    campaign: 5,
    persona: "may",
    answers: {
      feeling: "餐食一般，但环境对带宠物的人确实友好",
      recommend: "草坪位",
      scene: "带家人",
      detail: "有免费的狗狗饮水碗，还备了捡便袋",
    },
    image: 41,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 78,
  },

  // ── 坏样本：留了联系方式约“遛狗群” → block ──
  {
    campaign: 5,
    persona: "babab",
    answers: {
      feeling: "这周末有一起遛狗的吗，加我微信 dogwalk2024 拉群",
      recommend: "草坪位",
      scene: "带家人",
      detail: "顺便问问有没有推荐的狗粮",
    },
    image: 42,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 102,
  },

  // ═══ 7. 铁馆健身（5 条，验证「不推销」是不是真的）═══
  {
    campaign: 6,
    persona: "aken",
    answers: {
      feeling: "以教练身份说一句：器械是齐的，深蹲架不用排队",
      recommend: "自由重量区",
      scene: "一个人",
      detail: "50kg 的哑铃都有，这在 24 小时自助里算少见",
    },
    image: 43,
    adopted: true,
    clicks: 9,
    hoursAfterLaunch: 4,
  },
  {
    campaign: 6,
    persona: "xiaoli",
    answers: {
      feeling: "办卡一个月了，真的没人来推销私教",
      recommend: "24 小时刷脸",
      scene: "一个人",
      detail: "凌晨一点去过一次，还有人练",
    },
    image: 44,
    adopted: true,
    clicks: 7,
    hoursAfterLaunch: 28,
  },
  {
    campaign: 6,
    persona: "babab",
    answers: {
      feeling: "带娃练不了，但能在楼下练一小时已经很知足",
      recommend: "自由重量区",
      scene: "一个人",
      detail: "更衣室有淋浴，练完直接去上班",
    },
    image: 45,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 52,
  },
  {
    campaign: 6,
    persona: "nurse",
    answers: {
      feeling: "下夜班早上七点来练，这个时间段基本没人",
      recommend: "24 小时刷脸",
      scene: "一个人",
      detail: "对我这种作息颠倒的人太合适了",
    },
    image: 46,
    adopted: false,
    clicks: 5,
    hoursAfterLaunch: 76,
  },

  // ── 坏样本：没传图 + 内容空泛 ──
  {
    campaign: 6,
    persona: "xiaoli",
    answers: { feeling: "挺好的", recommend: "自由重量区", scene: "一个人" },
    image: null,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 100,
  },

  // ═══ 8. 麦野手作烘焙（6 条，讲抢到过什么）═══
  {
    campaign: 7,
    persona: "may",
    answers: {
      feeling: "十点那炉可颂我抢到了最后两个",
      recommend: "黄油可颂",
      scene: "带家人",
      detail: "孩子一个我一个，出炉还烫手",
    },
    image: 47,
    adopted: true,
    clicks: 10,
    hoursAfterLaunch: 5,
  },
  {
    campaign: 7,
    persona: "milkcat",
    answers: {
      feeling: "下午四点那炉没抢到，店员说可以提前留",
      recommend: "碱水结",
      scene: "一个人",
      detail: "第二次去提前打电话留了两个，确实留住了",
    },
    image: 48,
    adopted: true,
    clicks: 6,
    hoursAfterLaunch: 29,
  },
  {
    campaign: 7,
    persona: "chengxi",
    answers: {
      feeling: "奶油是动物性的，吃完嘴里不发腻",
      recommend: "动物奶油蛋糕",
      scene: "和朋友聚会",
      detail: "问过店员，用的确实是动物性淡奶油，成本高不少",
    },
    image: 49,
    adopted: false,
    clicks: 4,
    hoursAfterLaunch: 53,
  },
  {
    campaign: 7,
    persona: "xiaolu",
    answers: {
      feeling: "店面很小，只有两个位置能坐",
      recommend: "黄油可颂",
      scene: "和朋友聚会",
      detail: "基本上是买了就走，不适合久坐",
    },
    image: 50,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 77,
  },
  {
    campaign: 7,
    persona: "noot",
    answers: {
      feeling: "加班到晚上去只剩吐司了，但吐司也很好吃",
      recommend: "生吐司",
      scene: "一个人",
      detail: "店员说卖完就收摊，这点很实在",
    },
    image: 51,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 101,
  },

  // ── 坏样本：写了「无添加」「纯天然」→ 命中禁词 ──
  {
    campaign: 7,
    persona: "ajun",
    answers: {
      feeling: "这家面包无添加纯天然，吃着放心！",
      recommend: "生吐司",
      scene: "一个人",
      detail: "价格对学生稍微有点贵",
    },
    image: 52,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 125,
  },

  // ═══ 9. 巷子里·儿时味道小面（6 条，老街坊的记忆）═══
  {
    campaign: 8,
    persona: "chenayi",
    answers: {
      feeling: "味道跟我年轻时候吃的一模一样",
      recommend: "杂酱面",
      scene: "和朋友聚会",
      detail: "我们几个老姐妹每周三都来",
    },
    image: 53,
    adopted: true,
    clicks: 8,
    hoursAfterLaunch: 4,
  },
  {
    campaign: 8,
    persona: "zhou",
    answers: {
      feeling: "碱水面揉得到位，杂酱是当天现炒的，能吃出锅气",
      recommend: "杂酱面",
      scene: "一个人",
      detail: "五点开锅，我六点半到已经排了四个人",
    },
    image: 54,
    adopted: true,
    clicks: 11,
    hoursAfterLaunch: 28,
  },
  {
    campaign: 8,
    persona: "nurse",
    answers: {
      feeling: "下夜班来吃一碗，比什么都实在",
      recommend: "豌杂面",
      scene: "一个人",
      detail: "六点就开了，这个时间点很救命",
    },
    image: 55,
    adopted: false,
    clicks: 4,
    hoursAfterLaunch: 52,
  },
  {
    campaign: 8,
    persona: "xiaoli",
    answers: {
      feeling: "十二块一碗，重庆这个价格很良心了",
      recommend: "杂酱面",
      scene: "一个人",
      detail: "就是没地方坐，我是端到路边吃的",
    },
    image: 56,
    adopted: false,
    clicks: 6,
    hoursAfterLaunch: 76,
  },
  {
    campaign: 8,
    persona: "ajun",
    answers: {
      feeling: "老板看我学生样，多给了半勺杂酱！",
      recommend: "豌杂面",
      scene: "和朋友聚会",
      detail: "跟同学一起来的，两个人一共花了二十五",
    },
    image: 57,
    adopted: true,
    clicks: 5,
    hoursAfterLaunch: 100,
  },

  // ── 坏样本：复用第 53 张图 → duplicate_image ──
  {
    campaign: 8,
    persona: "xiaoli",
    answers: {
      feeling: "好吃，下次还来",
      recommend: "杂酱面",
      scene: "一个人",
    },
    image: "reuse:53",
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 124,
  },

  // ═══ 10. 沐云汤泉·亲子水乐园（7 条，活动已结束）═══
  {
    campaign: 9,
    persona: "babab",
    answers: {
      feeling: "水温真的是恒温，孩子泡了两小时没喊冷",
      recommend: "儿童区",
      scene: "带家人",
      detail: "儿童区限高 1.2 米，我儿子刚好卡线进去",
    },
    image: 58,
    adopted: true,
    clicks: 12,
    hoursAfterLaunch: 6,
  },
  {
    campaign: 9,
    persona: "may",
    answers: {
      feeling: "母婴室很干净，这个对带小娃的太重要了",
      recommend: "母婴室",
      scene: "带家人",
      detail: "里面有尿布台和热水，还备了湿巾",
    },
    image: 59,
    adopted: true,
    clicks: 9,
    hoursAfterLaunch: 30,
  },
  {
    campaign: 9,
    persona: "xiaolin",
    answers: {
      feeling: "带侄女来的，她在水里玩到不肯走",
      recommend: "儿童区",
      scene: "带家人",
      detail: "救生员一直在旁边看着，这点让人放心",
    },
    image: 60,
    adopted: false,
    clicks: 5,
    hoursAfterLaunch: 54,
  },
  {
    campaign: 9,
    persona: "ajun",
    answers: {
      feeling: "学生票便宜，但周末人有点多",
      recommend: "大池",
      scene: "和朋友聚会",
      detail: "下午三点以后人少一些",
    },
    image: 61,
    adopted: false,
    clicks: 2,
    hoursAfterLaunch: 78,
  },
  {
    campaign: 9,
    persona: "noot",
    answers: {
      feeling: "我是来泡汤的，儿童区太吵了",
      recommend: "成人静池",
      scene: "一个人",
      detail: "静池那边确实安静，跟儿童区隔得挺远",
    },
    image: 62,
    adopted: false,
    clicks: 3,
    hoursAfterLaunch: 102,
  },
  {
    campaign: 9,
    persona: "chenayi",
    answers: {
      feeling: "跟老姐妹来的，泡完浑身轻松",
      recommend: "大池",
      scene: "和朋友聚会",
      detail: "有免费的白开水，不用自己买",
    },
    image: 63,
    adopted: false,
    clicks: 1,
    hoursAfterLaunch: 126,
  },

  // ── 坏样本：留手机号 → block ──
  {
    campaign: 9,
    persona: "xiaoli",
    answers: {
      feeling: "想拼团的联系我 13800138000，凑满十个人有优惠",
      recommend: "大池",
      scene: "一个人",
      detail: "我这边已经有三个人了",
    },
    image: 64,
    adopted: false,
    clicks: 0,
    hoursAfterLaunch: 150,
  },
];
