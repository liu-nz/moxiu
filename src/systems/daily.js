/**
 * daily.js —— 每日 / 每周统计
 * 道盟集体任务与排行榜需要「今日进度」，这里用快照差值统一计算，
 * 避免在每个产出点都埋计数器。
 */

import { riftDayIndex } from '../core/clock.js';

export function ensureDailyBase(state) {
  if (!state.daily) state.daily = {};
  if (!state.daily.base) state.daily.base = snapshot(state);
  if (state.daily.day === null || state.daily.day === undefined) {
    state.daily.day = riftDayIndex(state.world.clockMs);
    state.daily.base = snapshot(state);
  }
  return state.daily;
}

export function snapshot(state) {
  const s = state.stats || {};
  return {
    dungeonRuns: s.dungeonRuns || 0,
    tradeCount: s.tradeCount || 0,
    soldQty: s.soldQty || 0,
    crafts: s.crafts || 0,
    harvests: s.harvests || 0,
    tributes: s.tributes || 0,
    totalCultivation: state.player?.totalCultivation || 0,
    earnedStone: s.earnedStone || 0,
    earnedCny: s.earnedCny || 0,
  };
}

/** 每日重置（由 rift.ensureDay 在界潮跨日时调用） */
export function rollDaily(state, day) {
  ensureDailyBase(state);
  state.daily.day = day;
  state.daily.base = snapshot(state);
  state.daily.rolls = (state.daily.rolls || 0) + 1;
}

/** 今日各项增量 */
export function dailyDelta(state) {
  ensureDailyBase(state);
  const b = state.daily.base;
  const s = state.stats || {};
  return {
    dungeons: (s.dungeonRuns || 0) - b.dungeonRuns,
    trades: (s.tradeCount || 0) - b.tradeCount,
    soldQty: (s.soldQty || 0) - b.soldQty,
    crafts: (s.crafts || 0) - b.crafts,
    harvests: (s.harvests || 0) - b.harvests,
    tributes: (s.tributes || 0) - b.tributes,
    cultGained: (state.player?.totalCultivation || 0) - b.totalCultivation,
    stoneEarned: (s.earnedStone || 0) - b.earnedStone,
    cnyEarned: (s.earnedCny || 0) - b.earnedCny,
  };
}

/** 通用记账：所有收入都应经过这里，便于任务与排行榜统计 */
export function earn(state, currency, amount) {
  if (!amount) return;
  if (!state.stats.earnedStone) state.stats.earnedStone = 0;
  if (!state.stats.earnedCny) state.stats.earnedCny = 0;
  if (currency === 'stone') state.stats.earnedStone += amount;
  else state.stats.earnedCny += amount;
}

export function countRun(state) { state.stats.dungeonRuns = (state.stats.dungeonRuns || 0) + 1; }
export function countSold(state, n) { state.stats.soldQty = (state.stats.soldQty || 0) + n; }
export function countCraft(state, n = 1) { state.stats.crafts = (state.stats.crafts || 0) + n; }
export function countHarvest(state, n = 1) { state.stats.harvests = (state.stats.harvests || 0) + n; }
