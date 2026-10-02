/**
 * crops.js —— 灵田作物（GDD 11.1）
 * 作物体系：灵米 → 黄精草 → 百年人参 → 冰莲 → 九转还魂草
 * 生长时间从 1 小时到 7 天不等。
 */

export const CROPS = [
  {
    id: 'lingmi', name: '灵米', itemId: 'lingmi', yieldQty: 6,
    seedCost: 20, growMs: 60 * 60 * 1000,
    unlockStage: 0,
    desc: '一小时的收成。修仙界的口粮，现代实验室的谜题。',
  },
  {
    id: 'huangjing', name: '黄精草', itemId: 'huangjing', yieldQty: 5,
    seedCost: 60, growMs: 3 * 60 * 60 * 1000,
    unlockStage: 2,
    desc: '三年一熟的灵草，灵田里三个月就能收。这就是有田的好处。',
  },
  {
    id: 'bainian', name: '百年人参', itemId: 'bainian', yieldQty: 4,
    seedCost: 240, growMs: 12 * 60 * 60 * 1000,
    unlockStage: 10,
    desc: '十二年一茬。灵田把时间压缩成了可以交易的东西。',
  },
  {
    id: 'binglian', name: '冰莲', itemId: 'binglian', yieldQty: 3,
    seedCost: 1200, growMs: 2 * 24 * 60 * 60 * 1000,
    unlockStage: 14,
    desc: '两天一茬，供灵元丹与渡劫丹。收获后可在背包保存，提前规划种植更从容。',
  },
  {
    id: 'jiuzhuan', name: '九转还魂草', itemId: 'jiuzhuan', yieldQty: 2,
    seedCost: 6000, growMs: 7 * 24 * 60 * 60 * 1000,
    unlockStage: 22,
    desc: '七年一熟。整座坊市一年也见不到几株，你却有一整块田。',
  },
];

export const CROP_MAP = Object.fromEntries(CROPS.map((c) => [c.id, c]));

/** 灵田地块：初始 3 块，最多 12 块 */
export const PLOTS = {
  initial: 3,
  max: 12,
  costOf(owned) { return Math.round(400 * Math.pow(1.85, Math.max(0, owned - 3))); },
};

export function unlockedCrops(stage) {
  return CROPS.filter((c) => stage >= c.unlockStage);
}

export function cropYield(crop, bonus) {
  return Math.max(1, Math.round(crop.yieldQty * (1 + (bonus || 0))));
}
