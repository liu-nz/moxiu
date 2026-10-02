/**
 * guild.js —— 道盟与跨界商会（GDD 15）
 *
 * 道盟：NPC 公会。加入后享受专精加成，可做每日集体任务攒贡献，
 *       用贡献在道盟商店兑换；每周可挑战一次盟中试炼（道盟 BOSS）。
 * 跨界商会：一次性入会，提供贸易税率减免与专属商品。
 */

import { GUILDS, GUILD_MAP, GUILD_QUESTS, GUILD_SHOP, GUILD_SHOP_MAP, GUILD_BOSS, CHAMBER } from '../data/guild.js';
import { ITEM_MAP, MATERIAL_MAP, CONSUMABLE_MAP } from '../data/items.js';
import { riftDayIndex } from '../core/clock.js';
import { dailyDelta } from './daily.js';
import { addItem } from './inventory.js';
import { cultivationRate, computeAttrs, guildMods, chamberMods } from './character.js';
import { logGood, logHl, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, clamp } from '../core/util.js';

/** 道盟专精加成 / 商会加成（实现在 character.js，这里统一转出，避免两处逻辑漂移） */
export { guildMods, chamberMods };

function gs(state) {
  if (!state.social) state.social = {};
  if (!state.social.guild) {
    state.social.guild = { id: null, contribution: 0, totalContribution: 0, quests: {}, shopBought: {}, bossAt: 0, bossBest: 0 };
  }
  return state.social.guild;
}

export function chamberJoined(state) {
  return !!state.social?.chamber?.joined;
}

/* ------------------------------------------------------------------ */
/* 道盟                                                                */
/* ------------------------------------------------------------------ */
export function joinGuild(state, id) {
  const g = GUILD_MAP[id];
  if (!g) return { ok: false, reason: '没有这个道盟。' };
  const s = gs(state);
  if (s.id) return { ok: false, reason: '你已经入盟了。' };
  if (state.currency.stone < g.joinCost.stone) {
    return { ok: false, reason: `入盟需 ${fmtInt(g.joinCost.stone)} 灵石。` };
  }
  state.currency.stone -= g.joinCost.stone;
  s.id = id;
  s.contribution += 30;
  logHl(state, `你加入了「${g.name}」—— ${g.perk}。`);
  toast(`加入 ${g.name}`, 'good');
  emit(EV.STATE);
  return { ok: true };
}

export function leaveGuild(state) {
  const s = gs(state);
  if (!s.id) return { ok: false, reason: '尚未入盟。' };
  const name = GUILD_MAP[s.id]?.name;
  s.id = null;
  s.quests = {};
  logGood(state, `你退出了「${name}」。`);
  emit(EV.STATE);
  return { ok: true };
}

/** 道盟专精加成（内部使用，等价于 character.guildMods） */
function guildModsOf(state) {
  const s = gs(state);
  const g = s.id ? GUILD_MAP[s.id] : null;
  return g ? { ...g.mods } : {};
}

/** 任务进度：目标值随玩家当前产出水平自动缩放 */
export function questProgress(state, quest) {
  const d = dailyDelta(state);
  const attrs = computeAttrs(state);

  switch (quest.metric) {
    case 'dungeons': return { cur: d.dungeons, goal: quest.goal, unit: '次' };
    case 'trades': return { cur: d.trades, goal: quest.goal, unit: '笔' };
    case 'soldQty': return { cur: d.soldQty, goal: quest.goal, unit: '件' };
    case 'crafts': return { cur: d.crafts, goal: quest.goal, unit: '次' };
    case 'cultRatio': {
      const perHour = cultivationRate(state, attrs) * 3600;
      return { cur: d.cultGained, goal: Math.max(1, perHour * quest.goal), unit: '修为', ratio: true };
    }
    case 'incomeRatio': {
      // 以 1 小时被动收入（现代侧）折算成灵石等值作为目标
      const hourly = Math.max(50, state.currency.cny * 0.02);
      const got = d.stoneEarned + d.cnyEarned / 40;
      return { cur: got, goal: hourly * quest.goal, unit: '灵石等值', ratio: true };
    }
    default: return { cur: 0, goal: quest.goal, unit: '' };
  }
}

export function questView(state) {
  const s = gs(state);
  const day = riftDayIndex(state.world.clockMs);
  return GUILD_QUESTS.map((q) => {
    const rec = s.quests[q.id];
    const claimedToday = rec && rec.day === day && rec.claimed;
    const p = questProgress(state, q);
    const done = p.cur >= p.goal;
    return { quest: q, progress: p, done, claimed: claimedToday, claimable: done && !claimedToday };
  });
}

export function claimQuest(state, questId) {
  const s = gs(state);
  if (!s.id) return { ok: false, reason: '先加入一个道盟。' };
  const q = GUILD_QUESTS.find((x) => x.id === questId);
  if (!q) return { ok: false, reason: '没有这个任务。' };
  const day = riftDayIndex(state.world.clockMs);
  const rec = s.quests[questId];
  if (rec && rec.day === day && rec.claimed) return { ok: false, reason: '今日已领取。' };

  const p = questProgress(state, q);
  if (p.cur < p.goal) return { ok: false, reason: '任务尚未完成。' };

  const bonus = 1 + Math.floor((state.player.stage || 0) / 10) * 0.35;
  const gain = Math.round(q.contribution * bonus);
  s.contribution += gain;
  s.totalContribution += gain;
  s.quests[questId] = { day, claimed: true };
  logGood(state, `完成道盟任务「${q.name}」，获得贡献 ${gain}。`);
  toast(`道盟贡献 +${gain}`, 'good');
  emit(EV.STATE);
  return { ok: true, gain };
}

export function claimAllQuests(state) {
  let total = 0;
  for (const q of GUILD_QUESTS) {
    const r = claimQuest(state, q.id);
    if (r.ok) total += r.gain;
  }
  return { ok: total > 0, total };
}

export function shopView(state) {
  const s = gs(state);
  const day = riftDayIndex(state.world.clockMs);
  return GUILD_SHOP.map((item) => {
    const rec = s.shopBought[item.id];
    const boughtToday = rec && rec.day === day ? rec.n : 0;
    return {
      item,
      boughtToday,
      locked: state.player.stage < item.unlockStage,
      affordable: s.contribution >= item.contribution,
    };
  });
}

export function buyFromShop(state, shopId) {
  const s = gs(state);
  if (!s.id) return { ok: false, reason: '先加入一个道盟。' };
  const item = GUILD_SHOP_MAP[shopId];
  if (!item) return { ok: false, reason: '没有这件物品。' };
  if (state.player.stage < item.unlockStage) return { ok: false, reason: '境界不足，宗门不发货。' };
  if (s.contribution < item.contribution) return { ok: false, reason: `贡献不足（需 ${item.contribution}）。` };

  const day = riftDayIndex(state.world.clockMs);
  const rec = s.shopBought[shopId];
  const boughtToday = rec && rec.day === day ? rec.n : 0;
  const dailyLimit = 3;
  if (boughtToday >= dailyLimit) return { ok: false, reason: `每日限购 ${dailyLimit} 次。` };

  s.contribution -= item.contribution;
  s.shopBought[shopId] = { day, n: boughtToday + 1 };
  addItem(state, item.out, item.qty, 'common');
  const name = ITEM_MAP[item.out]?.name || MATERIAL_MAP[item.out]?.name || CONSUMABLE_MAP[item.out]?.name || item.out;
  logGood(state, `以 ${item.contribution} 贡献换取「${name}」×${item.qty}。`);
  emit(EV.STATE);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 道盟 BOSS（每周试炼）                                                */
/* ------------------------------------------------------------------ */
export function bossStatus(state) {
  const s = gs(state);
  const now = state.world.clockMs;
  const ready = !s.bossAt || now - s.bossAt >= GUILD_BOSS.cooldownMs;
  return {
    ready,
    nextAt: s.bossAt ? s.bossAt + GUILD_BOSS.cooldownMs : now,
    remainMs: ready ? 0 : Math.max(0, s.bossAt + GUILD_BOSS.cooldownMs - now),
    best: s.bossBest || 0,
    stamina: GUILD_BOSS.stamina,
    ranks: GUILD_BOSS.ranks,
  };
}

/** 挑战盟中试炼：伤害由战力与所选择的打法决定 */
export function challengeBoss(state, rankId = 'steady') {
  const s = gs(state);
  if (!s.id) return { ok: false, reason: '先加入一个道盟。' };
  const st = bossStatus(state);
  if (!st.ready) return { ok: false, reason: '本周已经挑战过了。' };
  if (state.player.stamina < GUILD_BOSS.stamina) {
    return { ok: false, reason: `体力不足（需 ${GUILD_BOSS.stamina}）。` };
  }

  const rank = GUILD_BOSS.ranks.find((r) => r.id === rankId) || GUILD_BOSS.ranks[0];
  state.player.stamina -= GUILD_BOSS.stamina;

  const attrs = computeAttrs(state);
  const power = attrs.atk * 3 + attrs.def * 2 + attrs.hpMax * 0.35
    + attrs.skillPower * 900 + attrs.critRate * 1200 + attrs.critDmg * 500;
  const rounds = 20;
  const damage = Math.round(power * rank.mul * rounds * (0.85 + Math.random() * 0.3));
  const contribution = Math.max(20, Math.round(damage / GUILD_BOSS.damageToContribution));

  s.contribution += contribution;
  s.totalContribution += contribution;
  s.bossAt = state.world.clockMs;
  s.bossBest = Math.max(s.bossBest || 0, damage);

  logHl(state, `挑战盟中试炼（${rank.name}）：打出伤害 ${fmtInt(damage)}，获贡献 ${contribution}。`);
  toast(`试炼伤害 ${fmtInt(damage)}`, 'good');
  emit(EV.STATE);
  return { ok: true, damage, contribution, rank };
}

/* ------------------------------------------------------------------ */
/* 跨界商会                                                            */
/* ------------------------------------------------------------------ */
export function joinChamber(state) {
  if (!state.social) state.social = {};
  if (!state.social.chamber) state.social.chamber = { joined: false, joinedAt: 0 };
  const c = state.social.chamber;
  if (c.joined) return { ok: false, reason: '你已经是商会的人了。' };
  if (state.currency.stone < CHAMBER.joinCost.stone) {
    return { ok: false, reason: `入会需 ${fmtInt(CHAMBER.joinCost.stone)} 灵石。` };
  }
  state.currency.stone -= CHAMBER.joinCost.stone;
  c.joined = true;
  c.joinedAt = state.world.clockMs;
  logHl(state, `你加入了「${CHAMBER.name}」—— ${CHAMBER.perkText.join('、')}。`);
  toast('加入跨界商会', 'good');
  emit(EV.STATE);
  return { ok: true };
}

/** 商会加成汇总见 character.chamberMods（此处已统一转出） */

export function guildSummary(state) {
  const s = gs(state);
  const g = s.id ? GUILD_MAP[s.id] : null;
  return {
    joined: !!g,
    guild: g,
    contribution: s.contribution,
    totalContribution: s.totalContribution,
    quests: questView(state),
    shop: shopView(state),
    boss: bossStatus(state),
    mods: guildMods(state),
    chamber: {
      joined: chamberJoined(state),
      def: CHAMBER,
      cost: CHAMBER.joinCost.stone,
    },
    guilds: GUILDS,
  };
}

export { GUILDS, GUILD_MAP, GUILD_QUESTS, GUILD_BOSS, CHAMBER, GUILD_SHOP };
