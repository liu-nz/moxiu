import { riftDayIndex } from '../core/clock.js';
import { currencyOf, CURRENCY_NAME, getItem } from '../data/items.js';
import { countOf, removeItem, validQuantity } from './inventory.js';
import { quoteSell } from './market.js';
import { computeAttrs } from './character.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { earn } from './daily.js';

const QUALITY_RANK = {common:0,fine:1,rare:2,epic:3,legend:4};
const CLIENT_DIALOGUE = {
 '林教授':['先从一批可追踪的样本开始。','数据很一致，再核对一批。','我们可以合作验证新材料了。','我不再追问来源，但请保留记录。','两界的实验室终于用同一种方法交流。'],
 '陈老板':['先看看品相与来历。','你带来的东西，值得留档。','珍品不是价格，是它背后的故事。','我知道你还有另一条进货路。','这间收藏室会替两界保留记忆。'],
 '炼器大师':['现代量具真能校准炉火？','上次校验修正了旧图谱。','下一次一起试做灵能装甲。','灵科不是替代传承，而是补上盲点。','工坊的大门随时为你敞开。'],
 '丹阁掌柜':['先把药材批次登记清楚。','有了记录，我才能安排义诊。','丹方与分析报告可以互相核验。','别把未经验证的样本当作疗效承诺。','两界灯火有你的一份。'],
 '黑市商人':['来路可以保密，数量不能含糊。','你是个守约的人。','我留了更完整的旧账线索。','界门的事情，我见过不止一次。','有些秘密值得和信任的人分享。'],
 '神秘买家':['先证明你能找到这份材料。','你果然认识那条旧路。','我收藏的不只是物品。','我的上一位供货人也能跨界。','有一天，你会在界门档案里见到我的名字。'],
};
export const CLIENT_TIERS = ['陌生人','合作客户','长期伙伴','知情者','两界盟友'];
export function clientRelation(state, client) {
  const points = state.commissions?.relations?.[client] || 0;
  const ending=state.tales?.flags || {};
  const memory=client==='林教授' && ending.professor_after_done ? ending.professor_after_done==='open'?'双语论文收到新的复核申请，我们继续一起核验。':'匿名约定依然有效，我会先替你保护来源。' : client==='陈老板' && ending.collector_after_done ? ending.collector_after_done==='restore'?'展柜的补痕很受关注，修复也成了故事的一部分。':'那一处缺角留下了新的姓名，我很庆幸没有抹去它。' : client==='炼器大师' && ending.workshop_after_done ? ending.workshop_after_done==='sword'?'徒弟在继续修订青穗剑，记得出剑也要知止。':'雨露袍已经护住了几个新人，徒弟终于理解了守护。' : null;
  return {dialogue:memory || CLIENT_DIALOGUE[client]?.[Math.min(4,Math.floor(points / 20))] || '按时交付，关系会逐渐成长。',points, tier:CLIENT_TIERS[Math.min(4,Math.floor(points / 20))]};
}
const ORDERS = Object.freeze([
 {id:'crosser-monitor',side:'modern',item:'gufaqi',qty:1,source:'farm',client:'林教授',type:'special',minStage:14,storyEnding:'cooperate',title:'阵眼校验委托',note:'调停结局开放：使用古法器核对公开监测方案。'},
 {id:'crosser-seal',side:'cultivation',item:'jingmi',qty:3,source:'market',client:'炼器大师',type:'special',minStage:14,storyEnding:'contain',title:'断流维护委托',note:'守界结局开放：用现代量具校验断流装置。'},
 {id:'professor-partner',side:'modern',item:'lingmi',qty:6,source:'farm',client:'林教授',type:'special',minRelation:20,minQuality:'fine',title:'长期研究合作',note:'合作关系达到20后开放，仅验收优质及以上同批样本。'},
  {id:'professor-sample',side:'modern',item:'lingmi',qty:3,source:'farm',client:'林教授',type:'chain',title:'林教授的第一批样本',note:'完成后开放精密测量合作。',chainStep:0},
  {id:'professor-tools',side:'cultivation',item:'jingmi',qty:2,source:'market',client:'林教授',type:'chain',title:'跨界测量合作',note:'把量具送往青云工坊，与教授共同核验数据。',chainStep:1},
  {id:'collector-quality',side:'modern',item:'bainian',qty:1,source:'farm',client:'陈老板',type:'special',minQuality:'rare',minStage:10,title:'珍品人参收藏',note:'仅接收珍品及以上品质，普通货物不会扣除。'},
  {id:'urgent-workshop',side:'cultivation',item:'jingmi',qty:2,source:'market',client:'炼器大师',type:'timed',hours:12,title:'炉具校准急件',note:'接取后十二小时内交付，报价高于常规委托。'},
  { id: 'clinic-herb', side: 'modern', item: 'huangjing', qty: 2, title: '医院药材急件', client: '市立中医院', note: '急需新鲜黄精草，用于配制临床观察样本。' },
  { id: 'lab-grain', side: 'modern', item: 'lingmi', qty: 3, title: '灵米实验样本', client: '异质物研究所', note: '研究员希望得到同一批次的灵米样本。' },
  { id: 'auction-root', side: 'modern', item: 'bainian', qty: 1, title: '百年参鉴定委托', client: '神秘买家', note: '请提供一株完整百年人参供药理鉴定。' },
  { id: 'workshop-tools', side: 'cultivation', item: 'jingmi', qty: 2, title: '炼器坊精密量具', client: '青云炼器坊', note: '工坊需要现代精密工具校准新式炉具。' },
  { id: 'formation-lamp', side: 'cultivation', item: 'qiangguang', qty: 2, title: '遗迹照明委托', client: '黑市商人', note: '探查队征集耐用强光设备，照亮阴性阵眼。' },
  { id: 'medicine-kit', side: 'cultivation', item: 'kangshengsu', qty: 2, title: '外门解毒急件', client: '丹阁掌柜', note: '弟子历练归来，需要抗生素处理毒伤。' },
  { id: 'breakfast-eggs', side: 'modern', item: 'lingjidan', qty: 4, reward: 160, source: 'ranch', title: '早餐店试吃订单', client: '青河早餐店', note: '从牧场收取灵鸡蛋，送往现代早餐店；每次交付支付 ¥160。' },
  { id: 'textile-wool', side: 'modern', item: 'lingyangmao', qty: 2, reward: 900, source: 'ranch', minStage: 10, title: '耐磨纤维样品', client: '青河纺织厂', note: '养殖灵羊收取羊毛，现代工厂用作新型织物的样品。' },
  { id: 'clinic-antler', side: 'modern', item: 'lurong', qty: 1, reward: 4000, source: 'ranch', minStage: 14, title: '康复药材样品', client: '市立中医院', note: '牧场产出的鹿茸用于受控研究，交付固定报酬。' },
  { id: 'shop-rice', side: 'modern', item: 'lingmi', qty: 6, reward: 720, source: 'farm', shop: true, title: '两界商铺供货', client: '两界商铺', note: '需拥有一间现代店铺。种植灵米、带货回城，为自己的经营补齐供货线。' },
]);

export function refreshCommissions(state) {
  const day = riftDayIndex(state.world.clockMs);
  state.commissions ||= {};
  const c = state.commissions;
  c.active ||= []; c.history ||= []; c.total ||= 0; c.sources ||= []; c.relations ||= {}; c.chains ||= {};
  c.active = c.active.filter(x => x.expiresAt > state.world.clockMs);
  if (c.day !== day) { c.day = day; c.completed = []; }
  return day;
}

export function commissionBoard(state, side = state.side) {
  const day = refreshCommissions(state);
  const orders = ORDERS.filter(o => o.side === side && !o.source);
  const offset = Math.abs(day) % orders.length;
  const daily = orders.slice(offset).concat(orders.slice(0, offset)).slice(0, 2);
  const extra = ORDERS.filter(o => o.side === side && o.source && (!o.storyEnding || state.tales.flags.crosser_complete===o.storyEnding) && (!o.minRelation || clientRelation(state,o.client).points >= o.minRelation) && state.player.stage >= (o.minStage || 0) && (o.chainStep === undefined || (state.commissions.chains[o.client] || 0) === o.chainStep));
  const active = state.commissions.active.filter(x => x.side === side).map(x => ORDERS.find(o => o.id === x.id));
  return [...new Map([...active, ...daily, ...extra].map(x => [x.id, x])).values()].map(order => {
    const item = getItem(order.item);
    const have = order.minQuality ? state.inventory.filter(e=>e.itemId === order.item && QUALITY_RANK[e.quality] >= QUALITY_RANK[order.minQuality]).reduce((n,e)=>n+e.qty,0) : countOf(state, order.item);
    const relation = clientRelation(state, order.client);
    const done = state.commissions.completed.includes(order.id);
    const accepted = state.commissions.active.find(x => x.id === order.id);
    const sold = quoteSell(state, side, order.item, order.qty, order.minQuality || 'common', computeAttrs(state))?.total || 0;
    return { ...order, relation, type:order.type || 'normal', source: order.source || (side === 'modern' ? 'farm' : 'market'), itemName: item.name, have, done, sold, accepted,
      locked: order.shop && !state.estate.shops, reward: accepted?.reward || order.reward || Math.max(1, Math.round(sold * (order.type === 'timed' ? 1.25 : 1.12) * (1 + Math.floor(relation.points / 20) * .02))), currency: currencyOf(side) };
  });
}

export function acceptCommission(state, id) {
  const order = [...commissionBoard(state, 'modern'), ...commissionBoard(state, 'cultivation')].find(x => x.id === id);
  if (!order || order.done || order.locked) return { ok: false, reason: '委托未开放、已完成或尚未拥有现代店铺。' };
  if (order.accepted) return { ok: false, reason: '已经接取这份委托。' };
  if (state.commissions.active.length >= 2) return { ok: false, reason: '最多追踪两份委托，可先交付或放弃一份。' };
  state.commissions.active.push({ id, side: order.side, reward: order.reward, expiresAt: state.world.clockMs + (order.hours || 72) * 3600000 });
  emit(EV.STATE);
  return { ok: true };
}

export function abandonCommission(state, id) {
  refreshCommissions(state);
  if (!state.commissions.active.some(x => x.id === id)) return { ok: false, reason: '没有接取这份委托。' };
  state.commissions.active = state.commissions.active.filter(x => x.id !== id);
  emit(EV.STATE);
  return { ok: true };
}

export function fulfillCommission(state, id) {
  const order = commissionBoard(state).find(x => x.id === id);
  if (!order) return { ok: false, reason: '这份委托今日未开放，请查看当前委托板。' };
  if (order.done) return { ok: false, reason: '这份委托今天已经交付。' };
  if (order.locked) return { ok: false, reason: '需要先拥有一间现代店铺。' };
  if (order.type !== 'normal' && !order.accepted) return {ok:false,reason:'请先接取这份特殊委托。'};
  if (!validQuantity(order.qty) || order.have < order.qty) return { ok: false, reason: `需要 ${order.itemName} ×${order.qty}，当前只有 ${order.have}。` };
  if (order.minQuality) {
    let left = order.qty;
    for (const quality of Object.keys(QUALITY_RANK)) {
      if (QUALITY_RANK[quality] < QUALITY_RANK[order.minQuality]) continue;
      const take = Math.min(left,countOf(state,order.item,quality));
      if(take) left -= removeItem(state,order.item,take,quality);
      if(!left) break;
    }
  } else if (!removeItem(state, order.item, order.qty)) return { ok: false, reason: '物品数量已变化，请刷新委托板。' };
  state.commissions.relations[order.client] = Math.min(100,(state.commissions.relations[order.client] || 0) + (state.modern.job === 'media' ? 6 : 5));
  if(order.chainStep !== undefined) state.commissions.chains[order.client] = order.chainStep + 1;
  state.currency[order.currency] += order.reward;
  earn(state, order.currency, order.reward);
  state.commissions.completed.push(order.id);
  state.commissions.active = state.commissions.active.filter(x => x.id !== id);
  state.commissions.total++;
  if (!state.commissions.sources.includes(order.source)) state.commissions.sources.push(order.source);
  state.commissions.history = [{ id, title: order.title, at: state.world.clockMs, reward: order.reward, currency: order.currency }, ...state.commissions.history].slice(0, 12);
  logGood(state, `完成「${order.title}」委托，获得 ${order.reward} ${CURRENCY_NAME[order.currency]}。`);
  toast(`委托交付成功：+${order.reward} ${CURRENCY_NAME[order.currency]}`, 'good');
  emit(EV.STATE);
  return { ok: true, reward: order.reward, currency: order.currency };
}
