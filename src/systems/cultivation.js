/**
 * cultivation.js —— 修炼与境界突破（GDD 6）
 *
 * 层内晋升自动完成；跨大境界需手动突破，成功率随境界档位提升，
 * 并且「最多失败三次，第四次必成」（GDD 6.2）。
 */

import {
  needOf, stageInfo, baseCultivationRate, nextBreakthrough,
  BREAKTHROUGH_PITY, BREAKTHROUGH_FAIL_LOSS, REALMS,
} from '../data/realms.js';
import { computeAttrs, cultivationRate } from './character.js';
import { sideFactor, SIDE } from '../core/state.js';
import { logGood, logWarn, logHl, pushLog } from './log.js';
import { emit, EV } from '../core/bus.js';
import { getEvent } from '../data/worldEvents.js';
import { clamp, fmtInt, fmtPct } from '../core/util.js';
import { syncGateLevel } from './rift.js';
import { updateTutorial } from './tutorial.js';
import { researchEffects } from '../data/research.js';
import { lifestyleEffects } from './lifestyle.js';
import { isAscensionReady } from '../data/realms.js';

/** 主循环：修为增长 */
export function tickCultivation(state, dtMs) {
  const secs = dtMs / 1000;
  if (secs <= 0) return 0;
  const gain = cultivationRate(state) * secs;
  state.player.cultivation += gain;
  state.player.totalCultivation += gain;
  advanceIfReady(state);
  return gain;
}

/** 修为满则自动晋层（大境界顶层除外，需手动突破） */
export function advanceIfReady(state) {
  let guard = 0;
  let advanced = false;
  while (guard++ < 64) {
    const info = stageInfo(state.player.stage);
    const need = info.stage.need;
    if (state.player.cultivation < need) break;

    const isTop = info.stageIndex === info.realm.stages.length - 1;
    if (isTop) {
      state.player.cultivation = need;
      const bt = nextBreakthrough(state.player.stage);
      if (state.player.autoBreakthrough && !bt?.ascension && !bt?.locked) {
        const result = attemptBreakthrough(state);
        if (result.success) { advanced = true; continue; }
      }
      break;
    }
    state.player.cultivation -= need;
    state.player.stage += 1;
    advanced = true;

    const ni = stageInfo(state.player.stage);
    logGood(state, `修为圆满，晋入「${ni.realm.name} · ${ni.stage.name}」。`);
    if (ni.stage.note) logHl(state, ni.stage.note);
    syncGateLevel(state);
    updateTutorial(state);
    emit(EV.STATE);
  }
  return advanced;
}

/** 当前突破信息 */
export function breakthroughInfo(state) {
  const bt = nextBreakthrough(state.player.stage);
  if (!bt) return { available: false, reason: '当前阶段无需突破。' };

  const info = stageInfo(state.player.stage);
  const need = info.stage.need;
  const full = state.player.cultivation >= need;

  const attrs = computeAttrs(state);
  const ev = getEvent(state.market.eventId);
  const raw = bt.success + attrs.breakthroughAdd + (state.player.breakthroughBuff || 0) - (ev.breakthroughPenalty || 0);
  const chance = clamp(raw, 0.02, 0.95);
  const pity = state.player.breakthroughFails >= BREAKTHROUGH_PITY;

  return {
    available: true,
    locked: bt.locked,
    ascension: !!bt.ascension,
    from: info,
    toRealm: bt.toRealm,
    need,
    full,
    chance,
    pity,
    fails: state.player.breakthroughFails,
    pityLeft: Math.max(0, BREAKTHROUGH_PITY - state.player.breakthroughFails),
    buff: state.player.breakthroughBuff || 0,
    eventPenalty: ev.breakthroughPenalty || 0,
    reason: bt.locked
      ? `「${bt.toRealm.name}」境将在正式版开放。`
      : (full ? '' : `修为未圆满（${fmtInt(state.player.cultivation)} / ${fmtInt(need)}）。`),
  };
}

/** 执行突破 */
export function breakthroughLossMultiplier(state) {
  return researchEffects(state).breakthroughLossMul * (1 - lifestyleEffects(state).breakthroughLossCut);
}

export function attemptBreakthrough(state) {
  if (state.player.ascensionReady) return { ok: false, reason: '雷劫已渡过，可以在轮回页确认飞升。' };
  const info = breakthroughInfo(state);
  if (!info.available) return { ok: false, reason: info.reason };
  if (info.locked) return { ok: false, reason: info.reason, locked: true };
  if (!info.full) return { ok: false, reason: info.reason };
  state.stats.breakthroughAttempts = (state.stats.breakthroughAttempts || 0) + 1;

  const success = info.pity || Math.random() < info.chance;

  // 丹药加成无论成败都会消耗（一次性的东西，进了炉子就没了）
  state.player.breakthroughBuff = 0;

  // 渡劫大圆满：飞升轮回（不重置，交给 UI 走飞升流程）
  if (info.ascension) {
    if (!success) {
      state.player.breakthroughFails += 1;
      const lost = state.player.cultivation * BREAKTHROUGH_FAIL_LOSS * breakthroughLossMultiplier(state);
      state.player.cultivation = Math.max(0, state.player.cultivation - lost);
      logWarn(state, `雷劫未过。修为逸散 ${fmtInt(lost)}。${info.pityLeft > 1 ? '再试一次。' : '下次必定飞升。'}`);
      emit(EV.BREAKTHROUGH, { success: false, ascension: true });
      emit(EV.STATE);
      return { ok: true, success: false, ascension: true };
    }
    state.player.ascensionReady = true;
    logHl(state, '九重雷劫已过。你站在飞升台上，看见了两个世界同时在你脚下。');
    emit(EV.BREAKTHROUGH, { success: true, ascension: true });
    emit(EV.STATE);
    return { ok: true, success: true, ascension: true };
  }

  if (success) {
    state.player.stage += 1;
    state.player.cultivation = 0;
    state.player.breakthroughFails = 0;
    state.player.hp = null;
    state.player.mp = null;
    const ni = stageInfo(state.player.stage);
    logHl(state, `突破成功！你踏入「${ni.realm.name} · ${ni.stage.name}」。`);
    if (ni.stage.note) logHl(state, ni.stage.note);
    syncGateLevel(state);
    updateTutorial(state);
    emit(EV.BREAKTHROUGH, { success: true, stage: state.player.stage });
    emit(EV.STATE);
    return { ok: true, success: true, chance: info.chance, stage: state.player.stage };
  }

  state.player.breakthroughFails += 1;
  const lossMul = breakthroughLossMultiplier(state);
  const lost = state.player.cultivation * BREAKTHROUGH_FAIL_LOSS * lossMul;
  state.player.cultivation = Math.max(0, state.player.cultivation - lost);
  const left = Math.max(0, BREAKTHROUGH_PITY - state.player.breakthroughFails);
  logWarn(state, `突破失败。修为逸散 ${fmtInt(lost)}${lossMul < 1 ? '（灵能电池抵消了一半）' : ''}，境界未损。${left > 0 ? `再失败 ${left} 次后将进入保底。` : '下次突破必定成功。'}`);
  emit(EV.BREAKTHROUGH, { success: false, fails: state.player.breakthroughFails });
  emit(EV.STATE);
  return { ok: true, success: false, chance: info.chance, lost };
}

/** 使用突破类丹药 */
export function applyBreakthroughPill(state, add) {
  state.player.breakthroughBuff = (state.player.breakthroughBuff || 0) + add;
  state.player.pillsUsed += 1;
}

/** 阶段进度（用于进度条） */
export function stageProgress(state) {
  const info = stageInfo(state.player.stage);
  const need = info.stage.need;
  const cur = Math.min(state.player.cultivation, need);
  return {
    cur, need,
    ratio: need > 0 ? cur / need : 0,
    isTop: info.stageIndex === info.realm.stages.length - 1,
  };
}

export { stageInfo, needOf, cultivationRate };

export function setBreakthroughAutomation(state, on) {
  if (typeof on !== 'boolean' || (on && state.player.stage < 10 && !(state.stats.breakthroughAttempts > 0))) return { ok: false, reason: '先亲自尝试一次跨境突破，再开启闭关托管。' };
  state.player.autoBreakthrough = on; emit(EV.STATE); return { ok: true };
}
/** 晋层/跨境也必须切片，否则长段离线会一直使用旧境界速率。 */
export function nextCultivationEvent(state) {
  const progress = stageProgress(state), bt = nextBreakthrough(state.player.stage);
  if (progress.isTop && (!state.player.autoBreakthrough || bt?.ascension || bt?.locked)) return Infinity;
  const rate = cultivationRate(state);
  return rate > 0 ? Math.max(1, (progress.need - progress.cur) / rate * 1000) : Infinity;
}
