/**
 * ranking.js —— 排行榜与称号（GDD 15）
 * 综合实力榜 / 财富榜 / 贸易榜 / 修炼速度榜。每周刷新发称号奖励。
 * 一期为单机，榜单上的其他「天选者」由 NPC 模拟。
 */

export const BOARDS = [
  { id: 'power',  name: '综合实力榜', unit: '战力', desc: '境界、装备、功法、灵兽的综合体现' },
  { id: 'wealth', name: '财富榜',     unit: '灵石', desc: '持有的灵石总量' },
  { id: 'trade',  name: '贸易榜',     unit: '笔',   desc: '累计完成的跨界交易笔数' },
  { id: 'speed',  name: '修炼速度榜', unit: '/秒', desc: '当前每秒修为产出' },
];

export const BOARD_MAP = Object.fromEntries(BOARDS.map((b) => [b.id, b]));

/** NPC 天选者名册（一期以 NPC 模拟） */
export const RIVAL_NAMES = [
  '林砚之', '苏不问', '陈拾遗', '柳三更', '沈青梧', '顾长风',
  '周砚秋', '吴听澜', '郑无咎', '何寄北', '许南枝', '冯雪衣',
  '秦望川', '曹半山', '袁子规', '邓九斤', '范听雪', '彭不器',
  '蒋秋声', '卢照微', '谭星野', '毕无涯', '钟离白', '南宫叙',
];

/**
 * 每周结算时按名次发称号。
 * 称号只保留一周（下次刷新时覆盖），提供小额永久加成。
 */
export const TITLES = {
  power: [
    { rank: 1, name: '一世之雄', mods: { atkMul: 0.06, hpMul: 0.06 } },
    { rank: 2, name: '锋芒毕露', mods: { atkMul: 0.04 } },
    { rank: 3, name: '崭露头角', mods: { atkMul: 0.02 } },
  ],
  wealth: [
    { rank: 1, name: '富可敌国', mods: { tradeProfit: 0.08 } },
    { rank: 2, name: '腰缠万贯', mods: { tradeProfit: 0.05 } },
    { rank: 3, name: '小有积蓄', mods: { tradeProfit: 0.03 } },
  ],
  trade: [
    { rank: 1, name: '两界通商', mods: { tradehouseSpeed: 0.15 } },
    { rank: 2, name: '行商有道', mods: { tradehouseSpeed: 0.10 } },
    { rank: 3, name: '初通门路', mods: { tradehouseSpeed: 0.05 } },
  ],
  speed: [
    { rank: 1, name: '一日千里', mods: { cultSpeed: 0.10 } },
    { rank: 2, name: '朝闻道', mods: { cultSpeed: 0.06 } },
    { rank: 3, name: '勤能补拙', mods: { cultSpeed: 0.03 } },
  ],
};

export const RANKING = {
  /** 每周刷新（按界潮日每 7 天） */
  weekLengthDays: 7,
  /** NPC 每周基准水平相对玩家当前值的分布范围 */
  spreadMin: 0.45,
  spreadMax: 1.75,
  /** NPC 在周内的成长速度（每小时） */
  growthPerHour: 0.006,
  rivalCount: 19,
  /** 上榜名次 */
  topN: 12,
};

export function titleFor(boardId, rank) {
  const list = TITLES[boardId] || [];
  return list.find((t) => t.rank === rank) || null;
}
