/**
 * realms.js —— 境界与修为（GDD 6）
 * 九大境界：炼气 → 筑基 → 金丹 → 元婴 → 化神 → 炼虚 → 合体 → 大乘 → 渡劫 → 飞升轮回
 *
 * 炼气十层修为表取自 GDD 6.1；其余境界 GDD 未给表，按同一曲线外推。
 * mult      —— 该境界的「修炼速度倍率」，决定修为产出
 * statMult  —— 该境界的「属性倍率」，决定五维基础值
 */

export const REALMS = [
  {
    id: 'qi', name: '炼气', tier: 'early', locked: false,
    mult: 1, statMult: 1,
    desc: '凡人之躯初引灵气入体。现代文明在这个阶段对修士而言近乎神迹。',
    stages: [
      { name: '炼气一层', need: 100,     note: '开局' },
      { name: '炼气二层', need: 500,     note: '' },
      { name: '炼气三层', need: 1000,    note: '解锁副本「山贼寨」' },
      { name: '炼气四层', need: 2000,    note: '' },
      { name: '炼气五层', need: 4000,    note: '解锁功法系统' },
      { name: '炼气六层', need: 8000,    note: '解锁副本「乱葬岗」' },
      { name: '炼气七层', need: 16000,   note: '' },
      { name: '炼气八层', need: 32000,   note: '' },
      { name: '炼气九层', need: 50000,   note: '' },
      { name: '炼气十层', need: 60000,   note: '大圆满，可突破筑基' },
    ],
  },
  {
    id: 'foundation', name: '筑基', tier: 'early', locked: false,
    mult: 12, statMult: 6,
    desc: '筑就道基，可御物、可远行。界门随境界提升而扩容。',
    stages: [
      { name: '筑基初期', need: 150000,  note: '界门升至 Lv.2，每日穿越次数 +1' },
      { name: '筑基中期', need: 300000,  note: '解锁副本「黑水沼泽」' },
      { name: '筑基后期', need: 600000,  note: '' },
      { name: '筑基大圆满', need: 1000000, note: '可突破金丹' },
    ],
  },
  {
    id: 'core', name: '金丹', tier: 'mid', locked: false,
    mult: 120, statMult: 36,
    desc: '凝气成丹。灵科融合路线正式展开——现代仪器开始真正帮上忙。',
    stages: [
      { name: '金丹初期', need: 2000000,   note: '界门升至 Lv.3，可携带活物跨界' },
      { name: '金丹中期', need: 4000000,   note: '解锁副本「万剑冢」' },
      { name: '金丹后期', need: 8000000,   note: '' },
      { name: '金丹大圆满', need: 14000000, note: '可突破元婴' },
    ],
  },
  {
    id: 'nascent', name: '元婴', tier: 'mid', locked: false,
    mult: 1200, statMult: 216,
    desc: '元婴出窍，可离体远游。你开始同时处理两个世界的生意。',
    stages: [
      { name: '元婴初期', need: 30000000,  note: '界门升至 Lv.4，可携带道侣跨界' },
      { name: '元婴中期', need: 60000000,  note: '解锁副本「九幽炼狱」' },
      { name: '元婴后期', need: 120000000, note: '' },
      { name: '元婴大圆满', need: 200000000, note: '可突破化神' },
    ],
  },
  {
    id: 'spirit', name: '化神', tier: 'mid', locked: false,
    mult: 12000, statMult: 1296,
    desc: '神念化虚，一念千里。普通现代科技已无法直接对抗，只能融合。',
    stages: [
      { name: '化神初期', need: 400000000,  note: '界门升至 Lv.5，界潮累计上限 +2' },
      { name: '化神中期', need: 800000000,  note: '解锁副本「太虚遗迹」' },
      { name: '化神后期', need: 1600000000, note: '' },
      { name: '化神大圆满', need: 2800000000, note: '可突破炼虚' },
    ],
  },
  {
    id: 'void', name: '炼虚', tier: 'late', locked: false,
    mult: 120000, statMult: 7776,
    desc: '炼化虚空，界门近乎无碍。灵能电池开始在两个世界同时供电。',
    stages: [
      { name: '炼虚初期', need: 5000000000,  note: '界门升至 Lv.6，解锁界门商店' },
      { name: '炼虚中期', need: 10000000000, note: '解锁副本「星陨海」' },
      { name: '炼虚后期', need: 20000000000, note: '' },
      { name: '炼虚大圆满', need: 35000000000, note: '可突破合体' },
    ],
  },
  {
    id: 'fusion', name: '合体', tier: 'late', locked: false,
    mult: 1200000, statMult: 46656,
    desc: '身与道合，可跨界传送货物——不用自己扛了。',
    stages: [
      { name: '合体初期', need: 60000000000,   note: '界门升至 Lv.7，可跨界传送货物' },
      { name: '合体中期', need: 120000000000,  note: '' },
      { name: '合体后期', need: 240000000000,  note: '' },
      { name: '合体大圆满', need: 420000000000, note: '可突破大乘' },
    ],
  },
  {
    id: 'mahayana', name: '大乘', tier: 'peak', locked: false,
    mult: 12000000, statMult: 279936,
    desc: '大乘之境，只差一步飞升。阵法建筑开始改造现代都市。',
    stages: [
      { name: '大乘初期', need: 700000000000,   note: '界门升至 Lv.8，每日穿越次数 +2' },
      { name: '大乘中期', need: 1400000000000,  note: '' },
      { name: '大乘后期', need: 2800000000000,  note: '' },
      { name: '大乘大圆满', need: 5000000000000, note: '可突破渡劫' },
    ],
  },
  {
    id: 'tribulation', name: '渡劫', tier: 'peak', locked: false,
    mult: 120000000, statMult: 1679616,
    desc: '渡九重雷劫。修仙能力已全面超过普通现代科技。',
    stages: [
      { name: '渡劫初期', need: 8000000000000,   note: '界门升至 Lv.9，完全自由不限次数' },
      { name: '渡劫中期', need: 16000000000000,  note: '解锁副本「飞升台」' },
      { name: '渡劫后期', need: 32000000000000,  note: '' },
      { name: '渡劫大圆满', need: 60000000000000, note: '大圆满，可飞升轮回' },
    ],
  },
];

/** 突破基础成功率（GDD 6.2：初期 10% / 中期 20% / 后期 30% / 巅峰 40%） */
export const TIER_SUCCESS = { early: 0.10, mid: 0.20, late: 0.30, peak: 0.40 };

/** GDD 6.2：最多失败三次，第四次必成 */
export const BREAKTHROUGH_PITY = 3;

/** 突破失败损失的修为比例（GDD 6.2：不掉境界，损失部分修为） */
export const BREAKTHROUGH_FAIL_LOSS = 0.15;

/* ------------------------------------------------------------------ */
/* 由「全局阶段序号」推导一切                                           */
/* ------------------------------------------------------------------ */

export const FLAT_STAGES = (() => {
  const out = [];
  REALMS.forEach((realm, ri) => {
    realm.stages.forEach((stage, si) => {
      out.push({ realmIndex: ri, stageIndex: si, realm, stage, globalIndex: out.length });
    });
  });
  return out;
})();

export const TOTAL_STAGES = FLAT_STAGES.length;

export function stageInfo(gi) {
  return FLAT_STAGES[Math.max(0, Math.min(FLAT_STAGES.length - 1, gi))];
}

/** 战斗用的“等级”：炼气一层=1 …… 渡劫大圆满=42 */
export function levelOf(gi) { return gi + 1; }

/** 该境界的属性倍率（用于伤害公式的量级适配） */
export function statMultOf(gi) {
  return stageInfo(gi).realm.statMult;
}

/** 该阶段的基础五维（GDD 7.1） */
export function baseAttrs(gi) {
  const info = stageInfo(gi);
  const si = info.stageIndex;
  const M = info.realm.statMult;
  return {
    hpMax: Math.round((100 + si * 30) * M),
    mpMax: Math.round((50 + si * 12) * M),
    atk:   Math.round((10 + si * 3) * M),
    def:   Math.round((5 + si * 2) * M),
    spd:   Math.round((10 + si * 0.5 + info.realmIndex * 5) * 10) / 10,
  };
}

/** 每秒基础修为产出（未计任何加成） */
export function baseCultivationRate(gi) {
  const info = stageInfo(gi);
  return (3.2 + info.stageIndex * 1.0) * info.realm.mult;
}

/** 突破所需：从当前阶段跨到大境界的下一段 */
export function nextBreakthrough(gi) {
  const cur = stageInfo(gi);
  const isRealmTop = cur.stageIndex === cur.realm.stages.length - 1;
  if (!isRealmTop) return null;
  const nextRealm = REALMS[cur.realmIndex + 1];
  if (!nextRealm) {
    // 渡劫大圆满 → 飞升轮回
    return {
      from: cur,
      toRealm: { name: '飞升', locked: false, isAscension: true },
      tier: cur.realm.tier,
      success: TIER_SUCCESS[cur.realm.tier] || 0.1,
      locked: false,
      ascension: true,
    };
  }
  return {
    from: cur,
    toRealm: nextRealm,
    tier: cur.realm.tier,
    success: TIER_SUCCESS[cur.realm.tier] || 0.1,
    locked: !!nextRealm.locked,
    ascension: false,
  };
}

export function needOf(gi) {
  return stageInfo(gi).stage.need;
}

export function realmLabel(gi) {
  const info = stageInfo(gi);
  return `${info.realm.name} · ${info.stage.name}`;
}

export function realmName(gi) {
  return stageInfo(gi).realm.name;
}

export function totalCultivationTo(gi) {
  let sum = 0;
  for (let i = 0; i < gi; i++) sum += FLAT_STAGES[i].stage.need;
  return sum;
}

/** 是否为渡劫大圆满（可飞升） */
export function isAscensionReady(gi) {
  return gi === FLAT_STAGES.length - 1;
}
