/**
 * combat.js —— 战斗系统（GDD 7.4）
 *
 * 实际伤害 = 攻击 × 技能倍率 × (1 - 防御/(防御+500×境界量级+等级×50)) × 暴击系数 × 属性克制系数
 *
 * 说明：GDD 原文的常数项是「500 + 等级×50」。由于本作九境界的属性按倍率指数成长
 * （炼气→渡劫相差约 168 万倍），固定常数会让后期防御直接吞掉全部伤害。
 * 因此把常数项同步乘以当前境界的「属性倍率」，公式形态与含义完全保留，
 * 只是让它随境界量级一起走。
 */

import { computeAttrs, combatLevel, techEffects, combatPower } from './character.js';
import { statMultOf } from '../data/realms.js';
import { clamp } from '../core/util.js';
import { DUNGEON_COUNTERS } from '../data/dungeons.js';

export function defenseReduction(def, level, scale = 1) {
  const d = Math.max(0, def);
  const K = 500 * scale + level * 50;
  return 1 - d / (d + K);
}

/** 属性克制 / 科技联动系数（GDD 10.1） */
export function elementMultiplier(state, dungeon) {
  let m = 1;
  const fx = techEffects(state);
  const tags = dungeon?.tags || [];
  for (const c of DUNGEON_COUNTERS) if (tags.includes(c.tag) && fx.has(c.effect)) m *= c.damage;
  return m;
}

/** 科技装备带来的额外减伤（毒系副本带抗生素 = 自动解毒） */
export function techDamageReduce(state, dungeon) {
  const fx = techEffects(state);
  const tags = dungeon?.tags || [];
  let r = 0;
  for (const c of DUNGEON_COUNTERS) if (tags.includes(c.tag) && fx.has(c.effect)) r += c.reduce;
  return r;
}

/** 单次攻击结算 */
function strike(attacker, defender, opts) {
  const {
    skillPower = 0, critRate = 0, critDmg = 0, lifesteal = 0,
    dodge = 0, dmgReduce = 0, level = 1, element = 1, defScale = 1,
    rng = Math.random,
  } = opts;

  if (dodge > 0 && rng() < dodge) {
    return { dmg: 0, crit: false, miss: true, heal: 0 };
  }
  const crit = rng() < critRate;
  const critMult = crit ? 1.5 + critDmg : 1;
  let dmg = attacker.atk * (1 + skillPower)
    * defenseReduction(defender.def, level, defScale) * critMult * element;
  dmg *= (1 - clamp(dmgReduce, 0, 0.85));
  dmg = Math.max(1, Math.round(dmg));
  const heal = Math.round(dmg * clamp(lifesteal, 0, 0.2));
  return { dmg, crit, miss: false, heal };
}

/**
 * 自动战斗（一次副本波次）
 *
 * BOSS 每 4 回合释放一次大招（1.5 倍伤害）。灵科「阵法传感器」解锁后，
 * 战斗日志会提前显示蓄力倒计时——这就是 GDD 10.1 里「副本中显示 BOSS 血量与技能冷却」的落点。
 *
 * @param {object} state
 * @param {object} enemy 具体敌人数值
 * @param {object} ctx  { dungeon, playerHp, pets, scale, intel }
 */
export function simulateBattle(state, enemy, ctx = {}) {
  const a = computeAttrs(state);
  const level = combatLevel(state);
  const element = elementMultiplier(state, ctx.dungeon);
  const extraReduce = techDamageReduce(state, ctx.dungeon);
  const playerScale = ctx.scale || statMultOf(state.player.stage);
  const intel = !!ctx.intel;
  const isBoss = !!enemy.boss;
  const rng = ctx.rng || Math.random;
  const CHARGE_EVERY = 4;
  const CHARGE_START = 5;
  const CHARGE_MUL = 1.5;

  const player = {
    name: '你',
    hp: ctx.playerHp ?? a.hpMax,
    hpMax: a.hpMax,
    atk: a.atk,
    def: a.def,
    spd: a.spd,
  };
  const foe = {
    name: enemy.name,
    hp: enemy.hp,
    hpMax: enemy.hp,
    atk: enemy.atk,
    def: enemy.def,
    spd: enemy.spd,
  };

  const pets = (ctx.pets || []).filter((p) => p && p.hp > 0);
  // deployedBeasts 已应用等级成长，此处只使用最终攻击。
  const metrics = { playerDamage: 0, petDamage: 0, incomingDamage: 0, healing: 0, crits: 0, dodges: 0 };

  const log = [];
  const chargeLog = [];
  let rounds = 0;
  const maxRounds = 60;
  const playerFirst = player.spd >= foe.spd;

  const isChargeRound = (r) => isBoss && r >= CHARGE_START && (r - CHARGE_START) % CHARGE_EVERY === 0;
  const nextCharge = (r) => {
    if (!isBoss) return Infinity;
    if (r < CHARGE_START) return CHARGE_START - r;
    const gap = CHARGE_EVERY - ((r - CHARGE_START) % CHARGE_EVERY);
    return gap === 0 ? CHARGE_EVERY : gap;
  };

  const petTurn = () => {
    for (const pet of pets) {
      if (pet.atk <= 0 || foe.hp <= 0) continue;
      const critical = pet.id === 'linghu' && rng() < 0.30;
      const combo = pet.id === 'canglang' && rng() < 0.25;
      const hits = combo ? 2 : 1;
      for (let i = 0; i < hits && foe.hp > 0; i++) {
        const damage = Math.max(1, Math.round(pet.atk * defenseReduction(foe.def, level, playerScale)
          * 0.5 * (critical ? 1.6 : 1) * (1 + a.beastBattleDamage)));
        foe.hp -= damage;
        metrics.petDamage += damage;
        log.push(`　　${pet.name || '灵兽'}合击${critical ? '（暴击）' : combo ? '（连击）' : ''}，追加 ${damage} 伤害。`);
      }
    }
  };

  while (player.hp > 0 && foe.hp > 0 && rounds < maxRounds) {
    rounds++;

    const playerTurn = () => {
      const r = strike(player, foe, {
        skillPower: a.skillPower, critRate: a.critRate, critDmg: a.critDmg,
        lifesteal: a.lifesteal, dodge: 0, dmgReduce: 0, level,
        element: element * (1 + a.beastBattleDamage), defScale: playerScale, rng,
      });
      if (r.miss) { log.push(`第${rounds}回合：你出手落空。`); return; }
      foe.hp -= r.dmg;
      metrics.playerDamage += r.dmg;
      metrics.crits += r.crit ? 1 : 0;
      const healing = Math.max(0, Math.min(player.hpMax - player.hp, r.heal));
      metrics.healing += healing;
      if (r.heal) player.hp += healing;
      log.push(`第${rounds}回合：你造成 ${r.dmg} 伤害${r.crit ? '（暴击）' : ''}${healing ? `，吸血 ${healing}` : ''}。`);
      petTurn();
    };

    const foeTurn = () => {
      const charging = isChargeRound(rounds);
      const r = strike(foe, player, {
        skillPower: 0, critRate: 0.05, critDmg: 0.2,
        lifesteal: 0, dodge: a.dodge,
        dmgReduce: clamp(a.dmgReduce + extraReduce, 0, 0.85),
        level, element: 1, defScale: playerScale, rng,
      });
      if (r.miss) { metrics.dodges++; log.push(`第${rounds}回合：${foe.name} 的攻击被你闪开。`); return; }
      const dmg = charging ? Math.round(r.dmg * CHARGE_MUL) : r.dmg;
      player.hp -= dmg;
      metrics.incomingDamage += dmg;
      if (charging) {
        chargeLog.push(rounds);
        log.push(`第${rounds}回合：【蓄力·大招】${foe.name} 造成 ${dmg} 伤害。`);
      } else {
        log.push(`第${rounds}回合：${foe.name} 造成 ${dmg} 伤害${r.crit ? '（暴击）' : ''}。`);
      }
    };

    if (playerFirst) { playerTurn(); if (foe.hp <= 0) break; foeTurn(); }
    else { foeTurn(); if (player.hp <= 0) break; playerTurn(); }
  }

  const win = foe.hp <= 0 && player.hp > 0;
  return {
    win,
    outcome: win ? 'victory' : player.hp <= 0 ? 'defeat' : 'timeout',
    metrics,
    rounds,
    playerHp: Math.max(0, Math.round(player.hp)),
    playerHpMax: player.hpMax,
    enemyHp: Math.max(0, Math.round(foe.hp)),
    enemyHpMax: foe.hpMax,
    boss: isBoss,
    intel,
    chargeRounds: chargeLog,
    nextChargeIn: isBoss && foe.hp > 0 ? nextCharge(rounds) : null,
    log,
  };
}

export { combatPower };
