/**
 * ranking.js —— 排行榜与称号（GDD 15）
 *
 * 每周刷新一批 NPC 天选者作为对手：以刷新那一刻玩家的水平为基准生成，
 * 周内按固定速率缓慢成长。所以只要你这一周比对手涨得快，名次就会往上走。
 * 每周结算时按名次发放称号，称号提供小额加成，下周刷新时覆盖。
 */

import { BOARDS, BOARD_MAP, RIVAL_NAMES, RANKING, titleFor } from '../data/ranking.js';
import { combatPower, cultivationRate, computeAttrs } from './character.js';
import { logHl, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { seededRand, fmtInt } from '../core/util.js';

function rk(state) {
  if (!state.social) state.social = {};
  if (!state.social.ranking) {
    state.social.ranking = { week: null, rivals: [], titles: {}, lastSettleWeek: null, bestRanks: {} };
  }
  return state.social.ranking;
}

/** 玩家在四个榜上的当前数值 */
export function boardValues(state) {
  const attrs = computeAttrs(state);
  return {
    power: combatPower(state),
    wealth: Math.max(state.currency.stone, state.stats.maxStone || 0),
    trade: state.stats.tradeCount || 0,
    speed: cultivationRate(state, attrs),
  };
}

function weekOf(state) {
  const day = state.rift?.day ?? 0;
  return Math.floor(day / RANKING.weekLengthDays);
}

/** 每周刷新对手名单 + 结算上一周称号 */
export function ensureRivals(state) {
  const r = rk(state);
  const week = weekOf(state);
  if (r.week === week && r.rivals.length) return false;

  // 先结算上一周
  if (r.week !== null && r.week !== week) settleWeek(state, r.week);

  const values = boardValues(state);
  const rnd = seededRand('moxiu-rivals-' + week + '-' + (state.reincarnation?.count || 0));
  const count = RANKING.rivalCount;

  r.rivals = Array.from({ length: count }, (_, i) => {
    const name = RIVAL_NAMES[i % RIVAL_NAMES.length];
    const base = {};
    for (const b of BOARDS) {
      const f = RANKING.spreadMin + rnd() * (RANKING.spreadMax - RANKING.spreadMin);
      base[b.id] = Math.max(1, values[b.id] * f);
    }
    return { id: 'r' + i, name, base, at: state.world.clockMs };
  });

  r.week = week;
  logHl(state, `本周天选者榜单已刷新（第 ${week + 1} 周），共 ${count} 位对手。`);
  emit(EV.STATE);
  return true;
}

/** 对手在周内的成长值 */
function rivalValue(state, rival, boardId) {
  const hours = Math.max(0, (state.world.clockMs - rival.at) / 3600000);
  const growth = 1 + hours * RANKING.growthPerHour;
  return rival.base[boardId] * growth;
}

/** 纯排名计算：只使用当前已生成的对手名单，不触发刷新 */
function ranksOf(state, boardId) {
  const r = rk(state);
  const values = boardValues(state);
  const mine = values[boardId] || 0;

  const rows = (r.rivals || []).map((rv) => ({
    id: rv.id,
    name: rv.name,
    value: rivalValue(state, rv, boardId),
    me: false,
  }));
  rows.push({ id: 'me', name: '你', value: mine, me: true });
  rows.sort((a, b) => b.value - a.value);

  const myIndex = rows.findIndex((x) => x.me);
  return { rows, myIndex, mine, total: rows.length };
}

export function boardView(state, boardId) {
  ensureRivals(state);
  const { rows, myIndex, mine, total } = ranksOf(state, boardId);
  return {
    board: BOARD_MAP[boardId],
    rows: rows.slice(0, RANKING.topN).map((x, i) => ({ ...x, rank: i + 1 })),
    myRank: myIndex + 1,
    myValue: mine,
    total,
    inTop: myIndex < RANKING.topN,
  };
}

export function allBoards(state) {
  ensureRivals(state);
  return BOARDS.map((b) => boardView(state, b.id));
}

/** 每周结算：按名次发称号（使用结算时刻仍在生效的对手名单） */
export function settleWeek(state, week) {
  const r = rk(state);
  const awarded = [];
  for (const b of BOARDS) {
    const { myIndex } = ranksOf(state, b.id);
    const rank = myIndex + 1;
    const prev = r.bestRanks[b.id];
    if (!prev || rank < prev) r.bestRanks[b.id] = rank;

    const title = titleFor(b.id, rank);
    if (title) {
      r.titles[b.id] = { rank, name: title.name, mods: title.mods, week };
      awarded.push(`${b.name}第 ${rank} 名 · ${title.name}`);
    } else {
      delete r.titles[b.id];
    }
  }
  r.lastSettleWeek = week;
  if (awarded.length) {
    logHl(state, `上周榜单结算：${awarded.join('；')}。`);
    toast(`获得称号：${awarded[0]}`, 'good');
  } else {
    logHl(state, '上周榜单结算：未进入前三，无称号。');
  }
  emit(EV.STATE);
  return awarded;
}

/** 称号加成汇总 */
export function titleMods(state) {
  const titles = state.social?.ranking?.titles || {};
  const out = { atkMul: 0, hpMul: 0, tradeProfit: 0, tradehouseSpeed: 0, cultSpeed: 0 };
  for (const t of Object.values(titles)) {
    for (const [k, v] of Object.entries(t.mods || {})) {
      out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}

export function rankingSummary(state) {
  const r = rk(state);
  const week = weekOf(state);
  const day = state.rift?.day ?? 0;
  const daysLeft = RANKING.weekLengthDays - (day % RANKING.weekLengthDays);
  return {
    week,
    daysLeft,
    titles: r.titles,
    bestRanks: r.bestRanks,
    boards: allBoards(state),
    titleMods: titleMods(state),
  };
}

export { BOARDS, BOARD_MAP, RANKING };
