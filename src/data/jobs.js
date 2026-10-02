/**
 * jobs.js —— 现代职业（GDD 13.1）
 * 挂机赚工资，作为现代世界的基础收入。工资随职业等级提升。
 */

export const JOBS = [
  {
    id: 'dev', name: '程序员', base: 88, growth: 1.34, baseCost: 1200,
    desc: '工资最高，但你要在修仙界和加班之间做选择。',
  },
  {
    id: 'designer', name: '设计师', base: 70, growth: 1.32, baseCost: 900,
    desc: '审美也是一种生产力。至少你是这么告诉自己的。',
  },
  {
    id: 'doctor', name: '医生', base: 96, growth: 1.30, baseCost: 1600,
    desc: '在里世界救死扶伤，在表世界你卖的就是抗生素。',
  },
  {
    id: 'teacher', name: '教师', base: 54, growth: 1.38, baseCost: 600,
    desc: '稳定、体面、慢。胜在升级便宜。',
  },
  {
    id: 'media', name: '自媒体', base: 44, growth: 1.46, baseCost: 500,
    desc: '起薪最低，涨幅最高。你在网上讲修仙故事，没人信，但都爱听。',
  },
];

export const JOB_MAP = Object.fromEntries(JOBS.map((j) => [j.id, j]));

/** 该职业在 level 级时的时薪（¥/小时） */
export function jobRate(jobId, level) {
  const j = JOB_MAP[jobId];
  if (!j) return 0;
  return j.base * Math.pow(j.growth, Math.max(0, level - 1));
}

/** 升到下一级的花费 */
export function jobUpgradeCost(jobId, level) {
  const j = JOB_MAP[jobId];
  if (!j) return Infinity;
  return Math.round(j.baseCost * Math.pow(1.85, Math.max(0, level - 1)));
}

/** 现代商业（GDD 13.2）：商业等级越高，进货成本越低、客流量越大 */
export const BUSINESS = {
  maxLevel: 10,
  costOf(level) { return Math.round(2500 * Math.pow(2.1, level)); },
  /** 进货成本折扣：每级 -2% */
  buyDiscount(level) { return Math.min(0.20, level * 0.02); },
  /** 每小时被动收入 */
  passiveIncome(level) { return level * 26; },
};
