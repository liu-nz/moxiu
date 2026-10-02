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
import { tickCultivation, advanceIfReady } from '../systems/cultivation.js';
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
import { nextRiftAt } from './clock.js';
import { lifestyleEffects } from '../systems/lifestyle.js';
import { earn } from '../systems/daily.js';

let rafId = null;
let lastTs = 0;
let getStateFn = null;
let visibilityHandler = null;

export const SPEEDS = [1, 10, 60];
export const MODES = ['standard', 'sandbox'];

/** 离线与后台恢复最多结算三天真实时间，生产时间片不跨过界潮刷新。 */
export const MAX_AWAY_REAL_MS = 3 * 24 * 3600 * 1000;
const MAX_SLICE_WORLD_MS = 15 * 60 * 1000;

export function isStandard(state) {
  return (state.world?.mode || 'standard') === 'standard';
}

export function startLoop(getState) {
  stopLoop();
  getStateFn = getState;
  lastTs = performance.now();
  const frame = (ts) => {
    // 完整记录帧间隔，长间隔走带上限的补算路径。
    const dtReal = Math.max(0, ts - lastTs);
    lastTs = ts;
    step(dtReal);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  // 标签页切走时 requestAnimationFrame 会暂停，回来时补算这段时间
  visibilityHandler = () => {
    if (document.hidden) return;
    const now = performance.now();
    const elapsed = Math.max(0, now - lastTs);
    lastTs = now; // 背景 RAF 已结算的部分不重复补算。
    if (elapsed > 0) step(elapsed);
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
  visibilityHandler = null;
}

/** 推进一帧 */
export function step(dtRealMs) {
  const state = getStateFn ? getStateFn() : null;
  if (!state) return;

  if (!Number.isFinite(dtRealMs) || dtRealMs < 0) return;
  if (isStandard(state)) {
    const target = Date.now();
    const jump = Math.max(0, target - state.world.clockMs);
    state.world.speed = 1;
    if (jump > 3000) settleElapsed(state, jump, { targetMs: target, homeBonus: true });
    else {
      advance(state, jump, jump);
      state.world.clockMs = target;
      syncWorldDay(state);
    }
    return;
  }
  if (dtRealMs > 3000) settleElapsed(state, dtRealMs, { homeBonus: true });
  else advance(state, dtRealMs * (state.world.speed || 1), dtRealMs);
}

/**
 * 按世界时间推进（离线结算与测试用）。
 * 注意：这里始终走「累加」路径，不做时钟对齐——离线结算需要精确控制推进量。
 */
export function syncWorldDay(state, { duties = true } = {}) {
  const roll = ensureDay(state);
  if (duties && roll.rolled && !roll.first && roll.days > 0) {
    runDailyDuties(state, roll.days);
    runDailyStipend(state, roll.days);
  }
  return roll;
}

/** 时间片不会跨过界潮日或临时状态到期，生产先结算旧日，随后刷新。 */
export function advance(state, dtWorld, dtReal = dtWorld / (state.world.speed || 1)) {
  if (!Number.isFinite(dtWorld) || dtWorld < 0 || !Number.isFinite(dtReal) || dtReal < 0) return;
  syncWorldDay(state);
  let left = dtWorld;
  const ratio = dtWorld > 0 ? dtReal / dtWorld : 0;
  while (left > 0) {
    const now = state.world.clockMs;
    let slice = Math.min(left, state.auto?.battleOn ? 60000 : MAX_SLICE_WORLD_MS, nextRiftAt(now) - now);
    for (const buff of state.player.buffs || []) {
      if (buff.until > now) slice = Math.min(slice, buff.until - now);
    }
    state.world.clockMs += slice;
    runSystems(state, slice, slice * ratio);
    left = Math.max(0, left - slice);
    syncWorldDay(state);
  }
  ensureRivals(state);
  updateTutorial(state);
  emit(EV.TICK, dtWorld);
}

/** 离线和标签页恢复共用同一结算路径与三天真实时间上限。 */
export function settleElapsed(state, elapsedReal, { targetMs = null, homeBonus = false } = {}) {
  if (!Number.isFinite(elapsedReal) || elapsedReal < 0) return { worldMs: 0, capped: false, homeBonus: 0 };
  const capped = Math.min(elapsedReal, MAX_AWAY_REAL_MS);
  const speed = isStandard(state) ? 1 : (state.world.speed || 1);
  const worldMs = capped * speed;
  const beforeCult = state.player.totalCultivation;
  const beforePassive = state.stats.passiveCny || 0;
  advance(state, worldMs, capped);
  const bonus = homeBonus ? lifestyleEffects(state).offlineBonus : 0;
  if (bonus > 0) {
    const extraCult = Math.max(0, state.player.totalCultivation - beforeCult) * bonus;
    const extraCny = Math.max(0, (state.stats.passiveCny || 0) - beforePassive) * bonus;
    state.player.cultivation += extraCult;
    state.player.totalCultivation += extraCult;
    advanceIfReady(state);
    state.currency.cny += extraCny;
    earn(state, 'cny', extraCny);
    state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
  }
  // 超上限的尾段只校准日期与界潮；不补发未模拟日期的生产和职责。
  if (isStandard(state) && targetMs !== null) {
    state.world.clockMs = targetMs;
    state.world.speed = 1;
    syncWorldDay(state, { duties: false });
  }
  return { worldMs, capped: capped < elapsedReal, homeBonus: bonus };
}

function runSystems(state, dtWorld, dtReal) {
  state.playMs = (state.playMs || 0) + dtReal;

  const endClock = state.world.clockMs;
  state.world.clockMs = endClock - dtWorld; // 速率取时间片开始时的有效状态。
  tickCultivation(state, dtWorld);
  tickModern(state, dtWorld);
  tickEstate(state, dtWorld);
  tickStamina(state, dtWorld);
  state.world.clockMs = endClock;
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
}

/** 沙盒模式下调倍率；标准模式固定 1× */
export function setSpeed(state, speed) {
  if (isStandard(state)) return { ok: false, reason: '标准模式下界潮按真实时间刷新，倍率固定 1×。' };
  if (!SPEEDS.includes(speed)) return { ok: false, reason: '请选择 1×、10× 或 60×。' };
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
    syncWorldDay(state, { duties: false });
    const drift = state.world.clockMs - before;
    pushLog(state, `已切换到标准模式：世界时钟对齐真实时间（偏移 ${drift >= 0 ? '+' : ''}${Math.round(drift / 60000)} 分钟），界潮恢复全服统一。`, 'hl');
  } else {
    pushLog(state, `已切换到沙盒模式：世界时钟将按倍率推进，界潮不再与全服同步。`, 'warn');
  }
  emit(EV.STATE);
  return { ok: true };
}
