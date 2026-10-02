/**
 * beasts.js —— 灵兽系统（GDD 11.2）
 *
 * 战斗灵兽：副本中捕捉获得，上阵 2 只，自动帮打。
 * 养殖灵兽：灵脉牧场放养，定时产出材料。
 * 联动：养殖灵兽的产出 → 炼丹/炼器/卖店铺；战斗灵兽可以放到牧场帮忙看护，减少作物被偷吃。
 */

export const BATTLE_BEASTS = [
  {
    id: 'linghu', name: '灵狐', tier: 1, atkRatio: 0.30, hpRatio: 0.18, spd: 1.25,
    trait: '暴击', traitDesc: '合击有 30% 概率造成 1.6 倍伤害',
    unlockStage: 2,
    desc: '尾巴分三叉，会学人说话。打起来比你快。',
  },
  {
    id: 'canglang', name: '苍狼', tier: 2, atkRatio: 0.40, hpRatio: 0.26, spd: 1.15,
    trait: '连击', traitDesc: '合击有 25% 概率追加一次',
    unlockStage: 10,
    desc: '群居妖兽，独行的那一只往往最难缠。',
  },
  {
    id: 'xuangui', name: '玄龟', tier: 3, atkRatio: 0.28, hpRatio: 0.55, spd: 0.75,
    trait: '护主', traitDesc: '出战时为你提供 8% 伤害减免',
    unlockStage: 14,
    desc: '壳上刻满了前主人的名字，它一个都没记住。',
  },
  {
    id: 'huofeng', name: '火凤', tier: 4, atkRatio: 0.60, hpRatio: 0.30, spd: 1.35,
    trait: '焚天', traitDesc: '合击附带灼烧，本场战斗伤害 +12%',
    unlockStage: 22,
    desc: '涅槃过一次的鸟。第二次飞起来的时候，天是红的。',
  },
  {
    id: 'pixiu', name: '貔貅', tier: 5, atkRatio: 0.48, hpRatio: 0.40, spd: 1.05,
    trait: '纳财', traitDesc: '出战时副本灵石收益 +25%',
    unlockStage: 30,
    desc: '只进不出。养它的人财运都不错，人品就不一定了。',
  },
];

export const BEAST_MAP = Object.fromEntries(BATTLE_BEASTS.map((b) => [b.id, b]));

export const RANCH_BEASTS = [
  {
    id: 'lingji', name: '灵鸡', produceId: 'lingjidan', qty: 2, cycleMs: 45 * 60 * 1000,
    cost: 300, unlockStage: 0,
    desc: '产蛋。灵鸡蛋是炼丹的万用辅料，也是现代早餐店买不到的东西。',
  },
  {
    id: 'lingyang', name: '灵羊', produceId: 'lingyangmao', qty: 2, cycleMs: 3 * 60 * 60 * 1000,
    cost: 1200, unlockStage: 10,
    desc: '产毛。灵羊毛纺出来的布，比任何现代防弹材料都耐磨。',
  },
  {
    id: 'linglu', name: '灵鹿', produceId: 'lurong', qty: 1, cycleMs: 8 * 60 * 60 * 1000,
    cost: 6000, unlockStage: 14,
    desc: '产鹿茸。它每年掉一次，你每年赚一次。',
  },
];

export const RANCH_MAP = Object.fromEntries(RANCH_BEASTS.map((b) => [b.id, b]));

/** 牧场栏位 */
export const RANCH = {
  initial: 2,
  max: 10,
  costOf(owned) { return Math.round(800 * Math.pow(1.9, Math.max(0, owned - 2))); },
};

/** 上阵灵兽数量（GDD 11.2：上阵 2 只） */
export const DEPLOY_LIMIT = 2;

/** 灵兽升级 */
export const BEAST_MAX_LEVEL = 10;
export function beastUpgradeCost(beast, level) {
  const tier = BEAST_MAP[beast.id]?.tier || 1;
  return Math.round(200 * Math.pow(2.2, tier - 1) * Math.pow(1.6, level - 1));
}

/** 捕捉概率：副本通关后按难度与副本档位判定 */
export function captureChance(dungeonIndex, diffId) {
  const base = 0.10 + dungeonIndex * 0.025;
  const mul = diffId === 'hell' ? 3 : diffId === 'hard' ? 1.8 : 1;
  return Math.min(0.60, base * mul);
}

/** 可捕捉的战斗灵兽（按副本档位） */
export function capturableBeasts(stage) {
  return BATTLE_BEASTS.filter((b) => stage >= b.unlockStage);
}
