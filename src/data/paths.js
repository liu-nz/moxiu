/**
 * paths.js —— 道途系统（GDD 8）
 * 开局选择一条，提供核心被动，决定 Build 大方向。
 */

export const PATHS = [
  {
    id: 'war', name: '战修', icon: '战',
    passive: '攻击 +20%，暴击伤害 +30%',
    fit: '刷副本、推图、PVP，输出型',
    mods: { atkMul: 0.20, critDmgAdd: 0.30 },
    desc: '以战养道。刀口舔血换来的修为，比打坐快得多，也险得多。',
  },
  {
    id: 'law', name: '法修', icon: '法',
    passive: '功法威力 +30%，真元上限 +50%',
    fit: '技能流、群攻推图',
    mods: { skillPowerAdd: 0.30, mpMaxMul: 0.50 },
    desc: '重术不重器。一册功法在手，胜过千般法器。',
  },
  {
    id: 'alchemy', name: '丹修', icon: '丹',
    passive: '炼丹成功率 +25%，丹药效果 +20%',
    fit: '炼丹流、经济流、自给自足',
    mods: { alchemyAdd: 0.25, pillEffectAdd: 0.20 },
    desc: '炉火不熄。别人靠打，你靠卖——丹药在两界都是硬通货。',
  },
  {
    id: 'artifact', name: '器修', icon: '器',
    passive: '炼器成功率 +25%，装备强化加成 +15%',
    fit: '装备流、打宝流',
    mods: { forgeAdd: 0.25, enhanceAdd: 0.15 },
    desc: '以器证道。你相信一切修为最终都要落在器物上。',
  },
  {
    id: 'merchant', name: '商修', icon: '商',
    passive: '贸易利润 +30%，店铺客流量 +20%',
    fit: '跨界贸易流、经济养成流',
    mods: { tradeProfitAdd: 0.30, shopTrafficAdd: 0.20 },
    desc: '两界之间最锋利的东西不是剑，是价差。',
  },
  {
    id: 'speed', name: '速修', icon: '速',
    passive: '修炼速度 +25%，突破成功率 +10%',
    fit: '快速飞升流、冲级流',
    mods: { cultSpeedAdd: 0.25, breakthroughAdd: 0.10 },
    desc: '不快就死。你把每一次打坐都当作最后一次。',
  },
];

export const PATH_MAP = Object.fromEntries(PATHS.map((p) => [p.id, p]));

export function getPath(id) { return id ? PATH_MAP[id] : null; }

/** 取道途修正（没有道途时返回全 0） */
export function pathMods(id) {
  const p = getPath(id);
  return p ? p.mods : {};
}

/** 切换道途的道具（GDD 8：中期可通过道具切换，MVP 提供一次免费重选） */
export const PATH_SWITCH_COST = { stone: 5000 };
