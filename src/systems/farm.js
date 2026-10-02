/**
 * farm.js —— 灵田种植（GDD 11.1）
 * 作物生长按世界时钟推进；灵科「自动灵田」解锁后离线也会自动补种。
 */

import { CROP_MAP, PLOTS, cropYield, unlockedCrops } from '../data/crops.js';
import { getEvent } from '../data/worldEvents.js';
import { researchEffects } from '../data/research.js';
import { BEAST_MAP } from '../data/beasts.js';
import { addProduced } from './cargo.js';
import { guildMods, sectMods } from './character.js';
import { countHarvest } from './daily.js';
import { logGood, logWarn, toast } from './log.js';import { updateTutorial } from './tutorial.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

export function ensurePlots(state) {
  const f = state.farm;
  f.plan ??= {};
  f.autoHarvest ??= true;
  f.autoReplant ??= true;
  f.reserveStone ??= 0;
  // 旧存档按每块田的实际作物迁移，保留混种。
  f.plots.forEach((p, i) => { if (p && !Object.hasOwn(f.plan, i)) f.plan[i] = p.cropId; });
  while (f.plots.length < f.unlocked) f.plots.push(null);
  if (f.plots.length > f.unlocked) f.plots.length = f.unlocked;
  for (let i = 0; i < f.unlocked; i++) if (!Object.hasOwn(f.plan, i)) f.plan[i] = f.lastCrop || null;
  return f.plots;
}

/** 灵田产量加成：灵科「自动灵田」+ 道盟丹鼎会 + 宗门丹霞谷 */
export function farmBonus(state) {
  const fx = researchEffects(state);
  let b = (fx.farmYield || 0) + (getEvent(state.market.eventId).farmYield || 0);
  b += guildMods(state).farmYield || 0;
  b += sectMods(state).farmYield || 0;
  return b;
}

export function unlocked(state) {
  return unlockedCrops(state.player.stage);
}

export function plant(state, index, cropId) {
  if (!validPlot(state, index)) return { ok: false, reason: '地块不存在。' };
  ensurePlots(state);
  const crop = CROP_MAP[cropId];
  if (!crop) return { ok: false, reason: '没有这种作物。' };
  if (state.player.stage < crop.unlockStage) return { ok: false, reason: '境界不足，种不了。' };
  if (state.farm.plots[index] !== null && state.farm.plots[index] !== undefined) {
    return { ok: false, reason: '这块地还占着。' };
  }
  if (state.currency.stone < crop.seedCost) {
    return { ok: false, reason: `灵石不足（需 ${fmtInt(crop.seedCost)}）。` };
  }
  state.currency.stone -= crop.seedCost;
  state.stats.farmSeedStone = (state.stats.farmSeedStone || 0) + crop.seedCost;
  state.farm.plots[index] = {
    cropId,
    plantedAt: state.world.clockMs,
    readyAt: state.world.clockMs + crop.growMs,
  };
  state.farm.lastCrop = cropId;
  state.farm.plan[index] = cropId;
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true };
}

export function plantAll(state, cropId) {
  ensurePlots(state);
  let n = 0;
  for (let i = 0; i < state.farm.plots.length; i++) {
    if (state.farm.plots[i]) continue;
    const r = plant(state, i, cropId);
    if (!r.ok) break;
    n++;
  }
  if (n) toast(`种下 ${n} 块地。`);
  return n;
}

export function isReady(state, plot) {
  return plot && state.world.clockMs >= plot.readyAt;
}

export function harvest(state, index, silent = false) {
  if (!validPlot(state, index)) return { ok: false, reason: '地块不存在。' };
  ensurePlots(state);
  const plot = state.farm.plots[index];
  if (!plot) return { ok: false, reason: '这块地是空的。' };
  if (!isReady(state, plot)) return { ok: false, reason: '还没熟。' };
  const crop = CROP_MAP[plot.cropId];
  if (!crop) return { ok: false, reason: '作物数据不可用。' };
  const qty = cropYield(crop, farmBonus(state));
  const placement = addProduced(state, crop.itemId, qty, 'common');
  state.farm.plots[index] = null;
  countHarvest(state, 1);
  if (!silent) logGood(state, `收获「${crop.name}」×${qty}。`);
  emit(EV.STATE);
  return { ok: true, qty, crop, ...placement };
}

export function harvestAll(state) {
  ensurePlots(state);
  let total = 0;
  const names = [];
  for (let i = 0; i < state.farm.plots.length; i++) {
    const r = harvest(state, i);
    if (r.ok) { total += r.qty; names.push(`${r.crop.name}×${r.qty}`); }
  }
  if (total) toast(`收获：${names.join('、')}`, 'good');
  return { ok: total > 0, total, names };
}

export function buyPlot(state) {
  if (state.farm.unlocked >= PLOTS.max) return { ok: false, reason: '灵田已开垦到极限。' };
  const cost = PLOTS.costOf(state.farm.unlocked);
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };
  state.currency.stone -= cost;
  state.farm.unlocked += 1;
  ensurePlots(state);
  logGood(state, `开垦新地一块，灵田共 ${state.farm.unlocked} 块。`);
  emit(EV.STATE);
  return { ok: true };
}

const validPlot = (state, index) => Number.isInteger(index) && index >= 0 && index < state.farm.unlocked;

export function hasFarmGuard(state) {
  return (state.beasts?.deployed || []).some(uid => state.beasts.owned.some(b => b.uid === uid && BEAST_MAP[b.id]));
}

export function setPlotPlan(state, index, cropId) {
  if (!validPlot(state, index)) return { ok: false, reason: '地块不存在。' };
  if (cropId !== null && (!CROP_MAP[cropId] || state.player.stage < CROP_MAP[cropId].unlockStage)) {
    return { ok: false, reason: '这种作物尚未解锁。' };
  }
  ensurePlots(state);
  state.farm.plan[index] = cropId;
  emit(EV.STATE);
  return { ok: true };
}

export function setFarmAutomation(state, { autoHarvest, autoReplant, reserveStone } = {}) {
  if (!researchEffects(state).autoFarm) return { ok: false, reason: '先研究「自动灵田」。' };
  if ((autoHarvest !== undefined && typeof autoHarvest !== 'boolean') ||
      (autoReplant !== undefined && typeof autoReplant !== 'boolean') ||
      (reserveStone !== undefined && (!Number.isSafeInteger(reserveStone) || reserveStone < 0))) {
    return { ok: false, reason: '请选择开关状态，保留灵石须为非负整数。' };
  }
  ensurePlots(state);
  Object.assign(state.farm, Object.fromEntries(Object.entries({ autoHarvest, autoReplant, reserveStone }).filter(([, v]) => v !== undefined)));
  emit(EV.STATE);
  return { ok: true };
}

/** 前 12 小时安心收菜；之后只计算真正暴露的成熟时间。 */
export const RAID_GRACE_MS = 12 * 3600000;
export const RAID_RATE_PER_HOUR = 0.05;

export function tickFarm(state, dtMs = 0) {
  if (!state.farm || !Number.isFinite(dtMs) || dtMs < 0) return;
  const f = state.farm;
  ensurePlots(state);
  const fx = researchEffects(state), now = state.world.clockMs;
  const names = [];
  for (let i = 0; i < f.plots.length; i++) {
    const p = f.plots[i];
    if (!p || !CROP_MAP[p.cropId] || now < p.readyAt) continue;
    if (fx.autoFarm && f.autoHarvest) {
      harvest(state, i, true); // 已提醒的旧作物也能自动收获。
    } else if (!p.notified) {
      p.notified = true;
      names.push(CROP_MAP[p.cropId].name);
    }
  }
  if (names.length) logGood(state, `灵田成熟：${names.join('、')}。`);
  if (fx.autoFarm && f.autoReplant) {
    for (let i = 0; i < f.plots.length; i++) {
      if (f.plots[i]) continue;
      const id = Object.hasOwn(f.plan, i) ? f.plan[i] : f.lastCrop;
      const crop = CROP_MAP[id];
      if (!crop || state.player.stage < crop.unlockStage || state.currency.stone - crop.seedCost < f.reserveStone) continue;
      plant(state, i, id);
    }
  }
  if (dtMs > 0 && !fx.autoFarm && !hasFarmGuard(state)) {
    for (let i = 0; i < f.plots.length; i++) {
      const p = f.plots[i];
      if (!p) continue;
      const exposed = Math.max(0, now - Math.max(now - dtMs, p.readyAt + RAID_GRACE_MS));
      if (!exposed || Math.random() >= 1 - Math.exp(-RAID_RATE_PER_HOUR * exposed / 3600000)) continue;
      f.plots[i] = null;
      logWarn(state, `「${CROP_MAP[p.cropId]?.name || '作物'}」成熟超过 12 小时且无人看护，被偷吃了。上阵战斗灵兽可避免。`);
      emit(EV.STATE);
    }
  }
}

export function nextFarmEvent(state) {
  return Math.min(Infinity, ...state.farm.plots.filter(p => p && p.readyAt > state.world.clockMs).map(p => p.readyAt - state.world.clockMs));
}

export function farmSummary(state) {
  ensurePlots(state);
  const f = state.farm;
  return {
    plots: f.plots.map((p, i) => {
      if (!p) return { index: i, empty: true };
      const crop = CROP_MAP[p.cropId];
      const total = p.readyAt - p.plantedAt;
      const done = Math.max(0, Math.min(total, state.world.clockMs - p.plantedAt));
      return {
        index: i,
        empty: false,
        crop,
        ready: state.world.clockMs >= p.readyAt,
        remainMs: Math.max(0, p.readyAt - state.world.clockMs),
        ratio: total > 0 ? done / total : 0,
      };
    }),
    unlocked: f.unlocked,
    max: PLOTS.max,
    nextCost: PLOTS.costOf(f.unlocked),
    bonus: farmBonus(state),
  };
}
