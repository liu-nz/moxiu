/**
 * projects.js —— 城市灵改工程（GDD 1.3 后期幻想）
 *
 * GDD 1.3 后期：修仙反哺现代——「灵能电池、阵法建筑、修仙者改造城市」。
 * 灵能电池已经在研究树里落地，这里承接后两者：
 * 把修仙的阵法与材料搬进现代都市，改造出反哺两界的基础设施。
 *
 * 这些是后期长线目标，需要高境界才能解锁、需要后期材料才能动工。
 */

export const CITY_PROJECTS = [
  {
    id: 'spiritvein', name: '城市聚灵阵', accent: '阵',
    stage: 23,
    research: ['sensor'],
    desc: '在整座城市的地下埋一圈聚灵阵。灵气浓度上来之后，你在两界任何一侧修炼都更快。',
    effectText: '修炼速度 +15%（全局）',
    effect: { cultSpeed: 0.15 },
    cost: { stone: 300000, cny: 800000, mats: { xuanjing: 5, huojing: 2 } },
  },
  {
    research: ['alloy'],
    id: 'urbancore', name: '灵化改造区', accent: '改',
    stage: 26,
    desc: '把一片城区整体灵化：阵法供电、灵材结构、灵气循环。租金自然水涨船高。',
    effectText: '地产租金 +50%',
    effect: { rentMul: 0.50 },
    cost: { stone: 1200000, cny: 5000000, mats: { xuanjing: 8, huojing: 6 } },
  },
  {
    research: ['battery'],
    id: 'powergrid', name: '灵能电网', accent: '能',
    stage: 27,
    desc: '把灵能电池并进城市电网。第一次合闸的时候，半个城市的灯都亮了一瞬。',
    effectText: '工资与商业被动收入 +25%',
    effect: { modernIncome: 0.25 },
    cost: { stone: 2500000, cny: 12000000, mats: { huojing: 10, xingchen: 3 } },
  },
  {
    prerequisites: ['powergrid'],
    id: 'teleport', name: '跨城传送阵', accent: '传',
    stage: 30,
    desc: '城市之间架传送阵。货运通道扩容，单次跨界载重增加，店铺能更快处理货物。',
    effectText: '跨界载重 +10 kg，店铺吞吐翻倍',
    effect: { gateCarry: 10, shopThroughput: 1.0 },
    cost: { stone: 9000000, cny: 40000000, mats: { xingchen: 6, xuanjing: 12 } },
  },
  {
    research: ['branchpredict'],
    id: 'oracle', name: '天机推演台', accent: '演',
    stage: 34,
    desc: '把天机阁的铜盘放大一万倍，架在城市最高处。它开始推演一些没人问过的问题。',
    effectText: '奇闻触发 +30%，道途可随时免费重选',
    effect: { taleRate: 0.30, freePathSwitch: true },
    cost: { stone: 80000000, cny: 300000000, mats: { xingchen: 12, xuanjing: 20 } },
  },
  {
    prerequisites: ['spiritvein'],
    id: 'ascendbase', name: '飞升台基座', accent: '升',
    stage: 38,
    desc: '按飞升台的图纸，在现代都市的地基里复刻一座基座。你不太确定这算不算作弊。',
    effectText: '飞升轮回点 +25%',
    effect: { reincarnationBonus: 0.25 },
    cost: { stone: 600000000, cny: 2000000000, mats: { xingchen: 24, xuanjing: 40 } },
  },
];

export const PROJECT_MAP = Object.fromEntries(CITY_PROJECTS.map((p) => [p.id, p]));

export function canStart(state, id) {
  const p = PROJECT_MAP[id];
  if (!p) return { ok: false, reason: '没有这项工程。' };
  if (state.projects?.done?.[id]) return { ok: false, reason: '已完工。' };
  for (const id of p.research || []) if (!state.research?.done?.[id]) return { ok: false, reason: '需要先完成前置灵科研究。' };
  for (const id of p.prerequisites || []) if (!state.projects?.done?.[id]) return { ok: false, reason: '需要先完成前置城市工程。' };
  if (state.player.stage < p.stage) {
    return { ok: false, reason: `需要更高境界才能动工。` };
  }
  if (state.currency.stone < p.cost.stone) return { ok: false, reason: `灵石不足（需 ${p.cost.stone}）。` };
  if (state.currency.cny - p.cost.cny < (state.modern?.reserveCny || 0)) return { ok: false, reason: `投资后资金不足以满足保留线。` };
  for (const [mid, qty] of Object.entries(p.cost.mats)) {
    const have = (state.inventory || []).filter((e) => e.itemId === mid).reduce((a, e) => a + e.qty, 0);
    if (have < qty) return { ok: false, reason: `材料不足。` };
  }
  return { ok: true };
}

/** 汇总已完工工程的全局效果 */
export function projectEffects(state) {
  const out = {
    cultSpeed: 0, rentMul: 0, modernIncome: 0,
    gateCarry: 0, shopThroughput: 0, taleRate: 0,
    freePathSwitch: false, reincarnationBonus: 0,
  };
  const done = state.projects?.done || {};
  for (const p of CITY_PROJECTS) {
    if (!done[p.id]) continue;
    for (const [k, v] of Object.entries(p.effect)) {
      if (typeof v === 'number' && typeof out[k] === 'number') out[k] += v;
      else out[k] = v;
    }
  }
  return out;
}
