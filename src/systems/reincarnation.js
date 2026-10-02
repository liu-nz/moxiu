/**
 * reincarnation.js —— 轮回与天命（GDD 16）
 *
 * 渡劫大圆满 → 飞升 → 结算轮回点 → 选择天命 → 开启下一轮。
 * 保留：轮回点、图鉴、永久加成、道侣缘分、灵科研究（知识与关系不随轮回消散）。
 * 重置：境界、修为、货币、背包、装备、功法、灵田、牧场、灵兽、副本进度、地产。
 */

import { FATES, FATE_MAP, BLESSINGS, BLESSING_MAP, CODEX, settleReincarnation } from '../data/fates.js';
import { REALMS, FLAT_STAGES } from '../data/realms.js';
import { rollEquipment } from '../data/equipment.js';
import { createInitialState, SIDE } from '../core/state.js';
import { logHl, logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

export function canAscend(state) {
  return state.player.stage >= FLAT_STAGES.length - 1;
}

export function ascensionPreview(state) {
  return settleReincarnation(state);
}

/** 飞升：结算并重置 */
export function ascend(state) {
  if (!canAscend(state)) return { ok: false, reason: '尚未到渡劫大圆满。' };
  const settle = settleReincarnation(state);

  state.reincarnation.count += 1;
  state.reincarnation.points += settle.total;
  state.reincarnation.earned += settle.total;

  // 图鉴解锁
  for (const c of CODEX) state.reincarnation.codex[c.id] = true;

  const kept = {
    points: state.reincarnation.points,
    count: state.reincarnation.count,
    companions: state.companions,
    research: state.research,
    estate: state.estate,
    tales: state.tales,
    blessings: state.reincarnation.blessings,
    codex: state.reincarnation.codex,
  };

  // 重置本世
  state.player.stage = 0;
  state.player.cultivation = 0;
  state.player.totalCultivation = 0;
  state.player.hp = null;
  state.player.mp = null;
  state.player.stamina = 100;
  state.player.staminaAcc = 0;
  state.player.breakthroughFails = 0;
  state.player.breakthroughBuff = 0;
  state.player.buffs = [];
  state.player.pillsUsed = 0;

  state.currency.stone = 0;
  state.currency.cny = 2000;
  state.inventory = [];
  state.equipment = { weapon: null, helmet: null, armor: null, boots: null, ring1: null, ring2: null, artifact: null };
  state.tech = [];
  state.bag = [];
  state.skills = { heart: null, move1: null, move2: null, special: null };
  state.skillBag = [];

  state.farm = { plots: [], unlocked: 3 };
  state.ranch = { slots: [], unlocked: 2 };
  state.beasts = { owned: [], deployed: [] };
  state.crafting = { autoAlchemy: false, lastAutoAt: 0, totalPills: state.crafting?.totalPills || 0, totalForged: state.crafting?.totalForged || 0 };
  state.dungeon = { cleared: {}, runs: 0, fails: 0, log: [] };

  state.rift.gateLevel = 1;
  state.rift.crossings = 0;
  state.rift.day = null;
  state.rift.startDay = null;
  state.side = SIDE.MODERN;

  // 研究点保留一半（知识仍在，但需要重新积累）
  state.research.points = Math.floor((kept.research?.points || 0) * 0.5);

  state.tutorial.step = 0;
  state.tutorial.done = {};

  // 天命
  if (!state.reincarnation.fate) state.reincarnation.fate = null;

  logHl(state, `飞升轮回：第 ${state.reincarnation.count} 世结束，获得轮回点 ${settle.total}（累计 ${state.reincarnation.points}）。`);
  emit(EV.STATE);
  return { ok: true, settle };
}

/** 选择天命（开启新一轮前必须选） */
export function chooseFate(state, fateId) {
  const f = FATE_MAP[fateId];
  if (!f) return { ok: false, reason: '没有这个天命。' };
  state.reincarnation.fate = fateId;

  // 天命开局资源
  const mods = f.mods || {};
  if (mods.startCny) state.currency.cny = mods.startCny;
  if (mods.startStone) state.currency.stone = mods.startStone;
  if (mods.startPlots) state.farm.unlocked = Math.max(state.farm.unlocked, 3 + mods.startPlots);

  if (mods.startWeaponTier !== undefined) {
    const eq = rollEquipment('weapon', mods.startWeaponTier, 24);
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
