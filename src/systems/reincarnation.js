/**
 * reincarnation.js —— 轮回与天命（GDD 16）
 *
 * 渡劫大圆满 → 飞升 → 结算轮回点 → 选择天命 → 开启下一轮。
 * 保留：轮回点、图鉴、永久加成、道侣缘分、灵科研究（知识与关系不随轮回消散）。
 * 重置：境界、修为、货币、背包、装备、功法、灵田、牧场、灵兽、副本进度、地产。
 */

import { FATES, FATE_MAP, BLESSINGS, BLESSING_MAP, CODEX, settleReincarnation } from '../data/fates.js';
import { FLAT_STAGES, stageInfo } from '../data/realms.js';
import { rollEquipment } from '../data/equipment.js';
import { createInitialState } from '../core/state.js';
import { logHl, logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { ensureDay } from './rift.js';
import { markCollection } from './collection.js';

export const ASCENSION_RESET = '境界与修为、货币与本世统计、背包与配装、灵田牧场灵兽、炼制与副本、职业商业地产、宗门道盟商会、生活工程、界门与自动设置';
export const ASCENSION_KEEP = '轮回点与累计点数、图鉴与永久天赋、道侣缘分、已完成研究及一半研究点（实验室重建）、奇闻见闻与历史最佳名次';

export function fateChoicePending(state) {
  const r = state.reincarnation;
  return !!r && r.count > 0 && !r.fate && (r.awaitingFate || state.player.stage === 0);
}

export function canAscend(state) {
  return state.player.stage === FLAT_STAGES.length - 1
    && state.player.cultivation >= stageInfo(state.player.stage).stage.need
    && state.player.ascensionReady === true;
}

export function ascensionPreview(state) {
  return settleReincarnation(state);
}

/** 飞升：结算并重置 */
export function ascend(state) {
  if (!canAscend(state)) return { ok: false, reason: '需渡劫大圆满修为圆满，并在修炼页成功渡过雷劫。' };
  const settle = settleReincarnation(state);

  const old = state.reincarnation;
  const next = createInitialState(state.world.clockMs);
  next.createdAt = state.createdAt;
  next.savedAt = state.savedAt;
  next.playMs = state.playMs;
  next.world = { ...state.world };
  next.reincarnation = {
    ...next.reincarnation, count: old.count + 1, points: old.points + settle.total,
    earned: old.earned + settle.total, blessings: { ...old.blessings },
    codex: { ...old.codex }, awaitingFate: true,
  };
  for (const c of CODEX) next.reincarnation.codex[c.id] = true;
  next.companions = structuredClone(state.companions);
  next.collection = structuredClone(state.collection || next.collection);
  next.market.quoteLockDay=state.market.quoteLockDay;
  next.commissions.relations = {...state.commissions?.relations};
  next.commissions.chains = {...state.commissions?.chains};
  next.commissions.total = state.commissions?.total || 0;
  next.commissions.sources = [...(state.commissions?.sources || [])];
  next.commissions.history = structuredClone(state.commissions?.history || []);
  next.research.done = { ...state.research.done };
  next.research.points = Math.floor((state.research.points || 0) * 0.5);
  next.tales.seen = { ...state.tales?.seen };
  next.tales.count = state.tales?.count || 0;
  next.tales.history = structuredClone(state.tales?.history || []);
  next.tales.flags = { ...state.tales?.flags };
  next.social.ranking.bestRanks = { ...state.social?.ranking?.bestRanks };
  // 按新开局统一重置，避免新系统意外继承上世资产或任务。
  Object.assign(state, next);
  ensureDay(state, { silent: true });

  logHl(state, `飞升轮回：第 ${state.reincarnation.count} 世结束，获得轮回点 ${settle.total}（累计 ${state.reincarnation.points}）。`);
  emit(EV.STATE);
  return { ok: true, settle };
}

/** 选择天命（开启新一轮前必须选） */
export function chooseFate(state, fateId) {
  if (!fateChoicePending(state)) return { ok: false, reason: '天命仅在轮回开局选择一次，本世不可改选或重复领取。' };
  const f = FATE_MAP[fateId];
  if (!f) return { ok: false, reason: '没有这个天命。' };
  state.reincarnation.fate = fateId;
  state.reincarnation.awaitingFate = false;

  // 天命开局资源
  const mods = f.mods || {};
  if (mods.startCny) state.currency.cny += mods.startCny - 2000;
  if (mods.startStone) state.currency.stone += mods.startStone;
  if (mods.startPlots) state.farm.unlocked = Math.max(state.farm.unlocked, 3 + mods.startPlots);

  if (mods.startWeaponTier !== undefined) {
    const eq = rollEquipment('weapon', mods.startWeaponTier, 24);
    markCollection(state, 'equipment', `${eq.slot}:${eq.tier}`);
    eq.name = '天命·' + eq.name;
    state.bag.push(eq);
  }

  logHl(state, `天命既定：「${f.name}」—— ${f.effect}`);
  toast(`天命：${f.name}`, 'good');
  emit(EV.STATE);
  return { ok: true, fate: f };
}

/** 永久加成效果 */
export function blessingEffects(state) {
  const b = state.reincarnation?.blessings || {};
  const fate = state.reincarnation?.fate ? FATE_MAP[state.reincarnation.fate] : null;
  const fm = fate?.mods || {};
  return {
    cultSpeed: (b.cult || 0) * 0.06 + (fm.cultSpeedAdd || 0),
    atkMul: (b.atk || 0) * 0.06 + (fm.atkMul || 0),
    hpMul: (b.hp || 0) * 0.08,
    tradeProfit: (b.trade || 0) * 0.05 + (fm.tradeProfitAdd || 0),
    fortune: (b.fortune || 0) * 0.05,
    gateCarry: (b.gate || 0) * 1,
    alchemy: fm.alchemyAdd || 0,
    shopIncomeMul: fm.shopIncomeMul || 0,
    breakthroughAdd: fm.breakthroughAdd || 0,
  };
}

export function buyBlessing(state, id) {
  const def = BLESSING_MAP[id];
  if (!def) return { ok: false, reason: '没有这项天赋。' };
  const lv = state.reincarnation.blessings[id] || 0;
  if (lv >= def.max) return { ok: false, reason: '已至满级。' };
  const cost = def.costOf(lv);
  if (state.reincarnation.points < cost) return { ok: false, reason: `轮回点不足（需 ${cost}）。` };
  state.reincarnation.points -= cost;
  state.reincarnation.blessings[id] = lv + 1;
  logGood(state, `天赋「${def.name}」提升至 Lv.${lv + 1}。`);
  emit(EV.STATE);
  return { ok: true };
}

export function codexView(state) {
  return CODEX.map((c) => ({ ...c, unlocked: !!state.reincarnation?.codex?.[c.id] }));
}

export { FATES, FATE_MAP, BLESSINGS, BLESSING_MAP, CODEX };
