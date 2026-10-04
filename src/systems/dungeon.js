import {sourceOpen,worldState} from '../data/worldStates.js';
import {hasAffix} from '../data/affixes.js';
/**
 * dungeon.js —— 副本系统（GDD 10）+ 挂机自动战斗（GDD 2.1）
 * 八大副本、三难度、体力消耗制。
 * 敌人数值由 data/dungeons.js 按解锁阶段的玩家战力推导。
 */

import {
  DUNGEONS, DUNGEON_MAP, DIFFICULTIES, DIFF_MAP, STAMINA, QUALITY_TABLE, DUNGEON_COUNTERS,
  resolveWaves, dropScale, skillScale, powerUnit,
} from '../data/dungeons.js';
import { MATERIAL_MAP, ITEM_MAP } from '../data/items.js';
import { stageInfo } from '../data/realms.js';
import { rollEquipment, randomTierIndex } from '../data/equipment.js';
import { rollSkill, randomSkillTier, randomGrade } from '../data/skills.js';
import { addProduced } from './cargo.js';
import { markCollection } from './collection.js';
import { addItem } from './inventory.js';
import { simulateBattle } from './combat.js';
import { computeAttrs, guildMods, combatPower, sectMods, techEffects } from './character.js';
import { researchEffects } from '../data/research.js';
import { lifestyleEffects } from './lifestyle.js';
import { advanceIfReady } from './cultivation.js';
import { deployedBeasts, beastBonuses, tryCapture } from './beasts.js';
import { dutyMultiplier } from './companion.js';
import { countRun, earn } from './daily.js';
import { logGood, logWarn, logHl, toast } from './log.js';
import { updateTutorial } from './tutorial.js';
import { emit, EV } from '../core/bus.js';
import { rint, weightedPick, clamp, fmtInt } from '../core/util.js';

/** 自动战斗的节奏：每 30 秒世界时间尝试打一轮（体力是真正的瓶颈） */
export const AUTO_INTERVAL_MS = 30 * 1000;

/* ---------------- 体力 ---------------- */
export function staminaMax(state) {
  return STAMINA.max + (guildMods(state).staminaMax || 0);
}

export function staminaInterval(state) {
  return STAMINA.regenPerMs / (1 + lifestyleEffects(state).staminaRegen);
}
export function tickStamina(state, dtMs) {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return;
  const max = staminaMax(state);
  if (state.player.stamina >= max) { state.player.staminaAcc = 0; return; }
  const interval = staminaInterval(state);
  const acc = (state.player.staminaAcc || 0) + dtMs;
  const gain = Math.floor(acc / interval);
  state.player.stamina = Math.min(max, state.player.stamina + gain);
  state.player.staminaAcc = state.player.stamina >= max ? 0 : acc - gain * interval;
}
/** 距离体力回满；next=true 时只计算下一点。均为世界时间。 */
export function staminaEta(state, next = false) {
  const max = staminaMax(state);
  if (state.player.stamina >= max) return 0;
  const need = next ? 1 : Math.ceil(max - state.player.stamina);
  return Math.max(0, need * staminaInterval(state) - (state.player.staminaAcc || 0));
}

/* ---------------- 解锁 ---------------- */
export function unlockedDungeons(state) {
  return DUNGEONS.map((d, i) => ({
    ...d,
    index: i,
    unlocked: state.player.stage >= d.unlockStage && (!d.worldChallenge || sourceOpen(state)),
    unlockLabel: d.worldChallenge?'筑基中期 · 灵脉衰竭第三天':stageInfo(d.unlockStage).stage.name,
    waves: resolveWaves(d),
  }));
}

export function canEnter(state, dungeonId, diffId, { free = false } = {}) {
  if (state.side !== 'cultivation' && !free) return { ok: false, reason: '请先穿越到修仙界，再进入秘境。' };
  const d = DUNGEON_MAP[dungeonId];
  const diff = DIFF_MAP[diffId];
  if (!d || !diff) return { ok: false, reason: '没有这个副本。' };
  if(d.worldChallenge && !sourceOpen(state))return {ok:false,reason:'灵脉源头仅在灵脉衰竭第三天开放，需筑基中期。'};
  if(diff.minReincarnation && state.reincarnation.count < diff.minReincarnation) return {ok:false,reason:'劫境须完成一次轮回；首领蓄力伤害额外提高25%。'};
  if (state.player.stage < d.unlockStage) {
    return { ok: false, reason: `需要达到 ${stageInfo(d.unlockStage).stage.name} 才能进入。` };
  }
  if(!free && dungeonId==='bandit' && state.dungeon.tactic==='bribe' && state.currency.stone<50) return {ok:false,reason:'买路战术每次额外需要50灵石。'};
  if (!free && state.player.stamina < diff.stamina) {
    return { ok: false, reason: `体力不足（需 ${diff.stamina}，当前 ${Math.floor(state.player.stamina)}）。` };
  }
  return { ok: true };
}

/* ---------------- 掉落 ---------------- */
function rollQuality(luck = 0) {
  const table = QUALITY_TABLE.map((q) => [q.id, q.id === 'common' ? Math.max(20, q.w - luck * 40) : q.w * (1 + luck)]);
  return weightedPick(table);
}

function grantRewards(state, d, diff, result, silent) {
  const materialTarget = state.dungeon.materialTargets?.[d.id];
  const focused = d.matPool?.includes(materialTarget);
  const mul = diff.rewardMul * (focused ? .85 : 1);
  const bb = beastBonuses(state);
  const bailing = dutyMultiplier(state, 'bailing');
  const guildStone = 1 + (guildMods(state).dungeonStone || 0);

  const stoneMul = (1 + bb.stoneBonus + bailing * 0.2) * guildStone;
  const stone = Math.round(rint(d.stone[0], d.stone[1]) * mul * stoneMul);
  const cult = Math.round(rint(d.cultivation[0], d.cultivation[1]) * mul);

  state.currency.stone += stone;
  earn(state, 'stone', stone);
  state.player.cultivation += cult;
  state.player.totalCultivation += cult;
  state.stats.maxStone = Math.max(state.stats.maxStone || 0, state.currency.stone);

  result.rewards.stone = stone;
  result.rewards.cultivation = cult;

  // 装备
  const eqChance = clamp((d.equipChance - (focused ? .15 : 0)) * diff.dropMul, 0, 0.95);
  const drops = rint(1, ['hell','mythic'].includes(diff.id) ? 2 : 1) + (bailing ? 1 : 0) + bb.bonusDrops;
  for (let i = 0; i < drops; i++) {
    if (Math.random() < eqChance) {
      const slots = ['weapon', 'helmet', 'armor', 'boots', 'ring1', 'ring2', 'artifact'];
      const slot = slots[Math.floor(Math.random() * slots.length)];
      const tierIdx = randomTierIndex(['hell','mythic'].includes(diff.id) ? 4 : diff.id === 'hard' ? 3 : 2);
      const eq = rollEquipment(slot, tierIdx, dropScale(d));
      if(d.id==='swamp'){eq.set='blackwater';eq.name='黑水·'+eq.name;}
      markCollection(state, 'equipment', `${eq.slot}:${eq.tier}`);
      state.bag.push(eq);
      result.rewards.equipment.push(eq);
    }
  }

  // 功法
  if (state.player.stage >= 4 && Math.random() < clamp(d.skillChance * diff.dropMul, 0, 0.9)) {
    const slotType = ['heart', 'move', 'move', 'special'][Math.floor(Math.random() * 4)];
    const sk = rollSkill(slotType, randomSkillTier(3), randomGrade(), skillScale(d));
    state.skillBag.push(sk);
    result.rewards.skills.push(sk);
  }

  // 材料
  if (d.matPool?.length) {
    const n = rint(1, 2) + (bailing ? 1 : 0);
    const matBonus = 1 + (sectMods(state).matYield || 0);
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.55 * matBonus) {
        const mid = d.matPool[Math.floor(Math.random() * d.matPool.length)];
        addItem(state, mid, 1, 'common');
        result.rewards.materials.push({ id: mid, qty: 1 });
      }
    }
  }

  if (focused) { addItem(state, materialTarget, 1, 'common'); result.rewards.materials.push({ id: materialTarget, qty: 1 }); }

  // 商品（带品质）
  if (Math.random() < d.goodsChance * (focused ? .7 : 1)) {
    const itemId = d.goodsPool[Math.floor(Math.random() * d.goodsPool.length)];
    const qty = rint(1, diff.id === 'normal' ? 3 : diff.id === 'hard' ? 6 : 12);
    const quality = rollQuality(0);
    addProduced(state, itemId, qty, quality);
    result.rewards.goods.push({ itemId, qty, quality });
  }

  // 灵兽捕捉
  const captured = tryCapture(state, DUNGEONS.indexOf(d), diff.id, (state.reincarnation?.blessings?.fortune || 0) * 0.05);
  if (captured) result.rewards.beast = captured;

  advanceIfReady(state);
}

/* ---------------- 副本主流程 ---------------- */
export function runDungeon(state, dungeonId, diffId, opts = {}) {
  const check = canEnter(state, dungeonId, diffId, opts);
  if (!check.ok) return { ok: false, reason: check.reason };

  const d = DUNGEON_MAP[dungeonId];
  const diff = DIFF_MAP[diffId];
  const waves = resolveWaves(d);
  const bribe=!opts.free && dungeonId==='bandit' && state.dungeon.tactic==='bribe';
  if(bribe)state.currency.stone-=50;
  const silent = !!opts.silent;

  if (!opts.free) state.player.stamina -= diff.stamina;
  state.dungeon.runs += 1;
  countRun(state);

  const result = {
    ok: true,
    dungeon: d,
    diff,
    silent,
    win: true,
    waves: [],
    rewards: { stone: 0, cultivation: 0, equipment: [], skills: [], goods: [], materials: [], beast: null },
    clearedAtWave: 0,
    enteredStage: state.player.stage,
  };

  const attrs = computeAttrs(state);
  const pets = deployedBeasts(state);
  const intel = researchEffects(state).dungeonIntel;
  let hp = attrs.hpMax, souls=0;

  for (const w of waves) {
    if(bribe && !w.boss && result.waves.length<2) {result.waves.push({enemy:w.name,boss:false,win:true,rounds:0,playerHp:hp,metrics:{},log:['支付买路费用，绕过这一波守卫。']});continue;}
    const enemy = {
      ...w,
      hp: Math.round(w.hp * diff.statMul),
      atk: Math.round(w.atk * diff.statMul * (worldState(state).enemyAtk || 1)),
      def: Math.round(w.def * diff.statMul),
      spd: Math.round(w.spd * diff.statMul * 10) / 10,
    };
    const battle = simulateBattle(state, enemy, { dungeon: d, playerHp: hp, pets, intel, mythic: diff.id === 'mythic', rng: opts.rng, soulStacks: hasAffix(state,'shiling')?souls:0 });
    state.stats.battles += 1;
    result.waves.push({ enemy: w.name, boss: !!w.boss, ...battle });
    hp = battle.playerHp;
    if (!battle.win) {
      result.win = false;
      result.clearedAtWave = result.waves.length;
      break;
    }
    state.stats.wins += 1;
    if(hasAffix(state,'shiling'))souls=Math.min(10,souls+1);
    hp = Math.min(attrs.hpMax, hp + Math.round(attrs.hpMax * 0.15));
  }

  state.dungeon.lastBattleStats={name:d.name+' · '+diff.name,...result.waves.reduce((out,w)=>{for(const key of ['playerDamage','petDamage','mechanicDamage','incomingDamage'])out[key]+=w.metrics?.[key] || 0;return out;},{playerDamage:0,petDamage:0,mechanicDamage:0,incomingDamage:0})};
  if (result.win) {
    grantRewards(state, d, diff, result, silent);
    if(d.id==='source'){state.tales.flags.source_discovered='recorded';logGood(state,'灵脉溯源：逆流并非天灾，另一个界门正在抽取地脉。');}
    const key = `${dungeonId}:${diffId}`;
    state.dungeon.cleared[key] = (state.dungeon.cleared[key] || 0) + 1;
    if (!silent) {
      logGood(state, `通关「${d.name} · ${diff.name}」：灵石 +${fmtInt(result.rewards.stone)}，修为 +${fmtInt(result.rewards.cultivation)}。`);
      if (result.rewards.equipment.length) logHl(state, `掉落装备：${result.rewards.equipment.map((e) => e.name).join('、')}。`);
      if (result.rewards.skills.length) logHl(state, `掉落功法：${result.rewards.skills.map((s) => s.name).join('、')}。`);
      toast(`通关 ${d.name}·${diff.name}`, 'good');
    }
  } else {
    state.dungeon.fails += 1;
    if (!silent) {
      logWarn(state, `在「${d.name} · ${diff.name}」第 ${result.clearedAtWave} 波败退（${result.waves[result.waves.length - 1].enemy}）。体力已消耗。`);
      toast(`败于 ${d.name}`, 'warn');
    }
  }

  {
    state.dungeon.log.unshift({
      t: state.world.clockMs,
      dungeon: d.name,
      diff: diff.name,
      win: result.win,
      stone: result.rewards.stone,
      wave: result.clearedAtWave,
      outcome: result.waves.at(-1)?.outcome,
    });
    state.dungeon.log = state.dungeon.log.slice(0, 30);
  }

  updateTutorial(state);
  emit(EV.BATTLE, result);
  emit(EV.STATE);
  return result;
}

/* ---------------- 挂机自动战斗（GDD 2.1 的 30 秒循环） ---------------- */
export function setAutoBattle(state, on, dungeonId, diffId) {
  const current = state.auto || {};
  let selected = dungeonId || current.dungeonId;
  const difficulty = diffId || current.diffId || 'normal';
  if (on && !selected) selected = DUNGEONS.find(d => state.player.stage >= d.unlockStage)?.id;
  const d = selected ? DUNGEON_MAP[selected] : null;
  if (typeof on !== 'boolean' || !DIFF_MAP[difficulty] || (selected && !d)) return { ok: false, reason: '副本或难度不合法。' };
  if(on && d?.worldChallenge && !sourceOpen(state))return {ok:false,reason:'灵脉源头当前尚未开放。'};
  if (d && state.player.stage < d.unlockStage) return { ok: false, reason: '该秘境尚未解锁。' };
  if (on && !d) return { ok: false, reason: '还没有解锁副本。' };
  if (on && state.side !== 'cultivation') return { ok: false, reason: '请在修仙界开启自动战斗。' };
  state.auto = { ...current, dungeonId: selected || null, diffId: difficulty, battleOn: on,
    acc: 0, fails: 0, stopReason: null, wins: current.wins || 0, losses: current.losses || 0, runs: current.runs || 0 };
  toast(on ? `自动战斗已开启：${d.name} · ${DIFF_MAP[difficulty].name}` : '自动战斗已关闭。');
  emit(EV.STATE);
  return { ok: true };
}

export function tickAutoBattle(state, dtMs) {
  const a = state.auto;
  if (!a || !a.battleOn || !a.dungeonId) return;
  if (!Number.isFinite(dtMs) || dtMs <= 0 || state.side !== 'cultivation') return;
  if (!DIFF_MAP[a.diffId] || !DUNGEON_MAP[a.dungeonId] || state.player.stage < DUNGEON_MAP[a.dungeonId].unlockStage) {
    a.battleOn = false; a.acc = 0; a.stopReason = '目标已失效，请重新选择。'; emit(EV.STATE); return;
  }

  a.acc = (a.acc || 0) + dtMs;
  let runs = Math.floor(a.acc / AUTO_INTERVAL_MS);
  if (runs <= 0) return;
  a.acc -= runs * AUTO_INTERVAL_MS;
  runs = Math.min(runs, 60);

  for (let i = 0; i < runs; i++) {
    if (state.player.stamina < DIFF_MAP[a.diffId].stamina) break;
    const res = runDungeon(state, a.dungeonId, a.diffId, { silent: true });
    if (!res.ok) { a.battleOn = false; a.stopReason = res.reason; break; }
    a.runs = (a.runs || 0) + 1;

    a.lastResult = { win: res.win, dungeon: res.dungeon.name, diff: res.diff.name, wave: res.clearedAtWave, stone: res.rewards.stone, at: state.world.clockMs };
    if (res.win) {
      a.wins = (a.wins || 0) + 1;
      a.fails = 0;
    } else {
      a.losses = (a.losses || 0) + 1;
      a.fails = (a.fails || 0) + 1;
      if (a.fails >= 3) {
        // 连败三次：自动降档；已经是普通还打不过就停机
        const idx = DIFFICULTIES.findIndex((x) => x.id === a.diffId);
        if (idx > 0) {
          a.diffId = DIFFICULTIES[idx - 1].id;
          a.fails = 0;
          logWarn(state, `自动战斗连续败退，已降为「${DIFF_MAP[a.diffId].name}」。`);
        } else {
          a.battleOn = false;
          a.stopReason = '普通难度连续败退三次，先调整配装。';
          logWarn(state, `自动战斗连续败退，已自动停止。建议先提升 Build 再开。`);
          break;
        }
      }
    }
  }
  emit(EV.STATE);
}

export function autoBattleView(state) {
  const a = state.auto || {};
  return {
    on: !!a.battleOn,
    dungeonId: a.dungeonId,
    diffId: a.diffId || 'normal',
    runs: a.runs || 0,
    fails: a.fails || 0,
    wins: a.wins || 0, losses: a.losses || 0, lastResult: a.lastResult || null,
    status: !a.battleOn ? (a.stopReason || '已停止') : state.side !== 'cultivation' ? '人在现代界，暂停战斗'
      : state.player.stamina < (DIFF_MAP[a.diffId]?.stamina || 10) ? '等待体力恢复' : '等待下一轮（每 30 秒世界时间）',
    dungeons: DUNGEONS.map((d) => ({
      ...d,
      unlocked: state.player.stage >= d.unlockStage && (!d.worldChallenge || sourceOpen(state)),
    })),
    diffs: DIFFICULTIES,
    etaPerRunMs: AUTO_INTERVAL_MS,
  };
}

/** 该难度下的推荐战力（用于 UI 提示） */
export function recommendPower(dungeonId, diffId) {
  const d = DUNGEON_MAP[dungeonId];
  const diff = DIFF_MAP[diffId];
  if (!d || !diff) return 0;
  const waves = resolveWaves(d);
  const boss = waves[waves.length - 1];
  const hp = boss.hp * diff.statMul;
  const atk = boss.atk * diff.statMul;
  const def = boss.def * diff.statMul;
  return Math.round(atk * 3 + def * 2 + hp * 0.35 + 20);
}

export function dungeonPreparation(state, dungeonId, diffId) {
  const d = DUNGEON_MAP[dungeonId], diff = DIFF_MAP[diffId];
  if (!d || !diff) return { ok: false, reason: '没有这个副本或难度。' };
  const attrs = computeAttrs(state), fx = techEffects(state), power = combatPower(state);
  const recommended = recommendPower(dungeonId, diffId);
  const stoneMul = (1 + beastBonuses(state).stoneBonus + dutyMultiplier(state, 'bailing') * 0.2) * (1 + (guildMods(state).dungeonStone || 0));
  const counters = DUNGEON_COUNTERS.filter((c) => d.tags.includes(c.tag)).map((c) => ({ ...c, equipped: fx.has(c.effect) }));
  const materialTarget = state.dungeon.materialTargets?.[d.id], focused = d.matPool?.includes(materialTarget);
  const rewardFactor = focused ? .85 : 1;
  const emptySkills = Object.values(state.skills).filter((s) => !s).length;
  const tips = [worldState(state).enemyAtk ? '世界状态：灵兽暴躁，本次敌人攻击提高10%。' : '', ...counters.filter((c) => !c.equipped).map((c) => `建议带上${c.name}：${c.text}。`)].filter(Boolean);
  if (focused) tips.push(`采材模式：通关额外保证1件${MATERIAL_MAP[materialTarget]?.name || ITEM_MAP[materialTarget]?.name || materialTarget}；灵石与修为减少15%，装备判定减少15个百分点，商品掉率乘70%。`);
  if (d.mechanic) tips.push(`专属机制「${d.mechanic.name}」：${d.mechanic.rule}`, `应对方式：${d.mechanic.counter}`);
  if (state.player.stage >= 4 && emptySkills) tips.push(`有 ${emptySkills} 个功法空槽，先比较可用功法。`);
  if (power < recommended * 0.8) tips.push('估算战力偏低，可先试普通难度或较早的秘境。');
  tips.push(`首波以满气血入场；胜利波次间恢复 15% 气血。BOSS 从第 5 回合起每 4 回合发动一次大招，${d.mechanic?.id === 'thunder' ? '本秘境雷劫倍率递增，最高2.1倍' : '伤害为1.5倍'}。`);
  tips.push('气血、防御、减伤与吸血有助于连续作战；提高伤害可以减少承受大招的次数。');
  return { ok: true, check: canEnter(state, dungeonId, diffId), dungeon: d, diff, attrs, power,
    recommended, counters, tips, pets: deployedBeasts(state),
    stone: d.stone.map((n) => Math.round(n * diff.rewardMul * stoneMul * rewardFactor)),
    cultivation: d.cultivation.map((n) => Math.round(n * diff.rewardMul * rewardFactor)),
    equipChance: clamp((d.equipChance - (focused ? .15 : 0)) * diff.dropMul, 0, .95),
    skillChance: state.player.stage >= 4 ? clamp(d.skillChance * diff.dropMul, 0, .9) : 0,
    signature: JSON.stringify([state.side, state.player.stage, attrs, state.skills, state.equipment, state.player.build, worldState(state), state.tech, state.beasts, state.companions, stoneMul, materialTarget]),
  };
}

/** 最靠后的已解锁副本（道侣代刷用） */
export function bestDungeon(state) {
  const list = DUNGEONS.filter((d) => state.player.stage >= d.unlockStage && (!d.worldChallenge || sourceOpen(state)));
  list.sort((a,b)=>a.unlockStage-b.unlockStage);
  return list.length ? list[list.length - 1] : null;
}

export { DUNGEONS, DUNGEON_MAP, DIFFICULTIES, DIFF_MAP, STAMINA, combatPower, powerUnit };

export function setMaterialTarget(state, dungeonId, itemId) {
  const d=DUNGEON_MAP[dungeonId];
  if(!d || state.player.stage<d.unlockStage || (itemId!==null && !d.matPool.includes(itemId)))return {ok:false,reason:'请选择已解锁秘境的掉落材料。'};
  (state.dungeon.materialTargets ??= {})[dungeonId]=itemId;emit(EV.STATE);return {ok:true};
}
