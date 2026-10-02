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
import { statMultOf } from '../data/realms.js';
import { sectMods } from './character.js';
import { lifestyleEffects } from './lifestyle.js';
import { projectEffects } from '../data/projects.js';

/** 数值随境界放大，避免后期遇到「捡到 50 灵石」这种废话 */
function scaleOf(state) {
  const realmIndex = Math.floor(state.player.stage / 4.7);
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
    const v = eff.cult * mul;
    state.player.cultivation += v;
    state.player.totalCultivation += v;
    notes.push(`修为 +${fmtInt(v)}`);
  }
  if (eff.stamina) {
    state.player.stamina = Math.max(0, Math.min(100, state.player.stamina + eff.stamina));
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

/** 主循环：按世界时间概率触发 */
export function tickTales(state, dtMs) {
  const t = state.tales;
  if (!t || t.pending) return;
  const hours = dtMs / 3600000;
  if (hours <= 0) return;
  if (state.world.clockMs - (t.lastAt || 0) < TALE_RATE.minGapMs) return;

  const fx = state.reincarnation?.blessings?.fortune || 0;
  const sm = sectMods(state).taleRate || 0;
  const lf = lifestyleEffects(state).taleRate || 0;
  const pj = projectEffects(state).taleRate || 0;
  const chance = TALE_RATE.perHour * hours * (1 + fx * 0.05 + sm + lf + pj);
  if (Math.random() >= chance) return;

  trigger(state);
}

/** 立刻触发一个奇闻 */
export function trigger(state, forcedId) {
  const t = state.tales;
  if (t.pending) return null;
  const pool = talesFor(state.side, state.player.stage);
  if (!pool.length) return null;

  // 优先未读过的
  const fresh = pool.filter((x) => !t.seen[x.id]);
  const list = fresh.length ? fresh : pool;
  const tale = forcedId ? (TALE_MAP[forcedId] || list[0]) : list[Math.floor(Math.random() * list.length)];

  t.pending = { id: tale.id, at: state.world.clockMs };
  t.lastAt = state.world.clockMs;
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
  const choice = tale.choices[choiceIndex];
  if (!choice) return { ok: false, reason: '没有这个选项。' };

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

  const text = choice.result || tale.text;
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
    seen: Object.keys(state.tales?.seen || {}).length,
    total: TALES.length,
  };
}

export { TALES, TALE_MAP };
