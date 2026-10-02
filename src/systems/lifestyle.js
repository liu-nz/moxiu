/**
 * lifestyle.js —— 现代休闲生活（GDD 1.2 里世界职责）
 * 人民币的主要去处，也是两界对比最直观的地方。
 */

import { LIFESTYLE, LIFESTYLE_MAP, upgradeCost, qualityOf, qualityGiftBonus } from '../data/lifestyle.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, fmtPct } from '../core/util.js';

function ls(state) {
  if (!state.lifestyle) state.lifestyle = { levels: {} };
  if (!state.lifestyle.levels) state.lifestyle.levels = {};
  return state.lifestyle;
}

export function levelOf(state, id) {
  return ls(state).levels[id] || 0;
}

export function upgrade(state, id) {
  const item = LIFESTYLE_MAP[id];
  if (!item) return { ok: false, reason: '没有这个生活项目。' };
  const lv = levelOf(state, id);
  if (lv >= item.maxLevel) return { ok: false, reason: '已到顶了。' };
  const cost = upgradeCost(item, lv);
  if (state.currency.cny < cost) return { ok: false, reason: `需要 ¥${fmtInt(cost)}。` };

  state.currency.cny -= cost;
  ls(state).levels[id] = lv + 1;
  const nextName = item.levels[Math.min(lv + 1, item.levels.length - 1)];
  logGood(state, `${item.name}提升至 Lv.${lv + 1}：${nextName}。${item.effectText}`);
  emit(EV.STATE);
  return { ok: true, level: lv + 1 };
}

export function upgradeAll(state, id) {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const r = upgrade(state, id);
    if (!r.ok) break;
    n++;
  }
  if (n) toast(`连升 ${n} 级`, 'good');
  return n;
}

/** 生活品质（0-1） */
export function quality(state) {
  return qualityOf(ls(state).levels);
}

export function giftBonus(state) {
  return qualityGiftBonus(ls(state).levels);
}

/** 汇总生活加成 */
export function lifestyleEffects(state) {
  const lv = ls(state).levels;
  const out = {
    offlineBonus: 0, staminaRegen: 0, hpMul: 0,
    breakthroughLossCut: 0, taleRate: 0, tradehouseSpeed: 0,
    quality: qualityOf(lv),
  };
  for (const item of LIFESTYLE) {
    const n = lv[item.id] || 0;
    if (!n) continue;
    switch (item.id) {
      case 'housing': out.offlineBonus += item.perLevel * n; break;
      case 'food': out.staminaRegen += item.perLevel * n; break;
      case 'fitness': out.hpMul += item.perLevel * n; break;
      case 'fun': out.breakthroughLossCut += item.perLevel * n; break;
      case 'travel': out.taleRate += item.perLevel * n; break;
      case 'collection': out.tradehouseSpeed += item.perLevel * n; break;
      default: break;
    }
  }
  out.breakthroughLossCut = Math.min(0.40, out.breakthroughLossCut);
  return out;
}

export function lifestyleSummary(state) {
  const fx = lifestyleEffects(state);
  return {
    list: LIFESTYLE.map((item) => {
      const lv = levelOf(state, item.id);
      return {
        item,
        level: lv,
        maxed: lv >= item.maxLevel,
        cost: upgradeCost(item, lv),
        currentName: lv > 0 ? item.levels[Math.min(lv - 1, item.levels.length - 1)] : '—',
        nextName: lv < item.maxLevel ? item.levels[Math.min(lv, item.levels.length - 1)] : null,
      };
    }),
    quality: fx.quality,
    effects: fx,
    giftBonus: giftBonus(state),
    totalLevels: LIFESTYLE.reduce((a, l) => a + (ls(state).levels[l.id] || 0), 0),
    maxLevels: LIFESTYLE.length * 10,
  };
}

export { LIFESTYLE, LIFESTYLE_MAP, upgradeCost };
