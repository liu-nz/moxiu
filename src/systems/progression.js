/** 从已存在的系统状态推导成长路线，不额外发奖励或强迫线性游玩。 */
import { PROJECTS, RESEARCH_LAB } from '../data/research.js';
import { SHOP, WAREHOUSE } from '../data/estate.js';
import { CITY_PROJECTS } from '../data/projects.js';
import { investmentPreview } from './modern.js';
import { estateSummary, shopCapacity } from './estate.js';
import { rpPerHour } from './research.js';
import { targetProject, isDone } from './projects.js';
import { investmentBudget } from './finance.js';
import { SIDE, sideFactor } from '../core/state.js';

export function growthRoadmap(state) {
  const researchDone = PROJECTS.filter(p => state.research.done[p.id]).length;
  const cityDone = CITY_PROJECTS.filter(p => isDone(state, p.id)).length;
  const steps = [
    { id: 'income', name: '建立第一份现金流', done: !!state.modern.job, view: 'modern', note: '工资供采购周转，先选职业，再比较升级投资。', phase: 0 },
    { id: 'roundtrip', name: '完成一次两界往返与成交', done: state.rift.crossings >= 2 && state.stats.tradeCount >= 1, view: 'gate', note: '采购现代货 → 穿越出货 → 带灵植回来。界门确认行情、载重与次数。', phase: 0 },
    { id: 'business', name: '建立商业与进货折扣', done: state.modern.businessLevel >= 1, view: 'modern', note: '商业Lv.1解锁店铺；货物决定回款，商业被动和地产租金提供稳定收入。', phase: 0 },
    { id: 'lab', name: '把修仙资源交给现代实验室', done: state.research.labLevel >= 1, view: 'research', note: '建设研究所持续积累研究点，或用副本/牧场材料兑换。', phase: 1 },
    { id: 'knowledge', name: '完成第一项灵科研究', done: researchDone > 0, view: 'research', note: '灵能电池降低突破损失；分析丹毒降低炼丹风险。先按当前玩法选择。', phase: 1 },
    { id: 'automation', name: '接通洞府生产自动化', done: !!(state.research.done.autoirrigate || state.research.done.autopill), view: 'research', note: '自动灵田与自动炼丹分别有前置研究；完成后安排计划和资金保留线。', phase: 1 },
    { id: 'city', name: '完成第一项城市灵改', done: cityDone > 0, view: 'estate', note: '将秘境灵材、研究知识与两界资金投入工程，让修仙开始反哺现代。', phase: 2 },
    { id: 'network', name: '建立跨城货运网络', done: isDone(state, 'teleport'), view: 'estate', note: '先建灵能电网，再建跨城传送阵：载重增加10kg，店铺吞吐翻倍。', phase: 2 },
  ];
  const pinned = targetProject(state);
  let next = steps.find(s => !s.done);
  if (pinned) next = { id: `project:${pinned.project.id}`, name: `筹备${pinned.project.name}`, view: 'estate', note: pinned.reason || '条件已备齐，可以预览工程收益并确认动工。', phase: 2, project: pinned };
  const currentPhase = cityDone ? 2 : researchDone || state.research.labLevel > 0 ? 1 : 0;
  return { steps, next, currentPhase, researchDone, cityDone, phases: ['现代辅助修仙', '灵科融合', '修仙反哺现代'] };
}
export function goalDestination(state, view) {
  if (state.side !== SIDE.MODERN && ['modern', 'estate'].includes(view)) return { view: 'gate', label: '前往界门，返回现代' };
  return { view, label: ({ modern: '比较经营投资', research: '查看研究与前置', estate: '查看工程与缺口', gate: '整理跨界物资' })[view] || '查看目标' };
}

/** 金钱回本只比较同一货币的新增稳定收入；研究点/吞吐/载重不虚报回本。 */
export function investmentOptions(state) {
  const preview = investmentPreview(state), estates = estateSummary(state);
  const list = [];
  const add = (id, name, view, cost, delta, unit, locked = false) => {
    const budget = investmentBudget(state, cost);
    list.push({ id, name, view, cost, delta, unit, affordable: !locked && budget.ok, locked,
      hours: unit === '人民币/时' && delta > 0 ? cost / delta : null,
      reason: locked ? '尚未解锁或已达上限' : budget.reason });
  };
  if (state.modern.job) add('job', '职级提升', 'modern', preview.job.cost, preview.job.delta, '人民币/时');
  add('business', '商业升级', 'modern', preview.business.cost, preview.business.delta, '人民币/时', state.modern.businessLevel >= 10);
  for (const e of estates.list) if (e.owned < e.maxOwn) add(e.id, e.name, 'estate', e.nextPrice, e.actualRent, '人民币/时');
  if (state.estate.shops < SHOP.maxOwn) add('shop', '开设店铺', 'estate', estates.shopPrice, shopCapacity(state), '件/时', state.modern.businessLevel < SHOP.unlockBusinessLevel);
  if (state.estate.warehouseLevel < WAREHOUSE.maxLevel) add('warehouse', '扩建仓库', 'estate', estates.warehouseCost, 1, 'kg');
  if (state.research.labLevel < RESEARCH_LAB.maxLevel) add('lab', '研究所升级', 'research', RESEARCH_LAB.costOf(state.research.labLevel), RESEARCH_LAB.rpPerHour(state.research.labLevel + 1) * sideFactor(state, SIDE.MODERN) - rpPerHour(state), '研究点/时');
  const cash = list.filter(x => !x.locked && x.hours !== null && Number.isFinite(x.hours)).sort((a, b) => a.hours - b.hours);
  return { list, fastest: cash[0] || null, budget: investmentBudget(state, 0) };
}
