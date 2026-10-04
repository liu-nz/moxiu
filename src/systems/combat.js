import {activeBuild} from '../data/builds.js';
import {hasAffix} from '../data/affixes.js';
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
import { researchEffects } from '../data/research.js';
import { deployedBeasts } from './beasts.js';

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
    rng = Math.random, hit = 1,
  } = opts;

  if (dodge > 0 && rng() < dodge / Math.max(.5, hit)) {
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
  const routine=activeBuild(state), affixWard=hasAffix(state,'due'), zhuri=hasAffix(state,'zhuri');
  const level = combatLevel(state);
  const element = elementMultiplier(state, ctx.dungeon);
  const extraReduce = techDamageReduce(state, ctx.dungeon);
  const playerScale = ctx.scale || statMultOf(state.player.stage);
  const intel = !!ctx.intel;
  const isBoss = !!enemy.boss;
  const mechanic = isBoss ? ctx.dungeon?.mechanic : null;
  const fx = techEffects(state);
  const rng = ctx.rng || Math.random;
  const CHARGE_EVERY = 4;
  const CHARGE_START = 5;
  const CHARGE_MUL = 1.5;

  const player = {
    name: '你',
    hp: ctx.playerHp ?? a.hpMax,
    hpMax: a.hpMax,
    atk: a.atk * (1 + Math.min(.3,Math.max(0,ctx.soulStacks || 0)*.03)),
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
  const metrics = { playerDamage: 0, petDamage: 0, incomingDamage: 0, healing: 0, crits: 0, dodges: 0, mechanicDamage: 0, absorbed: 0, foeHealing: 0 };

  const log = [];
  const chargeLog = [];
  if(hasAffix(state,'shiling') && ctx.soulStacks)log.push(`【噬灵】本次秘境累积 ${Math.min(10,ctx.soulStacks)} 层，攻击提高 ${Math.min(30,ctx.soulStacks*3)}%。`);
  let rounds = 0;
  const maxRounds = 60;
  const playerFirst = player.spd >= foe.spd;
  let poisonStacks = 0, outgoingPoison=0, ward=0, wardUntil=0;
  const blackwater=Object.values(state.equipment).filter(e=>e?.set==='blackwater').length>=2;
  const receive=(raw)=>{
    if(affixWard && !metrics.dueUsed && player.hp-raw<=player.hpMax*.3){metrics.dueUsed=true;ward=Math.round(player.hpMax*.25);wardUntil=rounds+2;log.push('【渡厄】危急护盾开启，持续三回合。');}
    const absorbed=rounds<=wardUntil?Math.min(ward,raw):0;ward-=absorbed;metrics.playerAbsorbed=(metrics.playerAbsorbed || 0)+absorbed;
    const dmg=raw-absorbed;player.hp-=dmg;metrics.incomingDamage+=dmg;return dmg;
  };
  if(routine!=='balanced')log.push(`【套路】${routine}：本场按当前配装结算。`);
  let shield = mechanic?.id === 'shield' ? Math.round(foe.hpMax * .2 * (ctx.intel || a.hit >= 1.15 ? .5 : 1) * (a.skillPower >= .3 ? .5 : 1)) : 0;
  if(mechanic?.id === 'shield') {
    if(state.dungeon.tactic==='node_attack') {foe.atk*=.8;log.push('【遗迹节点】攻势节点关闭，首领攻击降低20%。');}
    if(state.dungeon.tactic==='node_shield') {shield=0;log.push('【遗迹节点】护盾节点关闭。');}
    if(state.dungeon.tactic==='node_heal') log.push('【遗迹节点】治疗节点关闭。');
  }
  if (mechanic) log.push(`【${mechanic.name}】${mechanic.rule}`);
  if (mechanic?.id === 'pressure' && player.spd < foe.spd) { player.atk *= .85; log.push('【深海重压】人物攻击降低15%，灵兽合击保持原强度。'); }
  const damageFoe = dmg => { const absorbed = Math.min(shield, dmg); shield -= absorbed; metrics.absorbed += absorbed; foe.hp -= dmg - absorbed; if (absorbed) log.push(`　　残阵护盾吸收 ${absorbed}，剩余 ${shield}。`); };
  const hazard = (raw, name) => {
    const dmg = Math.max(1, Math.round(raw * (1 - clamp(a.dmgReduce + extraReduce, 0, .85))));
    const received=receive(dmg); metrics.mechanicDamage += received;
    log.push(`第${rounds}回合：【${name}】造成 ${received} 伤害。`);
  };

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
        damageFoe(damage);
        metrics.petDamage += damage;
        log.push(`　　${pet.name || '灵兽'}合击${critical ? '（暴击）' : combo ? '（连击）' : ''}，追加 ${damage} 伤害。`);
      }
    }
  };

  while (player.hp > 0 && foe.hp > 0 && rounds < maxRounds) {
    rounds++;
    if(routine==='tech' && rounds===4){const heal=Math.min(player.hpMax-player.hp,Math.round(player.hpMax*.15));player.hp+=heal;metrics.healing+=heal;const pulse=Math.round(player.atk*.4);damageFoe(pulse);metrics.playerDamage+=pulse;log.push(`【灵能脉冲】恢复 ${heal} 气血，造成 ${pulse} 伤害。`);if(foe.hp<=0)break;}
    if (state.reincarnation?.fate === 'alchemy' && rounds % 4 === 0) { const heal=Math.min(player.hpMax-player.hp,Math.round(player.hpMax*.02)); player.hp+=heal;metrics.healing+=heal; if(heal)log.push(`【丹道天命】恢复 ${heal} 气血。`); }
    if (isBoss) {
      const phase = mechanic?.id === 'thunder' && foe.hp / foe.hpMax <= .15 ? 4 : foe.hp / foe.hpMax <= .3 ? 3 : foe.hp / foe.hpMax <= .65 ? 2 : 1;
      if (phase !== metrics.phase) { metrics.phase = phase; log.push(`【首领阶段 ${phase}】${phase === 1 ? '试探' : phase === 2 ? '攻势加强' : phase === 3 ? '背水一战' : '道途终试'}：观察蓄力与护盾。`); }
    }

    const playerTurn = () => {
      const r = strike(player, foe, {
        skillPower: a.skillPower + (foe.hp / foe.hpMax <= .3 ? (state.path === 'war' ? .15 : 0) + (state.equipment.weapon?.rule === 'execute' ? .2 : 0) : 0), critRate: zhuri && player.spd>=foe.spd*1.3?1:a.critRate+(routine==='burst' && rounds<=3 && pets.some(p=>p.id==='huofeng')?.15:0), critDmg: a.critDmg+(routine==='burst' && rounds<=3?.35:0),
        lifesteal: a.lifesteal, dodge: 0, dmgReduce: 0, level,
        element: element * (1 + a.beastBattleDamage), defScale: playerScale, rng, hit: a.hit,
      });
      if (r.miss) { log.push(`第${rounds}回合：你出手落空。`); return; }
      if(state.dungeon.tactic === 'assault') r.dmg=Math.round(r.dmg*1.15);
      else if(['guard','stealth'].includes(state.dungeon.tactic)) r.dmg=Math.round(r.dmg*.9);
      if(routine==='poison')r.dmg=Math.max(1,Math.round(r.dmg*.85));
      if(routine==='burst' && rounds>3)r.dmg=Math.max(1,Math.round(r.dmg*.85));
      if(routine==='merchant')r.dmg=Math.max(1,Math.round(r.dmg*.75));
      if(routine==='tech')r.dmg=Math.max(1,Math.round(r.dmg*.9));
      if(routine==='poison')outgoingPoison=Math.min(5,outgoingPoison+1);
      damageFoe(r.dmg);
      metrics.playerDamage += r.dmg;
      if(state.path==='law' && state.skills.move1 && state.skills.move2 && rounds%3===0 && foe.hp>0) {const extra=Math.round(r.dmg*.15);damageFoe(extra);metrics.playerDamage+=extra;log.push(`【双招连携】追加 ${extra} 伤害。`);}
      if (foe.hp > 0 && researchEffects(state).neuralInterface && rounds % 3 === 0) {
        const bonus = Math.round(r.dmg * (state.path === 'law' ? .4 : .25)); damageFoe(bonus); metrics.playerDamage += bonus;
        log.push(`　　神经接口连携，追加 ${bonus} 伤害。`);
      }
      metrics.crits += r.crit ? 1 : 0;
      const healing = Math.max(0, Math.min(player.hpMax - player.hp, r.heal));
      metrics.healing += healing;
      if (r.heal) player.hp += healing;
      log.push(`第${rounds}回合：你造成 ${r.dmg} 伤害${r.crit ? '（暴击）' : ''}${healing ? `，吸血 ${healing}` : ''}。`);
      if (foe.hp > 0 && mechanic?.id === 'reflect' && rounds % 3 === 0) hazard(r.dmg * .2 * (a.skillPower >= .3 ? .5 : 1), '剑阵反击');
      if (player.hp <= 0) return;
      petTurn();
    };

    const foeTurn = () => {
      const charging = isChargeRound(rounds);
      const r = strike(foe, player, {
        skillPower: mechanic?.id === 'ambush' && state.dungeon.tactic !== 'stealth' && rounds <= 2 ? .4 : 0, critRate: 0.05, critDmg: 0.2,
        lifesteal: 0, dodge: a.dodge,
        dmgReduce: clamp(a.dmgReduce + extraReduce, 0, 0.85),
        level, element: 1, defScale: playerScale, rng,
      });
      if (r.miss) { metrics.dodges++; log.push(`第${rounds}回合：${foe.name} 的攻击被你闪开。`); return; }
      const stagePressure = metrics.phase === 4 ? 1.3 : metrics.phase === 3 ? 1.15 : metrics.phase === 2 ? 1.08 : 1;
      const chargeMul = mechanic?.id === 'thunder' ? Math.min(2.1, CHARGE_MUL + Math.floor(rounds / 4) * .15) : CHARGE_MUL;
      let dmg = charging ? Math.round(r.dmg * chargeMul * stagePressure) : r.dmg;
      if(charging && state.equipment.armor?.rule==='powerarmor')dmg=Math.round(dmg*.8);
      if(charging && ctx.mythic) dmg=Math.round(dmg*1.25);
      if (state.dungeon.tactic === 'assault') dmg=Math.round(dmg*1.15);
      if(charging && state.dungeon.tactic === 'guard') dmg=Math.round(dmg*.75);
      if (charging && state.reincarnation?.fate === 'war') dmg = Math.round(dmg * 1.1);
      if (charging && state.equipment.armor?.rule === 'chargeguard' && !metrics.affixWardUsed) {dmg=Math.round(dmg*.75);metrics.affixWardUsed=true;log.push('【护阵词条】抵消首次蓄力伤害的25%。');}
      if (charging && researchEffects(state).adaptiveWard && !metrics.wardUsed) { dmg = Math.round(dmg * .5); metrics.wardUsed = true; log.push('【自适应护甲】抵消本场首次蓄力伤害的一半。'); }
      dmg=receive(dmg);
      if (mechanic?.id === 'poison' && !fx.has('poison_immunity')) poisonStacks = Math.min(3, poisonStacks + 1);
      if (charging) {
        chargeLog.push(rounds);
        log.push(`第${rounds}回合：【蓄力·大招】${foe.name} 造成 ${dmg} 伤害。`);
      } else {
        log.push(`第${rounds}回合：${foe.name} 造成 ${dmg} 伤害${r.crit ? '（暴击）' : ''}。`);
      }
    };

    if (playerFirst || (state.reincarnation?.fate === 'speed' && isChargeRound(rounds))) { playerTurn(); if (foe.hp <= 0 || player.hp <= 0) break; foeTurn(); }
    else { foeTurn(); if (player.hp <= 0) break; playerTurn(); }
    if (foe.hp <= 0 || player.hp <= 0) break;
    if(outgoingPoison){const dmg=Math.max(1,Math.round(player.atk*.03*outgoingPoison*(blackwater?1.25:1)));damageFoe(dmg);metrics.poisonDamage=(metrics.poisonDamage || 0)+dmg;metrics.playerDamage+=dmg;log.push(`【蚀灵毒 ${outgoingPoison}层】造成 ${dmg} 伤害。`);if(foe.hp<=0)break;}
    if (mechanic?.id === 'poison' && poisonStacks) hazard(player.hpMax * .02 * poisonStacks, `瘴毒${poisonStacks}层`);
    if (mechanic?.id === 'burn' && !fx.has('heat_shield')) hazard(player.hpMax * .02, '地火灼烧');
    if(mechanic?.id === 'shield' && rounds%4===0 && state.dungeon.tactic!=='node_heal') {const heal=Math.min(Math.round(foe.hpMax*.03),foe.hpMax-foe.hp);foe.hp+=heal;metrics.foeHealing+=heal;if(heal)log.push(`【遗迹治疗节点】恢复 ${heal} 气血。`);}
    if (mechanic?.id === 'revive' && !fx.has('light_boost')) {
      const restored = Math.min(Math.round(foe.hpMax * .04), foe.hpMax - foe.hp);
      foe.hp += restored; metrics.foeHealing += restored;
      if (restored) log.push(`第${rounds}回合：【阴魂复苏】恢复 ${restored} 气血。`);
    }
  }

  const win = foe.hp <= 0 && player.hp > 0;
  return {
    win,
    outcome: win ? 'victory' : player.hp <= 0 ? 'defeat' : 'timeout',
    metrics,
    mechanic: mechanic?.name || null,
    shieldLeft: shield,
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

/** 对称论道：双方满气血，复用攻击公式；不修改人物气血、体力或背包。 */
export function simulateDuel(left, right, rng = Math.random) {
  const states = [left, right], attrs = states.map(s => computeAttrs(s, { competitive: true }));
  const fighters = attrs.map(a => ({...a, hp:a.hpMax}));
  const pets = states.map(deployedBeasts), log = [];
  const order = attrs[0].spd === attrs[1].spd ? (rng() < .5 ? [0,1] : [1,0]) : attrs[0].spd > attrs[1].spd ? [0,1] : [1,0];
  let rounds = 0;
  while (fighters.every(f=>f.hp>0) && rounds < 60) {
    rounds++;
    for (const i of order) {
      const j=1-i,a=attrs[i],b=attrs[j],f=fighters[i],foe=fighters[j];
      const hit=strike(f,foe,{skillPower:a.skillPower,critRate:a.critRate,critDmg:a.critDmg,lifesteal:a.lifesteal,
        dodge:b.dodge,dmgReduce:b.dmgReduce,level:combatLevel(states[i]),defScale:statMultOf(states[j].player.stage),hit:a.hit,rng});
      foe.hp-=hit.dmg; f.hp=Math.min(f.hpMax,f.hp+hit.heal);
      log.push({round:rounds,side:i,damage:hit.dmg,crit:hit.crit,miss:hit.miss});
      for (const pet of pets[i]) {
        if (foe.hp<=0) break;
        const hits=pet.id==='canglang'&&rng()<.25?2:1;
        const critical=pet.id==='linghu'&&rng()<.3;
        const damage=Math.max(1,Math.round(pet.atk*.5*defenseReduction(b.def,combatLevel(states[i]),statMultOf(states[j].player.stage))*(1+a.beastBattleDamage)*(critical?1.6:1)));
        foe.hp-=damage*hits;
        log.push({round:rounds,side:i,damage:damage*hits,pet:pet.name});
      }
      if (foe.hp<=0) break;
    }
  }
  const score=fighters[1].hp<=0?1:fighters[0].hp<=0?0:.5;
  return {score,rounds,hp:fighters.map(f=>Math.max(0,Math.round(f.hp))),maxHp:attrs.map(a=>a.hpMax),log};
}
