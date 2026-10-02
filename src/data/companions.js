/**
 * companions.js —— 道侣系统（GDD 12）
 * 好感度五阶段（相识 → 好友 → 知己 → 道侣 → 同心），
 * 每位道侣有职业专长，可以在你不在线时替你干活。
 */

export const COMPANIONS = [
  {
    id: 'suqingyuan', name: '苏清鸢', title: '剑修', unlockStage: 0,
    gift: 'juqi', giftHint: '聚气丹：坊市有售，也可自己炼',
    trait: '替你刷副本，省体力',
    desc: '话少，剑快。她说她不需要道侣，只是没人陪她练剑。',
    duties: {
      idle: '自动代刷副本（每次界潮刷新时代打一轮已通关的最高难度副本）',
    },
  },
  {
    id: 'moyao', name: '墨瑶', title: '丹修', unlockStage: 10,
    gift: 'huangjing', giftHint: '黄精草：灵田种植',
    trait: '替你炼丹，每日产出丹药',
    desc: '炉子前坐了一百年。她记得每一味药的脾气，包括你的。',
    duties: {
      idle: '每日自动炼制一批丹药（每次界潮刷新时结算）',
    },
  },
  {
    id: 'tiexinlan', name: '铁心兰', title: '体修', unlockStage: 14,
    gift: 'lingjin', giftHint: '灵金：黑水沼泽掉落',
    trait: '替你看店补货，省得跑一趟',
    desc: '一拳能砸碎山门，却愿意站在柜台后面数灵石。',
    duties: {
      idle: '店铺自动售货效率 +50%',
    },
  },
  {
    id: 'bailing', name: '白灵', title: '妖修', unlockStage: 22,
    gift: 'yaodan', giftHint: '妖丹：副本掉落',
    trait: '替你探索隐藏宝箱，副本收益提升',
    desc: '狐族出身，鼻子比谁都灵。她说宝藏的味道像下雨前的土。',
    duties: {
      idle: '副本掉落数量 +1，灵石收益 +20%',
    },
  },
];

export const COMPANION_MAP = Object.fromEntries(COMPANIONS.map((c) => [c.id, c]));

/** 好感度五阶段（GDD 12） */
export const AFFECTION_STAGES = [
  { id: 'meet',    name: '相识', min: 0,  max: 19, effect: null },
  { id: 'friend',  name: '好友', min: 20, max: 39, effect: '双修：修炼速度 +5%' },
  { id: 'confidant', name: '知己', min: 40, max: 59, effect: '互助：所在世界收益 +8%' },
  { id: 'partner', name: '道侣', min: 60, max: 79, effect: '同心：修炼速度再 +10%，副本可替伤一次' },
  { id: 'soul',    name: '同心', min: 80, max: 100, effect: '专长全开：专属被动效果翻倍' },
];

export function affectionStage(value) {
  const v = Math.max(0, Math.min(100, value || 0));
  for (let i = AFFECTION_STAGES.length - 1; i >= 0; i--) {
    if (v >= AFFECTION_STAGES[i].min) return AFFECTION_STAGES[i];
  }
  return AFFECTION_STAGES[0];
}

/** 送礼：好感度随阶段递减（越高越难涨） */
export const GIFT = {
  baseGain: 8,
  /** 好感度越高，单次送礼收益越低 */
  gainFor(value, itemTier) {
    const v = value || 0;
    const damp = v < 20 ? 1 : v < 40 ? 0.8 : v < 60 ? 0.6 : v < 80 ? 0.42 : 0.3;
    return Math.max(1, Math.round(GIFT.baseGain * damp * (1 + (itemTier || 1) * 0.25)));
  },
  /** 送礼消耗的灵石（按好感度递增） */
  costFor(value) {
    const v = value || 0;
    return Math.round(200 * Math.pow(1.28, v / 10));
  },
};

/** 各阶段解锁的道侣特效 */
export function companionBonuses(state, companionId) {
  const v = (state.companions?.[companionId]?.affection) || 0;
  const stage = affectionStage(v);
  const soul = stage.id === 'soul';
  return {
    cultSpeed: v >= 60 ? (soul ? 0.20 : 0.10) : v >= 20 ? (soul ? 0.10 : 0.05) : 0,
    sideIncome: v >= 40 ? (soul ? 0.16 : 0.08) : 0,
    damageTaken: v >= 60 ? (soul ? 0.14 : 0.07) : 0,
    dutiesOn: v >= 40,
    dutiesDoubled: soul,
    stage,
  };
}
