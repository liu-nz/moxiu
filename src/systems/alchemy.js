/** 固定主材 + 可选辅材；手动与自动共用材料、预算和品质结算。 */
import { ALCHEMY_RECIPES, ALCHEMY_MAP } from '../data/recipes.js';
import { getItem } from '../data/items.js';
import { AUX_MAP } from '../data/alchemy.js';
import { CROPS } from '../data/crops.js';
import { RANCH_BEASTS } from '../data/beasts.js';
import { DUNGEONS } from '../data/dungeons.js';
import { stageInfo } from '../data/realms.js';
import { researchEffects } from '../data/research.js';
import { computeAttrs } from './character.js';
import { validQuantity } from './inventory.js';
import { addProduced, productionCount, consumeWorld } from './cargo.js';
import { countCraft } from './daily.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, clamp } from '../core/util.js';

export const AUTO_ALCHEMY_INTERVAL = 30 * 60000;
export function unlockedRecipes(state) { return ALCHEMY_RECIPES.filter(r => state.player.stage >= r.unlockStage); }
export function materialSource(state, id) {
  const crop = CROPS.find(c => c.itemId === id), beast = RANCH_BEASTS.find(b => b.produceId === id);
  if (crop || beast) {
    const d = crop || beast;
    return `${crop ? '灵田种植' : '牧场养殖'}${d.name}${state.player.stage < d.unlockStage ? `（需${stageInfo(d.unlockStage).stage.name}）` : ''}`;
  }
  const d = DUNGEONS.find(d => d.matPool?.includes(id));
  return d ? `秘境「${d.name}」掉落${state.player.stage < d.unlockStage ? `（需${stageInfo(d.unlockStage).stage.name}）` : ''}` : '材料库 / 交易获取';
}
export function recipeStatus(state, id, auxId = 'plain') {
  const recipe = ALCHEMY_MAP[id], aux = AUX_MAP[auxId];
  if(auxId === 'sustained' && (state.path !== 'alchemy' || !researchEffects(state).sustainedPill || getItem(recipe?.out)?.effect?.type !== 'cultivation_boost')) return {ok:false,reason:'缓释丹衣仅限丹修完成研究后炼制修炼增益丹。'};
  if (!recipe || !aux) return { ok: false, reason: '丹方或辅材方案不存在。' };
  const merged = { ...recipe.mats };
  for (const [id, qty] of Object.entries(aux.mats)) merged[id] = (merged[id] || 0) + qty;
  const mats = Object.entries(merged).map(([id, need]) => ({ id, need, have: productionCount(state, id), name: getItem(id)?.name || id, source: materialSource(state, id) }));
  const cost = recipe.cost + aux.cost, rate = alchemyRate(state, recipe, auxId), tox = sideEffectRate(state, auxId);
  const matOk = mats.every(m => m.have >= m.need), stoneOk = state.currency.stone >= cost;
  const locked = state.player.stage < recipe.unlockStage || state.player.stage < aux.stage;
  return { ok: !locked && matOk && stoneOk, recipe, aux, mats, cost, rate, tox, matOk, stoneOk, locked,
    maxAttempts: locked ? 0 : Math.max(0, Math.min(Math.floor(state.currency.stone / cost), ...mats.map(m => Math.floor(m.have / m.need)))),
    reason: locked ? '丹方或辅材方案尚未解锁。' : !matOk ? '材料不足' : !stoneOk ? '灵石不足' : '' };
}
export function alchemyRate(state, recipe, auxId = 'plain') {
  return clamp(recipe.success + (computeAttrs(state).alchemy || 0) + (researchEffects(state).alchemySuccess || 0) + (AUX_MAP[auxId]?.rate || 0), .05, .98);
}
export function sideEffectRate(state, auxId = 'plain') { return clamp(.4 * (state.modern.job === 'doctor' ? .8 : 1) * (researchEffects(state).alchemyTox ?? 1) * (AUX_MAP[auxId]?.tox ?? 1), 0, 1); }
export function isFirstCraft(state, id) { return !state.crafting?.seen?.[id]; }
export function markSeen(state, id) { (state.crafting.seen ??= {})[id] = true; }
export function craft(state, id, times = 1, { auxId = 'plain', silent = false, rng = Math.random, reserveStone = 0 } = {}) {
  if (!validQuantity(times) || times > 100 || !Number.isSafeInteger(reserveStone) || reserveStone < 0) return { ok: false, reason: '炼制次数须为 1–100 的整数，保留灵石须为非负整数。' };
  const initial = recipeStatus(state, id, auxId);
  if (!initial.ok) return { ok: false, reason: initial.reason };
  let made = 0, failed = 0, extraLoss = 0, attempts = 0, baseSpent = 0;
  const grades = {}, r = initial.recipe;
  for (let i = 0; i < times; i++) {
    const st = recipeStatus(state, id, auxId);
    if (!st.ok || state.currency.stone - st.cost < reserveStone) break;
    for (const m of st.mats) consumeWorld(state, 'cultivation', m.id, m.need);
    state.currency.stone -= st.cost;
    baseSpent += st.cost;
    attempts++;
    markSeen(state, id);
    if (rng() < st.rate) {
      const roll = st.aux.rare + st.aux.fine > 0 ? rng() : 1;
      const grade = auxId === 'sustained' ? 'sustained' : roll < st.aux.rare ? 'rare' : roll < st.aux.rare + st.aux.fine ? 'fine' : 'common';
      addProduced(state, r.out, r.qty, grade);
      grades[grade] = (grades[grade] || 0) + r.qty;
      made += r.qty;
    } else {
      failed++;
      if (rng() < st.tox) {
        const loss = Math.min(Math.round(st.cost * .5), Math.max(0, state.currency.stone - reserveStone));
        state.currency.stone -= loss;
        extraLoss += loss;
      }
    }
  }
  if (!attempts) return { ok: false, reason: '保留灵石后不足以开炉。' };
  state.crafting.totalPills = (state.crafting.totalPills || 0) + made;
  countCraft(state, attempts);
  state.stats.alchemyStone = (state.stats.alchemyStone || 0) + baseSpent + extraLoss;
  const report = { at: state.world.clockMs, recipeId: id, auxId, attempts, made, failed, grades, extraLoss, stoneSpent: baseSpent + extraLoss };
  state.crafting.history = [...(state.crafting.history || []), report].slice(-10);
  if (!silent) {
    const message = `「${r.name}」${attempts} 炉：炼成 ${made} 枚，失败 ${failed} 炉${extraLoss ? `，反噬损失 ${fmtInt(extraLoss)} 灵石` : ''}。`;
    (made ? logGood : logWarn)(state, message);
    toast(message, made ? 'good' : 'warn');
  }
  emit(EV.STATE);
  return { ok: true, ...report };
}

export function setAlchemyPlan(state, { recipeId, auxId, on, reserveStone } = {}) {
  const id = recipeId ?? state.crafting.selectedRecipe ?? 'huiyuan', aid = auxId ?? state.crafting.selectedAux ?? 'plain';
  const st = recipeStatus(state, id, aid);
  if (!st.recipe || st.locked) return { ok: false, reason: st.reason };
  if (on !== undefined && (typeof on !== 'boolean' || (on && !researchEffects(state).autoAlchemy))) return { ok: false, reason: '先研究「自动炼丹机」。' };
  if (reserveStone !== undefined && (!Number.isSafeInteger(reserveStone) || reserveStone < 0)) return { ok: false, reason: '保留灵石须为非负整数。' };
  const changed = id !== state.crafting.selectedRecipe || aid !== state.crafting.selectedAux;
  state.crafting.selectedRecipe = id; state.crafting.selectedAux = aid;
  if (changed) state.crafting.autoAcc = 0;
  if (on !== undefined) state.crafting.autoAlchemy = on;
  if (reserveStone !== undefined) state.crafting.reserveStone = reserveStone;
  emit(EV.STATE);
  return { ok: true };
}

/** 道侣每日代炼独立于机器研究；只炼选定丹方，不擅自换材料。 */
export function autoCraft(state, batches = 3, { companion = false } = {}) {
  if (!companion && (!researchEffects(state).autoAlchemy || !state.crafting.autoAlchemy)) return { made: 0 };
  return craft(state, state.crafting.selectedRecipe || 'huiyuan', batches, { auxId: state.crafting.selectedAux || 'plain', silent: true, reserveStone: state.crafting.reserveStone || 0 });
}
export function tickAlchemy(state, dtMs) {
  if (!Number.isFinite(dtMs) || dtMs < 0 || !researchEffects(state).autoAlchemy || !state.crafting.autoAlchemy) return;
  const c = state.crafting;
  c.autoAcc = (c.autoAcc || 0) + dtMs;
  const cycles = Math.floor(c.autoAcc / AUTO_ALCHEMY_INTERVAL);
  c.autoAcc %= AUTO_ALCHEMY_INTERVAL;
  for (let i = 0; i < cycles; i++) {
    const result = autoCraft(state, 3);
    c.lastAutoAt = state.world.clockMs;
    c.lastAutoResult = result;
    if (!result.ok) break; // 缺料等待下一周期，不积压开炉次数。
  }
}
export function nextAlchemyEvent(state) {
  return researchEffects(state).autoAlchemy && state.crafting.autoAlchemy ? AUTO_ALCHEMY_INTERVAL - (state.crafting.autoAcc || 0) : Infinity;
}
export function alchemyPlan(state) { return recipeStatus(state, state.crafting.selectedRecipe || 'huiyuan', state.crafting.selectedAux || 'plain'); }

export function alchemyEconomics(state, id, auxId) {
  const st = recipeStatus(state,id,auxId);
  if(!st.recipe)return null;
  const expected = st.rate * st.recipe.qty;
  const cost = st.cost * (1 + (1-st.rate)*st.tox*.5);
  return { expectedPills:expected, stonePerPill:cost/expected, rarePer100:st.rate*st.aux.rare*100, meanPotency:1+st.aux.fine*.15+st.aux.rare*.3, locked:st.locked };
}
