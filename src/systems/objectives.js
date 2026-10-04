import { needOf, stageInfo, TOTAL_STAGES } from '../data/realms.js';
import { commissionBoard } from './commissions.js';
import { buildStatus } from '../data/builds.js';
import { ESTATE_MAP } from '../data/estate.js';
import { PROJECTS, PROJECT_MAP } from '../data/research.js';
import { PROJECT_MAP as CITY_MAP } from '../data/projects.js';
import { BATTLE_BEASTS } from '../data/beasts.js';
import { status as cityStatus } from './projects.js';

export const OBJECTIVE_OPTIONS = Object.freeze([
  {id:'crosser',label:'查明另一位穿越者'},
  {id:'build',label:'准备当前套路'},
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
  if(id==='crosser'){const flags=['crosser_route','crosser_trace','crosser_offer','crosser_complete'],progress=flags.filter(k=>state.tales.flags[k]).length;return {...option,done:progress===4,progress,total:4,missing:state.player.stage<14?'金丹开启，先完成修炼与突破。':'在探索追查不属于你的矿泉水；章节需要前置线索和对应世界。',view:'exploration'};}
  if(id==='build'){const b=buildStatus(state);return {...option,done:b.ready,progress:b.ready?1:0,total:1,missing:b.ready?'当前套路已就绪；可去秘境验证。':`缺少：${b.missing.join('、')}`,view:'cultivation'};}
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


export function currentGoals(state) {
 const need=needOf(state.player.stage),next=stageInfo(Math.min(TOTAL_STAGES-1,state.player.stage+1));
 const goals=[{id:'primary',kind:'主要目标',label:state.player.stage===TOTAL_STAGES-1?'准备飞升与下一世':`修炼至${next.stage.name}`,progress:Math.min(need,state.player.cultivation),total:need,missing:state.player.cultivation>=need?'修为已满，查看突破准备。':`还差 ${Math.ceil(need-state.player.cultivation).toLocaleString('zh-CN')} 修为；可继续修炼，按需准备丹药与功法。`,view:state.side==='modern'?'gate':'cultivation'}];
 const orders=[...commissionBoard(state,'modern'),...commissionBoard(state,'cultivation')].filter(o=>o.accepted && !o.done).sort((a,b)=>Number(b.have>=b.qty)-Number(a.have>=a.qty));
 const order=orders[0];
 if(order){const ready=order.have>=order.qty;const targetSide=ready?order.side:order.source==='market'?'modern':'cultivation';goals.push({id:'recommended',kind:'推荐目标',label:order.title,progress:Math.min(order.have,order.qty),total:order.qty,missing:`${order.itemName}缺 ${Math.max(0,order.qty-order.have)} · 报酬 ${order.reward}${order.currency==='cny'?'元':'灵石'}；${ready?'物资备齐，前往指定世界交付':'先准备物资'}`,view:state.side!==targetSide?'gate':ready?'gate':order.source==='market'?'market':'farm'});}
 else {const b=buildStatus(state);goals.push({id:'recommended',kind:'推荐目标',label:b.ready?'挑选今日两界委托':`准备${b.def.name}`,progress:0,total:1,missing:b.ready?'到界门查看客户需求，自选一条生产或采购路线。':`缺少：${b.missing.join('、')}`,view:b.ready?'gate':state.side==='modern'?'gate':'cultivation'});}
 const personal=objectiveStatus(state);if(personal)goals.push({...personal,kind:'长期目标'});
 return goals;
}
