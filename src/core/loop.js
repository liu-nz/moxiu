/**
 * loop.js —— 主循环与时间基准
 *
 * 两种时间模式（state.world.mode）：
 *
 *   standard（标准 / 联机）
 *     世界时钟严格等于真实时间，倍率固定 1×。
 *     界潮因此按真实时间每日 05:00 刷新——这正是 GDD 3.1
 *     「界潮是全服统一的跨界窗口，所有玩家共享同一波界潮」的前提。
 *
 *   sandbox（沙盒 / 单机）
 *     世界时钟按倍率推进（1× / 10× / 60×），用于快速体验完整流程。
 *     代价是每个玩家活在自己的时间线上，界潮不再全服统一。
 */

import { emit, EV } from './bus.js';
import { tickCultivation } from '../systems/cultivation.js';
import { tickModern } from '../systems/modern.js';
import { tickEstate } from '../systems/estate.js';
import { tickStamina, tickAutoBattle } from '../systems/dungeon.js';
import { tickFarm } from '../systems/farm.js';
import { tickRanch } from '../systems/ranch.js';
import { tickResearch } from '../systems/research.js';
import { tickTales } from '../systems/tales.js';
import { tickTradehouse } from '../systems/tradehouse.js';
import { ensureRivals } from '../systems/ranking.js';
import { ensureDay } from '../systems/rift.js';
import { runDailyDuties, runDailyStipend } from '../systems/duties.js';
import { updateTutorial } from '../systems/tutorial.js';
import { pushLog } from '../systems/log.js';

let rafId = null;
let lastTs = 0;
let getStateFn = null;
let hiddenAt = 0;

export const SPEEDS = [1, 10, 60];
export const MODES = ['standard', 'sandbox'];

/** 单帧世界时间推进上限：防止时钟跳变（切后台、改系统时间）带来收益暴涨 */
const MAX_STEP_WORLD_MS = 60 * 1000;

export function isStandard(state) {
  return (state.world?.mode || 'standard') === 'standard';
}

export function startLoop(getState) {
  getStateFn = getState;
  lastTs = performance.now();
  const frame = (ts) => {
    // 单帧最多推进 1 秒真实时间，防止卡顿导致数值跳变
    const dtReal = Math.min(Math.max(0, ts - lastTs), 1000);
    lastTs = ts;
    step(dtReal);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  // 标签页切走时 requestAnimationFrame 会暂停，回来时补算这段时间
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now();
    } else if (hiddenAt) {
      const elapsed = Math.min(performance.now() - hiddenAt, 12 * 3600 * 1000);
      hiddenAt = 0;
      lastTs = performance.now();
      if (elapsed > 3000) step(elapsed);
    }
  });
}

export function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/** 推进一帧 */
export function step(dtRealMs) {
  const state = getStateFn ? getStateFn() : null;
  if (!state) return;

  if (isStandard(state)) {
    // 标准模式：把世界时钟直接对齐到真实时间，而不是累加——
    // 这样即使掉帧、切后台或系统时间被调整，界潮也始终落在全服同一个窗口上。
    const target = Date.now();
    const jump = target - state.world.clockMs;
    state.world.clockMs = target;
    state.world.speed = 1;
    runSystems(state, Math.min(Math.max(0, jump), MAX_STEP_WORLD_MS), dtRealMs);
    return;
  }

  const speed = state.world.speed || 1;
  const dtWorld = dtRealMs * speed;
  state.world.clockMs += dtWorld;
  runSystems(state, dtWorld, dtRealMs);
}

/**
 * 按世界时间推进（离线结算与测试用）。
 * 注意：这里始终走「累加」路径，不做时钟对齐——离线结算需要精确控制推进量。
 */
export function advance(state, dtWorld, dtReal = dtWorld / (state.world.speed || 1)) {
  state.world.clockMs += dtWorld;
  runSystems(state, dtWorld, dtReal);
}

function runSystems(state, dtWorld, dtReal) {
  state.playMs = (state.playMs || 0) + dtReal;

  tickCultivation(state, dtWorld);
  tickModern(state, dtWorld);
  tickEstate(state, dtWorld);
  tickStamina(state, dtWorld);
  tickFarm(state, dtWorld);
  tickRanch(state, dtWorld);
  tickResearch(state, dtWorld);
  tickTales(state, dtWorld);
  tickTradehouse(state, dtWorld);
  tickAutoBattle(state, dtWorld);

  const now = state.world.clockMs;
  if (state.player.buffs && state.player.buffs.length) {
    const before = state.player.buffs.length;
    state.player.buffs = state.player.buffs.filter((b) => b.until > now);
    if (state.player.buffs.length !== before) emit(EV.STATE);
  }

  const roll = ensureDay(state);
  if (roll.rolled && !roll.first && roll.days > 0) {
    runDailyDuties(state, roll.days);
    runDailyStipend(state, roll.days);
  }
  ensureRivals(state);
  updateTutorial(state);
  emit(EV.TICK, dtWorld);
}

/** 沙盒模式下调倍率；标准模式固定 1× */
export function setSpeed(state, speed) {
  if (isStandard(state)) return { ok: false, reason: '标准模式下界潮按真实时间刷新，倍率固定 1×。' };
  state.world.speed = speed;
  emit(EV.STATE);
  return { ok: true };
}

/**
 * 切换时间模式。
 * 沙盒 → 标准：把世界时钟对齐到真实时间（界潮会重新与全服同步）。
 * 标准 → 沙盒：保留当前时钟，之后按倍率推进。
 */
export function setMode(state, mode) {
  if (!MODES.includes(mode)) return { ok: false, reason: '没有这个模式。' };
  const cur = state.world.mode || 'standard';
  if (cur === mode) return { ok: false, reason: '已经在这个模式了。' };

  state.world.mode = mode;
  if (mode === 'standard') {
    const before = state.world.clockMs;
    state.world.clockMs = Date.now();
    state.world.speed = 1;
    const drift = state.world.clockMs - before;
    pushLog(state, `已切换到标准模式：世界时钟对齐真实时间（偏移 ${drift >= 0 ? '+' : ''}${Math.round(drift / 60000)} 分钟），界潮恢复全服统一。`, 'hl');
  } else {
    pushLog(state, `已切换到沙盒模式：世界时钟将按倍率推进，界潮不再与全服同步。`, 'warn');
  }
  emit(EV.STATE);
  return { ok: true };
}
