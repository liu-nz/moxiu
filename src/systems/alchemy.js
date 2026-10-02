/**
 * alchemy.js —— 炼丹（GDD 11 / 5）
 * 材料 → 丹药。成功率受道途（丹修 +25%）、药性数据库研究、丹毒影响。
 */

import { ALCHEMY_RECIPES, ALCHEMY_MAP } from '../data/recipes.js';
import { MATERIAL_MAP, CONSUMABLE_MAP } from '../data/items.js';
import { researchEffects } from '../data/research.js';
import { computeAttrs } from './character.js';
import { addItem, countOf, removeItem } from './inventory.js';
import { countCraft } from './daily.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, clamp } from '../core/util.js';

export function unlockedRecipes(state) {
  return ALCHEMY_RECIPES.filter((r) => state.player.stage >= r.unlockStage);
}

export function recipeStatus(state, id) {
  const r = ALCHEMY_MAP[id];
  if (!r) return { ok: false, reason: '没有这个丹方。' };
  if (state.player.stage < r.unlockStage) return { ok: false, reason: '境界不足。', locked: true };
  const mats = Object.entries(r.mats).map(([mid, qty]) => ({
    id: mid, need: qty, have: countOf(state, mid), name: MATERIAL_MAP[mid]?.name || mid,
  }));
  const matOk = mats.every((m) => m.have >= m.need);
  const stoneOk = state.currency.stone >= r.cost;
  return {
    ok: matOk && stoneOk,
    recipe: r,
    mats,
    matOk,
    stoneOk,
    reason: !matOk ? '材料不足' : !stoneOk ? '灵石不足' : '',
    rate: alchemyRate(state, r),
  };
}

export function alchemyRate(state, recipe) {
  const attrs = computeAttrs(state);
  const fx = researchEffects(state);
  return clamp(recipe.success + (attrs.alchemy || 0) + (fx.alchemySuccess || 0), 0.05, 0.98);
}

/** 丹毒（副作用）触发概率：失败时额外损失灵石的概率 */
export function sideEffectRate(state) {
  const fx = researchEffects(state);
  return 0.4 * (fx.alchemyTox ?? 1);
}

export function isFirstCraft(state, id) {
  return !(state.crafting?.seen || {})[id];
}

export function markSeen(state, id) {
  if (!state.crafting) state.crafting = {};
  if (!state.crafting.seen) state.crafting.seen = {};
  state.crafting.seen[id] = true;
}

export function craft(state, id, times = 1) {
  const r = ALCHEMY_MAP[id];
  if (!r) return { ok: false, reason: '没有这个丹方。' };
  if (state.player.stage < r.unlockStage) return { ok: false, reason: '境界不足。' };

  let made = 0;
  let failed = 0;
  let extraLoss = 0;
  const fx = researchEffects(state);

  for (let t = 0; t < times; t++) {
    const st = recipeStatus(state, id);
    if (!st.matOk || !st.stoneOk) break;
    markSeen(state, id);

    for (const [mid, qty] of Object.entries(r.mats)) removeItem(state, mid, qty);
    state.currency.stone -= r.cost;

    if (Math.random() < st.rate) {
      addItem(state, r.out, r.qty, 'common');
      made += r.qty;
    } else {
      failed++;
      // 丹毒：失败时按概率额外损失灵石
      const tox = fx.alchemyTox ?? 1;
      if (Math.random() < 0.4 * tox) {
        const loss = Math.round(r.cost * 0.5);
        state.currency.stone = Math.max(0, state.currency.stone - loss);
        extraLoss += loss;
      }
    }
  }

  if (!made && !failed) {
    const st = recipeStatus(state, id);
    return { ok: false, reason: st.reason || '无法炼制。' };
  }

  state.crafting.totalPills += made;
  countCraft(state, 1);
  const outName = CONSUMABLE_MAP[r.out]?.name || r.out;
  if (made) logGood(state, `炼成「${outName}」×${made}${failed ? `，失败 ${failed} 次` : ''}。`);
  else logWarn(state, `炼制「${r.name}」失败 ${failed} 次，材料尽毁${extraLoss ? `，丹毒反噬损失 ${fmtInt(extraLoss)} 灵石` : ''}。`);
  if (made) toast(`炼成 ${outName} ×${made}`, 'good');
  else toast('炼丹失败', 'warn');

  emit(EV.STATE);
  return { ok: true, made, failed, extraLoss };
}

/** 自动炼丹机：离线时结算一批（GDD 5.1） */
export function autoCraft(state, batches = 3) {
  const fx = researchEffects(state);
  if (!fx.autoAlchemy) return { made: 0 };
  const list = unlockedRecipes(state);
  if (!list.length) return { made: 0 };
  // 优先炼当前能炼的最高阶丹药
  let total = 0;
  for (let i = list.length - 1; i >= 0 && total < batches; i--) {
    const r = list[i];
    const st = recipeStatus(state, r.id);
    if (!st.ok) continue;
    const n = Math.min(batches - total, 2);
    const res = craft(state, r.id, n);
    total += res.made || 0;
  }
  return { made: total };
}
