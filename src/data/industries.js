/** 灵科公司：按订单消耗实物材料，不凭空印钱。 */
export const INDUSTRIES = [
  { id: 'textile', name: '灵材试制工坊', stage: 14, business: 2, research: 'alloy', cost: { cny: 120000, stone: 4000 }, cycleMs: 4 * 3600000, mats: { lingyangmao: 2, lingjin: 1 }, runningCost: 200, cny: 12000, rp: 8, desc: '牧场纤维与秘境灵金制成复合织物，交付现代试制订单。' },
  { id: 'biotech', name: '灵植制剂公司', stage: 18, business: 3, research: 'database', cost: { cny: 350000, stone: 10000 }, cycleMs: 8 * 3600000, mats: { bainian: 2, lurong: 1 }, runningCost: 600, cny: 32000, rp: 16, desc: '用灵田和牧场材料做成标准制剂，送交现代实验室。' },
  { id: 'logistics', name: '界门工程公司', stage: 30, business: 4, project: 'teleport', cost: { cny: 1200000, stone: 60000 }, cycleMs: 24 * 3600000, mats: { xuanjing: 2, xingchen: 1 }, runningCost: 4000, cny: 180000, rp: 60, desc: '消耗秘境灵材维护跨城货运节点，完成阵法工程订单。' },
];
export const INDUSTRY_MAP = Object.fromEntries(INDUSTRIES.map(p => [p.id, p]));
