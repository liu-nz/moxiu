/**
 * guild.js —— 道盟与跨界商会（GDD 15）
 *
 * 道盟（公会）：玩家加入道盟，集体任务、道盟商店、道盟 BOSS。一期 NPC 道盟。
 * 跨界商会：跨两界的商人组织，加入后享受贸易税率减免、专属商品。
 */

export const GUILDS = [
  {
    id: 'tianji', name: '四海商盟',
    focus: '情报与贸易',
    desc: '盟中人不问出身，只问消息值多少灵石。',
    perk: '交易行成交速度 +25%，贸易利润 +6%',
    mods: { tradehouseSpeed: 0.25, tradeProfit: 0.06 },
    joinCost: { stone: 300 },
    accent: '商',
  },
  {
    id: 'qingyun', name: '散修同盟',
    focus: '战斗与秘境',
    desc: '一群不愿入宗门的人凑出来的组织。他们只信一件事：能打的人说话才有人听。',
    perk: '副本灵石收益 +18%，体力上限 +20',
    mods: { dungeonStone: 0.18, staminaMax: 20 },
    joinCost: { stone: 300 },
    accent: '战',
  },
  {
    id: 'danxia', name: '丹鼎会',
    focus: '丹器与灵田',
    desc: '会中四季飘着药香。这里的人不太会打架，但都很会算账。',
    perk: '炼丹成功率 +8%，灵田产量 +15%',
    mods: { alchemySuccess: 0.08, farmYield: 0.15 },
    joinCost: { stone: 300 },
    accent: '丹',
  },
];

export const GUILD_MAP = Object.fromEntries(GUILDS.map((g) => [g.id, g]));

/**
 * 每日集体任务。
 * 阈值用「当日进度 / 目标」计算，目标随玩家当前产出水平自动缩放，
 * 所以低境界和高境界的玩家都能在合理时间内完成。
 */
export const GUILD_QUESTS = [
  {
    id: 'hunt', name: '清剿妖患', metric: 'dungeons',
    desc: '今日通关副本 3 次', goal: 3, contribution: 60,
  },
  {
    id: 'trade', name: '货通两界', metric: 'trades',
    desc: '今日完成 15 笔交易', goal: 15, contribution: 50,
  },
  {
    id: 'cultivate', name: '勤修不辍', metric: 'cultRatio',
    desc: '今日累积修为达到 2 小时挂机量', goal: 2, contribution: 70,
  },
  {
    id: 'ship', name: '出货', metric: 'soldQty',
    desc: '今日售出 30 件货物', goal: 30, contribution: 55,
  },
  {
    id: 'profit', name: '敛财', metric: 'incomeRatio',
    desc: '今日收入达到 1 小时被动收入', goal: 1, contribution: 65,
  },
  {
    id: 'gather', name: '采药炼器', metric: 'crafts',
    desc: '今日炼丹或炼器 4 次', goal: 4, contribution: 55,
  },
];

/** 道盟商店：用道盟贡献兑换 */
export const GUILD_SHOP = [
  {
    id: 'pill_juqi', name: '道盟特供·聚气丹', out: 'juqi', qty: 5,
    contribution: 40, unlockStage: 0,
    desc: '宗门丹房统一配发，比坊市便宜。',
  },
  {
    id: 'pill_huiyuan', name: '道盟特供·回元丹', out: 'huiyuandan', qty: 5,
    contribution: 50, unlockStage: 0,
    desc: '出门在外的弟子人手一份。',
  },
  {
    id: 'mat_lingjin', name: '灵金锭', out: 'lingjin', qty: 3,
    contribution: 120, unlockStage: 10,
    desc: '宗门矿脉直供，不用自己去沼泽里挖。',
  },
  {
    id: 'pill_zhuji', name: '道盟特供·筑基丹', out: 'zhujidan', qty: 2,
    contribution: 200, unlockStage: 10,
    desc: '长老亲手炼的，比自己炼的稳。',
  },
  {
    id: 'mat_jianpo', name: '剑魄匣', out: 'jianpo', qty: 3,
    contribution: 420, unlockStage: 14,
    desc: '从剑冢里收来的断剑残意。',
  },
  {
    id: 'pill_lingyuan', name: '道盟特供·灵元丹', out: 'lingyuandan', qty: 2,
    contribution: 700, unlockStage: 14,
    desc: '闭关前领的。领了就得闭关，不然长老会问。',
  },
  {
    id: 'mat_xuanjing', name: '玄晶残片', out: 'xuanjing', qty: 3,
    contribution: 1600, unlockStage: 22,
    desc: '前朝阵法核心的碎片，道盟库房里存了几百年。',
  },
  {
    id: 'pill_dujie', name: '道盟特供·渡劫丹', out: 'dujiedan', qty: 1,
    contribution: 3000, unlockStage: 22,
    desc: '只发给快渡劫的弟子。发下去基本就不还了。',
  },
];

export const GUILD_SHOP_MAP = Object.fromEntries(GUILD_SHOP.map((s) => [s.id, s]));

/** 道盟 BOSS：每周一次，按打出的伤害给贡献 */
export const GUILD_BOSS = {
  cooldownMs: 7 * 24 * 3600 * 1000,
  name: '盟中试炼',
  desc: '道盟长老布下的试炼阵法。按你打出的伤害折算贡献。',
  /** 每次挑战消耗的体力 */
  stamina: 30,
  /** 贡献 = 伤害 / 该系数 */
  damageToContribution: 1000,
  /** 三档难度：会心一击的概率与倍率 */
  ranks: [
    { id: 'steady', name: '稳扎稳打', mul: 1.0, contributionMul: 1.0 },
    { id: 'burst',  name: '全力以赴', mul: 1.6, contributionMul: 1.6 },
    { id: 'allin',  name: '孤注一掷', mul: 2.4, contributionMul: 2.4 },
  ],
};

/** 跨界商会 */
export const CHAMBER = {
  id: 'chamber',
  name: '跨界商会',
  joinCost: { stone: 15000 },
  desc: '一群在界门两侧同时开铺子的人。他们不管你是谁，只看你的货。',
  perks: {
    tradeProfit: 0.08,
    tradehouseSpeed: 0.20,
    listingFeeDiscount: 0.5,
  },
  perkText: [
    '贸易利润 +8%',
    '交易行成交速度 +20%',
    '上架税费减半',
  ],
};
