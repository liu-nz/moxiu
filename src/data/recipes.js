/**
 * recipes.js —— 炼丹与炼器配方（GDD 11 / 9.2）
 *
 * 炼丹：材料 → 丹药。成功率受道途（丹修 +25%）、药性数据库研究、丹毒影响。
 * 炼器：灵材 + 灵石 → 指定部位装备，品阶由材料档位决定，成功率受道途（器修 +25%）与研究影响。
 */

import { MATERIALS } from './items.js';

/** 炼丹配方 */
export const ALCHEMY_RECIPES = [
  {
    id: 'huiyuan', name: '回元丹', out: 'huiyuandan', qty: 2,
    cost: 40, success: 0.80, unlockStage: 0,
    mats: { huangjing: 2 },
    desc: '最基础的丹方。灵田一茬黄精草能炼两次。',
  },
  {
    id: 'juqi', name: '聚气丹', out: 'juqi', qty: 2,
    cost: 90, success: 0.72, unlockStage: 0,
    mats: { huangjing: 3, lingjidan: 1 },
    desc: '低阶修士的日用丹药。自炼自卖，比倒卖划算。',
  },
  {
    id: 'ningshen', name: '凝神丹', out: 'ningshendan', qty: 1,
    cost: 260, success: 0.62, unlockStage: 2,
    mats: { bainian: 1, lingjidan: 2 },
    desc: '一小时内修炼速度 +100%。闭关前的最后一口。',
  },
  {
    id: 'zhuji', name: '筑基丹', out: 'zhujidan', qty: 1,
    cost: 600, success: 0.55, unlockStage: 10,
    mats: { bainian: 2, huangjing: 5, lurong: 1 },
    desc: '突破成功率 +20%。坊市里卖 300 灵石，自己炼省一半。',
  },
  {
    id: 'lingyuan', name: '灵元丹', out: 'lingyuandan', qty: 1,
    cost: 2400, success: 0.45, unlockStage: 14,
    mats: { binglian: 1, bainian: 3, lurong: 2 },
    desc: '两小时内修炼速度 +200%。冰莲化掉之前必须炼完。',
  },
  {
    id: 'dujie', name: '渡劫丹', out: 'dujiedan', qty: 1,
    cost: 9000, success: 0.38, unlockStage: 22,
    mats: { binglian: 2, lurong: 3, xuanjing: 1 },
    desc: '突破成功率 +30%。据说拿别人的失败炼出来的。',
  },
  {
    id: 'jiuzhuan', name: '九转还魂丹', out: 'jiuzhuandan', qty: 1,
    cost: 60000, success: 0.30, unlockStage: 26,
    mats: { jiuzhuan: 1, binglian: 2, xingchen: 1 },
    desc: '直接推进两次突破保底。命不好的人，只能靠钱。',
  },
];

/** 炼器：材料档位 → 装备品阶区间 */
export const FORGE_RECIPES = [
  { id: 'yin',   name: '阴精铸',   mat: 'yinjing',  qty: 3, cost: 200,    tierMin: 0, tierMax: 1, success: 0.78, unlockStage: 0 },
  { id: 'ling',  name: '灵金铸',   mat: 'lingjin',  qty: 3, cost: 900,    tierMin: 1, tierMax: 2, success: 0.72, unlockStage: 10 },
  { id: 'jian',  name: '剑魄铸',   mat: 'jianpo',   qty: 3, cost: 3200,   tierMin: 2, tierMax: 3, success: 0.66, unlockStage: 14 },
  { id: 'huo',   name: '火晶铸',   mat: 'huojing',  qty: 3, cost: 12000,  tierMin: 3, tierMax: 3, success: 0.60, unlockStage: 19 },
  { id: 'xuan',  name: '玄晶铸',   mat: 'xuanjing', qty: 3, cost: 50000,  tierMin: 3, tierMax: 4, success: 0.54, unlockStage: 22 },
  { id: 'xing',  name: '星尘铸',   mat: 'xingchen', qty: 3, cost: 200000, tierMin: 4, tierMax: 4, success: 0.48, unlockStage: 26 },
];

export const ALCHEMY_MAP = Object.fromEntries(ALCHEMY_RECIPES.map((r) => [r.id, r]));
export const FORGE_MAP = Object.fromEntries(FORGE_RECIPES.map((r) => [r.id, r]));

export function matName(id) {
  return MATERIALS.find((m) => m.id === id)?.name || id;
}

export function unlockedRecipes(stage, list) {
  return list.filter((r) => stage >= r.unlockStage);
}
