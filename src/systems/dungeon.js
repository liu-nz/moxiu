/**
 * dungeon.js —— 副本系统（GDD 10）+ 挂机自动战斗（GDD 2.1）
 * 八大副本、三难度、体力消耗制。
 * 敌人数值由 data/dungeons.js 按解锁阶段的玩家战力推导。
 */

import {
  DUNGEONS, DUNGEON_MAP, DIFFICULTIES, DIFF_MAP, STAMINA, QUALITY_TABLE,
  resolveWaves, dropScale, skillScale, powerUnit,
} from '../data/dungeons.js';
import { stageInfo } from '../data/realms.js';
import { rollEquipment, randomTierIndex } from '../data/equipment.js';
import { rollSkill, randomSkillTier, randomGrade } from '../data/skills.js';
import { addItem } from './inventory.js';
import { simulateBattle } from './combat.js';
import { computeAttrs, guildMods, combatPower, sectMods } from './character.js';
import { researchEffects } from '../data/research.js';
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

export function tickStamina(state, dtMs) {
  const max = staminaMax(state);
  if (state.player.stamina >= max) { state.player.staminaAcc = 0; return; }
  state.player.staminaAcc = (state.player.staminaAcc || 0) + dtMs;
  while (state.player.staminaAcc >= STAMINA.regenPerMs && state.player.stamina < max) {
    state.player.staminaAcc -= STAMINA.regenPerMs;
    state.player.stamina = Math.min(max, state.player.stamina + 1);
  }
}

export function staminaEta(state) {
  const max = staminaMax(state);
  if (state.player.stamina >= max) return 0;
  const need = max - state.player.stamina;
  return need * STAMINA.regenPerMs - (state.player.staminaAcc || 0);
}

/* ---------------- 解锁 ---------------- */
export function unlockedDungeons(state) {
  return DUNGEONS.map((d, i) => ({
    ...d,
    index: i,
    unlocked: state.player.stage >= d.unlockStage,
    unlockLabel: stageInfo(d.unlockStage).stage.name,
    waves: resolveWaves(d),
  }));
}

export function canEnter(state, dungeonId, diffId) {
  const d = DUNGEON_MAP[dungeonId];
  const diff = DIFF_MAP[diffId];
  if (!d || !diff) return { ok: false, reason: '没有这个副本。' };
  if (state.player.stage < d.unlockStage) {
    return { ok: false, reason: `需要达到 ${stageInfo(d.unlockStage).stage.name} 才能进入。` };
  }
  if (state.player.stamina < diff.stamina) {
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
  const mul = diff.rewardMul;
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
  const eqChance = clamp(d.equipChance * diff.dropMul, 0, 0.95);
  const drops = rint(1, diff.id === 'hell' ? 2 : 1) + (bailing ? 1 : 0) + bb.bonusDrops;
  for (let i = 0; i < drops; i++) {
    if (Math.random() < eqChance) {
      const slots = ['weapon', 'helmet', 'armor', 'boots', 'ring1', 'ring2', 'artifact'];
      const slot = slots[Math.floor(Math.random() * slots.length)];
      const tierIdx = randomTierIndex(diff.id === 'hell' ? 4 : diff.id === 'hard' ? 3 : 2);
      const eq = rollEquipment(slot, tierIdx, dropScale(d));
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

  // 商品（带品质）
  if (Math.random() < d.goodsChance) {
    const itemId = d.goodsPool[Math.floor(Math.random() * d.goodsPool.length)];
    const qty = rint(1, diff.id === 'normal' ? 3 : diff.id === 'hard' ? 6 : 12);
    const quality = rollQuality(0);
    addItem(state, itemId, qty, quality);
    result.rewards.goods.push({ itemId, qty, quality });
  }

  // 灵兽捕捉
  const captured = tryCapture(state, DUNGEONS.indexOf(d), diff.id, (state.reincarnation?.blessings?.fortune || 0) * 0.05);
  if (captured) result.rewards.beast = captured;

  advanceIfReady(state);
}

/* ---------------- 副本主流程 ---------------- */
export function runDungeon(state, dungeonId, diffId, opts = {}) {
  const check = canEnter(state, dungeonId, diffId);
  if (!check.ok) return { ok: false, reason: check.reason };

  const d = DUNGEON_MAP[dungeonId];
  const diff = DIFF_MAP[diffId];
  const waves = resolveWaves(d);
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
  };

  const attrs = computeAttrs(state);
  const pets = deployedBeasts(state);
  const intel = researchEffects(state).dungeonIntel;
  let hp = attrs.hpMax;

  for (const w of waves) {
    const enemy = {
      ...w,
      hp: Math.round(w.hp * diff.statMul),
      atk: Math.round(w.atk * diff.statMul),
      def: Math.round(w.def * diff.statMul),
      spd: Math.round(w.spd * diff.statMul * 10) / 10,
    };
    const battle = simulateBattle(state, enemy, { dungeon: d, playerHp: hp, pets, intel });
    state.stats.battles += 1;
    result.waves.push({ enemy: w.name, boss: !!w.boss, ...battle });
    hp = battle.playerHp;
    if (!battle.win) {
      result.win = false;
      result.clearedAtWave = result.waves.length;
      break;
    }
    state.stats.wins += 1;
    hp = Math.min(attrs.hpMax, hp + Math.round(attrs.hpMax * 0.15));
  }

  if (result.win) {
    grantRewards(state, d, diff, result, silent);
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

  if (!silent) {
    state.dungeon.log.unshift({
      t: state.world.clockMs,
      dungeon: d.name,
      diff: diff.name,
      win: result.win,
      stone: result.rewards.stone,
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
  if (!state.auto) state.auto = { battleOn: false, dungeonId: null, diffId: 'normal', acc: 0, runs: 0, fails: 0 };
  if (dungeonId) state.auto.dungeonId = dungeonId;
  if (diffId) state.auto.diffId = diffId;
  if (on && !state.auto.dungeonId) {
    const list = DUNGEONS.filter((d) => state.player.stage >= d.unlockStage);
    if (!list.length) return { ok: false, reason: '还没有解锁任何副本。' };
    state.auto.dungeonId = list[list.length - 1].id;
  }
  state.auto.battleOn = !!on;
  state.auto.acc = 0;
  state.auto.fails = 0;
  toast(on ? `自动战斗已开启：${DUNGEON_MAP[state.auto.dungeonId]?.name} · ${DIFF_MAP[state.auto.diffId]?.name}` : '自动战斗已关闭。');
  emit(EV.STATE);
  return { ok: true };
}

export function tickAutoBattle(state, dtMs) {
  const a = state.auto;
  if (!a || !a.battleOn || !a.dungeonId) return;
  const diff = DIFF_MAP[a.diffId];
  if (!diff) return;

  a.acc = (a.acc || 0) + dtMs;
  let runs = Math.floor(a.acc / AUTO_INTERVAL_MS);
  if (runs <= 0) return;
  a.acc -= runs * AUTO_INTERVAL_MS;
  runs = Math.min(runs, 60);

  for (let i = 0; i < runs; i++) {
    if (state.player.stamina < diff.stamina) break;
    const res = runDungeon(state, a.dungeonId, a.diffId, { silent: true });
    if (!res.ok) break;
    a.runs = (a.runs || 0) + 1;

    if (res.win) {
      a.fails = 0;
    } else {
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
    dungeons: DUNGEONS.map((d) => ({
      ...d,
      unlocked: state.player.stage >= d.unlockStage,
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

/** 最靠后的已解锁副本（道侣代刷用） */
export function bestDungeon(state) {
  const list = DUNGEONS.filter((d) => state.player.stage >= d.unlockStage);
  return list.length ? list[list.length - 1] : null;
}

export { DUNGEONS, DUNGEON_MAP, DIFFICULTIES, DIFF_MAP, STAMINA, combatPower, powerUnit };
