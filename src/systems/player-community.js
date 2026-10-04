import { getItem, ITEM_MAP } from '../data/items.js';
import { addItem, removeEntry, carryWeight } from './inventory.js';
import { carryCapacity } from './rift.js';
import { simulateDuel } from './combat.js';
import { recordTrade } from './market.js';

export const SHARED_COMMANDS = Object.freeze({'exchange.list':4,'exchange.buy':2,'exchange.cancel':1,'arena.enroll':0,'arena.challenge':1});
export const exchangeEligible = state => state.player.stage >= 2 && state.playMs >= 1800000;
export function validateShared(action,args) {
  if (!Array.isArray(args) || args.length!==SHARED_COMMANDS[action]) throw new Error('玩家操作参数无效');
  const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const id=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s);
  if(action==='exchange.list'&&(!id(args[0])||!integer(args[1],1,1000)||!integer(args[2],1,1e9)||!['stone','cny'].includes(args[3]))) throw new Error('请选择合法货物、数量、单价和货币');
  if((action==='exchange.buy'||action==='exchange.cancel')&&(!/^[0-9a-f-]{36}$/i.test(args[0])||(action==='exchange.buy'&&!integer(args[1],1,1000)))) throw new Error('挂单编号或购买数量无效');
  if(action==='arena.challenge'&&!integer(args[0],10000000,99999999))throw new Error('请输入8位玩家 UID');
}
const fail=reason=>({result:{ok:false,reason}});
export function runShared(state,target,action,args,context,now) {
  if(action.startsWith('exchange.') && !exchangeEligible(state) && action!=='exchange.cancel') return fail('炼气三层且服务器成长满30分钟后开放玩家交易。');
  if(action==='exchange.list') {
    const [uid,qty,price,currency]=args,entry=state.inventory.find(e=>e.uid===uid),item=getItem(entry?.itemId);
    if(!entry||!item||qty>entry.qty)return fail('货物数量已变化，请重新选择。');
    const slots=Math.min(8,state.social?.tradehouse?.slots||3);
    if(context.active_orders>=slots)return fail('玩家摊位已满，请先撤回未售挂单或扩充摊位。');
    removeEntry(state,uid,qty);
    return {result:{ok:true,qty},effect:{entry:{itemId:entry.itemId,quality:entry.quality},qty,price,currency,slots}};
  }
  if(action==='exchange.cancel') {
    const order=context.order;
    if(!order||!context.mine||order.status!=='active')return fail('挂单不存在、已结束或不属于你。');
    addItem(state,order.item.itemId,order.remaining,order.item.quality);
    return {result:{ok:true,returned:order.remaining},effect:{order_id:order.id}};
  }
  if(action==='exchange.buy') {
    const order=context.order,qty=args[1],item=getItem(order?.item?.itemId);
    if(!target||!order||!item||order.status!=='active'||Date.parse(order.expires_at)<=now)return fail('挂单已结束或到期，请刷新市场。');
    if(context.mine)return fail('不能购买自己的挂单。');
    if(qty>order.remaining)return fail('余量已变化，请重新确认。');
    if(!exchangeEligible(target))return fail('卖家的角色已重置，请等待卖家更新或撤回挂单。');
    if(carryWeight(state)+(ITEM_MAP[item.id]?.weight||0)*qty>carryCapacity(state)+1e-8)return fail('行囊载重不足，请先整理货物。');
    const total=order.price*qty,fee=Math.ceil(total*.02);
    if(state.currency[order.currency]<total)return fail('资金不足，请减少购买数量。');
    state.currency[order.currency]-=total;target.currency[order.currency]+=total-fee;
    addItem(state,order.item.itemId,qty,order.item.quality);
    recordTrade(state,{type:'buy',itemId:item.id,qty,amount:total,currency:order.currency,channel:'玩家交易'});
    recordTrade(target,{type:'sell',itemId:item.id,qty,amount:total-fee,currency:order.currency,channel:'玩家交易'});
    return {result:{ok:true,qty,total,fee,net:total-fee,currency:order.currency},effect:{order_id:order.id,qty,total,fee}};
  }
  if(action==='arena.enroll') {
    if(state.player.stage<2)return fail('炼气三层后可以报名论道。');
    return {result:{ok:true},effect:{enroll:true}};
  }
  if(action==='arena.challenge') {
    if(!target||context.mine||!context.enrolled||!context.target_enrolled)return fail('双方需报名论道，且不能挑战自己。');
    if(state.player.stage<2||target.player.stage<2)return fail('双方均需达到炼气三层。');
    if(Math.abs(state.player.stage-target.player.stage)>3)return fail('境界相差超过3层，暂不允许计分挑战。');
    if(Math.abs(context.rating-context.target_rating)>300)return fail('双方积分差超过300，请选择更接近的对手。');
    if(context.challenges_today>=5)return fail('今日5次论道挑战已用完。');
    if(context.pair_used)return fail('你们今日已论道，同一对玩家每天只计分一次。');
    const battle=simulateDuel(state,target);
    const expected=1/(1+10**((context.target_rating-context.rating)/400));
    const delta=Math.round(24*(battle.score-expected));
    const left=Math.max(0,context.rating+delta),right=Math.max(0,context.target_rating-delta);
    return {result:{ok:true,battle,rating:left,delta:left-context.rating},effect:{battle,rating:left,target_rating:right,season:context.season}};
  }
  return fail('未知玩家操作。');
}
