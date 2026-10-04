/** 市场决策页：先看目的地、载重与整批报价，再确认成交。 */
import { h, panel, panelFlush, bar, kv, showToast } from '../dom.js';
import { TRADE_ITEMS, ITEM_MAP, CATEGORIES, CONSUMABLES, currencyOf } from '../../data/items.js';
import { quoteBuy, quoteSell, quotePortfolio, affordableQuantity, demandArrow } from '../../systems/market.js';
import { inventoryRows, carryWeight } from '../../systems/inventory.js';
import { carryCapacity } from '../../systems/rift.js';
import { computeAttrs } from '../../systems/character.js';
import { trade_buy as buy, trade_sellOne as sellOne, trade_sellAllForeign as sellAllForeign, trade_buyConsumable as buyConsumable, trade_dropEntry as dropEntry } from '../commands.js';
import { getEvent } from '../../data/worldEvents.js';
import { chamberJoined } from '../../systems/guild.js';
import { SIDE_NAME, otherSide } from '../../core/state.js';
import { fmtInt, fmtKg } from '../../core/util.js';
import { clockHM } from '../../core/clock.js';

const ui = {};
const money = (world, amount) => world === 'modern' ? `¥${fmtInt(amount)}` : `${fmtInt(amount)} 灵石`;
const foreignRows = (s, world) => inventoryRows(s).filter(r => ITEM_MAP[r.itemId]?.origin !== world && ITEM_MAP[r.itemId]);
function arrow(s, world, id) {
  const d = s.market.demand[world]?.[id] ?? 1, a = demandArrow(d);
  return h('span', { class: a.cls, text: `${a.sym} ${a.label}` });
}
function maxBuy(s, item) {
  return affordableQuantity(s, s.side, item.id, Math.floor((carryCapacity(s) - carryWeight(s) + 1e-8) / item.weight));
}

/** 后台售货和跨日会改变报价；变化后的报价须由玩家再点一次确认。 */
function confirmQuote(s, ctx, { title, getQuote, describe, execute }) {
  const world = s.side;
  let quote = getQuote();
  if (!quote) { showToast('货物数量已变化，请重新选择。', 'warn'); ctx.rerender(); return; }
  const signature = q => JSON.stringify([s.market.day, q.total, q.qty, q.lines?.map(l=>[l.uid,l.qty]), q.weight]);
  let accepted = signature(quote);
  const detail = h('p.quote-detail', { text: describe(quote) });
  const status = h('p.t-sm.mt-3', { role: 'status', 'aria-live': 'polite', text: '确认后按本次整批报价成交。' });
  ctx.modal({ title, subtitle: `${SIDE_NAME[world]} · 整批报价`, body: h('div', null, detail, status), actions: [
    { label: '取消' },
    { label: '确认成交', primary: true, keepOpen: true, onClick: async () => {
      if (world !== s.side) { status.textContent = '所在世界已变化，请取消后重新报价。'; return; }
      const current = getQuote();
      if (!current) { status.textContent = '货物数量已变化，请取消后重新选择。'; return; }
      if (signature(current) !== accepted) {
        quote = current; accepted = signature(current); detail.textContent = describe(current);
        status.textContent = '行情或背包已变化，报价已更新。请再次确认成交。'; return;
      }
      const result = await execute();
      if (!result.ok) { status.textContent = result.reason || '成交失败，请重新选择。'; return; }
      ctx.closeOverlay(); ctx.rerender();
    } },
  ] });
}
function buyConfirm(s, ctx, item, n) {
  const world = s.side, to = otherSide(world);
  confirmQuote(s, ctx, { title: `进货 · ${item.name} ×${n}`,
    getQuote: () => { const q = quoteBuy(s, world, item.id, n); return q && { ...q, weight: carryWeight(s) + item.weight * n }; },
    describe: q => `支付 ${money(world, q.total)}\n跨界载重 ${fmtKg(q.weight)} / ${carryCapacity(s)} kg\n若带到${SIDE_NAME[to]}整批出售，当前估计回款 ${money(to, quoteSell(s, to, item.id, n, 'common', computeAttrs(s)).total)}。\n两界货币分别结算；目的地行情会变化，回款并非保证利润。`,
    execute: async () => { const r = await buy(s, world, item.id, n); if (r.ok) showToast(`已进货 ${n} 件 · 支付 ${money(world, r.cost)}`, 'good'); return r; },
  });
}
function sellConfirm(s, ctx, uid, n) {
  const world = s.side, item = s.inventory.find(e=>e.uid===uid);
  confirmQuote(s, ctx, { title: `出货 · ${ITEM_MAP[item?.itemId]?.name || '商品'} ×${n}`,
    getQuote: () => { const e = s.inventory.find(e=>e.uid===uid); return e && e.qty >= n ? quoteSell(s, world, e.itemId, n, e.quality, computeAttrs(s)) : null; },
    describe: q => `售出 ${n} 件\n本批回款 ${money(world, q.total)}\n平均 ${money(world, q.average)} / 件\n已逐件计入市场饱和。`,
    execute: async () => await sellOne(s, world, uid, n),
  });
}
function sellAllConfirm(s, ctx) {
  const world = s.side;
  confirmQuote(s, ctx, { title: '整包出货 · 仅跨界货物',
    getQuote: () => { const rows=foreignRows(s,world); return rows.length ? quotePortfolio(s,world,rows,computeAttrs(s)) : null; },
    describe: q => `售出 ${q.qty} 件跨界货物\n合计回款 ${money(world,q.total)}\n同一商品的不同品质共同计入当日销量。材料、丹药与本地货物会保留。`,
    execute: async () => await sellAllForeign(s,world),
  });
}
function priceDetails(s, item, world) {
  const demand=s.market.demand[world]?.[item.id]??1;
  return h('details.market-details', null,
    h('summary', { text: '价格详情' }),
    h('p.t-xs.t-dim', { text: `基础价 ${money(world,item.price[world])} · 当地需求 ×${demand.toFixed(2)} · 市场容量 ${item.capacity[world]} 件\n进货量 ${s.market.bought[world]?.[item.id]||0} · 出货量 ${s.market.sold[world]?.[item.id]||0}\n进货逐件涨价，出货逐件饱和；事件、商业折扣、品质与角色加成会影响报价。本地回收最多按未涨价进货基准的八折计算。` }),
  );
}
function buyRow(s, ctx, item) {
  const world=s.side, to=otherSide(world), max=maxBuy(s,item), q=quoteBuy(s,world,item.id,1);
  return h('div.rowitem.market-row', { dataset: { item: item.id } },
    h('div.rowitem-main', null,
      h('div.rowitem-title', null,h('span.rowitem-name',{text:item.name}),h('span.tag',{text:CATEGORIES[item.cat]?.name||'商品'})),
      h('div.rowitem-meta',null, h('span',{text:`${SIDE_NAME[to]}需求 `}),arrow(s,to,item.id),h('span',{text:` · 回款约 ${money(to,quoteSell(s,to,item.id,1,'common',computeAttrs(s)).total)} / 件`})),
      h('div.t-xs.t-dim',{text:`${item.weight} kg / 件 · 剩余载重可购 ${max} 件`}), priceDetails(s,item,world),
    ),
    h('div.rowitem-act',null,h('div.rowitem-price',{text:money(world,q.total)}),
      h('button.btn.btn-sm',{text:'买 1',disabled:max<1,onclick:()=>buyConfirm(s,ctx,item,1)}),
      h('button.btn.btn-sm',{text:'买 10',disabled:max<1,onclick:()=>buyConfirm(s,ctx,item,Math.min(10,max))}),
      h('button.btn.btn-sm.btn-solid',{text:`装满 ${max}`,disabled:max<1,onclick:()=>buyConfirm(s,ctx,item,max)})),
  );
}
function sellRow(s, ctx, row) {
  const q=quoteSell(s,s.side,row.itemId,row.qty,row.quality,computeAttrs(s));
  return h('div.rowitem.market-row',{dataset:{item:row.itemId}},
    h('div.rowitem-main',null,
      h('div.rowitem-title',null,h('span.rowitem-name',{text:row.item.name}),h('span.tag',{text:`${row.qualityInfo.name} ×${row.qty}`})),
      h('div.rowitem-meta',{text:`整批回款 ${money(s.side,q.total)} · ${fmtKg(row.weight)} kg`}), priceDetails(s,row.item,s.side)),
    h('div.rowitem-act',null,
      h('button.btn.btn-sm',{text:'卖 1',onclick:()=>sellConfirm(s,ctx,row.uid,1)}),
      h('button.btn.btn-sm.btn-solid',{text:'全卖',onclick:()=>sellConfirm(s,ctx,row.uid,row.qty)}),
      h('button.btn.btn-sm.btn-ghost',{text:'丢弃',onclick:()=>ctx.modal({title:`丢弃 ${row.item.name} ×${row.qty}`,body:h('p',{text:'丢弃没有收益，确认后会从背包移除。'}),actions:[{label:'保留'},{label:'确认丢弃',onClick:async ()=>{await dropEntry(s,row.uid,row.qty);ctx.rerender();}}]})})),
  );
}
export function renderMarket(s, ctx) {
  const world=s.side, to=otherSide(world), foreign=foreignRows(s,world), ev=getEvent(s.market.eventId);
  const local=TRADE_ITEMS.filter(i=>i.origin===world && !(i.noBuy||[]).includes(world) && (!i.chamberOnly||chamberJoined(s)));
  const u=ui[world] ||= { tab:foreign.length?'sell':'buy',cat:'all' };
  const recommendations=[...local].sort((a,b)=>quoteSell(s,to,b.id,1,'common',computeAttrs(s)).total/b.weight - quoteSell(s,to,a.id,1,'common',computeAttrs(s)).total/a.weight).slice(0,3);
  const capacity=carryCapacity(s), weight=carryWeight(s);
  const head=panel(null,null,
    h('div.flex-between',null,h('div',null,h('h2.t-serif',{text:`${SIDE_NAME[world]} · 市场`}),h('p.t-xs.t-dim',{text:`用当地货币进货，将货物带到${SIDE_NAME[to]}。每批成交前先确认报价。`})),h('button.btn.btn-sm',{text:'整理界门',onclick:()=>ctx.navigate('gate')})),
    bar(Math.min(1,weight/capacity),{thick:true,liveKey:'weightBar'}),
    h('div.bar-cap',null,h('span',{text:`已装 ${fmtKg(weight)} / ${capacity} kg`}),h('span',{text:`可用 ${money(world,s.currency[currencyOf(world)])}`})),
    h('p.t-xs.t-dim.mt-2',{text:`今日界潮：${ev.name} · ${ev.desc}`}),
  );
  const tabs=h('div.market-tabs',{role:'tablist','aria-label':'市场交易方向'},...[['buy','进货'],['sell','出货'],...(world==='cultivation'?[['pills','丹药']]:[])].map(([id,label])=>h('button.btn',{role:'tab','aria-selected':String(u.tab===id),class:u.tab===id?'btn-solid':'',text:label,onclick:()=>{u.tab=id;ctx.rerender();}})));
  let body;
  if(u.tab==='buy') {
    const categories=[...new Set(local.map(i=>i.cat))];
    if(u.cat!=='all'&&!categories.includes(u.cat))u.cat='all';
    body=h('div.flex-col.gap-4',null,
      panel('目的地机会',`${SIDE_NAME[to]} · 按每公斤当前回款排序`,h('div.market-opportunities',null,...recommendations.map(i=>h('div.opportunity-card',null,h('strong',{text:i.name}),h('div.t-sm.mt-2',null,arrow(s,to,i.id)),h('div.t-num',{text:`${money(to,quoteSell(s,to,i.id,1,'common',computeAttrs(s)).total/i.weight)} / kg`}),h('p.t-xs.t-dim',{text:`进货 ${money(world,quoteBuy(s,world,i.id,1).total)} / 件`}),h('button.btn.btn-sm.mt-2',{text:'查看报价',disabled:maxBuy(s,i)<1,onclick:()=>buyConfirm(s,ctx,i,1)})))),h('p.t-xs.t-dim.mt-2',{text:'排序比较目的地回款，不折算两界货币；还需考虑资金、品质、当日饱和与剩余穿越次数。'})),
      panelFlush('本地进货',h('select',{'aria-label':'商品分类',value:u.cat,onchange:e=>{u.cat=e.target.value;ctx.rerender();}},h('option',{value:'all',text:'全部分类'}),...categories.map(cat=>h('option',{value:cat,selected:u.cat===cat,text:CATEGORIES[cat]?.name||cat}))),...local.filter(i=>u.cat==='all'||i.cat===u.cat).map(i=>buyRow(s,ctx,i))),
      panel('生产与商会',null,h('p.t-xs.t-dim',{text:'灵田作物需要自己种植；商会专属货在加入商会后开放。已有种田、养殖和跨界生产仍可从导航进入。'}),h('div.btn-row.mt-2',null,h('button.btn.btn-sm',{text:world==='cultivation'?'照料灵田与牧场':'现代经营',onclick:()=>ctx.navigate(world==='cultivation'?'farm':'modern')}),h('button.btn.btn-sm',{text:'跨界商会',onclick:()=>ctx.navigate('social')}),h('button.btn.btn-sm',{text:'交易行',onclick:()=>ctx.navigate('tradehouse')}))),
    );
  } else if(u.tab==='sell') {
    const localRows=inventoryRows(s).filter(r=>ITEM_MAP[r.itemId]?.origin===world);
    body=h('div.flex-col.gap-4',null,panelFlush('跨界货物',foreign.length?h('button.btn.btn-sm.btn-solid',{text:'整包报价',onclick:()=>sellAllConfirm(s,ctx)}):null,...(foreign.length?foreign.map(r=>sellRow(s,ctx,r)):[h('div.empty',{text:`还没有外来货物。可以去${SIDE_NAME[to]}进货或生产，再带回来出售。`})])),
      localRows.length?h('details.panel.market-local',null,h('summary',{text:`本地回收 · ${localRows.reduce((a,r)=>a+r.qty,0)} 件`}),h('p.t-xs.t-dim',{text:'方便减重，回收价较低。本地货通常适合带到另一界出售。'}),...localRows.map(r=>sellRow(s,ctx,r))):null);
  } else {
    body=panelFlush('坊市丹药','材料与丹药不占跨界载重',...CONSUMABLES.filter(c=>!c.craftOnly).map(c=>h('div.rowitem',null,h('div.rowitem-main',null,h('strong',{text:c.name}),h('p.t-xs.t-dim',{text:c.desc})),h('div.rowitem-act',null,h('span.t-num',{text:money(world,c.price.cultivation)}),h('button.btn.btn-sm',{text:'购买丹药',disabled:s.currency.stone<c.price.cultivation,onclick:()=>confirmQuote(s,ctx,{title:`购买 ${c.name}`,getQuote:()=>({qty:1,total:c.price.cultivation}),describe:()=>`支付 ${c.price.cultivation} 灵石，购买 ${c.name} ×1。`,execute:async ()=>{const r=await buyConsumable(s,c.id);return r;}})})))));
  }
  const history=(s.market.history||[]).filter(r=>r.currency===currencyOf(world)).slice(0,6);
  return h('div.flex-col.gap-4',null,head,tabs,body,panel('近期收支','按当地货币记录',history.length?history.map(r=>kv(`${clockHM(r.at)} · ${r.channel} · ${ITEM_MAP[r.itemId]?.name || CONSUMABLES.find(c=>c.id===r.itemId)?.name || '货物'} ×${r.qty}`,`${r.type==='buy'?'−':'+'}${money(world,r.amount)}`)):h('p.t-xs.t-dim',{text:'成交后会在这里留下记录。'})));
}
