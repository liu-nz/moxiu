import {worldState} from '../data/worldStates.js';
/**
 * character.js —— 角色最终属性计算（GDD 7）+ 修炼速率 + 战力
 *
 * 五维基础属性随境界成长；
 * 二级属性（暴击率/暴击伤害/命中/闪避/吸血/伤害减免/功法威力/修炼速度）**不随境界自动提升**，
 * 完全由装备词条、功法、道途、研究、道侣、灵兽、轮回与社交加成决定（GDD 7.2）。
 *
 * 依赖方向：本模块只读「数据」，不调用任何 systems 模块，
 * 因此 guild / ranking / tradehouse 等可以安全地反向依赖它。
 */

import { baseAttrs, stageInfo, levelOf, baseCultivationRate } from '../data/realms.js';
import { effectiveStats, SLOT_MAP } from '../data/equipment.js';
import { pathMods } from '../data/paths.js';
import { getEvent } from '../data/worldEvents.js';
import { researchEffects } from '../data/research.js';
import { GUILD_MAP, CHAMBER } from '../data/guild.js';
import { SECT_MAP, SECT_RANKS } from '../data/sects.js';
import { projectEffects } from '../data/projects.js';
import { lifestyleEffects } from './lifestyle.js';
import { sideFactor, SIDE } from '../core/state.js';
import { clamp } from '../core/util.js';
import { founderMultiplier } from '../core/shards.js';

/** 二级属性上限（GDD 7.3） */
export const CAPS = {
  critRate: 0.75,
  dodge: 0.40,
  lifesteal: 0.20,
  dmgReduce: 0.60,
  cultSpeed: 5.00,
};

export const SECONDARY_KEYS = [
  'critRate', 'critDmg', 'hit', 'dodge', 'lifesteal', 'dmgReduce', 'skillPower', 'cultSpeed',
];

export const ATTR_NAME = {
  hpMax: '气血上限', mpMax: '真元上限', atk: '攻击', def: '防御', spd: '速度',
  critRate: '暴击率', critDmg: '暴击伤害', hit: '命中', dodge: '闪避',
  lifesteal: '吸血', dmgReduce: '伤害减免', skillPower: '功法威力', cultSpeed: '修炼速度',
  enhanceBonus: '强化加成', tradeProfit: '贸易利润', alchemy: '炼丹成功率',
  forge: '炼器成功率', shopTraffic: '店铺客流',
};

export const ATTR_IS_PCT = new Set([
  'critRate', 'critDmg', 'dodge', 'lifesteal', 'dmgReduce', 'skillPower', 'cultSpeed',
  'enhanceBonus', 'tradeProfit', 'alchemy', 'forge', 'shopTraffic',
]);

/* ------------------------------------------------------------------ */
/* 社交加成（道盟 / 商会 / 排行榜称号）—— 直接读原始数据，避免循环依赖   */
/* ------------------------------------------------------------------ */
export function guildMods(state) {
  const id = state.social?.guild?.id;
  const g = id ? GUILD_MAP[id] : null;
  return g ? { ...g.mods } : {};
}

export function chamberMods(state) {
  return state.social?.chamber?.joined ? { ...CHAMBER.perks } : {};
}

export function titleMods(state) {
  const out = { atkMul: 0, hpMul: 0, tradeProfit: 0, tradehouseSpeed: 0, cultSpeed: 0 };
  const titles = state.social?.ranking?.titles || {};
  for (const t of Object.values(titles)) {
    for (const [k, v] of Object.entries(t.mods || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}

/** 宗门加成（专精 + 辈分灵气 + 已参悟秘传）—— 直接读原始数据，避免循环依赖 */
export function sectMods(state) {
  const out = {
    atkMul: 0, skillPower: 0, critDmg: 0, cultSpeed: 0, alchemy: 0,
    farmYield: 0, tradehouseSpeed: 0, tradeProfit: 0, taleRate: 0,
    petPower: 0, bonusDrops: 0, captureChance: 0, petDmgReduce: 0,
    breakthroughAdd: 0, fortune: 0, matYield: 0,
  };
  const d = state.sect;
  if (!d?.id) return out;
  const sect = SECT_MAP[d.id];
  if (!sect) return out;

  const apply = (mods) => {
    for (const [k, v] of Object.entries(mods || {})) {
      if (typeof v !== 'number') continue;
      out[k] = (out[k] || 0) + v;
    }
  };
  apply(sect.mods);
  for (const sid of Object.keys(d.secrets || {})) {
    const sec = sect.secrets.find((x) => x.id === sid);
    if (sec) apply(sec.effect);
  }
  const rank = SECT_RANKS[Math.max(0, Math.min(SECT_RANKS.length - 1, d.rank || 0))];
  out.cultSpeed += rank.cultBonus;
  return out;
}

/* ------------------------------------------------------------------ */
/* 装备 + 功法 + 道途 + Buff 的汇总修正                                 */
/* ------------------------------------------------------------------ */
export function collectMods(state) {
  const mods = {};

  const add = (src, scale = 1) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== 'number' || !isFinite(v)) continue;
      mods[k] = (mods[k] || 0) + v * scale;
    }
  };

  // 道途被动
  const pm = pathMods(state.path);
  mods.enhanceBonus = (mods.enhanceBonus || 0) + (pm.enhanceAdd || 0);
  mods.tradeProfit = (mods.tradeProfit || 0) + (pm.tradeProfitAdd || 0);
  mods.alchemy = (mods.alchemy || 0) + (pm.alchemyAdd || 0);
  mods.forge = (mods.forge || 0) + (pm.forgeAdd || 0);
  mods.shopTraffic = (mods.shopTraffic || 0) + (pm.shopTrafficAdd || 0);
  mods._atkMul = (pm.atkMul || 0);
  mods._mpMaxMul = (pm.mpMaxMul || 0);
  mods.critDmg = (mods.critDmg || 0) + (pm.critDmgAdd || 0);
  mods.skillPower = (mods.skillPower || 0) + (pm.skillPowerAdd || 0);
  mods.cultSpeed = (mods.cultSpeed || 0) + (pm.cultSpeedAdd || 0);
  mods._breakthroughAdd = (pm.breakthroughAdd || 0);

  // 装备（七部位）
  const enhBonus = mods.enhanceBonus || 0;
  for (const slotId of Object.keys(SLOT_MAP)) {
    add(effectiveStats(state.equipment[slotId], enhBonus));
  }
  // 现代跨界装备
  for (const t of state.tech || []) add(effectiveStats(t, enhBonus));

  // 功法（四槽）
  for (const key of Object.keys(state.skills)) {
    const sk = state.skills[key];
    if (!sk) continue;
    const lvMul = 1 + ((sk.level || 1) - 1) * 0.18;
    add(sk.stats, lvMul);
  }

  // Buff（丹药等）
  for (const b of state.player.buffs || []) {
    if (b.until > state.world.clockMs) add(b.mods);
  }

  // 轮回永久加成 + 天命
  const b = state.reincarnation?.blessings || {};
  const fate = state.reincarnation?.fate;
  const fm = fate ? (FATE_MODS[fate] || {}) : {};
  mods.cultSpeed = (mods.cultSpeed || 0) + (b.cult || 0) * 0.06 + (fm.cultSpeedAdd || 0);
  mods.tradeProfit = (mods.tradeProfit || 0) + (b.trade || 0) * 0.05 + (fm.tradeProfitAdd || 0);
  mods.alchemy = (mods.alchemy || 0) + (fm.alchemyAdd || 0);
  mods._atkMul = (mods._atkMul || 0) + (b.atk || 0) * 0.06 + (fm.atkMul || 0);
  mods._hpMul = (mods._hpMul || 0) + (b.hp || 0) * 0.08;
  mods._breakthroughAdd = (mods._breakthroughAdd || 0) + (fm.breakthroughAdd || 0);
  mods._shopIncomeMul = (mods._shopIncomeMul || 0) + (fm.shopIncomeMul || 0);
  mods._fortune = (b.fortune || 0) * 0.05;

  // 道侣
  const comp = state.companions || {};
  let sideIncome = 0;
  let companionDmgReduce = 0;
  for (const [id, data] of Object.entries(comp)) {
    const v = data?.affection || 0;
    const soul = v >= 80;
    if (v >= 60) mods.cultSpeed += soul ? 0.20 : 0.10;
    else if (v >= 20) mods.cultSpeed += soul ? 0.10 : 0.05;
    if (v >= 40) sideIncome += soul ? 0.16 : 0.08;
    if (v >= 60) companionDmgReduce += soul ? 0.14 : 0.07;
  }
  mods._sideIncome = sideIncome;
  mods._companionDmgReduce = companionDmgReduce;

  // 道侣专长加成（GDD 12：炼丹加成等）
  for (const [id, spec] of Object.entries(COMPANION_SPECIALTY)) {
    const v = comp[id]?.affection || 0;
    if (v < spec.at) continue;
    const val = v >= 80 ? spec.soulValue : spec.value;
    if (spec.key === 'alchemy') mods.alchemy = (mods.alchemy || 0) + val;
  }

  // 灵兽护主
  const deployed = state.beasts?.deployed || [];
  let beastDmgReduce = 0;
  let beastStoneBonus = 0;
  let beastBattleDamage = 0;
  for (const uid of deployed) {
    const owned = (state.beasts.owned || []).find((x) => x.uid === uid);
    if (!owned) continue;
    if (owned.id === 'xuangui') beastDmgReduce += 0.08;
    if (owned.id === 'pixiu') beastStoneBonus += 0.25;
    if (owned.id === 'huofeng') beastBattleDamage += 0.12;
    if (owned.id === 'linghu' || owned.id === 'canglang') beastBattleDamage += 0.05;
  }
  mods._beastDmgReduce = beastDmgReduce;
  mods._beastStoneBonus = beastStoneBonus;
  mods._beastBattleDamage = beastBattleDamage;

  // 灵科研究：经脉模型提升功法威力
  mods.skillPower = (mods.skillPower || 0) + (researchEffects(state).skillPower || 0);

  // 社交：道盟专精 + 商会 + 排行榜称号
  const gm = guildMods(state);
  mods.tradeProfit = (mods.tradeProfit || 0) + (gm.tradeProfit || 0);
  mods.alchemy = (mods.alchemy || 0) + (gm.alchemySuccess || 0);
  const cm = chamberMods(state);
  mods.tradeProfit = (mods.tradeProfit || 0) + (cm.tradeProfit || 0);
  const tm = titleMods(state);
  mods._atkMul = (mods._atkMul || 0) + tm.atkMul;
  mods._hpMul = (mods._hpMul || 0) + tm.hpMul;
  mods.tradeProfit = (mods.tradeProfit || 0) + tm.tradeProfit;
  mods.cultSpeed = (mods.cultSpeed || 0) + tm.cultSpeed;

  // 宗门：专精 + 辈分灵气 + 秘传
  const sm = sectMods(state);
  mods._atkMul = (mods._atkMul || 0) + sm.atkMul;
  mods.skillPower = (mods.skillPower || 0) + sm.skillPower;
  mods.critDmg = (mods.critDmg || 0) + sm.critDmg;
  mods.cultSpeed = (mods.cultSpeed || 0) + sm.cultSpeed;
  mods.alchemy = (mods.alchemy || 0) + sm.alchemy;
  mods.tradeProfit = (mods.tradeProfit || 0) + sm.tradeProfit;
  mods._breakthroughAdd = (mods._breakthroughAdd || 0) + sm.breakthroughAdd;
  mods._fortune = (mods._fortune || 0) + sm.fortune;
  mods._sectPetDmgReduce = sm.petDmgReduce;

  // 现代休闲生活：健身提升气血
  const lf = lifestyleEffects(state);
  mods._hpMul = (mods._hpMul || 0) + lf.hpMul;

  // 城市灵改工程：城市聚灵阵等全局效果
  const pj = projectEffects(state);
  mods.cultSpeed = (mods.cultSpeed || 0) + (pj.cultSpeed || 0);

  return mods;
}

/** 道侣专长加成表（GDD 12 的「炼丹加成」等） */
const COMPANION_SPECIALTY = {
  moyao: { key: 'alchemy', at: 40, value: 0.08, soulValue: 0.16 },
};

/** 天命修正表（与 data/fates.js 保持同步的最小副本，避免模块循环） */
const FATE_MODS = {
  merchant: { tradeProfitAdd: 0.50, cultSpeedAdd: -0.20 },
  alchemy: { alchemyAdd: 0.40, atkMul: -0.15 },
  war: { atkMul: 0.30, shopIncomeMul: -0.30 },
  speed: { cultSpeedAdd: 0.40, breakthroughAdd: 0.05 },
};

/** 计算最终属性 */
export function computeAttrs(state, { competitive = false } = {}) {
  const base = baseAttrs(state.player.stage);
  const mods = collectMods(state);

  const atkMul = 1 + (mods._atkMul || 0);
  const mpMul = 1 + (mods._mpMaxMul || 0);
  const hpMul = 1 + (mods._hpMul || 0);

  const hpMax = Math.round((base.hpMax + (mods.hpMax || 0)) * hpMul);
  const mpMax = Math.round((base.mpMax + (mods.mpMax || 0)) * mpMul);
  const atk = Math.round((base.atk + (mods.atk || 0)) * atkMul);
  const def = Math.round(base.def + (mods.def || 0));
  const spd = Math.round((base.spd + (mods.spd || 0)) * 10) / 10;

  const ev = getEvent(state.market?.eventId);

  const critRate = clamp((mods.critRate || 0), 0, CAPS.critRate);
  const dodge = clamp((mods.dodge || 0), 0, CAPS.dodge);
  const lifesteal = clamp((mods.lifesteal || 0), 0, CAPS.lifesteal);
  const dmgReduce = clamp(
    (mods.dmgReduce || 0) + (mods._companionDmgReduce || 0)
    + (mods._beastDmgReduce || 0) + (mods._sectPetDmgReduce || 0),
    0, CAPS.dmgReduce,
  );
  const critDmg = Math.max(0, mods.critDmg || 0);
  const hit = clamp(1 + (mods.hit || 0), 0, 2);
  const skillPower = Math.max(0, mods.skillPower || 0);

  const cultSpeed = clamp(
    (mods.cultSpeed || 0) + (ev.cultSpeedAdd || 0),
    -0.80, CAPS.cultSpeed,
  );

  const creator = competitive ? 1 : founderMultiplier(state);
  return {
    hpMax: hpMax * creator, mpMax: mpMax * creator, atk: atk * creator, def: def * creator, spd: spd * creator,
    critRate, critDmg, hit, dodge, lifesteal, dmgReduce, skillPower, cultSpeed: (1 + cultSpeed) * creator * (worldState(state).cultMult || 1) - 1,
    enhanceBonus: mods.enhanceBonus || 0,
    tradeProfit: mods.tradeProfit || 0,
    alchemy: mods.alchemy || 0,
    forge: mods.forge || 0,
    shopTraffic: (mods.shopTraffic || 0) + (mods._shopIncomeMul || 0),
    breakthroughAdd: mods._breakthroughAdd || 0,
    sideIncome: mods._sideIncome || 0,
    fortune: mods._fortune || 0,
    beastStoneBonus: mods._beastStoneBonus || 0,
    beastBattleDamage: mods._beastBattleDamage || 0,
  };
}

/** 战斗等级（用于伤害公式中的 等级×50） */
export function combatLevel(state) {
  return levelOf(state.player.stage);
}

/** 每秒修为产出（含全部加成与所在世界系数） */
export function cultivationRate(state, attrs) {
  const a = attrs || computeAttrs(state);
  const base = baseCultivationRate(state.player.stage);
  return base * (1 + a.cultSpeed) * sideFactor(state, SIDE.CULTIVATION);
}

/** 战力估算（用于 UI 展示与排行榜，非游戏内数值） */
export function combatPower(state, options) {
  const a = computeAttrs(state, options);
  return Math.round(
    a.atk * 3 + a.def * 2 + a.hpMax * 0.35 + a.spd * 4
    + a.critRate * 900 + a.critDmg * 400 + a.skillPower * 700
    + a.dodge * 500 + a.dmgReduce * 600 + a.lifesteal * 500,
  );
}

export function stageLabel(state) {
  const info = stageInfo(state.player.stage);
  return `${info.realm.name}·${info.stage.name}`;
}

/** 现代科技装备带来的机制效果集合 */
export function techEffects(state) {
  const set = new Set();
  for (const t of state.tech || []) if (t.tech) set.add(t.tech);
  return set;
}
