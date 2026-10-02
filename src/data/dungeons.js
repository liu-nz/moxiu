/**
 * dungeons.js —— 副本与战斗（GDD 10）
 * 八大副本：山贼寨 → 乱葬岗 → 黑水沼泽 → 万剑冢 → 九幽炼狱 → 太虚遗迹 → 星陨海 → 飞升台
 * 三难度（普通/困难/地狱），体力消耗制。
 *
 * 敌人数值不写死，而是相对「解锁阶段的玩家基础战力」按系数推导，
 * 这样八条难度曲线自动跟随境界成长，不会出现后期副本比前期还软的情况。
 */

import { baseAttrs, stageInfo } from './realms.js';

export const DIFFICULTIES = [
  { id: 'normal', name: '普通', statMul: 1.00, stamina: 10, rewardMul: 1.0, dropMul: 1.0 },
  { id: 'hard',   name: '困难', statMul: 2.20, stamina: 25, rewardMul: 2.2, dropMul: 1.6 },
  { id: 'hell',   name: '地狱', statMul: 3.20, stamina: 50, rewardMul: 5.0, dropMul: 2.6 },
];
export const DIFF_MAP = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

/** 仅作用于首领；战前说明和结算共同引用。 */
export const DUNGEON_MECHANICS = {
  bandit: { id: 'ambush', name: '抢攻', rule: '首领前两回合攻击提高40%。', counter: '速度抢先、气血与减伤有助于撑过开场。' },
  graveyard: { id: 'revive', name: '阴魂复苏', rule: '每回合末首领恢复4%最大气血。', counter: '强光手电阻断复苏；高输出也能在恢复前击败首领。' },
  swamp: { id: 'poison', name: '叠层瘴毒', rule: '首领命中后叠一层毒，回合末每层造成最大气血2%的伤害，最多三层。', counter: '抗生素免疫瘴毒；闪避阻止叠层，减伤降低毒伤。' },
  swordtomb: { id: 'reflect', name: '剑阵反击', rule: '每第三回合，首领反弹人物该次伤害的20%；灵兽合击不反弹。', counter: '功法威力达到30%时反弹减半；减伤与灵兽合击可应对。' },
  purgatory: { id: 'burn', name: '地火灼烧', rule: '每回合末地火造成最大气血2%的伤害。', counter: '防火服隔绝地火；减伤可降低灼烧伤害。' },
  ruins: { id: 'shield', name: '残阵护盾', rule: '首领入场获得相当于最大气血20%的护盾，先耗尽护盾才能伤及本体。', counter: '阵法传感器或命中加成达到15%时护盾减半；功法威力达到30%时再减半。' },
  starfall: { id: 'pressure', name: '深海重压', rule: '人物本场攻击降低15%，灵兽合击不受影响。', counter: '人物速度不低于首领时抵消重压；灵兽与速度配装有优势。' },
  ascension: { id: 'thunder', name: '递增劫雷', rule: '首领大招倍率每四回合增加15个百分点，最高2.1倍。', counter: '持续减伤、吸血与护主灵兽保命；缩短战斗能减少雷劫强度。' },
};

/** 战前说明与实际科技克制共用，防止提示和结算各写一套。 */
export const DUNGEON_COUNTERS = [
  { tag: 'dark', effect: 'light_boost', name: '强光手电', damage: 2, reduce: 0, text: '阴系伤害 ×2' },
  { tag: 'poison', effect: 'poison_immunity', name: '抗生素', damage: 1.35, reduce: 0.20, text: '毒系伤害 ×1.35，额外减伤 20%' },
  { tag: 'fire', effect: 'heat_shield', name: '防火服', damage: 1, reduce: 0.25, text: '炼狱系额外减伤 25%' },
];

/** 波次系数：hp/def 相对玩家基础攻击，atk 相对玩家基础气血，spd 相对玩家基础速度 */
const WAVE_PROFILE = [
  { hp: 2.4, atk: 0.033, def: 0.05, spd: 0.85 },
  { hp: 3.4, atk: 0.048, def: 0.08, spd: 1.00 },
  { hp: 5.0, atk: 0.063, def: 0.12, spd: 1.10 },
  { hp: 8.0, atk: 0.088, def: 0.16, spd: 1.20, boss: true },
];

export const DUNGEONS = [
  {
    id: 'bandit', name: '山贼寨', unlockStage: 2, tags: [], powerBias: 0.85,
    desc: '一群占了官道的散修，抢来的东西堆了半个寨子。他们不知道什么叫载重上限。',
    waves: ['山贼喽啰', '山贼刀手', '山贼头目', '寨主·独眼虎'],
    stone: [30, 70], cultivation: [600, 1200],
    equipChance: 0.45, skillChance: 0.16, goodsChance: 0.60,
    goodsPool: ['lingmi', 'huangjing', 'juqi', 'yasuo'],
    matPool: ['yaodan'],
  },
  {
    id: 'graveyard', name: '乱葬岗', unlockStage: 5, tags: ['dark'], powerBias: 1.00,
    desc: '阴气积了三百年的地方。活人进去要打灯，修士进去要打十二分精神。',
    waves: ['腐尸', '食尸鬼', '尸魈', '尸王·无面'],
    stone: [80, 160], cultivation: [1000, 2000],
    equipChance: 0.55, skillChance: 0.22, goodsChance: 0.70,
    goodsPool: ['huangjing', 'juqi', 'yaodan', 'kangshengsu'],
    matPool: ['yaodan', 'yinjing'],
  },
  {
    id: 'swamp', name: '黑水沼泽', unlockStage: 11, tags: ['poison'], powerBias: 1.05,
    desc: '瘴气终年不散。带一盒抗生素进去，比带十件法器管用。',
    waves: ['瘴气水蛭', '毒沼巨鳄', '蚀骨毒藤', '沼主·万毒母'],
    stone: [200, 400], cultivation: [6000, 12000],
    equipChance: 0.60, skillChance: 0.24, goodsChance: 0.75,
    goodsPool: ['juqi', 'yaodan', 'gufaqi', 'jingmi'],
    matPool: ['yaodan', 'yinjing', 'lingjin'],
  },
  {
    id: 'swordtomb', name: '万剑冢', unlockStage: 15, tags: [], powerBias: 1.10,
    desc: '上万把断剑插在山谷里，每一把都还记着前主人最后一招。',
    waves: ['残剑游魂', '剑冢守卫', '无主剑灵', '剑冢·万剑归宗'],
    stone: [600, 1200], cultivation: [60000, 120000],
    equipChance: 0.70, skillChance: 0.34, goodsChance: 0.70,
    goodsPool: ['gufaqi', 'yaodan', 'jingmi', 'hejin'],
    matPool: ['lingjin', 'jianpo'],
  },
  {
    id: 'purgatory', name: '九幽炼狱', unlockStage: 19, tags: ['dark', 'fire'], powerBias: 1.15,
    desc: '地火与阴魂同炉。炼狱里最好的东西，都在最烫的地方。',
    waves: ['焦骨狱卒', '炼狱火鬼', '九幽判官', '狱主·焚天'],
    stone: [2000, 4000], cultivation: [600000, 1200000],
    equipChance: 0.75, skillChance: 0.38, goodsChance: 0.75,
    goodsPool: ['gufaqi', 'yaodan', 'jingmi', 'hejin'],
    matPool: ['lingjin', 'jianpo', 'huojing'],
  },
  {
    id: 'ruins', name: '太虚遗迹', unlockStage: 23, tags: [], powerBias: 1.20,
    desc: '前朝飞升者留下的洞府。阵法还在运转，主人已经不在了。',
    waves: ['残阵傀儡', '太虚守卫', '遗迹器灵', '遗迹核心·太虚'],
    stone: [8000, 16000], cultivation: [6000000, 12000000],
    equipChance: 0.80, skillChance: 0.42, goodsChance: 0.80,
    goodsPool: ['gufaqi', 'jingmi', 'hejin'],
    matPool: ['lingjin', 'jianpo', 'xuanjing'],
  },
  {
    id: 'starfall', name: '星陨海', unlockStage: 27, tags: ['poison'], powerBias: 1.25,
    desc: '天外陨铁沉在海底，海水被染成毒。捞上来的人，一半没回来。',
    waves: ['陨铁寄生物', '深海毒蛟', '星陨巨鲸', '海主·陨星'],
    stone: [30000, 60000], cultivation: [60000000, 120000000],
    equipChance: 0.85, skillChance: 0.46, goodsChance: 0.80,
    goodsPool: ['gufaqi', 'hejin'],
    matPool: ['xuanjing', 'xingchen'],
  },
  {
    id: 'ascension', name: '飞升台', unlockStage: 39, tags: ['dark'], powerBias: 1.30,
    desc: '九重雷劫落下的地方。台上的每一道刻痕，都是一次没成功的飞升。',
    waves: ['劫雷化身', '雷池守卫', '前代飞升者残念', '飞升台·天劫'],
    stone: [150000, 300000], cultivation: [46000000000, 92000000000],
    equipChance: 0.90, skillChance: 0.50, goodsChance: 0.85,
    goodsPool: ['gufaqi', 'hejin'],
    matPool: ['xingchen', 'xuanjing'],
  },
];

export const DUNGEON_MAP = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));
for (const d of DUNGEONS) d.mechanic = DUNGEON_MECHANICS[d.id];

/** 该副本解锁阶段的玩家基础战力（作为敌人数值的基准单位） */
export function powerUnit(dungeon) {
  const gi = Math.min(dungeon.unlockStage, 41);
  const base = baseAttrs(gi);
  const bias = dungeon.powerBias || 1;
  return {
    atk: base.atk * bias,
    hp: base.hpMax * bias,
    spd: base.spd,
    stage: stageInfo(gi),
  };
}

/** 把系数展开成具体敌人数值（普通难度基准，实际战斗再乘难度系数） */
export function resolveWaves(dungeon) {
  const u = powerUnit(dungeon);
  return dungeon.waves.map((name, i) => {
    const p = WAVE_PROFILE[Math.min(i, WAVE_PROFILE.length - 1)];
    return {
      name,
      boss: !!p.boss,
      hp: Math.max(1, Math.round(u.atk * p.hp)),
      atk: Math.max(1, Math.round(u.hp * p.atk)),
      def: Math.max(0, Math.round(u.atk * p.def)),
      spd: Math.round(u.spd * p.spd * 10) / 10,
    };
  });
}

/** 掉落装备/功法的数值规模（与玩家在该阶段的攻击力同量级） */
export function dropScale(dungeon) {
  const u = powerUnit(dungeon);
  return Math.max(1, u.atk * 1.8);
}

export function skillScale(dungeon) {
  const u = powerUnit(dungeon);
  return Math.max(1, u.atk * 0.8);
}

/** 体力（GDD 10：体力消耗制） */
export const STAMINA = {
  max: 100,
  regenPerMs: 8 * 60 * 1000,   // 每 8 分钟恢复 1 点（满体力约 13 小时）
};

/** 商品掉落时的品质分布（GDD 4.1 品质系数） */
export const QUALITY_TABLE = [
  { id: 'common', name: '普通', mult: 1.0, w: 62 },
  { id: 'fine',   name: '优质', mult: 1.4, w: 24 },
  { id: 'rare',   name: '稀有', mult: 2.2, w: 10 },
  { id: 'epic',   name: '珍品', mult: 4.0, w: 3.2 },
  { id: 'legend', name: '绝品', mult: 8.0, w: 0.8 },
];
export const QUALITY_MAP = Object.fromEntries(QUALITY_TABLE.map((q) => [q.id, q]));
