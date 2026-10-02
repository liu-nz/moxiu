/**
 * beasts.js —— 战斗灵兽养成与出战（GDD 11.2）
 * 副本中捕捉获得，上阵 2 只，自动帮打。
 */

import { BATTLE_BEASTS, BEAST_MAP, DEPLOY_LIMIT, BEAST_MAX_LEVEL, beastUpgradeCost, captureChance, capturableBeasts } from '../data/beasts.js';
import { baseAttrs } from '../data/realms.js';
import { sectMods } from './character.js';
import { logGood, logHl, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { uid, fmtInt } from '../core/util.js';

export function ownedBeasts(state) {
  return (state.beasts?.owned || []).map((b) => ({
    ...b,
    def: BEAST_MAP[b.id],
    deployed: (state.beasts.deployed || []).includes(b.uid),
  })).filter((b) => b.def);
}

export function capture(state, beastId) {
  const def = BEAST_MAP[beastId];
  if (!def) return null;
  const b = { uid: uid('bs'), id: beastId, level: 1, at: state.world.clockMs };
  state.beasts.owned.push(b);
  logHl(state, `捕获灵兽「${def.name}」！`);
  if ((state.beasts.deployed || []).length < DEPLOY_LIMIT) deploy(state, b.uid, true);
  emit(EV.STATE);
  return b;
}

/** 副本通关后尝试捕捉 */
export function tryCapture(state, dungeonIndex, diffId, luckBonus = 0) {
  const pool = capturableBeasts(state.player.stage);
  if (!pool.length) return null;
  const captureBonus = 1 + (sectMods(state).captureChance || 0);
  const ch = Math.min(0.85, captureChance(dungeonIndex, diffId) * (1 + luckBonus) * captureBonus);
  if (Math.random() >= ch) return null;

  // 越靠后的副本越可能捕到高阶灵兽
  const maxTier = Math.min(pool.length, 1 + Math.floor(dungeonIndex * 0.7));
  const candidates = pool.slice(0, Math.max(1, maxTier));

  // 优先补齐尚未拥有的种类，避免一直重复同一只
  const ownedIds = new Set((state.beasts.owned || []).map((b) => b.id));
  const fresh = candidates.filter((b) => !ownedIds.has(b.id));
  const list = fresh.length ? fresh : candidates;
  const picked = list[Math.floor(Math.random() * list.length)];
  return capture(state, picked.id);
}

export function deploy(state, beastUid, silent = false) {
  if (!state.beasts.owned.some((b) => b.uid === beastUid)) return { ok: false, reason: '没有这只灵兽。' };
  const list = state.beasts.deployed || (state.beasts.deployed = []);
  if (list.includes(beastUid)) return { ok: false, reason: '已经在阵中了。' };
  if (list.length >= DEPLOY_LIMIT) {
    if (!silent) return { ok: false, reason: `最多上阵 ${DEPLOY_LIMIT} 只，先撤下一只。` };
    list.shift();
  }
  list.push(beastUid);
  if (!silent) emit(EV.STATE);
  return { ok: true };
}

export function undeploy(state, beastUid) {
  const list = state.beasts.deployed || [];
  const i = list.indexOf(beastUid);
  if (i < 0) return { ok: false };
  list.splice(i, 1);
  emit(EV.STATE);
  return { ok: true };
}

export function upgrade(state, beastUid) {
  const b = state.beasts.owned.find((x) => x.uid === beastUid);
  if (!b) return { ok: false, reason: '没有这只灵兽。' };
  if (b.level >= BEAST_MAX_LEVEL) return { ok: false, reason: '已至满级。' };
  const cost = beastUpgradeCost(b, b.level);
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };
  state.currency.stone -= cost;
  b.level += 1;
  logGood(state, `「${BEAST_MAP[b.id].name}」成长至 Lv.${b.level}。`);
  emit(EV.STATE);
  return { ok: true };
}

export function release(state, beastUid) {
  const i = state.beasts.owned.findIndex((x) => x.uid === beastUid);
  if (i < 0) return { ok: false };
  const b = state.beasts.owned[i];
  const gain = 200 * b.level;
  state.beasts.owned.splice(i, 1);
  state.beasts.deployed = (state.beasts.deployed || []).filter((u) => u !== beastUid);
  state.currency.stone += gain;
  toast(`放归「${BEAST_MAP[b.id].name}」，得 ${gain} 灵石`);
  emit(EV.STATE);
  return { ok: true };
}

/** 出战灵兽的战斗数据 */
export function deployedBeasts(state) {
  const list = state.beasts?.deployed || [];
  const base = baseAttrs(state.player.stage);
  const petPower = 1 + (sectMods(state).petPower || 0);
  return list
    .map((u) => state.beasts.owned.find((b) => b.uid === u))
    .filter(Boolean)
    .map((b) => {
      const def = BEAST_MAP[b.id];
      if (!def) return null;
      const lvMul = 1 + (b.level - 1) * 0.12;
      return {
        uid: b.uid,
        id: b.id,
        name: def.name,
        level: b.level,
        trait: def.trait,
        atk: Math.round(base.atk * def.atkRatio * lvMul * petPower),
        hp: Math.round(base.hpMax * def.hpRatio * lvMul * petPower),
        spd: base.spd * def.spd,
      };
    })
    .filter(Boolean);
}

/** 灵兽带来的战斗加成 */
export function beastBonuses(state) {
  const pets = deployedBeasts(state);
  const sm = sectMods(state);
  let dmgReduce = 0;
  let stoneBonus = 0;
  let battleDamage = 0;
  let bonusDrops = sm.bonusDrops || 0;
  for (const p of pets) {
    if (p.id === 'xuangui') dmgReduce += 0.08;
    if (p.id === 'pixiu') stoneBonus += 0.25;
    if (p.id === 'huofeng') battleDamage += 0.12;
    if (p.id === 'linghu' || p.id === 'canglang') battleDamage += 0.05;
  }
  return { pets, dmgReduce, stoneBonus, battleDamage, bonusDrops };
}

export { BATTLE_BEASTS, BEAST_MAP, DEPLOY_LIMIT, BEAST_MAX_LEVEL };
