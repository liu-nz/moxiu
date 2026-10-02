/**
 * sects.js —— 宗门系统（GDD 1.2 表世界职责）
 *
 * 与「道盟」（GDD 15 的松散公会）区分：宗门是修仙界的正式组织。
 * 拜入宗门后从外门弟子做起，靠宗门贡献与境界晋升辈分；
 * 辈分越高，宗门灵气带来的修炼加成越大，还能兑换本门秘传。
 */

export const SECTS = [
  {
    id: 'qingyunjian', name: '青云剑宗', accent: '剑', focus: '剑修',
    desc: '山门立在云上，弟子入门第一天就要在剑冢里挑一把断剑。',
    perk: '攻击 +10%，功法威力 +12%',
    mods: { atkMul: 0.10, skillPower: 0.12 },
    joinStage: 0,
    secrets: [
      { id: 'swordheart', name: '剑心通明', cost: 800, effect: { skillPower: 0.10 }, desc: '剑意入心。功法威力永久 +10%。' },
      { id: 'qingfeng', name: '青锋剑意', cost: 2600, effect: { atkMul: 0.12 }, desc: '断剑重铸之日。攻击永久 +12%。' },
      { id: 'jianyu', name: '万剑归一', cost: 9000, effect: { critDmg: 0.30 }, desc: '一剑化万剑。暴击伤害永久 +30%。' },
    ],
  },
  {
    id: 'danxiagu', name: '丹霞谷', accent: '丹', focus: '丹修',
    desc: '谷中四季飘着药香，连风都是温的。弟子大多不太会打架，但都很会算账。',
    perk: '炼丹成功率 +12%，灵田产量 +20%',
    mods: { alchemySuccess: 0.12, farmYield: 0.20 },
    joinStage: 0,
    secrets: [
      { id: 'danjing', name: '九转丹经', cost: 800, effect: { alchemy: 0.15 }, desc: '炼丹成功率永久 +15%。' },
      { id: 'huoyan', name: '火眼金睛', cost: 2600, effect: { matYield: 0.25 }, desc: '看药一眼便知成色。材料掉落 +25%。' },
      { id: 'jiuzhuan', name: '九转还魂法', cost: 9000, effect: { breakthroughAdd: 0.08 }, desc: '突破成功率永久 +8%。' },
    ],
  },
  {
    id: 'tianjige', name: '天机阁', accent: '机', focus: '术修',
    desc: '阁中不供祖师，只供一台算到发烫的铜盘。他们相信万事皆可推演。',
    perk: '交易行成交速度 +30%，奇闻触发 +20%',
    mods: { tradehouseSpeed: 0.30, taleRate: 0.20 },
    joinStage: 0,
    secrets: [
      { id: 'tianjisuan', name: '天机算', cost: 800, effect: { tradeProfit: 0.12 }, desc: '贸易利润永久 +12%。' },
      { id: 'tuiyan', name: '推演术', cost: 2600, effect: { tradehouseSpeed: 0.20 }, desc: '交易行成交速度永久 +20%。' },
      { id: 'yinguo', name: '因果线', cost: 9000, effect: { fortune: 0.20 }, desc: '福缘 +20%：掉落与奇闻好运提升。' },
    ],
  },
  {
    id: 'wanshou', name: '万兽山庄', accent: '兽', focus: '驭兽',
    desc: '山庄养着上千头灵兽，从巴掌大的灵狐到能驮山的玄龟都有。',
    perk: '灵兽合击 +40%，副本掉落 +1',
    mods: { petPower: 0.40, bonusDrops: 1 },
    joinStage: 0,
    secrets: [
      { id: 'yushoujue', name: '驭兽诀', cost: 800, effect: { petPower: 0.35 }, desc: '灵兽合击伤害永久 +35%。' },
      { id: 'shouyu', name: '兽语', cost: 2600, effect: { captureChance: 0.30 }, desc: '灵兽捕捉概率 +30%。' },
      { id: 'wanling', name: '万灵归心', cost: 9000, effect: { petDmgReduce: 0.10 }, desc: '上阵灵兽额外为你提供 10% 伤害减免。' },
    ],
  },
];

export const SECT_MAP = Object.fromEntries(SECTS.map((s) => [s.id, s]));

/** 弟子辈分：靠「宗门贡献 + 境界」双条件晋升 */
export const SECT_RANKS = [
  { id: 'outer',  name: '外门弟子', contribution: 0,     stage: 0,  cultBonus: 0.03, perk: '宗门灵气：修炼速度 +3%' },
  { id: 'inner',  name: '内门弟子', contribution: 400,   stage: 10, cultBonus: 0.06, perk: '可领宗门月俸（每日灵石）' },
  { id: 'true',   name: '真传弟子', contribution: 1600,  stage: 14, cultBonus: 0.10, perk: '宗门灵气：修炼速度 +10%' },
  { id: 'core',   name: '核心弟子', contribution: 6000,  stage: 18, cultBonus: 0.15, perk: '宗门秘传可兑换全部三阶' },
  { id: 'elder',  name: '长老',     contribution: 20000, stage: 22, cultBonus: 0.20, perk: '宗门灵气：修炼速度 +20%' },
  { id: 'master', name: '宗主',     contribution: 70000, stage: 30, cultBonus: 0.28, perk: '宗门灵气：修炼速度 +28%，月俸翻倍' },
];

/** 宗门任务：比道盟任务更长线，奖励的是宗门贡献 */
export const SECT_QUESTS = [
  { id: 'patrol',  name: '巡山',     desc: '今日通关副本 2 次',            metric: 'dungeons',    goal: 2,  contribution: 80 },
  { id: 'refine',  name: '炼丹房当值', desc: '今日炼丹或炼器 3 次',          metric: 'crafts',      goal: 3,  contribution: 90 },
  { id: 'market',  name: '坊市采买',  desc: '今日完成 10 笔交易',           metric: 'trades',      goal: 10, contribution: 70 },
  { id: 'herb',    name: '采药',     desc: '今日收获灵田作物 3 次',          metric: 'harvests',    goal: 3,  contribution: 85 },
  { id: 'meditate',name: '闭关',     desc: '今日累积修为达到 3 小时挂机量',   metric: 'cultRatio',   goal: 3,  contribution: 100 },
  { id: 'tribute', name: '上缴',     desc: '今日向宗门上缴材料 1 次',        metric: 'tributes',    goal: 1,  contribution: 60 },
];

/**
 * 宗门大比：每周一次。
 * 名次不看绝对战力，而看你比「同境界的裸装基准」强多少——
 * 所以这是个 Build 质量的检验，而不是境界的检验。
 */
export const SECT_TOURNAMENT = {
  cooldownMs: 7 * 24 * 3600 * 1000,
  stamina: 20,
  tiers: [
    { id: 'first', name: '魁首', minRatio: 2.60, contribution: 4000, stoneMul: 6.0, desc: '同辈之中，你已无敌手。' },
    { id: 'top3',  name: '前三', minRatio: 1.90, contribution: 2200, stoneMul: 3.5, desc: '长老记住了你的名字。' },
    { id: 'top10', name: '前十', minRatio: 1.40, contribution: 1000, stoneMul: 2.0, desc: '还算不错，继续。' },
    { id: 'pass',  name: '入围', minRatio: 1.10, contribution: 400,  stoneMul: 1.2, desc: '勉强进了第二轮。' },
    { id: 'fail',  name: '落选', minRatio: 0,    contribution: 120,  stoneMul: 0.6, desc: '回去再练两年。' },
  ],
  /** 大比基础奖励（灵石），再乘 stoneMul */
  baseStone: 300,
};

/** 宗门月俸：按辈分每日发放 */
export const SECT_STIPEND = [20, 80, 260, 700, 1800, 4200];

/** 上缴材料换贡献：按材料档位 */
export function tributeValue(mat) {
  return Math.max(5, Math.round((mat.tier || 1) * 22));
}

export function sectRankOf(index) {
  return SECT_RANKS[Math.max(0, Math.min(SECT_RANKS.length - 1, index || 0))];
}

export function nextSectRank(index) {
  return SECT_RANKS[(index || 0) + 1] || null;
}
