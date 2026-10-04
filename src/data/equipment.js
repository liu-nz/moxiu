/**
 * equipment.js —— 装备系统（GDD 9.2）
 * 七部位（武器/头盔/衣服/鞋子/戒指×2/法宝）× 五品阶（凡/灵/宝/仙/神），强化 +1 ~ +15。
 * 另含 GDD 10.1 的「现代科技装备」：抗生素 / 强光手电 / 合金刀，带机制效果而非纯加属性。
 */

import { AFFIXES } from './affixes.js';
import { rint, pick, uid, clamp } from '../core/util.js';

export const SLOTS = [
  { id: 'weapon',   name: '武器', short: '兵' },
  { id: 'helmet',   name: '头盔', short: '冠' },
  { id: 'armor',    name: '衣服', short: '衣' },
  { id: 'boots',    name: '鞋子', short: '履' },
  { id: 'ring1',    name: '戒指·一', short: '环' },
  { id: 'ring2',    name: '戒指·二', short: '环' },
  { id: 'artifact', name: '法宝', short: '宝' },
];

export const SLOT_MAP = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

/** 五品阶（GDD 9.2） */
export const TIERS = [
  { id: 'common', name: '凡品', mult: 1.0,  cls: 'q-common', border: 'q-b-common' },
  { id: 'fine',   name: '灵品', mult: 1.6,  cls: 'q-fine',   border: 'q-b-fine' },
  { id: 'rare',   name: '宝品', mult: 2.6,  cls: 'q-rare',   border: 'q-b-rare' },
  { id: 'epic',   name: '仙品', mult: 4.2,  cls: 'q-epic',   border: 'q-b-epic' },
  { id: 'legend', name: '神品', mult: 7.0,  cls: 'q-legend', border: 'q-b-legend' },
];
export const TIER_MAP = Object.fromEntries(TIERS.map((t) => [t.id, t]));

/** 各部位的主属性权重 */
const SLOT_STATS = {
  weapon:   { atk: 1.00, critDmg: 0.030, skillPower: 0.030 },
  helmet:   { def: 0.80, hpMax: 0.90, dmgReduce: 0.012 },
  armor:    { def: 1.00, hpMax: 1.20, dmgReduce: 0.018 },
  boots:    { spd: 6.0, dodge: 0.018, def: 0.40 },
  ring1:    { atk: 0.50, critRate: 0.018, mpMax: 0.70 },
  ring2:    { atk: 0.50, lifesteal: 0.012, mpMax: 0.70 },
  artifact: { skillPower: 0.045, mpMax: 1.00, cultSpeed: 0.035 },
};

/** 百分比类词条：不随境界倍率放大，否则后期会出现 +300% 暴击伤害这种离谱值 */
export const PCT_KEYS = new Set([
  'critRate', 'critDmg', 'dodge', 'lifesteal', 'dmgReduce', 'skillPower', 'cultSpeed',
  'enhanceBonus', 'tradeProfit', 'alchemy', 'forge', 'shopTraffic',
]);

/** 小数值类词条（速度）：只随品阶成长，不随境界倍率放大 */
export const SMALL_KEYS = new Set(['spd']);

/**
 * 统一的词条数值生成
 *  - 百分比类：weight × 品阶 × 档次
 *  - 速度类：  weight × 品阶
 *  - 其余（攻击/防御/气血/真元）：weight × 品阶 × 档次 × 数值规模
 */
export function statValue(key, weight, scale, tierMult, gradeMult, jitter) {
  if (SMALL_KEYS.has(key)) {
    return Math.round(weight * tierMult * jitter * 10) / 10;
  }
  if (PCT_KEYS.has(key)) {
    return Math.round(weight * tierMult * gradeMult * jitter * 1000) / 1000;
  }
  return Math.max(1, Math.round(scale * weight * tierMult * gradeMult * jitter));
}

const NAME_POOL = {
  weapon:   ['青锋剑', '断岳刀', '寒潭枪', '流云剑', '裂石锤', '赤霄刃'],
  helmet:   ['玄铁冠', '紫金盔', '云纹巾', '镇魂冠', '灵犀盔', '苍羽笠'],
  armor:    ['玄龟甲', '流云袍', '铁骨衣', '青蛟甲', '月华袍', '重渊铠'],
  boots:    ['踏云履', '疾风靴', '磐石靴', '掠影履', '归元靴', '踏雪屐'],
  ring1:    ['聚灵环', '纳气戒', '玄阳指环', '藏锋环', '清心戒', '九曜环'],
  ring2:    ['噬血环', '护心戒', '回春环', '守拙戒', '灵犀环', '无相戒'],
  artifact: ['镇魂铃', '乾坤袋', '照妖镜', '灵枢盘', '九幽幡', '太虚印'],
};

/** 强化等级上限（GDD 9.2：+1 ~ +15） */
export const ENHANCE_MAX = 15;

/** 每级强化提供的加成比例（器修另有 +15% 加成） */
export const ENHANCE_PER_LEVEL = 0.05;

export function enhanceCost(level) {
  return Math.round(60 * Math.pow(1.42, level));
}

export function enhanceSuccess(level) {
  // +1~+5 必成，之后逐级降低，+15 约 30%
  if (level < 5) return 1;
  return clamp(1 - (level - 4) * 0.062, 0.30, 1);
}

/**
 * 生成一件装备
 * @param {string} slot 部位 id
 * @param {number} tierIndex 品阶 0-4
 * @param {number} scale 数值规模（由副本等级决定）
 */
export function rollEquipment(slot, tierIndex, scale) {
  const tier = TIERS[clamp(tierIndex, 0, TIERS.length - 1)];
  const w = SLOT_STATS[slot] || SLOT_STATS.weapon;
  const stats = {};
  for (const [k, weight] of Object.entries(w)) {
    const jitter = 0.85 + Math.random() * 0.3;
    stats[k] = statValue(k, weight, scale, tier.mult, 1, jitter);
  }
  return {
    uid: uid('eq'),
    slot,
    tier: tier.id,
    rule: tierIndex >= 2 && Math.random() < .25 ? pick(Object.entries(AFFIXES).filter(([,a])=>a.slots.includes(slot)).map(([id])=>id).concat(slot==='weapon'?['execute']:slot==='armor'?['chargeguard']:[])) : null,
    name: pick(NAME_POOL[slot] || NAME_POOL.weapon),
    enhance: 0,
    stats,
    tech: null,
  };
}

/** 由现代商品生成「跨界装备」（GDD 9.2 / 10.1） */
export function techEquipment(item) {
  if (!item.equip) return null;
  const scale = 0;
  const stats = {};
  if (item.equip.atk) stats.atk = item.equip.atk;
  return {
    uid: uid('tech'),
    slot: item.equip.slot,
    tier: 'fine',
    name: item.name,
    enhance: 0,
    stats,
    tech: item.equip.effect,
    techName: item.name,
    bound: true,       // 现代装备不占背包，随身携带
    itemId: item.id,
  };
}

/** 计算装备的实际属性（含强化） */
export function effectiveStats(eq, enhanceBonus = 0) {
  if (!eq) return {};
  const out = {};
  const mult = 1 + eq.enhance * ENHANCE_PER_LEVEL * (1 + enhanceBonus);
  for (const [k, v] of Object.entries(eq.stats || {})) {
    out[k] = v * mult;
  }
  return out;
}

export function tierOf(eq) { return TIER_MAP[eq?.tier] || TIERS[0]; }

export function equipmentLabel(eq) {
  if (!eq) return '空';
  const t = tierOf(eq);
  const plus = eq.enhance > 0 ? ` +${eq.enhance}` : '';
  return `${eq.name}${plus}`;
}

/** 装备战力粗估，用于排序/比较 */
export function equipmentScore(eq) {
  const s = effectiveStats(eq);
  return (s.atk || 0) * 2 + (s.def || 0) * 1.5 + (s.hpMax || 0) * 0.12
    + (s.spd || 0) * 3 + (s.critRate || 0) * 800 + (s.critDmg || 0) * 300
    + (s.skillPower || 0) * 400 + (s.mpMax || 0) * 0.1;
}

export function randomTierIndex(maxIndex = 3) {
  const r = Math.random();
  if (r > 0.985) return Math.min(4, maxIndex);
  if (r > 0.90) return Math.min(3, maxIndex);
  if (r > 0.66) return Math.min(2, maxIndex);
  if (r > 0.32) return Math.min(1, maxIndex);
  return 0;
}
