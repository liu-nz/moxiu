/**
 * rift.js —— 界潮与界门系统（GDD 3）
 *
 * 界潮：每日 05:00（UTC+8）刷新，双向穿越各 1 次，未使用最多累计 3 次（3 天不上线也不亏）。
 * 界门：等级随境界提升，决定跨界载重与可携带物品数量。
 * 付费红线：禁止出售额外界潮次数（GDD 3.1）。
 */

import { riftDayIndex, msToNextRift } from '../core/clock.js';
import { SIDE, SIDE_NAME } from '../core/state.js';
import { pushLog, logGood, logHl, logWarn } from './log.js';
import { refreshDay } from './market.js';
import { carryWeight } from './inventory.js';
import { getEvent } from '../data/worldEvents.js';
import { projectEffects } from '../data/projects.js';
import { updateTutorial, noteTutorialCross } from './tutorial.js';
import { rollDaily } from './daily.js';
import { emit, EV } from '../core/bus.js';
import { fmtDuration } from '../core/util.js';

/** 界门等级表（GDD 3.2 原表） */
export const GATE_LEVELS = [
  { lv: 1, carry: 10,  req: '初始',   reqStage: 0,  effect: '基础跨界功能' },
  { lv: 2, carry: 18,  req: '筑基期', reqStage: 10, effect: '每日穿越次数 +1' },
  { lv: 3, carry: 30,  req: '金丹期', reqStage: 14, effect: '可携带活物（宠物）跨界' },
  { lv: 4, carry: 50,  req: '元婴期', reqStage: 18, effect: '可携带道侣跨界' },
  { lv: 5, carry: 80,  req: '化神期', reqStage: 22, effect: '界潮累计上限 +2' },
  { lv: 6, carry: 120, req: '炼虚期', reqStage: 26, effect: '解锁界门商店' },
  { lv: 7, carry: 180, req: '合体期', reqStage: 30, effect: '可跨界传送货物（不用自己扛）' },
  { lv: 8, carry: 260, req: '大乘期', reqStage: 34, effect: '每日穿越次数 +2' },
  { lv: 9, carry: 400, req: '渡劫期', reqStage: 38, effect: '界门完全自由，不限次数' },
];

export function gateLevelForStage(stage) {
  let lv = 1;
  for (const g of GATE_LEVELS) if (stage >= g.reqStage) lv = g.lv;
  return lv;
}

/** 开局第几天（从 1 开始计数，用于 UI 展示） */
export function gameDay(state) {
  const start = state.rift.startDay;
  if (start === null || start === undefined) return 1;
  return (state.rift.day ?? start) - start + 1;
}

export function gateInfo(level) {
  return GATE_LEVELS[Math.max(0, Math.min(GATE_LEVELS.length - 1, level - 1))];
}

export function carryCapacity(state) {
  const base = gateInfo(state.rift.gateLevel).carry;
  const warehouse = state.estate?.warehouseLevel
    ? (state.estate.warehouseLevel * 1)
    : 0;
  const blessing = (state.reincarnation?.blessings?.gate || 0) * 1;
  const city = projectEffects(state).gateCarry || 0;
  return base + warehouse + blessing + city;
}

/** 每日每方向的基础穿越次数 */
export function perDirection(state) {
  const lv = state.rift.gateLevel;
  let n = 1;
  if (lv >= 2) n += 1;
  if (lv >= 8) n += 2;
  if (lv >= 9) n = 99;
  return n;
}

/** 累计上限对应的“天数”（GDD 3.1：3 次；Lv.5 再 +2） */
export function bankDays(state) {
  return 3 + (state.rift.gateLevel >= 5 ? 2 : 0);
}

export function bankCap(state) {
  return perDirection(state) * bankDays(state);
}

/** 境界提升后同步界门等级 */
export function syncGateLevel(state) {
  const lv = gateLevelForStage(state.player.stage);
  if (lv > state.rift.gateLevel) {
    const before = state.rift.gateLevel;
    state.rift.gateLevel = lv;
    const info = gateInfo(lv);
    logHl(state, `界门晋阶：Lv.${before} → Lv.${lv}　载重 ${info.carry} kg　${info.effect}`);
    return true;
  }
  return false;
}

/** 每日刷新：发放界潮次数 + 刷新行情与世界事件 */
export function ensureDay(state, opts = {}) {
  const day = riftDayIndex(state.world.clockMs);
  const first = state.rift.day === null;

  if (first) {
    state.rift.day = day;
    if (state.rift.startDay === null || state.rift.startDay === undefined) state.rift.startDay = day;
    refreshDay(state, day);
    rollDaily(state, day);
    const per = perDirection(state);
    state.rift.toCultivation = per;
    state.rift.toModern = per;
    return { rolled: true, first: true, days: 0 };
  }

  if (day <= state.rift.day) return { rolled: false, days: 0 };

  const days = Math.min(day - state.rift.day, 400);
  const per = perDirection(state);
  const cap = bankCap(state);
  for (let i = 0; i < days; i++) {
    state.rift.toCultivation = Math.min(cap, state.rift.toCultivation + per);
    state.rift.toModern = Math.min(cap, state.rift.toModern + per);
  }
  state.rift.day = day;
  refreshDay(state, day);
  rollDaily(state, day);

  const ev = getEvent(state.market.eventId);
  if (!opts.silent) {
    logHl(state, `界潮刷新（第 ${day + 1} 日）：双向穿越各 ${per} 次可用。世界事件「${ev.name}」——${ev.desc}`);
  }
  emit(EV.RIFT, { day, event: ev.id });
  return { rolled: true, days, event: ev.id };
}

/** 能否穿越 */
export function canCross(state, toSide) {
  if (toSide === state.side) return { ok: false, reason: '你已经在这一侧了。' };
  const remain = toSide === SIDE.CULTIVATION ? state.rift.toCultivation : state.rift.toModern;
  if (remain <= 0) {
    return {
      ok: false,
      reason: `今日「${SIDE_NAME[toSide]}」方向的界潮已耗尽，${fmtDuration(msToNextRift(state.world.clockMs))} 后刷新。`,
      needRift: true,
    };
  }
  const w = carryWeight(state);
  const cap = carryCapacity(state);
  if (w > cap) {
    return {
      ok: false,
      reason: `身负 ${w.toFixed(2)} kg，超出界门载重 ${cap} kg。先卖掉或丢弃一部分货。`,
      overweight: true,
    };
  }
  return { ok: true, remain };
}

/** 执行穿越 */
export function cross(state, toSide) {
  const check = canCross(state, toSide);
  if (!check.ok) return check;

  state.side = toSide;
  if (toSide === SIDE.CULTIVATION) state.rift.toCultivation -= 1;
  else state.rift.toModern -= 1;

  noteTutorialCross(state, toSide);
  state.rift.crossings += 1;
  state.stats.crossings += 1;
  state.rift.lastCrossAt = state.world.clockMs;

  const from = toSide === SIDE.CULTIVATION ? '现代都市' : '修仙界';
  logGood(state, `界门开启，自${from}穿入${SIDE_NAME[toSide]}。`);
  updateTutorial(state);
  emit(EV.WORLD, toSide);
  return { ok: true, side: toSide };
}

export { msToNextRift, riftDayIndex };
