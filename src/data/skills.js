/**
 * skills.js —— 功法系统（GDD 9.1）
 * 五品阶（黄/玄/地/天/仙）× 四档（下/中/上/极）；四个功法槽（心法×1、招式×2、特殊×1）。
 * 炼气五层解锁。
 */

import { pick, uid, clamp } from '../core/util.js';
import { statValue } from './equipment.js';

export const SKILL_SLOTS = [
  { id: 'heart',   name: '心法', count: 1 },
  { id: 'move',    name: '招式', count: 2 },
  { id: 'special', name: '特殊', count: 1 },
];

/** 功法品阶 */
export const SKILL_TIERS = [
  { id: 'huang', name: '黄阶', mult: 1.0, cls: 'q-common' },
  { id: 'xuan',  name: '玄阶', mult: 1.7, cls: 'q-fine' },
  { id: 'di',    name: '地阶', mult: 2.8, cls: 'q-rare' },
  { id: 'tian',  name: '天阶', mult: 4.5, cls: 'q-epic' },
  { id: 'xian',  name: '仙阶', mult: 7.5, cls: 'q-legend' },
];

/** 功法四档 */
export const SKILL_GRADES = [
  { id: 'xia',  name: '下', mult: 0.80 },
  { id: 'zhong',name: '中', mult: 1.00 },
  { id: 'shang',name: '上', mult: 1.25 },
  { id: 'ji',   name: '极', mult: 1.55 },
];

export const SKILL_TIER_MAP = Object.fromEntries(SKILL_TIERS.map((t) => [t.id, t]));
export const SKILL_GRADE_MAP = Object.fromEntries(SKILL_GRADES.map((g) => [g.id, g]));

const SKILL_NAMES = {
  heart: [
    ['太清养气诀', '混元功', '归元心经', '坐忘篇', '清静道经'],
    ['紫府纳灵诀', '周天引气法', '玄门吐纳术'],
    ['九转玄功', '太虚养神篇'],
    ['大衍心经'],
    ['太一混元道'],
  ],
  move: [
    ['裂石拳', '清风剑式', '踏歌步', '破军斩'],
    ['流云剑诀', '烈焰掌', '落星指'],
    ['九霄雷剑', '玄冰魄掌'],
    ['万剑归宗'],
    ['太虚剑典'],
  ],
  special: [
    ['龟息术', '敛息诀', '明目咒', '轻身术'],
    ['缩地成寸', '金刚不坏身', '敛气藏形'],
    ['大衍神算', '不动明王印'],
    ['一气化三清'],
    ['太上忘情篇'],
  ],
};

/** 各槽位的属性权重 */
const SLOT_WEIGHTS = {
  heart:   { cultSpeed: 0.035, mpMax: 1.40, hpMax: 0.90 },
  move:    { skillPower: 0.055, atk: 0.55, critDmg: 0.020 },
  special: { dmgReduce: 0.014, dodge: 0.012, lifesteal: 0.010, spd: 4.0 },
};

export function rollSkill(slotType, tierIndex, gradeIndex, scale) {
  const tier = SKILL_TIERS[clamp(tierIndex, 0, 4)];
  const grade = SKILL_GRADES[clamp(gradeIndex, 0, 3)];
  const names = SKILL_NAMES[slotType] || SKILL_NAMES.heart;
  const name = pick(names[clamp(tierIndex, 0, names.length - 1)]) || pick(names[0]);
  const w = SLOT_WEIGHTS[slotType] || SLOT_WEIGHTS.heart;
  const stats = {};
  for (const [k, weight] of Object.entries(w)) {
    const jitter = 0.88 + Math.random() * 0.24;
    stats[k] = statValue(k, weight, scale, tier.mult, grade.mult, jitter);
  }
  return {
    uid: uid('sk'),
    slot: slotType,
    tier: tier.id,
    grade: grade.id,
    name: `${tier.name}·${grade.name} · ${name}`,
    level: 1,
    maxLevel: 5,
    stats,
    tech: null,
  };
}

export function skillLabel(sk) {
  if (!sk) return '空';
  return sk.name;
}

export function skillScore(sk) {
  if (!sk) return 0;
  const s = sk.stats || {};
  const lv = sk.level || 1;
  return ((s.atk || 0) * 2 + (s.hpMax || 0) * 0.12 + (s.mpMax || 0) * 0.1
    + (s.skillPower || 0) * 500 + (s.cultSpeed || 0) * 500 + (s.critDmg || 0) * 300
    + (s.dmgReduce || 0) * 300 + (s.dodge || 0) * 400) * (1 + (lv - 1) * 0.18);
}

export function skillUpgradeCost(sk) {
  const tierIdx = SKILL_TIERS.findIndex((t) => t.id === sk.tier);
  return Math.round(120 * Math.pow(2.4, tierIdx) * Math.pow(1.8, sk.level));
}

export function randomSkillTier(maxIndex = 3) {
  const r = Math.random();
  if (r > 0.99) return Math.min(4, maxIndex);
  if (r > 0.92) return Math.min(3, maxIndex);
  if (r > 0.72) return Math.min(2, maxIndex);
  if (r > 0.38) return Math.min(1, maxIndex);
  return 0;
}

export function randomGrade() {
  const r = Math.random();
  if (r > 0.96) return 3;
  if (r > 0.82) return 2;
  if (r > 0.50) return 1;
  return 0;
}
