/**
 * fates.js —— 轮回与天命（GDD 16）
 *
 * 渡劫飞升后进入轮回：结算轮回点、解锁图鉴、获得永久加成。
 * 每次轮回选择一个天命（相当于周目 buff / 特殊规则），改变下一轮的玩法路线。
 */

import { projectEffects } from './projects.js';

export const FATES = [
  {
    id: 'merchant', name: '商道天命', icon: '商',
    effect: '开局自带启动资金，贸易利润 +50%，但修炼速度 -20%；任意道途均可使用商修锁价',
    mods: { tradeProfitAdd: 0.50, cultSpeedAdd: -0.20, startCny: 50000, startStone: 2000 },
    fit: '适合经商流',
  },
  {
    id: 'alchemy', name: '丹道天命', icon: '丹',
    effect: '开局灵田 +2 块，炼丹成功率 +40%，但攻击 -15%；副本每四回合恢复2%气血',
    mods: { alchemyAdd: 0.40, atkMul: -0.15, startPlots: 2 },
    fit: '适合炼丹流',
  },
  {
    id: 'war', name: '战道天命', icon: '战',
    effect: '开局自带灵器武器，攻击 +30%，但店铺收入 -30%，首领蓄力伤害额外+10%',
    mods: { atkMul: 0.30, shopIncomeMul: -0.30, startWeaponTier: 1 },
    fit: '适合战斗流',
  },
  {
    id: 'speed', name: '速道天命', icon: '速',
    effect: '修炼速度 +40%，突破成功率 +5%；首领蓄力回合优先出手',
    mods: { cultSpeedAdd: 0.40, breakthroughAdd: 0.05 },
    fit: '适合冲级流',
  },
];

export const FATE_MAP = Object.fromEntries(FATES.map((f) => [f.id, f]));

/** 轮回永久加成（消耗轮回点，跨周目保留） */
export const BLESSINGS = [
  { id: 'cult',     name: '悟性',   desc: '修炼速度 +6% / 级', max: 20, costOf: (l) => 2 + l },
  { id: 'atk',      name: '锋芒',   desc: '攻击 +6% / 级',     max: 20, costOf: (l) => 2 + l },
  { id: 'hp',       name: '道体',   desc: '气血 +8% / 级',     max: 20, costOf: (l) => 2 + l },
  { id: 'trade',    name: '财路',   desc: '贸易利润 +5% / 级', max: 15, costOf: (l) => 3 + l * 2 },
  { id: 'fortune',  name: '福缘',   desc: '掉落与奇闻好运 +5% / 级', max: 10, costOf: (l) => 4 + l * 2 },
  { id: 'gate',     name: '界感',   desc: '跨界载重 +1kg / 级', max: 10, costOf: (l) => 5 + l * 3 },
];

export const BLESSING_MAP = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));

/** 图鉴：每个大境界首次到达即解锁 */
export const CODEX = [
  { id: 'qi',          name: '炼气',     desc: '初引灵气入体。' },
  { id: 'foundation',  name: '筑基',     desc: '筑就道基，可御物远行。' },
  { id: 'core',        name: '金丹',     desc: '凝气成丹，灵科融合。' },
  { id: 'nascent',     name: '元婴',     desc: '元婴出窍，两界并行。' },
  { id: 'spirit',      name: '化神',     desc: '神念化虚，一念千里。' },
  { id: 'void',        name: '炼虚',     desc: '炼化虚空，界门无碍。' },
  { id: 'fusion',      name: '合体',     desc: '身与道合，隔空传物。' },
  { id: 'mahayana',    name: '大乘',     desc: '阵法建筑改造城市。' },
  { id: 'tribulation', name: '渡劫',     desc: '九重雷劫，一步飞升。' },
];

/**
 * 轮回结算：把本世的成就折算成轮回点。
 * 目标：一轮 7-14 天，首次轮回能拿到 20-40 点。
 */
export function settleReincarnation(state) {
  const stage = state.player.stage || 0;
  const realmIndex = Math.min(8, Math.floor(stage / 4.7));
  const parts = [];

  const realmPts = Math.round(stage * 0.9);
  parts.push({ label: `境界（第 ${stage + 1} 阶）`, value: realmPts });

  const stonePts = Math.round(Math.log10(Math.max(1, state.stats.maxStone || 0)) * 2.2);
  parts.push({ label: '财富', value: stonePts });

  const cnyPts = Math.round(Math.log10(Math.max(1, state.stats.maxCny || 0)) * 1.6);
  parts.push({ label: '产业', value: cnyPts });

  const dungeonPts = Math.round(Object.values(state.dungeon?.cleared || {}).reduce((a, b) => a + b, 0) * 0.35);
  parts.push({ label: '副本战绩', value: dungeonPts });

  const tradePts = Math.round(Math.log10(Math.max(1, state.stats.tradeCount || 0)) * 3);
  parts.push({ label: '贸易规模', value: tradePts });

  const companionPts = Object.values(state.companions || {}).reduce(
    (a, c) => a + Math.floor((c.affection || 0) / 25), 0,
  );
  parts.push({ label: '道侣缘分', value: companionPts });

  const researchPts = Object.keys(state.research?.done || {}).length;
  parts.push({ label: '灵科研究', value: researchPts });

  const total = parts.reduce((a, p) => a + p.value, 0);

  // 城市灵改工程「飞升台基座」提升轮回点收益
  const bonus = projectEffects(state).reincarnationBonus || 0;
  if (bonus > 0) parts.push({ label: `飞升台基座 +${(bonus * 100).toFixed(0)}%`, value: Math.round(total * bonus) });

  const final = parts.reduce((a, p) => a + p.value, 0);
  return { parts, total: Math.max(5, final), realmIndex };
}
