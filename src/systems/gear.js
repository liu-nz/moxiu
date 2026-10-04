/**
 * gear.js —— 装备 / 功法 / 丹药 的穿戴与养成操作
 */

import { SLOT_MAP, enhanceCost, enhanceSuccess, ENHANCE_MAX, effectiveStats, tierOf } from '../data/equipment.js';
import { skillUpgradeCost } from '../data/skills.js';
import { techEquipment } from '../data/equipment.js';
import { ITEM_MAP, CONSUMABLE_MAP } from '../data/items.js';
import { computeAttrs, combatPower, guildMods } from './character.js';
import { applyBreakthroughPill } from './cultivation.js';
import { removeItem, removeEntry, addItem } from './inventory.js';
import { researchEffects } from '../data/research.js';
import { projectEffects } from '../data/projects.js';
import { pillEffect, pillDescription, PILL_QUALITY } from '../data/alchemy.js';
import { BREAKTHROUGH_PITY } from '../data/realms.js';
import { getPath, PATH_SWITCH_COST } from '../data/paths.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt, clamp } from '../core/util.js';

/* ---------------- 装备 ---------------- */
/** 用替换后的整套配装计算收益，不修改背包或槽位。 */
export function previewBuildSwap(state, kind, uid, slotKey) {
  let item, old, next;
  if (kind === 'equipment') {
    item = state.bag.find((e) => e.uid === uid);
    if (!item || !SLOT_MAP[item.slot]) return { ok: false, reason: '装备已不在装备库。' };
    old = state.equipment[item.slot];
    if(item.slot==='helmet' && state.equipment.helmet?.boundTo) return {ok:false,reason:'请先卸下动力装甲。'};
    next = { ...state, equipment: { ...state.equipment, [item.slot]: item } };
    if(item.rule==='powerarmor' || item.slot==='armor' && old?.rule==='powerarmor') next.equipment.helmet=null;
  } else if (kind === 'skill') {
    item = state.skillBag.find((s) => s.uid === uid);
    if (state.player.stage < 4 || !SKILL_SLOT_KEYS.includes(slotKey)
      || !item || item.slot !== slotTypeOf(slotKey)) return { ok: false, reason: '功法或槽位不可用。' };
    old = state.skills[slotKey];
    next = { ...state, skills: { ...state.skills, [slotKey]: item } };
  } else return { ok: false, reason: '未知配装类型。' };
  const before = computeAttrs(state), after = computeAttrs(next);
  const powerBefore = combatPower(state), powerAfter = combatPower(next);
  const changes = Object.keys(before).filter((k) => typeof before[k] === 'number' && Math.abs(after[k] - before[k]) > 1e-7)
    .map((key) => ({ key, before: before[key], after: after[key], delta: after[key] - before[key] }));
  return { ok: true, item, old, before, after, powerBefore, powerAfter, changes };
}

export function equipItem(state, eqUid) {
  const idx = state.bag.findIndex((e) => e.uid === eqUid);
  if (idx < 0) return { ok: false, reason: '找不到这件装备。' };
  const eq = state.bag[idx];
  const slot = eq.slot;
  if (!SLOT_MAP[slot]) return { ok: false, reason: '部位不合法。' };
  if(slot==='helmet' && state.equipment.helmet?.boundTo) return {ok:false,reason:'动力装甲占用头盔，请先卸下衣服槽的动力装甲。'};
  const old = state.equipment[slot];
  state.bag.splice(idx, 1);
  if(slot==='armor' && old?.rule==='powerarmor') state.equipment.helmet=null;
  if(eq.rule==='powerarmor') {
    const helmet=state.equipment.helmet;if(helmet && !helmet.boundTo)state.bag.push(helmet);
    state.equipment.helmet={uid:eq.uid+'_helmet',slot:'helmet',tier:eq.tier,name:'动力装甲·头部（绑定衣服）',enhance:0,stats:{},boundTo:eq.uid};
  }
  state.equipment[slot] = eq;
  if (old) state.bag.push(old);
  logGood(state, `装备「${eq.name}」于${SLOT_MAP[slot].name}。`);
  emit(EV.STATE);
  return { ok: true };
}

export function unequip(state, slotId) {
  const eq = state.equipment[slotId];
  if (!eq) return { ok: false, reason: '该部位为空。' };
  if(eq.boundTo) return {ok:false,reason:'这是动力装甲的绑定槽位，请操作衣服槽。'};
  if(slotId==='armor' && eq.rule==='powerarmor') state.equipment.helmet=null;
  state.equipment[slotId] = null;
  state.bag.push(eq);
  emit(EV.STATE);
  return { ok: true };
}

export function enhance(state, slotId) {
  const eq = state.equipment[slotId];
  if (!eq) return { ok: false, reason: '该部位为空。' };
  if(eq.boundTo) return {ok:false,reason:'这是动力装甲的绑定槽位，请操作衣服槽。'};
  if (eq.enhance >= ENHANCE_MAX) return { ok: false, reason: '已达 +15 上限。' };
  const attrs = computeAttrs(state);
  const cost = Math.round(enhanceCost(eq.enhance) * (1 - Math.min(0.25, attrs.forge * 0.5)));
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };

  state.currency.stone -= cost;
  const base = enhanceSuccess(eq.enhance);
  const rate = clamp(base + attrs.forge * 0.5, 0, 1);

  if (Math.random() < rate) {
    eq.enhance += 1;
    logGood(state, `「${eq.name}」强化成功 → +${eq.enhance}。`);
    toast(`强化成功 +${eq.enhance}`, 'good');
  } else {
    logWarn(state, `「${eq.name}」强化失败（材料已耗）。`);
    toast('强化失败', 'warn');
  }
  emit(EV.STATE);
  return { ok: true };
}

export function enhancePreview(state, slotId) {
  const eq = state.equipment[slotId];
  if (!eq) return null;
  const attrs = computeAttrs(state);
  const cost = Math.round(enhanceCost(eq.enhance) * (1 - Math.min(0.25, attrs.forge * 0.5)));
  const rate = clamp(enhanceSuccess(eq.enhance) + attrs.forge * 0.5, 0, 1);
  return { cost, rate, maxed: eq.enhance >= ENHANCE_MAX };
}

export function scrapEquipment(state, eqUid) {
  const idx = state.bag.findIndex((e) => e.uid === eqUid);
  if (idx < 0) return { ok: false };
  const eq = state.bag[idx];
  const gain = Math.round(20 * (1 + ['common', 'fine', 'rare', 'epic', 'legend'].indexOf(eq.tier) * 0.8) * (1 + eq.enhance * 0.1));
  state.bag.splice(idx, 1);
  state.currency.stone += gain;
  toast(`分解「${eq.name}」得 ${gain} 灵石`);
  emit(EV.STATE);
  return { ok: true, gain };
}

/* ---------------- 道途切换（GDD 8：中期通过道具或轮回切换） ---------------- */
const FREE_SWITCH_WINDOW = 7 * 24 * 3600 * 1000;

export function pathSwitchStatus(state) {
  const fx = researchEffects(state);
  const pj = projectEffects(state);
  const last = state.reincarnation?.freePathSwitchAt || 0;
  const unlocked = !!fx.freePathSwitch || !!pj.freePathSwitch;
  // 天机推演台一旦建成，就不再受每周一次的限制
  const unlimited = !!pj.freePathSwitch;
  const freeReady = unlocked
    && (unlimited || !last || state.world.clockMs - last >= FREE_SWITCH_WINDOW);
  return {
    freeReady,
    freeUnlocked: unlocked,
    unlimited,
    nextFreeMs: freeReady ? 0 : Math.max(0, last + FREE_SWITCH_WINDOW - state.world.clockMs),
    cost: PATH_SWITCH_COST.stone,
    affordable: state.currency.stone >= PATH_SWITCH_COST.stone,
  };
}

export function switchPath(state, pathId) {
  const p = getPath(pathId);
  if (!p) return { ok: false, reason: '没有这条道途。' };
  if (state.path === pathId) return { ok: false, reason: '你已在此道。' };

  if (!state.path) {
    state.path = pathId;
    logGood(state, `初次择道：「${p.name}」。`);
    emit(EV.STATE);
    return { ok: true, free: true, first: true };
  }

  const st = pathSwitchStatus(state);
  if (st.freeReady) {
    state.reincarnation.freePathSwitchAt = state.world.clockMs;
    state.path = pathId;
    logGood(state, `灵科「技能分支预测」每周免费重选一次——本次改修「${p.name}」不耗灵石。`);
    emit(EV.STATE);
    return { ok: true, free: true };
  }

  if (state.currency.stone < st.cost) {
    return { ok: false, reason: `改修需要 ${fmtInt(st.cost)} 灵石（或等待每周一次的免费重选）。` };
  }
  state.currency.stone -= st.cost;
  state.path = pathId;
  logGood(state, `耗 ${fmtInt(st.cost)} 灵石，改修「${p.name}」之道。`);
  emit(EV.STATE);
  return { ok: true, free: false, cost: st.cost };
}

/* ---------------- 现代跨界装备 ---------------- */
export function equipTech(state, itemId) {
  const item = ITEM_MAP[itemId];
  if (!item || !item.equip) return { ok: false, reason: '这不是可装备的现代器物。' };
  if (state.tech.some((t) => t.itemId === itemId)) return { ok: false, reason: '已经带在身上了。' };
  if (removeItem(state, itemId, 1) < 1) return { ok: false, reason: '背包里没有这件东西。' };
  const eq = techEquipment(item);
  state.tech.push(eq);
  logGood(state, `随身携带「${item.name}」（跨界装备，不占背包载重）。`);
  emit(EV.STATE);
  return { ok: true };
}

export function unequipTech(state, itemId) {
  const idx = state.tech.findIndex((t) => t.itemId === itemId);
  if (idx < 0) return { ok: false, reason: '没有随身携带这件东西。' };
  state.tech.splice(idx, 1);
  addItem(state, itemId, 1);
  toast(`收起「${ITEM_MAP[itemId]?.name || itemId}」，已放回背包。`);
  emit(EV.STATE);
  return { ok: true };
}

/* ---------------- 功法 ---------------- */
export const SKILL_SLOT_KEYS = ['heart', 'move1', 'move2', 'special'];
export const SKILL_SLOT_LABEL = { heart: '心法', move1: '招式·一', move2: '招式·二', special: '特殊' };

export function slotTypeOf(key) {
  return key.startsWith('move') ? 'move' : key;
}

export function equipSkill(state, skillUid, slotKey) {
  if (!SKILL_SLOT_KEYS.includes(slotKey)) return { ok: false, reason: '槽位不合法。' };
  if (state.player.stage < 4) return { ok: false, reason: '炼气五层解锁功法系统。' };
  const idx = state.skillBag.findIndex((s) => s.uid === skillUid);
  if (idx < 0) return { ok: false, reason: '找不到这本功法。' };
  const sk = state.skillBag[idx];
  if (slotTypeOf(slotKey) !== sk.slot) {
    return { ok: false, reason: `《${sk.name}》属于「${sk.slot === 'heart' ? '心法' : sk.slot === 'move' ? '招式' : '特殊'}」槽。` };
  }
  const old = state.skills[slotKey];
  state.skillBag.splice(idx, 1);
  state.skills[slotKey] = sk;
  if (old) state.skillBag.push(old);
  logGood(state, `参悟「${sk.name}」于${SKILL_SLOT_LABEL[slotKey]}槽。`);
  emit(EV.STATE);
  return { ok: true };
}

export function unequipSkill(state, slotKey) {
  const sk = state.skills[slotKey];
  if (!sk) return { ok: false };
  state.skills[slotKey] = null;
  state.skillBag.push(sk);
  emit(EV.STATE);
  return { ok: true };
}

export function upgradeSkill(state, slotKey) {
  const sk = state.skills[slotKey];
  if (!sk) return { ok: false, reason: '该槽为空。' };
  if (sk.level >= sk.maxLevel) return { ok: false, reason: '已至圆满。' };
  const cost = skillUpgradeCost(sk);
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };
  state.currency.stone -= cost;
  sk.level += 1;
  logGood(state, `「${sk.name}」参悟至第 ${sk.level} 重。`);
  emit(EV.STATE);
  return { ok: true };
}

export function scrapSkill(state, skillUid) {
  const idx = state.skillBag.findIndex((s) => s.uid === skillUid);
  if (idx < 0) return { ok: false };
  const sk = state.skillBag[idx];
  const gain = 60 * (1 + sk.level);
  state.skillBag.splice(idx, 1);
  state.currency.stone += gain;
  toast(`散功得 ${gain} 灵石`);
  emit(EV.STATE);
  return { ok: true, gain };
}

/* ---------------- 丹药 ---------------- */
export function useConsumable(state, id, entryUid = null) {
  const c = CONSUMABLE_MAP[id];
  if (!c) return { ok: false, reason: '没有这种丹药。' };
  const entry = entryUid !== null ? state.inventory.find(e => e.uid === entryUid && e.itemId === id) :
    state.inventory.filter(e => e.itemId === id && e.qty > 0).sort((a, b) => (PILL_QUALITY[a.quality]?.potency || 1) - (PILL_QUALITY[b.quality]?.potency || 1))[0];
  if (!entry || entry.qty < 1) return { ok: false, reason: '背包里没有这枚丹药。' };
  const e = pillEffect(id, entry.quality), now = state.world.clockMs;
  const maxStamina = 100 + (guildMods(state).staminaMax || 0);
  if (e.type === 'stamina' && state.player.stamina >= maxStamina) return { ok: false, reason: '体力已满，丹药已保留。' };
  if (e.type === 'pity' && state.player.breakthroughFails >= BREAKTHROUGH_PITY) return { ok: false, reason: '下次突破已保底，丹药已保留。' };
  const isCultPill = b => b.id === 'ning_shen' || b.id === 'cult_pill';
  if (e.type === 'cultivation_boost') {
    const active = state.player.buffs.find(b => isCultPill(b) && b.until > now);
    if (active && ((active.mods.cultSpeed || 0) > e.add || (active.mods.cultSpeed === e.add && active.until >= now + e.durationMs))) {
      return { ok: false, reason: '当前丹药效果更强或仍覆盖完整时长，已保留这枚丹药。' };
    }
  }
  if(e.type==='battle_poison' && state.player.buffs.some(b=>b.id==='poison_pill' && b.until>=now+e.durationMs))return {ok:false,reason:'蚀灵丹仍覆盖完整时长，丹药已保留。'};
  removeEntry(state, entry.uid, 1);
  if (e.type === 'breakthrough') applyBreakthroughPill(state, e.add);
  else {
    state.player.pillsUsed = (state.player.pillsUsed || 0) + 1;
    if(e.type==='battle_poison'){state.player.buffs=state.player.buffs.filter(b=>b.id!=='poison_pill');state.player.buffs.push({id:'poison_pill',name:c.name,until:now+e.durationMs,mods:{}});}
    if (e.type === 'stamina') state.player.stamina = Math.min(maxStamina, state.player.stamina + e.add);
    if (e.type === 'pity') state.player.breakthroughFails = Math.min(BREAKTHROUGH_PITY, state.player.breakthroughFails + e.add);
    if (e.type === 'cultivation_boost') {
      state.player.buffs = state.player.buffs.filter(b => !isCultPill(b));
      state.player.buffs.push({ id: 'cult_pill', name: c.name, sourceItem: id, until: now + e.durationMs, mods: { cultSpeed: e.add } });
    }
  }
  logGood(state, `服下「${PILL_QUALITY[entry.quality]?.name || '普通'}${c.name}」：${pillDescription(id, entry.quality)}。`);
  emit(EV.STATE);
  return { ok: true, effect: e };
}

export { tierOf, effectiveStats };
