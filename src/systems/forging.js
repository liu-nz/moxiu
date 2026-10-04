/**
 * forging.js —— 炼器（GDD 9.2 / 5.1）
 * 灵材 + 灵石 → 指定部位装备。品阶由材料档位决定，成功率受道途（器修 +25%）与材料工程研究影响。
 */

import { FORGE_RECIPES, FORGE_MAP } from '../data/recipes.js';
import { MATERIAL_MAP } from '../data/items.js';
import { researchEffects } from '../data/research.js';
import { rollEquipment, SLOT_MAP, TIERS, TIER_MAP, enhanceCost, enhanceSuccess, ENHANCE_MAX } from '../data/equipment.js';
import { baseAttrs } from '../data/realms.js';
import { computeAttrs } from './character.js';
import { countOf, removeItem } from './inventory.js';
import { countCraft } from './daily.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, clamp } from '../core/util.js';
import { applyDesign } from '../data/equipmentDesigns.js';
import { markCollection } from './collection.js';

export function unlockedRecipes(state) {
  return FORGE_RECIPES.filter((r) => state.player.stage >= r.unlockStage && (!r.secret || (state.collection?.secrets || []).includes(r.secret)));
}

/** 锻造出的装备规模跟随当前境界，保证永远有用 */
export function forgeScale(state) {
  const base = baseAttrs(state.player.stage);
  return Math.max(1, base.atk * 1.8);
}

export function recipeStatus(state, id) {
  const r = Object.hasOwn(FORGE_MAP,id) ? FORGE_MAP[id] : null;
  if (!r) return { ok: false, reason: '没有这个图谱。' };
  if (state.player.stage < r.unlockStage) return { ok: false, reason: '境界不足。', locked: true };
  if(r.secret && !(state.collection?.secrets || []).includes(r.secret))return {ok:false,locked:true,reason:'尚未发现对应隐藏图谱。'};
  const have = countOf(state, r.mat);
  const matOk = have >= r.qty;
  const stoneOk = state.currency.stone >= r.cost;
  return {
    ok: matOk && stoneOk,
    recipe: r,
    have,
    matOk,
    stoneOk,
    matName: MATERIAL_MAP[r.mat]?.name || r.mat,
    tierRange: `${TIER_MAP[TIERS[r.tierMin].id].name} ~ ${TIER_MAP[TIERS[r.tierMax].id].name}`,
    rate: forgeRate(state, r),
  };
}

export function forgeRate(state, recipe) {
  const attrs = computeAttrs(state);
  const fx = researchEffects(state);
  return clamp(recipe.success + (attrs.forge || 0) + (fx.forgeSuccess || 0), 0.05, 0.98);
}

export function forge(state, id, slotId) {
  const st = recipeStatus(state, id);
  if (!st.ok) return { ok: false, reason: st.reason };
  if (!SLOT_MAP[slotId]) return { ok: false, reason: '部位不合法。' };

  const r = st.recipe;
  if(r.slot && r.slot!==slotId)return {ok:false,reason:'该图谱只能打造指定部位。'};
  const fx = researchEffects(state);
  removeItem(state, r.mat, r.qty);
  state.currency.stone -= r.cost;
  countCraft(state, 1);

  if (Math.random() >= st.rate) {
    state.crafting.totalForged += 0;
    logWarn(state, `「${r.name}」炼器失败，材料报废。`);
    toast('炼器失败', 'warn');
    emit(EV.STATE);
    return { ok: true, success: false };
  }

  let tier = r.tierMin + Math.floor(Math.random() * (r.tierMax - r.tierMin + 1));
  let upgraded = false;
  if (fx.forgeTierUp && Math.random() < fx.forgeTierUp && tier < TIERS.length - 1) {
    tier += 1;
    upgraded = true;
  }
  const eq = rollEquipment(slotId, tier, forgeScale(state));
  if(r.design){applyDesign(eq,r.design);markCollection(state,'designs',r.design);}
  markCollection(state, 'equipment', `${eq.slot}:${eq.tier}`);
  eq.forged = true;
  state.bag.push(eq);
  state.crafting.totalForged += 1;
  logGood(state, `炼成「${eq.name}」（${TIER_MAP[eq.tier].name}）${upgraded ? '—— 合金配比意外成功了' : ''}。`);
  toast(`炼成 ${eq.name}`, 'good');
  emit(EV.STATE);
  return { ok: true, success: true, equipment: eq };
}

/* ---------------- 强化（复用 gear.js 的规则，这里只做展示辅助） ---------------- */
export { enhanceCost, enhanceSuccess, ENHANCE_MAX };
