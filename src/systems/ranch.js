/**
 * ranch.js —— 灵脉牧场（GDD 11.2）
 * 养殖灵兽定时产出材料；战斗灵兽也可以放进牧场帮忙看护（减少作物被偷吃）。
 */

import { RANCH_BEASTS, RANCH_MAP, RANCH } from '../data/beasts.js';
import { hasFarmGuard } from './farm.js';
import { getItem } from '../data/items.js';
import { addItem } from './inventory.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { researchEffects } from '../data/research.js';

export function ensureSlots(state) {
  const r = state.ranch;
  r.autoCollect ??= true;
  while (r.slots.length < r.unlocked) r.slots.push(null);
  if (r.slots.length > r.unlocked) r.slots.length = r.unlocked;
  return r.slots;
}

export function unlockedBeasts(state) {
  return RANCH_BEASTS.filter((b) => state.player.stage >= b.unlockStage);
}

export function buyBeast(state, beastId) {
  const b = RANCH_MAP[beastId];
  if (!b) return { ok: false, reason: '没有这种灵兽。' };
  if (state.player.stage < b.unlockStage) return { ok: false, reason: '境界不足。' };
  ensureSlots(state);
  const idx = state.ranch.slots.findIndex((s) => s === null || s === undefined);
  if (idx < 0) return { ok: false, reason: '牧场没有空位了。' };
  if (state.currency.stone < b.cost) return { ok: false, reason: `需要 ${fmtInt(b.cost)} 灵石。` };
  state.currency.stone -= b.cost;
  state.ranch.slots[idx] = { beastId, lastAt: state.world.clockMs, pending: 0 };
  logGood(state, `「${b.name}」入栏，开始产出。`);
  emit(EV.STATE);
  return { ok: true };
}

export function buySlot(state) {
  if (state.ranch.unlocked >= RANCH.max) return { ok: false, reason: '牧场已扩到极限。' };
  const cost = RANCH.costOf(state.ranch.unlocked);
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };
  state.currency.stone -= cost;
  state.ranch.unlocked += 1;
  ensureSlots(state);
  logGood(state, `牧场扩建，共 ${state.ranch.unlocked} 个栏位。`);
  emit(EV.STATE);
  return { ok: true };
}

export function removeBeast(state, index) {
  ensureSlots(state);
  if (!Number.isInteger(index) || index < 0 || index >= state.ranch.unlocked || !state.ranch.slots[index]) return { ok: false, reason: '栏位不存在。' };
  if (state.ranch.slots[index].pending > 0) collect(state, index);
  state.ranch.slots[index] = null;
  emit(EV.STATE);
  return { ok: true };
}

/** 主循环：累计产出（不自动入包，等玩家收，除非有自动研究） */
export function tickRanch(state, dtMs) {
  const r = state.ranch;
  if (!r || !Number.isFinite(dtMs) || dtMs < 0) return;
  ensureSlots(state);
  const fx = researchEffects(state);
  for (const slot of r.slots) {
    if (!slot) continue;
    const b = RANCH_MAP[slot.beastId];
    if (!b) continue;
    slot.acc = (slot.acc || 0) + dtMs;
    const cycles = Math.floor(slot.acc / b.cycleMs);
    if (cycles > 0) {
      slot.acc -= cycles * b.cycleMs;
      const yieldQty = cycles * b.qty * (hasFarmGuard(state) ? 1.15 : 1) + (slot.yieldFraction || 0);
      const whole = Math.floor(yieldQty + 1e-9);
      slot.yieldFraction = Math.max(0, yieldQty - whole);
      slot.pending = (slot.pending || 0) + whole;
      emit(EV.STATE);
    }
  }
  // 自动灵田研究附带自动收牧场
  if (fx.autoFarm && r.autoCollect) collectAll(state, true);
}

export function collect(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.ranch.unlocked) return { ok: false, reason: '栏位不存在。' };
  ensureSlots(state);
  const slot = state.ranch.slots[index];
  if (!slot) return { ok: false, reason: '这个栏位是空的。' };
  const b = RANCH_MAP[slot.beastId];
  if (!b) return { ok: false, reason: '灵兽资料不可用。' };
  const qty = slot.pending || 0;
  if (qty <= 0) return { ok: false, reason: '还没有产出。' };
  addItem(state, b.produceId, qty, 'common');
  state.stats.ranchCollected = (state.stats.ranchCollected || 0) + qty;
  slot.pending = 0;
  logGood(state, `牧场收获：${b.name}产出 ×${qty}。`);
  emit(EV.STATE);
  return { ok: true, qty, beast: b };
}

export function collectAll(state, silent = false) {
  ensureSlots(state);
  let total = 0;
  const names = [];
  for (let i = 0; i < state.ranch.slots.length; i++) {
    const slot = state.ranch.slots[i];
    if (!slot || !slot.pending) continue;
    const b = RANCH_MAP[slot.beastId];
    if (!b) continue;
    addItem(state, b.produceId, slot.pending, 'common');
    names.push(`${getItem(b.produceId)?.name || b.produceId}×${slot.pending}`);
    total += slot.pending;
    slot.pending = 0;
  }
  state.stats.ranchCollected = (state.stats.ranchCollected || 0) + total;
  if (total && !silent) toast(`牧场收获 ${total} 件`, 'good');
  if (total) emit(EV.STATE);
  return { ok: total > 0, total, names };
}

export function ranchSummary(state) {
  ensureSlots(state);
  return {
    slots: state.ranch.slots.map((s, i) => {
      if (!s) return { index: i, empty: true };
      const b = RANCH_MAP[s.beastId];
      const acc = s.acc || 0;
      return {
        index: i,
        empty: false,
        beast: b,
        pending: s.pending || 0,
        ratio: b ? Math.min(1, acc / b.cycleMs) : 0,
        remainMs: b ? Math.max(0, b.cycleMs - acc) : 0,
      };
    }),
    unlocked: state.ranch.unlocked,
    max: RANCH.max,
    nextCost: RANCH.costOf(state.ranch.unlocked),
    guarded: hasFarmGuard(state),
  };
}

export function setRanchAutoCollect(state, on) {
  if (!researchEffects(state).autoFarm) return { ok: false, reason: '先研究「自动灵田」。' };
  if (typeof on !== 'boolean') return { ok: false, reason: '请选择开关状态。' };
  state.ranch.autoCollect = on;
  emit(EV.STATE);
  return { ok: true };
}

export function nextRanchEvent(state) {
  return Math.min(Infinity, ...state.ranch.slots.filter(s => s && RANCH_MAP[s.beastId]).map(s => RANCH_MAP[s.beastId].cycleMs - (s.acc || 0)));
}
