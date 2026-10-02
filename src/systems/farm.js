/**
 * farm.js —— 灵田种植（GDD 11.1）
 * 作物生长按世界时钟推进；灵科「自动灵田」解锁后离线也会自动补种。
 */

import { CROPS, CROP_MAP, PLOTS, cropYield, unlockedCrops } from '../data/crops.js';
import { researchEffects } from '../data/research.js';
import { addItem } from './inventory.js';
import { guildMods, sectMods } from './character.js';
import { countHarvest } from './daily.js';
import { logGood, logWarn, toast } from './log.js';import { updateTutorial } from './tutorial.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

export function ensurePlots(state) {
  const f = state.farm;
  while (f.plots.length < f.unlocked) f.plots.push(null);
  if (f.plots.length > f.unlocked) f.plots.length = f.unlocked;
  return f.plots;
}

/** 灵田产量加成：灵科「自动灵田」+ 道盟丹鼎会 + 宗门丹霞谷 */
export function farmBonus(state) {
  const fx = researchEffects(state);
  let b = fx.farmYield || 0;
  b += guildMods(state).farmYield || 0;
  b += sectMods(state).farmYield || 0;
  return b;
}

export function unlocked(state) {
  return unlockedCrops(state.player.stage);
}

export function plant(state, index, cropId) {
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
  state.farm.plots[index] = {
    cropId,
    plantedAt: state.world.clockMs,
    readyAt: state.world.clockMs + crop.growMs,
  };
  state.farm.lastCrop = cropId;
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

export function harvest(state, index) {
  ensurePlots(state);
  const plot = state.farm.plots[index];
  if (!plot) return { ok: false, reason: '这块地是空的。' };
  if (!isReady(state, plot)) return { ok: false, reason: '还没熟。' };
  const crop = CROP_MAP[plot.cropId];
  const qty = cropYield(crop, farmBonus(state));
  addItem(state, crop.itemId, qty, 'common');
  state.farm.plots[index] = null;
  countHarvest(state, 1);
  logGood(state, `收获「${crop.name}」×${qty}。`);
  emit(EV.STATE);
  return { ok: true, qty, crop };
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

/** 主循环：成熟提醒 + 自动补种 + 偷吃判定 */
export function tickFarm(state, dtMs = 0) {
  const f = state.farm;
  if (!f) return;
  ensurePlots(state);
  const fx = researchEffects(state);

  const readyIdx = [];
  for (let i = 0; i < f.plots.length; i++) {
    const p = f.plots[i];
    if (p && !p.notified && state.world.clockMs >= p.readyAt) {
      p.notified = true;
      readyIdx.push(i);
    }
  }
  if (readyIdx.length) {
    const names = readyIdx.map((i) => CROP_MAP[f.plots[i].cropId]?.name).filter(Boolean);
    logGood(state, `灵田成熟：${names.join('、')}。`);
    if (fx.autoFarm) harvestAll(state);
  }

  if (fx.autoFarm && f.lastCrop) {
    for (let i = 0; i < f.plots.length; i++) {
      if (f.plots[i]) continue;
      const crop = CROP_MAP[f.lastCrop];
      if (!crop || state.player.stage < crop.unlockStage) break;
      if (state.currency.stone < crop.seedCost) break;
      plant(state, i, f.lastCrop);
    }
  }

  /* GDD 11.2：战斗灵兽可以放到牧场帮忙看护，减少作物被偷吃 */
  if (dtMs > 0 && !fx.autoFarm) {
    const guarded = (state.beasts?.deployed?.length || 0) > 0;
    if (!guarded) {
      const hours = dtMs / 3600000;
      for (let i = 0; i < f.plots.length; i++) {
        const p = f.plots[i];
        if (!p) continue;
        if (state.world.clockMs < p.readyAt) continue;
        if (Math.random() >= RAID_RATE_PER_HOUR * hours) continue;
        const crop = CROP_MAP[p.cropId];
        f.plots[i] = null;
        logWarn(state, `无人看护，「${crop?.name || '灵田作物'}」被山里的东西偷吃了。上阵一只战斗灵兽可以避免。`);
      }
    }
  }
}

/** 无看护时，每块成熟未收的地每小时被偷吃的概率 */
export const RAID_RATE_PER_HOUR = 0.05;

export function farmSummary(state) {
  ensurePlots(state);
  const f = state.farm;
  return {
    plots: f.plots.map((p, i) => {
      if (!p) return { index: i, empty: true };
      const crop = CROP_MAP[p.cropId];
      const total = p.readyAt - p.plantedAt;
      const done = Math.min(total, state.world.clockMs - p.plantedAt);
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
