import { h,panel,panelFlush,showToast } from '../dom.js';
import { cloudSession } from '../../core/cloud.js';
import { communityData,communityBusy,communityError,refreshCommunity } from '../../core/community.js';
import { gameBusy,gamePending } from '../../core/game.js';
import { dispatchAction,isAuthoritative } from '../../core/authority.js';
import { inventoryRows } from '../../systems/inventory.js';
import { getItem } from '../../data/items.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import { stageInfo } from '../../data/realms.js';
import { exchangeEligible } from '../../systems/player-community.js';
import { fmtInt } from '../../core/util.js';
import { showAccount } from '../account.js';
let requested=null;
const qualityName=q=>QUALITY_MAP[q]?.name||q;
const form={entry:'',qty:'1',price:'1',currency:'stone'},quantities=new Map();
const money=(n,c)=>c==='cny'?`¥${fmtInt(n)}`:`${fmtInt(n)} 灵石`;
const time=t=>new Date(t).toLocaleString('zh-CN');
const blocked=()=>gameBusy||!!gamePending()||communityBusy||!!communityError;
async function refresh(){try{await refreshCommunity();}catch(e){showToast(e.message,'warn');}}
function intro(){
  const data=communityData();
  if(cloudSession&&!data&&!communityBusy&&requested!==cloudSession.user.id){requested=cloudSession.user.id;refresh();}
  return h('div',null,h('div.btn-row',null,h('button.btn.btn-sm',{text:'刷新玩家数据',disabled:communityBusy,onclick:refresh}),
    h('span.t-xs.t-dim',{text:data?`服务器记录 · ${data.player_count} 位玩家 · ${time(data.server_time)}`:'正在读取服务器玩家记录…'})),
    communityError?h('p.t-xs.t-fall.mt-2',{role:'status',text:communityError}):null);
}
const login=()=>panel('玩家联机','需要邮箱账号',h('p.t-sm',{text:'登录后可以使用真实玩家交易与异步论道。访客保留本机试玩。'}),h('button.btn.mt-2',{text:'登录 / 注册',onclick:()=>showAccount()}));
async function act(state,action,args,ctx){
  const result=await dispatchAction(state,action,args);
  if(!result?.ok){showToast(result?.reason||'操作未完成','warn');return result;}
  showToast(action==='exchange.buy'?`已成交 ${result.qty} 件，支付 ${money(result.total,result.currency)}`:'操作已确认并保存','good');
  await refresh();ctx.rerender();return result;
}
const field=(label,value,oninput,props={})=>h('label.production-field',null,h('span.t-xs',{text:label}),h('input',{'aria-label':label,type:'number',min:1,step:1,value,oninput:e=>oninput(e.target.value),...props}));
export function renderPlayerExchange(state,ctx){
  if(!isAuthoritative(state))return login();
  const data=communityData(),rows=inventoryRows(state),selected=rows.find(r=>r.uid===form.entry)||rows[0];
  if(selected)form.entry=selected.uid;
  const ready=exchangeEligible(state);
  const submit=()=>{
    const qty=Number(form.qty),price=Number(form.price),entry=form.entry,currency=form.currency;
    if(!selected||!Number.isSafeInteger(qty)||qty<1||qty>Math.min(selected.qty,1000)||!Number.isSafeInteger(price)||price<1||price>1e9)return showToast('请选择合法货物、数量（最多1000）和整数单价','warn');
    ctx.modal({title:'确认玩家挂单',body:h('div',null,h('p',{text:`${selected.item.name} · ${qualityName(selected.quality)} ×${qty}，单价 ${money(price,currency)}。`}),h('p.t-xs.mt-2',{text:'物品将离开背包并由服务器托管。有效期72小时；成交从卖家收入扣2%，未售部分可撤回。到账需要另一位真实玩家购买。'})),
      actions:[{label:'返回'},{label:'确认上架',primary:true,onClick:()=>act(state,'exchange.list',[entry,qty,price,currency],ctx)}]});
  };
  const buy=(order,qty)=>{
    if(!Number.isSafeInteger(qty)||qty<1||qty>Math.min(order.remaining,1000))return showToast('购买数量超出余量','warn');
    ctx.modal({title:'确认玩家成交',body:h('p',{text:`向 ${order.role_name}（UID ${order.uid}）购买 ${getItem(order.item.itemId)?.name||order.item.itemId} · ${qualityName(order.item.quality)} ×${qty}，支付 ${money(order.price*qty,order.currency)}。货物品质保持原样，手续费由卖家承担。`}),
      actions:[{label:'返回'},{label:'确认购买',primary:true,onClick:()=>act(state,'exchange.buy',[order.id,qty],ctx)}]});
  };
  return h('div.flex-col.gap-4',null,
    panel('玩家交易行','真实玩家挂单',h('p.t-xs.t-dim',{text:'支持背包里的贸易商品、材料和丹药。只使用游戏人民币或灵石，天道碎片不参与交易。成交税2%；买家受行囊载重限制。'}),intro(),
      !ready?h('p.t-xs.mt-2',{text:'解锁条件：炼气三层＋服务器成长满30分钟。NPC委托仍可照常使用。'}):null),
    panel('上架给玩家',`${data?.mine.length||0} / ${Math.min(8,state.social?.tradehouse?.slots||3)} 个摊位`,
      rows.length?h('div',null,
        h('label.production-field',null,h('span.t-xs',{text:'选择货物'}),h('select',{'aria-label':'玩家上架货物',onchange:e=>{form.entry=e.target.value;ctx.rerender();}},rows.map(r=>h('option',{value:r.uid,selected:r.uid===form.entry,text:`${r.item.name} · ${qualityName(r.quality)} ×${r.qty}`})))),
        field('上架数量',form.qty,v=>form.qty=v,{max:Math.min(selected.qty,1000)}),field('玩家交易单价',form.price,v=>form.price=v,{max:1e9}),
        h('label.production-field',null,h('span.t-xs',{text:'收款货币'}),h('select',{'aria-label':'玩家交易货币',onchange:e=>form.currency=e.target.value},h('option',{value:'stone',selected:form.currency==='stone',text:'灵石'}),h('option',{value:'cny',selected:form.currency==='cny',text:'游戏人民币'}))),
        h('button.btn.btn-solid.mt-2',{text:'预览玩家挂单',disabled:blocked()||!ready||!data,onclick:submit})):
        h('p.t-sm.t-dim',{text:'背包暂无可上架货物。可先前往市场进货或生产。'})),
    panelFlush('玩家在售','最近50条 · 价格固定',...(data?.offers.length?data.offers.map(o=>h('div.rowitem',{'data-player-order':o.id},
      h('div.rowitem-main',null,h('strong',{text:`${getItem(o.item.itemId)?.name||o.item.itemId} · ${qualityName(o.item.quality)} ×${o.remaining}`}),h('p.t-xs.t-dim',{text:`${o.role_name} · UID ${o.uid} · 单价 ${money(o.price,o.currency)}`}),h('p.t-xs.t-dimmer',{text:`到期 ${time(o.expires_at)}`})),
      h('div.rowitem-act',null,o.mine?h('span.tag',{text:'我的挂单'}):h('div',null,field(`购买数量 ${o.id}`,quantities.get(o.id)||'1',v=>quantities.set(o.id,v),{max:Math.min(o.remaining,1000),style:'max-width:100px'}),h('button.btn.btn-sm.mt-1',{text:'购买玩家货物',disabled:blocked()||!ready,onclick:()=>buy(o,Number(quantities.get(o.id)||1))}))))):[h('div.empty',{text:'暂无玩家挂单。不会生成假玩家订单；可以先上架等待其他玩家。'})])),
    panelFlush('我的托管货物','到期后仍保留，可取回',...(data?.mine.length?data.mine.map(o=>h('div.rowitem',null,h('div.rowitem-main',null,h('strong',{text:`${getItem(o.item.itemId)?.name||o.item.itemId} · ${qualityName(o.item.quality)} ×${o.remaining}`}),h('p.t-xs',{text:`${money(o.price,o.currency)} / 件 · ${Date.parse(o.expires_at)<=Date.parse(data.server_time)?'已到期':time(o.expires_at)}`})),h('button.btn.btn-sm',{text:'撤回玩家挂单',disabled:blocked(),onclick:()=>ctx.modal({title:'取回未售物品',body:h('p',{text:'未售部分按原品质返回背包。撤回可能使行囊超重，穿越前请整理。'}),actions:[{label:'保留挂单'},{label:'确认撤回',primary:true,onClick:()=>act(state,'exchange.cancel',[o.id],ctx)}]})}))):[h('div.empty',{text:'暂无托管物品。'})])),
    panel('玩家成交记录','最近20笔',data?.trades.length?data.trades.map(t=>h('p.t-xs.mt-2',{text:`${time(t.created_at)} · ${t.sold?'售出':'买入'} ${getItem(t.item.itemId)?.name||t.item.itemId} ×${t.quantity} · ${money(t.sold?t.total-t.fee:t.total,t.currency)}${t.sold?`（税 ${money(t.fee,t.currency)}）`:''} · 对方UID ${t.sold?t.buyer_uid:t.seller_uid}`})):h('p.t-xs.t-dim',{text:'玩家成交后在此显示。'})));
}
function duelModal(ctx,result,other){
  const battle=result.battle;
  ctx.modal({title:battle.score===1?'论道胜利':battle.score===0?'论道落败':'论道平局',subtitle:`对手：${other} · ${battle.rounds} 回合`,body:h('div',null,
    h('p',{text:`积分 ${result.delta>=0?'+':''}${result.delta} → ${result.rating}；人物气血、体力与资产保持不变。`}),
    h('p.t-xs.mt-2',{text:`你 ${fmtInt(battle.hp[0])}/${fmtInt(battle.maxHp[0])} 气血 · 对方 ${fmtInt(battle.hp[1])}/${fmtInt(battle.maxHp[1])}`}),
    h('details.mt-3',null,h('summary',{text:'查看战斗过程'}),battle.log.map(l=>h('p.t-xs.mt-1',{text:`第${l.round}回合 · ${l.side===0?'你':'对方'}${l.pet?` · ${l.pet}`:''}${l.miss?'未命中':`造成${fmtInt(l.damage)}伤害${l.crit?'（暴击）':''}`}`})))),actions:[{label:'继续修行',primary:true}]});
}
export function renderArena(state,ctx){
  if(!isAuthoritative(state))return login();
  const data=communityData(),self=data?.self;
  const table=(rows,arena)=>h('div',{style:'overflow-x:auto'},h('table.grid',null,h('thead',null,h('tr',null,['名次','行者','积分/战力'].map(text=>h('th',{text})))),h('tbody',null,rows.map(p=>h('tr',null,h('td',{text:`#${p.rank}`}),h('td',null,h('strong',{text:p.role_name+(p.mine?'（你）':'')}),h('div.t-xs.t-dim',{text:`UID ${p.uid} · ${stageInfo(p.stage).stage.name}`})),h('td.num',{text:arena?`${p.rating} · ${p.wins}胜${p.losses}负${p.draws}平`:fmtInt(p.power)}))))));
  return h('div.flex-col.gap-4',null,
    panel('玩家论道','服务器异步竞技',h('p.t-xs.t-dim',{text:'双方按当前服务器配装与灵兽满气血对战，对方无需在线。每天05:00（UTC+8）刷新5次挑战，同一对玩家每日只计分一次。限境界差3层、积分差300。'}),intro(),
      h('p.t-xs.mt-2',{text:`月赛季 ${data?.season||'—'} · 初始1000分 · 本月3场后入积分榜 · 今日已挑战 ${data?.challenges_today||0}/5`}),
      h('p.t-xs.mt-1',{text:self?`你的积分 ${self.rating} · ${self.games}场 · 实力第${self.power_rank}名 · 论道${self.arena_rank?`第${self.arena_rank}名`:'待定级'}`:'登录同步进度后获得真实排名。'}),
      !self?.joined?h('button.btn.btn-solid.mt-2',{text:'报名玩家论道',disabled:blocked()||state.player.stage<2||!data,onclick:()=>ctx.modal({title:'报名论道',body:h('p',{text:'报名后其他玩家可异步挑战你的服务器角色。首版仅记录积分和荣誉，不掉落资产、不发货币或碎片。'}),actions:[{label:'暂不报名'},{label:'确认报名',primary:true,onClick:()=>act(state,'arena.enroll',[],ctx)}]})}):h('span.tag.mt-2',{text:'已报名'})),
    panelFlush('可挑战的真实玩家','最多20位 · 按境界接近程度排序',...(data?.opponents.length?data.opponents.map(p=>h('div.rowitem',null,h('div.rowitem-main',null,h('strong',{text:p.role_name}),h('p.t-xs.t-dim',{text:`UID ${p.uid} · ${stageInfo(p.stage).stage.name} · ${p.rating}分 · 战力${fmtInt(p.power)}`})),h('button.btn.btn-sm',{text:p.used_today?'今日已交手':'预览论道',disabled:blocked()||!self?.joined||p.used_today||data.challenges_today>=5||Math.abs(state.player.stage-p.stage)>3||Math.abs((self?.rating||1000)-p.rating)>300,onclick:()=>ctx.modal({title:`挑战 ${p.role_name}`,body:h('p',{text:'服务器将读取双方最新配装并结算。消耗今日1次论道额度，胜负都计入月赛季。'}),actions:[{label:'返回'},{label:'确认论道',primary:true,onClick:async()=>{const r=await act(state,'arena.challenge',[p.uid],ctx);if(r?.ok)duelModal(ctx,r,p.role_name);}}]})}))):[h('div.empty',{text:'尚无其他已报名玩家。等待真人加入后再论道，NPC演练仍可使用。'})])),
    panel('真实实力榜','前50名 · 最近服务器同步配装',data?.power_board.length?table(data.power_board,false):h('p.t-sm',{text:'暂无已同步玩家。'})),
    panel('月赛季论道积分榜','前50名 · 至少3场 · 重开月赛季不重置角色',data?.arena_board.length?table(data.arena_board,true):h('p.t-sm',{text:'尚无完成3场定级的玩家。每月初积分重置1000，人物资产不重置。'})),
    panel('我的论道记录','最近20场',data?.matches.length?data.matches.map(m=>{const score=m.initiated?Number(m.score):1-Number(m.score);return h('p.t-xs.mt-2',{text:`${time(m.created_at)} · 对 ${m.initiated?m.defender_name:m.challenger_name} · ${score===1?'胜利':score===0?'落败':'平局'} · ${m.rounds}回合 · 积分${m.delta>=0?'+':''}${m.delta} · ${m.season}`});}):h('p.t-sm.t-dim',{text:'尚未参加论道。'})));
}
