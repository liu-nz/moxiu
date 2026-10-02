/**
 * sect.js —— 宗门系统（GDD 1.2 表世界职责）
 *
 * 拜入宗门 → 从外门弟子做起 → 靠宗门贡献与境界晋升辈分
 * → 辈分越高，宗门灵气加成越大、能兑换的本门秘传越多。
 */

import {
  SECTS, SECT_MAP, SECT_RANKS, SECT_QUESTS, SECT_TOURNAMENT,
  SECT_STIPEND, sectRankOf, nextSectRank, tributeValue,
} from '../data/sects.js';
import { baseAttrs } from '../data/realms.js';
import { MATERIAL_MAP, ITEM_MAP, CONSUMABLE_MAP } from '../data/items.js';
import { riftDayIndex } from '../core/clock.js';
import { dailyDelta } from './daily.js';
import { addItem, countOf, removeItem } from './inventory.js';
import { cultivationRate, computeAttrs, combatPower, sectMods } from './character.js';
import { logGood, logHl, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { earn } from './daily.js';
import { fmtInt } from '../core/util.js';

function sc(state) {
  if (!state.sect) {
    state.sect = {
      id: null, contribution: 0, totalContribution: 0, rank: 0,
      quests: {}, secrets: {}, stipendAt: 0, trialAt: 0, trialBest: null, tributes: 0,
    };
  }
  return state.sect;
}

/* ------------------------------------------------------------------ */
/* 拜入 / 退出                                                         */
/* ------------------------------------------------------------------ */
export function joinSect(state, id) {
  const s = SECT_MAP[id];
  if (!s) return { ok: false, reason: '没有这个宗门。' };
  const d = sc(state);
  if (d.id) return { ok: false, reason: '你已经拜入宗门了。' };
  if (state.player.stage < s.joinStage) return { ok: false, reason: '境界不足，山门不收。' };

  d.id = id;
  d.contribution = 50;
  d.totalContribution = 50;
  d.rank = 0;
  logHl(state, `你拜入「${s.name}」，成为外门弟子。${s.perk}。`);
  toast(`拜入 ${s.name}`, 'good');
  emit(EV.STATE);
  return { ok: true };
}

export function leaveSect(state) {
  const d = sc(state);
  if (!d.id) return { ok: false, reason: '尚未拜入宗门。' };
  const name = SECT_MAP[d.id]?.name;
  d.id = null;
  d.rank = 0;
  d.quests = {};
  logWarn(state, `你离开了「${name}」。宗门贡献与秘传保留，但宗门灵气加成失效。`);
  emit(EV.STATE);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 辈分                                                                */
/* ------------------------------------------------------------------ */
export function rankInfo(state) {
  const d = sc(state);
  const cur = sectRankOf(d.rank);
  const nxt = nextSectRank(d.rank);
  const contributionOk = nxt ? d.contribution >= nxt.contribution : false;
  const stageOk = nxt ? state.player.stage >= nxt.stage : false;
  return {
    index: d.rank,
    current: cur,
    next: nxt,
    contributionOk,
    stageOk,
    canPromote: !!nxt && contributionOk && stageOk,
    rankPerk: cur.perk,
    cultBonus: cur.cultBonus,
  };
}

export function promote(state) {
  const info = rankInfo(state);
  if (!info.next) return { ok: false, reason: '你已是宗主。' };
  if (!info.stageOk) return { ok: false, reason: `境界不足，需再上一层楼。` };
  if (!info.contributionOk) return { ok: false, reason: `宗门贡献不足（需 ${fmtInt(info.next.contribution)}）。` };
  const d = sc(state);
  d.rank += 1;
  const r = sectRankOf(d.rank);
  logHl(state, `宗门晋阶：你成为「${r.name}」。${r.perk}。`);
  toast(`晋阶 ${r.name}`, 'good');
  emit(EV.STATE);
  return { ok: true, rank: r };
}

/* ------------------------------------------------------------------ */
/* 宗门任务                                                            */
/* ------------------------------------------------------------------ */
export function questProgress(state, quest) {
  const d = dailyDelta(state);
  const attrs = computeAttrs(state);
  switch (quest.metric) {
    case 'dungeons': return { cur: d.dungeons, goal: quest.goal, unit: '次' };
    case 'crafts': return { cur: d.crafts, goal: quest.goal, unit: '次' };
    case 'trades': return { cur: d.trades, goal: quest.goal, unit: '笔' };
    case 'harvests': return { cur: d.harvests, goal: quest.goal, unit: '次' };
    case 'tributes': return { cur: d.tributes, goal: quest.goal, unit: '次' };
    case 'cultRatio': {
      const perHour = cultivationRate(state, attrs) * 3600;
      return { cur: d.cultGained, goal: Math.max(1, perHour * quest.goal), unit: '修为', ratio: true };
    }
    default: return { cur: 0, goal: quest.goal, unit: '' };
  }
}

export function questView(state) {
  const d = sc(state);
  const day = riftDayIndex(state.world.clockMs);
  return SECT_QUESTS.map((q) => {
    const rec = d.quests[q.id];
    const claimed = rec && rec.day === day && rec.claimed;
    const p = questProgress(state, q);
    const done = p.cur >= p.goal;
    return { quest: q, progress: p, done, claimed, claimable: done && !claimed };
  });
}

export function claimQuest(state, questId) {
  const d = sc(state);
  if (!d.id) return { ok: false, reason: '先拜入一个宗门。' };
  const q = SECT_QUESTS.find((x) => x.id === questId);
  if (!q) return { ok: false, reason: '没有这个任务。' };
  const day = riftDayIndex(state.world.clockMs);
  const rec = d.quests[questId];
  if (rec && rec.day === day && rec.claimed) return { ok: false, reason: '今日已领。' };

  const p = questProgress(state, q);
  if (p.cur < p.goal) return { ok: false, reason: '任务尚未完成。' };

  const bonus = 1 + Math.floor((state.player.stage || 0) / 10) * 0.4;
  const gain = Math.round(q.contribution * bonus);
  d.contribution += gain;
  d.totalContribution += gain;
  d.quests[questId] = { day, claimed: true };
  logGood(state, `完成宗门任务「${q.name}」，获得宗门贡献 ${gain}。`);
  emit(EV.STATE);
  return { ok: true, gain };
}

export function claimAllQuests(state) {
  let total = 0;
  for (const q of SECT_QUESTS) {
    const r = claimQuest(state, q.id);
    if (r.ok) total += r.gain;
  }
  if (total) toast(`宗门贡献 +${total}`, 'good');
  return { ok: total > 0, total };
}

/* ------------------------------------------------------------------ */
/* 上缴材料换贡献                                                      */
/* ------------------------------------------------------------------ */
export function tribute(state, matId, qty = 1) {
  const d = sc(state);
  if (!d.id) return { ok: false, reason: '先拜入一个宗门。' };
  const mat = MATERIAL_MAP[matId];
  if (!mat) return { ok: false, reason: '这不是可上缴的材料。' };
  const have = countOf(state, matId);
  const n = Math.min(qty, have);
  if (n <= 0) return { ok: false, reason: '材料不足。' };

  removeItem(state, matId, n);
  const gain = tributeValue(mat) * n;
  d.contribution += gain;
  d.totalContribution += gain;
  d.tributes = (d.tributes || 0) + n;
  state.stats.tributes = (state.stats.tributes || 0) + 1;
  logGood(state, `向宗门上缴「${mat.name}」×${n}，得宗门贡献 ${gain}。`);
  emit(EV.STATE);
  return { ok: true, gain };
}

/* ------------------------------------------------------------------ */
/* 宗门秘传                                                            */
/* ------------------------------------------------------------------ */
export function secretView(state) {
  const d = sc(state);
  const sect = d.id ? SECT_MAP[d.id] : null;
  if (!sect) return [];
  return sect.secrets.map((sec, i) => {
    const owned = !!d.secrets[sec.id];
    // 真传弟子（rank 2）之后才开放第二、三项
    const rankOk = d.rank >= (i === 0 ? 0 : i === 1 ? 2 : 3);
    return {
      secret: sec,
      owned,
      rankOk,
      affordable: d.contribution >= sec.cost,
      canBuy: !owned && rankOk && d.contribution >= sec.cost,
    };
  });
}

export function buySecret(state, secretId) {
  const d = sc(state);
  if (!d.id) return { ok: false, reason: '先拜入一个宗门。' };
  const sect = SECT_MAP[d.id];
  const sec = sect.secrets.find((x) => x.id === secretId);
  if (!sec) return { ok: false, reason: '本门没有这项秘传。' };
  if (d.secrets[secretId]) return { ok: false, reason: '已参悟。' };
  const idx = sect.secrets.indexOf(sec);
  const needRank = idx === 0 ? 0 : idx === 1 ? 2 : 3;
  if (d.rank < needRank) {
    return { ok: false, reason: `需先晋阶至「${SECT_RANKS[needRank].name}」。` };
  }
  if (d.contribution < sec.cost) return { ok: false, reason: `宗门贡献不足（需 ${sec.cost}）。` };

  d.contribution -= sec.cost;
  d.secrets[secretId] = state.world.clockMs;
  logHl(state, `参悟宗门秘传「${sec.name}」—— ${sec.desc}`);
  toast(`秘传：${sec.name}`, 'good');
  emit(EV.STATE);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 宗门大比                                                            */
/* ------------------------------------------------------------------ */
export function baselinePower(state) {
  const b = baseAttrs(state.player.stage);
  return Math.round(b.atk * 3 + b.def * 2 + b.hpMax * 0.35 + b.spd * 4);
}

export function tournamentStatus(state) {
  const d = sc(state);
  const now = state.world.clockMs;
  const ready = !d.trialAt || now - d.trialAt >= SECT_TOURNAMENT.cooldownMs;
  const ratio = combatPower(state) / Math.max(1, baselinePower(state));
  const tier = SECT_TOURNAMENT.tiers.find((t) => ratio >= t.minRatio) || SECT_TOURNAMENT.tiers[SECT_TOURNAMENT.tiers.length - 1];
  return {
    ready,
    remainMs: ready ? 0 : Math.max(0, d.trialAt + SECT_TOURNAMENT.cooldownMs - now),
    ratio,
    tier,
    best: d.trialBest,
    stamina: SECT_TOURNAMENT.stamina,
    tiers: SECT_TOURNAMENT.tiers,
  };
}

export function challengeTournament(state) {
  const d = sc(state);
  if (!d.id) return { ok: false, reason: '先拜入一个宗门。' };
  const st = tournamentStatus(state);
  if (!st.ready) return { ok: false, reason: '本周大比已经结束了。' };
  if (state.player.stamina < SECT_TOURNAMENT.stamina) {
    return { ok: false, reason: `体力不足（需 ${SECT_TOURNAMENT.stamina}）。` };
  }

  state.player.stamina -= SECT_TOURNAMENT.stamina;
  const tier = st.tier;
  const stone = Math.round(SECT_TOURNAMENT.baseStone * tier.stoneMul
    * Math.pow(1.9, Math.floor(state.player.stage / 6)));
  const contribution = tier.contribution;

  d.contribution += contribution;
  d.totalContribution += contribution;
  d.trialAt = state.world.clockMs;
  d.trialBest = tier.id;
  state.currency.stone += stone;

  logHl(state, `宗门大比：${tier.name}（战力为同境界基准的 ${st.ratio.toFixed(2)} 倍）—— ${tier.desc} 获贡献 ${contribution}，灵石 ${fmtInt(stone)}。`);
  toast(`大比 · ${tier.name}`, tier.id === 'fail' ? 'warn' : 'good');
  emit(EV.STATE);
  return { ok: true, tier, contribution, stone, ratio: st.ratio };
}

/* ------------------------------------------------------------------ */
/* 月俸                                                                */
/* ------------------------------------------------------------------ */
export function grantStipend(state) {
  const d = sc(state);
  if (!d.id) return 0;
  const base = SECT_STIPEND[Math.max(0, Math.min(SECT_STIPEND.length - 1, d.rank))] || 0;
  const bonus = state.player.stage >= 30 ? 2 : 1;
  const amount = Math.round(base * bonus);
  state.currency.stone += amount;
  earn(state, 'stone', amount);
  state.stats.maxStone = Math.max(state.stats.maxStone || 0, state.currency.stone);
  logGood(state, `宗门月俸：灵石 +${fmtInt(amount)}。`);
  return amount;
}

/* ------------------------------------------------------------------ */
/* 加成汇总                                                            */
/* ------------------------------------------------------------------ */
/** 宗门加成实现在 character.sectMods（直接读原始数据，避免循环依赖），此处统一转出 */
export { sectMods };

export function sectSummary(state) {
  const d = sc(state);
  const sect = d.id ? SECT_MAP[d.id] : null;
  return {
    joined: !!sect,
    sect,
    sects: SECTS,
    contribution: d.contribution,
    totalContribution: d.totalContribution,
    rank: rankInfo(state),
    quests: questView(state),
    secrets: secretView(state),
    tournament: tournamentStatus(state),
    stipend: SECT_STIPEND[Math.max(0, Math.min(SECT_STIPEND.length - 1, d.rank))] || 0,
    mods: sectMods(state),
    tributes: d.tributes || 0,
  };
}

export { SECTS, SECT_MAP, SECT_RANKS, SECT_QUESTS, SECT_TOURNAMENT, tributeValue };
