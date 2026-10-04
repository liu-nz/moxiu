/**
 * recipes.js —— 炼丹与炼器配方（GDD 11 / 9.2）
 *
 * 炼丹：材料 → 丹药。成功率受道途（丹修 +25%）、药性数据库研究、丹毒影响。
 * 炼器：灵材 + 灵石 → 指定部位装备，品阶由材料档位决定，成功率受道途（器修 +25%）与研究影响。
 */

import { MATERIALS } from './items.js';
import { EQUIPMENT_DESIGNS } from './equipmentDesigns.js';

/** 炼丹配方 */
export const ALCHEMY_RECIPES = [
 {id:'shiling',name:'蚀灵丹',out:'shilingdan',qty:1,cost:120,success:.72,unlockStage:5,mats:{huangjing:3,lingjidan:1},desc:'毒丹流战前准备：一小时持续叠毒；需丹修与药性数据库。'},
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
    desc: '跨界贸易用丹药，不可服用。售价随市场与品质变化。',
  },
  {
    id: 'ningshen', name: '凝神丹', out: 'ningshendan', qty: 1,
    cost: 260, success: 0.62, unlockStage: 10,
    mats: { bainian: 1, lingjidan: 2 },
    desc: '一小时内修炼速度 +100%。闭关前的最后一口。',
  },
  {
    id: 'zhuji', name: '筑基丹', out: 'zhujidan', qty: 1,
    cost: 600, success: 0.55, unlockStage: 14,
    mats: { bainian: 2, huangjing: 5, lurong: 1 },
    desc: '下次突破成功率 +20%。可炼制不同品质；原方成本高于市场购入价。',
  },
  {
    id: 'lingyuan', name: '灵元丹', out: 'lingyuandan', qty: 1,
    cost: 2400, success: 0.45, unlockStage: 14,
    mats: { binglian: 1, bainian: 3, lurong: 2 },
    desc: '两小时内修炼速度 +200%。同类修炼丹药替换，不叠加。',
  },
  {
    id: 'dujie', name: '渡劫丹', out: 'dujiedan', qty: 1,
    cost: 9000, success: 0.38, unlockStage: 23,
    mats: { binglian: 2, lurong: 3, xuanjing: 1 },
    desc: '突破成功率 +30%。据说拿别人的失败炼出来的。',
  },
  {
    id: 'jiuzhuan', name: '九转还魂丹', out: 'jiuzhuandan', qty: 1,
    cost: 60000, success: 0.30, unlockStage: 27,
    mats: { jiuzhuan: 1, binglian: 2, xingchen: 1 },
    desc: '直接推进两次突破保底。命不好的人，只能靠钱。',
  },
];

/** 炼器：材料档位 → 装备品阶区间 */
export const FORGE_RECIPES = [
  { id: 'yin',   name: '阴精铸',   mat: 'yinjing',  qty: 3, cost: 200,    tierMin: 0, tierMax: 1, success: 0.78, unlockStage: 5 },
  { id: 'ling',  name: '灵金铸',   mat: 'lingjin',  qty: 3, cost: 900,    tierMin: 1, tierMax: 2, success: 0.72, unlockStage: 11 },
  { id: 'jian',  name: '剑魄铸',   mat: 'jianpo',   qty: 3, cost: 3200,   tierMin: 2, tierMax: 3, success: 0.66, unlockStage: 15 },
  { id: 'huo',   name: '火晶铸',   mat: 'huojing',  qty: 3, cost: 12000,  tierMin: 3, tierMax: 3, success: 0.60, unlockStage: 19 },
  { id: 'xuan',  name: '玄晶铸',   mat: 'xuanjing', qty: 3, cost: 50000,  tierMin: 3, tierMax: 4, success: 0.54, unlockStage: 23 },
  { id: 'xing',  name: '星尘铸',   mat: 'xingchen', qty: 3, cost: 200000, tierMin: 4, tierMax: 4, success: 0.48, unlockStage: 27 },
];

export const ALCHEMY_MAP = Object.fromEntries(ALCHEMY_RECIPES.map((r) => [r.id, r]));
FORGE_RECIPES.push(...EQUIPMENT_DESIGNS.map(d=>({id:`design_${d.id}`,name:d.name,design:d.id,slot:d.slot,secret:d.secret,desc:d.note,mat:d.stage>=11?'lingjin':'yinjing',qty:2,cost:d.stage>=11?700:240,tierMin:1,tierMax:1,success:.78,unlockStage:d.stage})));

export const FORGE_MAP = Object.fromEntries(FORGE_RECIPES.map((r) => [r.id, r]));

export function matName(id) {
  return MATERIALS.find((m) => m.id === id)?.name || id;
}

export function unlockedRecipes(stage, list) {
  return list.filter((r) => stage >= r.unlockStage);
}
