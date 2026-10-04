import { ESTATE_MAP } from '../data/estate.js';
import { PROJECTS, PROJECT_MAP } from '../data/research.js';
import { PROJECT_MAP as CITY_MAP } from '../data/projects.js';
import { BATTLE_BEASTS } from '../data/beasts.js';
import { status as cityStatus } from './projects.js';

export const OBJECTIVE_OPTIONS = Object.freeze([
  { id: 'home', label: '攒第一套城郊房' },
  { id: 'beasts', label: '收集 3 种战斗灵兽' },
  ...PROJECTS.map(p => ({ id: `research:${p.id}`, label: `完成研究：${p.name}` })),
  ...Object.values(CITY_MAP).map(p => ({ id: `city:${p.id}`, label: `完成工程：${p.name}` })),
]);

export function setObjective(state, id) {
  if (id !== null && !OBJECTIVE_OPTIONS.some(x => x.id === id)) return { ok: false, reason: '请选择有效目标。' };
  state.objective = id;
  return { ok: true };
}

export function objectiveStatus(state) {
  const id = state.objective;
  const option = OBJECTIVE_OPTIONS.find(x => x.id === id);
  if (!option) return null;
  if (id === 'home') {
    const estate = ESTATE_MAP.suburb, owned = state.estate.owned.suburb || 0;
    return { ...option, done: owned >= 1, progress: Math.min(owned, 1), total: 1,
      missing: owned ? '已拥有；可继续经营和扩建。' : `还需 ¥${Math.max(0, estate.price - state.currency.cny).toLocaleString('zh-CN')}，前往地产置业。`, view: 'estate' };
  }
  if (id === 'beasts') {
    const species = new Set((state.beasts.owned || []).map(b => b.id).filter(id => BATTLE_BEASTS.some(x => x.id === id))).size;
    return { ...option, done: species >= 3, progress: Math.min(species, 3), total: 3,
      missing: species >= 3 ? '图鉴目标已完成。' : `还差 ${3 - species} 种；通关秘境有机会捕捉新灵兽。`, view: 'dungeon' };
  }
  if (id.startsWith('research:')) {
    const researchId = id.slice(9), project = PROJECT_MAP[researchId];
    const done = !!state.research.done[researchId];
    const req = project.req.filter(r => !state.research.done[r]).map(r => PROJECT_MAP[r].name);
    return { ...option, done, progress: done ? 1 : 0, total: 1,
      missing: done ? '研究已完成。' : `${req.length ? `前置：${req.join('、')}；` : ''}需要 ${project.cost} 研究点，当前 ${Math.floor(state.research.points)}。`, view: 'research' };
  }
  if (id.startsWith('city:')) {
    const projectId = id.slice(5), result = cityStatus(state, projectId);
    return { ...option, done: result.done, progress: result.done ? 1 : 0, total: 1, missing: result.done ? '工程已完工。' : result.reason, view: 'estate' };
  }
  return null;
}
