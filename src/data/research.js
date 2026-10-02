/**
 * research.js —— 灵科融合研究树（GDD 5）
 *
 * 现代科技不再提供简单的「+20% 属性」Buff，而是升级为机制型功能。
 * 研究点（Research Point）通过现代研究 + 修仙材料 + 特殊事件获得。
 */

export const BRANCHES = [
  {
    id: 'energy', name: '灵能工程', dir: '现代工业 × 修仙阵法',
    desc: '把电和灵力接在同一根线上。第一个做到的人会被两边同时通缉。',
  },
  {
    id: 'alchemy', name: '丹药科学', dir: '现代分析 × 炼丹术',
    desc: '把「火候」翻译成温度曲线，把「药性」翻译成分子式。',
  },
  {
    id: 'compute', name: '功法计算', dir: '现代计算机 × 修仙功法',
    desc: '你给功法建了模型。它开始给出你没想过的路线。',
  },
  {
    id: 'material', name: '材料工程', dir: '现代冶金 × 灵金材料',
    desc: '灵金的延展性不符合任何已知的金属学定律。那就重写定律。',
  },
];

export const PROJECTS = [
  /* ---- 灵能工程 ---- */
  {
    id: 'battery', branch: 'energy', name: '灵能电池', cost: 20, req: [],
    effect: { breakthroughLossMul: 0.5 },
    effectDesc: '突破失败时自动抵消一半修为损失',
    desc: '储存多余灵力。突破失败的一瞬间，它替你接住了一部分。',
  },
  {
    id: 'sensor', branch: 'energy', name: '阵法传感器', cost: 45, req: ['battery'],
    effect: { dungeonIntel: true },
    effectDesc: '副本中显示 BOSS 血量与技能冷却',
    desc: '把阵法的灵气波动读成数字。你现在能「看见」对手还剩多少。',
  },
  {
    id: 'autoirrigate', branch: 'energy', name: '自动灵田', cost: 90, req: ['sensor'],
    effect: { farmYield: 0.30, autoFarm: true },
    effectDesc: '灵田无人值守自动浇水施肥，产量 +30%，且离线自动补种',
    desc: '定时器、水泵、一根接在灵脉上的管子。修仙界的农民会恨你。',
  },

  /* ---- 丹药科学 ---- */
  {
    id: 'toxanalyze', branch: 'alchemy', name: '分析丹毒', cost: 25, req: [],
    effect: { alchemyTox: 0.5 },
    effectDesc: '炼丹副作用概率 -50%',
    desc: '丹毒的成分在现代实验室里有个名字：重金属络合物。',
  },
  {
    id: 'database', branch: 'alchemy', name: '药性数据库', cost: 55, req: ['toxanalyze'],
    effect: { alchemySuccess: 0.10 },
    effectDesc: '炼丹成功率 +10%',
    desc: '三千年份的丹方，加上一台能跑的服务器。',
  },
  {
    id: 'autopill', branch: 'alchemy', name: '自动炼丹机', cost: 110, req: ['database'],
    effect: { autoAlchemy: true },
    effectDesc: '离线自动炼丹（每次界潮刷新时结算一批）',
    desc: '炉子会自己看火。你终于可以睡觉了。',
  },

  /* ---- 功法计算 ---- */
  {
    id: 'simulate', branch: 'compute', name: '功法模拟', cost: 30, req: [],
    effect: { skillPreview: true },
    effectDesc: '功法升级前可预览属性变化',
    desc: '先跑一遍模拟，再决定要不要把这条经脉走通。',
  },
  {
    id: 'meridian', branch: 'compute', name: '经脉模型', cost: 65, req: ['simulate'],
    effect: { skillPower: 0.15 },
    effectDesc: '功法威力 +15%',
    desc: '你算出了最优的灵气路径。它和你师父教的不一样。',
  },
  {
    id: 'branchpredict', branch: 'compute', name: '技能分支预测', cost: 130, req: ['meridian'],
    effect: { freePathSwitch: true },
    effectDesc: '每周可免费重选一次道途',
    desc: '系统预测了你的下一步。它给出的三个选项，你一个都没想到。',
  },

  /* ---- 材料工程 ---- */
  {
    id: 'matanalyze', branch: 'material', name: '灵金分析', cost: 25, req: [],
    effect: { matInfo: true },
    effectDesc: '显示材料的性质与用途',
    desc: 'X 射线衍射图上一片空白。你又做了一次，还是一片空白。',
  },
  {
    id: 'alloy', branch: 'material', name: '合金融合', cost: 60, req: ['matanalyze'],
    effect: { forgeTierUp: 0.35 },
    effectDesc: '炼器有 35% 概率产出更高一阶的品级',
    desc: '把灵金按一定比例掺进钛合金，得到了不该存在的东西。',
  },
  {
    id: 'stability', branch: 'material', name: '法器稳定性研究', cost: 120, req: ['alloy'],
    effect: { forgeSuccess: 0.15 },
    effectDesc: '炼器成功率 +15%',
    desc: '你终于搞明白了炼器为什么会炸——是应力集中。',
  },
];

export const PROJECT_MAP = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export function projectsOf(branchId) {
  return PROJECTS.filter((p) => p.branch === branchId);
}

/** 研究所：现代建筑，每小时产出研究点 */
export const RESEARCH_LAB = {
  maxLevel: 12,
  costOf(level) { return Math.round(6000 * Math.pow(2.05, level)); },
  rpPerHour(level) { return level * 1.6; },
};

/** 材料兑换研究点：按材料档位 */
export function materialToRP(mat) {
  return Math.max(1, Math.round((mat.tier || 1) * 6));
}

/** 汇总所有已解锁研究的效果 */
export function researchEffects(state) {
  const out = {
    breakthroughLossMul: 1,
    dungeonIntel: false,
    farmYield: 0,
    autoFarm: false,
    alchemyTox: 1,
    alchemySuccess: 0,
    autoAlchemy: false,
    skillPreview: false,
    skillPower: 0,
    freePathSwitch: false,
    matInfo: false,
    forgeTierUp: 0,
    forgeSuccess: 0,
  };
  const done = state.research?.done || {};
  for (const p of PROJECTS) {
    if (!done[p.id]) continue;
    for (const [k, v] of Object.entries(p.effect)) {
      if (typeof v === 'number' && typeof out[k] === 'number') {
        out[k] = k === 'breakthroughLossMul' || k === 'alchemyTox' ? out[k] * v : out[k] + v;
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

export function canResearch(state, id) {
  const p = PROJECT_MAP[id];
  if (!p) return { ok: false, reason: '没有这项研究。' };
  if (state.research?.done?.[id]) return { ok: false, reason: '已完成。' };
  for (const r of p.req) {
    if (!state.research?.done?.[r]) {
      return { ok: false, reason: `需要先完成「${PROJECT_MAP[r].name}」。` };
    }
  }
  if ((state.research?.points || 0) < p.cost) {
    return { ok: false, reason: `研究点不足（需 ${p.cost}）。` };
  }
  return { ok: true };
}
