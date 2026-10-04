/**
 * daily.js —— 每日 / 每周统计
 * 道盟集体任务与排行榜需要「今日进度」，这里用快照差值统一计算，
 * 避免在每个产出点都埋计数器。
 */

import { riftDayIndex } from '../core/clock.js';
import { logGood } from './log.js';
import { emit, EV } from '../core/bus.js';
import { RANCH_MAP } from '../data/beasts.js';
import { tickRanch } from './ranch.js';

export const SIGN_IN_REWARD = 20;
export function bindActivity(state, activity) {
  if (!activity) return;
  state.daily ||= {};
  Object.assign(state.daily, activity);
}
export function signIn(state) {
  state.daily ||= {};
  const day = riftDayIndex(state.world.clockMs), d = state.daily;
  if (d.signInDay === day) return { ok: false, reason: '今天已经签到，明日 05:00 后可再次领取。' };
  d.signInStreak = d.signInDay === day - 1 ? (d.signInStreak || 0) + 1 : 1;
  d.signInDay = day; d.signInTotal = (d.signInTotal || 0) + 1;
  state.currency.stone += SIGN_IN_REWARD;
  earn(state, 'stone', SIGN_IN_REWARD);
  logGood(state, `今日签到：+${SIGN_IN_REWARD} 灵石，连续 ${d.signInStreak} 天。`);
  emit(EV.STATE);
  return { ok: true, reward: SIGN_IN_REWARD, day };
}
export function claimHelp(state) {
  const d = state.daily || {}, day = riftDayIndex(state.world.clockMs);
  if (!d.help || d.helpClaimedDay === day) return { ok: false, reason: '没有可领取的照料，或今天已经领取。' };
  const plot = state.farm.plots.find(x => x && x.readyAt > state.world.clockMs);
  const slot = state.ranch.slots.find(x => x && RANCH_MAP[x.beastId]);
  let kind;
  if (plot) { plot.readyAt = Math.max(state.world.clockMs, plot.readyAt - 5 * 60000); kind = '灵田'; }
  else if (slot) {
    const cycle = RANCH_MAP[slot.beastId].cycleMs;
    slot.acc = Math.min(cycle, (slot.acc || 0) + 5 * 60000);
    tickRanch(state, 0); kind = '牧场';
  } else return { ok: false, reason: '请先种植作物或养殖灵兽，再领取照料。' };
  const helpId = d.help.id;
  d.helpClaimedDay = day; d.help = null;
  logGood(state, `${kind}收到同行照料，本次等待缩短至多 5 分钟。`);
  emit(EV.STATE);
  return { ok: true, helpId, day, kind };
}

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
