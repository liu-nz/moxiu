/**
 * companion.js —— 道侣系统（GDD 12）
 * 好感度五阶段：相识 → 好友 → 知己 → 道侣 → 同心。
 * 好感度达到「知己」后，道侣开始替你干活（离线自动化）。
 */

import { COMPANIONS, COMPANION_MAP, affectionStage, AFFECTION_STAGES, GIFT, companionBonuses } from '../data/companions.js';
import { MATERIAL_MAP, ITEM_MAP, CONSUMABLE_MAP } from '../data/items.js';
import { countOf, removeItem } from './inventory.js';
import { logGood, logHl, toast } from './log.js';
import { updateTutorial } from './tutorial.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

export function ensure(state) {
  if (!state.companions) state.companions = {};
  for (const c of COMPANIONS) {
    if (!state.companions[c.id]) {
      state.companions[c.id] = { affection: 0, gifts: 0, met: false };
    }
  }
  return state.companions;
}

export function unlockedCompanions(state) {
  return COMPANIONS.filter((c) => state.player.stage >= c.unlockStage);
}

export function companionView(state, id) {
  const c = COMPANION_MAP[id];
  if (!c) return null;
  const data = state.companions?.[id] || { affection: 0, gifts: 0, met: false };
  const stage = affectionStage(data.affection);
  const idx = AFFECTION_STAGES.indexOf(stage);
  const next = AFFECTION_STAGES[idx + 1] || null;
  const bonus = companionBonuses(state, id);
  return {
    def: c,
    affection: data.affection,
    gifts: data.gifts,
    met: data.met,
    stage,
    next,
    unlocked: state.player.stage >= c.unlockStage,
    bonus,
    giftItem: c.gift,
    giftHint: c.giftHint || '',
    giftName: ITEM_MAP[c.gift]?.name || MATERIAL_MAP[c.gift]?.name || CONSUMABLE_MAP[c.gift]?.name || c.gift,
    giftHave: countOf(state, c.gift),
    stoneCost: GIFT.costFor(data.affection),
    dutyOn: bonus.dutiesOn,
  };
}

export function meet(state, id) {
  ensure(state);
  const d = state.companions[id];
  if (!d || d.met) return { ok: false };
  d.met = true;
  d.affection = Math.max(d.affection, 2);
  logHl(state, `你结识了「${COMPANION_MAP[id].name}」。`);
  emit(EV.STATE);
  return { ok: true };
}

/** 送礼：消耗一份专属信物 + 灵石 */
export function gift(state, id) {
  ensure(state);
  const c = COMPANION_MAP[id];
  if (!c) return { ok: false, reason: '没有这个人。' };
  if (state.player.stage < c.unlockStage) return { ok: false, reason: '缘分未到。' };
  const d = state.companions[id];
  const cost = GIFT.costFor(d.affection);
  const have = countOf(state, c.gift);

  if (have < 1) {
    return { ok: false, reason: `需要一份「${ITEM_MAP[c.gift]?.name || MATERIAL_MAP[c.gift]?.name || c.gift}」。` };
  }
  if (state.currency.stone < cost) {
    return { ok: false, reason: `还需要 ${fmtInt(cost)} 灵石置办。` };
  }

  removeItem(state, c.gift, 1);
  state.currency.stone -= cost;

  const tier = MATERIAL_MAP[c.gift]?.tier || 1;
  const gain = GIFT.gainFor(d.affection, tier);
  const before = affectionStage(d.affection);
  d.affection = Math.min(100, d.affection + gain);
  d.gifts += 1;
  d.met = true;

  const after = affectionStage(d.affection);
  if (after !== before) {
    logHl(state, `与「${c.name}」的关系进至「${after.name}」—— ${after.effect || ''}`);
    toast(`与${c.name}：${after.name}`, 'good');
  } else {
    logGood(state, `你送了一份礼给「${c.name}」，好感 +${gain}。`);
  }
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true, gain, stage: after };
}

/** 道侣汇总加成 */
export function companionTotals(state) {
  ensure(state);
  let cultSpeed = 0;
  let sideIncome = 0;
  let damageTaken = 0;
  const duties = [];
  for (const c of COMPANIONS) {
    const b = companionBonuses(state, c.id);
    cultSpeed += b.cultSpeed;
    sideIncome += b.sideIncome;
    damageTaken += b.damageTaken;
    if (b.dutiesOn) duties.push({ id: c.id, name: c.name, trait: c.trait, doubled: b.dutiesDoubled });
  }
  return { cultSpeed, sideIncome, damageTaken, duties };
}

export function hasDuty(state, id) {
  const b = companionBonuses(state, id);
  return b.dutiesOn;
}

export function dutyMultiplier(state, id) {
  const b = companionBonuses(state, id);
  if (!b.dutiesOn) return 0;
  return b.dutiesDoubled ? 2 : 1;
}

export { COMPANIONS, COMPANION_MAP, AFFECTION_STAGES, affectionStage };
