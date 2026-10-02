/**
 * offline.js —— 离线收益（GDD 19）
 * 按当前所在世界计算，另一世界 50% 收益（由 sideFactor 统一处理）。
 * 离线期间同样会推进灵田、牧场、地产、研究与奇闻。
 */

import { advance } from '../core/loop.js';
import { ensureDay } from './rift.js';
import { runDailyDuties } from './duties.js';
import { updateTutorial } from './tutorial.js';
import { pushLog } from './log.js';
import { lifestyleEffects } from './lifestyle.js';
import { fmtDuration, fmtInt } from '../core/util.js';

const MAX_OFFLINE_MS = 3 * 24 * 3600 * 1000;   // 最多结算 3 天

/**
 * 结算离线收益。返回报告对象或 null（离线时间过短）。
 * 内部按 240 段切片推进，以便中途触发境界晋升与界潮刷新。
 */
export function applyOffline(state, nowMs) {
  const savedAt = state.savedAt || nowMs;
  const elapsedReal = Math.max(0, nowMs - savedAt);
  if (elapsedReal < 60 * 1000) return null;

  const capped = Math.min(elapsedReal, MAX_OFFLINE_MS);
  const speed = state.world.speed || 1;
  const worldMs = capped * speed;

  const before = {
    stage: state.player.stage,
    stone: state.currency.stone,
    cny: state.currency.cny,
    cult: state.player.totalCultivation,
    rp: state.research?.points || 0,
  };

  const steps = 240;
  const dt = worldMs / steps;

  for (let i = 0; i < steps; i++) {
    advance(state, dt, dt / speed);
  }

  const report = {
    elapsedReal,
    worldMs,
    capped: capped < elapsedReal,
    cult: state.player.totalCultivation - before.cult,
    cny: state.currency.cny - before.cny,
    stone: state.currency.stone - before.stone,
    rp: (state.research?.points || 0) - before.rp,
    stageFrom: before.stage,
    stageTo: state.player.stage,
  };

  // 现代休闲生活：居所提升离线收益
  const homeBonus = lifestyleEffects(state).offlineBonus;
  if (homeBonus > 0) {
    const extraCult = report.cult * homeBonus;
    const extraCny = report.cny * homeBonus;
    state.player.cultivation += extraCult;
    state.player.totalCultivation += extraCult;
    state.currency.cny += extraCny;
    report.cult += extraCult;
    report.cny += extraCny;
    report.homeBonus = homeBonus;
  }

  pushLog(state, `离线 ${fmtDuration(elapsedReal)}：修为 +${fmtInt(report.cult)}，灵石 +${fmtInt(report.stone)}，¥+${fmtInt(report.cny)}${homeBonus ? `（居所加成 +${(homeBonus * 100).toFixed(0)}%）` : ''}。`, 'hl');
  return report;
}
