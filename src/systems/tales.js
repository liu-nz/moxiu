/**
 * tales.js —— 奇闻事件的触发与结算（GDD 14.1）
 * 随机触发的小事件，玩家上线时可能遇到，做选择获得奖励或损失。
 */

import { TALES, TALE_MAP, talesFor, TALE_RATE } from '../data/tales.js';
import { getItem, MATERIAL_MAP } from '../data/items.js';
import { addItem } from './inventory.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { baseCultivationRate, stageInfo } from '../data/realms.js';
import { riftDayIndex, riftDayStart, HOUR } from '../core/clock.js';
import { guildMods } from './character.js';
import { advanceIfReady } from './cultivation.js';
import { sectMods } from './character.js';
import { lifestyleEffects } from './lifestyle.js';
import { projectEffects } from '../data/projects.js';

/** 数值随境界放大，避免后期遇到「捡到 50 灵石」这种废话 */
function scaleOf(state) {
  const realmIndex = stageInfo(state.player.stage).realmIndex;
  return 1 + realmIndex * 2.6;
}

function applyEffect(state, eff, scale) {
  if (!eff) return [];
  const notes = [];
  const mul = eff.scale ? scale : 1;

  if (eff.stone) {
    state.currency.stone = Math.max(0, state.currency.stone + eff.stone * mul);
    notes.push(`灵石 ${eff.stone > 0 ? '+' : ''}${fmtInt(eff.stone * mul)}`);
  }
  if (eff.cny) {
    state.currency.cny = Math.max(0, state.currency.cny + eff.cny * mul);
    notes.push(`¥${eff.cny > 0 ? '+' : ''}${fmtInt(eff.cny * mul)}`);
  }
  if (eff.cult) {
    const v = eff.scale ? Math.min(1800, Math.max(30, eff.cult / 3.2)) * baseCultivationRate(state.player.stage) : eff.cult;
    state.player.cultivation += v;
    state.player.totalCultivation += v;
    notes.push(`修为 +${fmtInt(v)}`);
  }
  if (eff.stamina) {
    state.player.stamina = Math.max(0, Math.min(100 + (guildMods(state).staminaMax || 0), state.player.stamina + eff.stamina));
    notes.push(`体力 ${eff.stamina > 0 ? '+' : ''}${eff.stamina}`);
  }
  if (eff.rp) {
    state.research.points += eff.rp;
    notes.push(`研究点 +${eff.rp}`);
  }
  if (eff.karma) {
    state.stats.karma = (state.stats.karma || 0) + eff.karma;
  }
  if (eff.items) {
    for (const it of eff.items) {
      addItem(state, it.id, it.qty || 1, it.quality || 'common');
      notes.push(`${getItem(it.id)?.name || it.id} ×${it.qty || 1}`);
    }
  }
  if (eff.buff) {
    const id = 'tale_' + (eff.buff.name || 'x');
    state.player.buffs = state.player.buffs.filter(b => b.id !== id);
    state.player.buffs.push({
      id: 'tale_' + (eff.buff.name || 'x'),
      name: eff.buff.name || '奇遇',
      until: state.world.clockMs + (eff.buff.durationMs || 3600000),
      mods: eff.buff.mods || {},
    });
    notes.push(`获得状态「${eff.buff.name}」`);
  }
  return notes;
}

/** 每界潮日2次机会；福缘/生活/宗门/城市加成提高至3或4次。不堆积离线弹窗。 */
export function taleQuota(state) {
  const bonus = (state.reincarnation?.blessings?.fortune || 0) * .05 + (sectMods(state).taleRate || 0) + lifestyleEffects(state).taleRate + projectEffects(state).taleRate;
  return 2 + (bonus >= .15 ? 1 : 0) + (bonus >= .45 ? 1 : 0);
}
function syncSchedule(state) {
  const t = state.tales;
  if (!t) return;
  const day = riftDayIndex(state.world.clockMs);
  if (t.schedule?.day === day) return;
  const quota = taleQuota(state), start = riftDayStart(day);
  t.schedule = { day, quota, cursor: 0, triggered: 0, slots: Array.from({ length: quota }, (_, i) => start + (2 + i * 20 / quota) * HOUR) };
  // 新开局从30分钟以后遇到第一条，避免挡住贸易入场；旧日机会不补弹。
  t.schedule.slots = t.schedule.slots.filter(at => at >= state.world.clockMs);
  if (!t.count && t.schedule.slots.length && t.schedule.slots[0] > state.world.clockMs + .5 * HOUR) t.schedule.slots[0] = state.world.clockMs + .5 * HOUR;
}
export function nextTaleEvent(state) {
  if (!state.tales) return Infinity;
  syncSchedule(state);
  const at = state.tales.schedule.slots[state.tales.schedule.cursor];
  return at === undefined ? Infinity : Math.max(1, at - state.world.clockMs);
}
export function tickTales(state, dtMs) {
  if (!state.tales || !Number.isFinite(dtMs) || dtMs < 0) return;
  syncSchedule(state);
  const t = state.tales, schedule = t.schedule;
  while (schedule.cursor < schedule.slots.length && schedule.slots[schedule.cursor] <= state.world.clockMs) {
    schedule.cursor++;
    if (t.pending || state.world.clockMs - (t.lastAt || 0) < TALE_RATE.minGapMs) continue;
    trigger(state);
  }
}

/** 立刻触发一个奇闻 */
export function trigger(state, forcedId) {
  const t = state.tales;
  if (t.pending) return null;
  const pool = talesFor(state.side, state.player.stage, state);
  if (!pool.length) return null;

  // 优先未读过的
  syncSchedule(state);
  if (t.schedule.triggered >= t.schedule.quota) return null;
  if (forcedId && !pool.some(x => x.id === forcedId)) return null;
  const recent = (t.history || []).slice(0, 4).map(x => x.id);
  const eligible = pool.filter(x => !recent.includes(x.id));
  const fresh = eligible.filter(x => !t.seen[x.id]);
  const list = fresh.length ? fresh : eligible.length ? eligible : pool;
  const tale = forcedId ? TALE_MAP[forcedId] : list[Math.min(list.length - 1, Math.floor(Math.random() * list.length))];

  t.pending = { id: tale.id, at: state.world.clockMs };
  t.lastAt = state.world.clockMs;
  t.schedule.triggered++;
  t.seen[tale.id] = (t.seen[tale.id] || 0) + 1;
  t.count = (t.count || 0) + 1;
  emit(EV.OVERLAY, { kind: 'tale', tale });
  return tale;
}

export function pendingTale(state) {
  const p = state.tales?.pending;
  if (!p) return null;
  return TALE_MAP[p.id] || null;
}

/** 做出选择 */
export function resolveTale(state, choiceIndex) {
  const tale = pendingTale(state);
  if (!tale) return { ok: false, reason: '没有待处理的奇闻。' };
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0) return { ok: false, reason: '没有这个选项。' };
  const choice = tale.choices[choiceIndex];
  if (!choice) return { ok: false, reason: '没有这个选项。' };

  const allowed = taleChoiceStatus(state, choice);
  if (!allowed.ok) return allowed;
  const scale = scaleOf(state);
  let eff = choice.effect || {};
  let outcome = null;

  if (eff.roll) {
    const ok = Math.random() < eff.roll.chance;
    outcome = ok;
    eff = ok ? (eff.roll.success || {}) : (eff.roll.fail || {});
  }

  const notes = applyEffect(state, eff, scale);
  state.tales.pending = null;

  advanceIfReady(state);
  const text = outcome === false ? (choice.failResult || '这次尝试未如愿，代价与结果已按风险结算。') : choice.result || tale.text;
  state.tales.history = [{ id: tale.id, name: tale.name, at: state.world.clockMs, choice: choice.label, text, notes, outcome }, ...(state.tales.history || [])].slice(0, 30);
  const kind = outcome === false ? 'warn' : 'good';
  if (notes.length) {
    (kind === 'good' ? logGood : logWarn)(state, `${tale.name}：${notes.join('，')}。`);
  } else {
    logGood(state, `${tale.name}：${text}`);
  }

  emit(EV.STATE);
  return { ok: true, tale, choice, notes, text, outcome };
}

export function taleStats(state) {
  return {
    count: state.tales?.count || 0,
    quota: state.tales?.schedule?.quota || taleQuota(state),
    today: state.tales?.schedule?.day === riftDayIndex(state.world.clockMs) ? state.tales.schedule.triggered : 0,
    seen: Object.keys(state.tales?.seen || {}).length,
    total: TALES.length,
  };
}

export { TALES, TALE_MAP };

/** 按最坏支出验证随机选项，余额不足时不能白拿奖励。 */
export function taleChoiceStatus(state, choice) {
  const effect = choice.effect || {}, branches = effect.roll ? [effect.roll.success || {}, effect.roll.fail || {}] : [effect];
  const costs = { stone: 0, cny: 0 };
  for (const eff of branches) for (const cur of ['stone', 'cny']) costs[cur] = Math.max(costs[cur], Math.max(0, -(eff[cur] || 0) * (eff.scale ? scaleOf(state) : 1)));
  const missing = Object.entries(costs).filter(([cur, n]) => state.currency[cur] < n);
  return { ok: !missing.length, costs, reason: missing.length ? `需要备足${missing.map(([cur,n]) => `${cur === 'stone' ? '灵石' : '人民币'} ${fmtInt(n)}`).join('、')}。` : '' };
}
