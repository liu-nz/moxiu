import {BUILDS,buildStatus} from '../../data/builds.js';
import {AFFIXES,affixDescription} from '../../data/affixes.js';
import {build_selectBuild,build_inscribeAffix,gear_useConsumable} from '../commands.js';
import {TRADE_ITEMS} from '../../data/items.js';
import {h,panel} from '../dom.js';
import {getPath} from '../../data/paths.js';
import {TACTICS} from '../../systems/build.js';
import {build_createPowerArmor,build_lockQuote,build_setTactic,build_setTraining,build_transferStat} from '../commands.js';
export function renderBuild(s,ctx) {
 const path=getPath(s.path);
 const run=async(command,...args)=>{const r=await command(s,...args);if(!r.ok)ctx.showToast(r.reason,'warn');ctx.rerender();};
 const equipped=Object.values(s.equipment).filter(e=>e && !e.boundTo), items=[...equipped,...s.bag].filter(e=>!e.tech && e.rule!=='powerarmor' && ['rare','epic','legend'].includes(e.tier));
 const current=buildStatus(s);
 return h('div.flex-col.gap-4',null,
  panel('本世套路',`${current.def.name} · ${current.ready?'生效':'条件不足，暂按自由配装'}`,
   h('p.t-xs.t-dim',{text:'同一时间只启用一个套路；更换道途、职业或装备后会重新检查条件。套路与新战斗词条用于秘境，竞技维持现有公平规则。'}),
   Object.entries(BUILDS).map(([id,def])=>{const b=buildStatus(s,id),selected=(s.player.build || 'balanced')===id;return h('div.rowitem.mt-2',null,
    h('div.rowitem-main',null,h('strong.t-sm',{text:def.name}),h('p.t-xs',{text:def.effect}),h('p.t-xs.t-dim',{text:b.missing.length?'还需：'+b.missing.join('、'):'✓ 核心条件齐备'})),
    h('button.btn.btn-sm',{text:selected?'已选择':`启用${def.name}`,disabled:selected || def.needs.some(([,test])=>!test(s)),onclick:()=>run(build_selectBuild,id)}));}),
   h('div.btn-row.mt-2',null,h('button.btn.btn-sm',{text:'准备功法与装备',onclick:()=>ctx.navigate('character')}),h('button.btn.btn-sm',{text:'准备丹药',onclick:()=>ctx.navigate(s.side==='cultivation'?'craft':'gate')}),s.inventory.some(e=>e.itemId==='shilingdan' && e.qty>0)?h('button.btn.btn-sm',{text:'服用蚀灵丹',onclick:()=>run(gear_useConsumable,'shilingdan')}):null)),
  panel('机制词条铭刻','1000灵石 + 灵金×2 / 次',
   h('p.t-xs.t-dim',{text:'筑基中期开放，只限宝品及以上普通装备。每件保留一个机制词条，铭刻成功会替换原词条；同名机制不叠加。随机宝品掉落也可能获得词条。'}),
   Object.values(AFFIXES).map(a=>h('p.t-xs.mt-2',{text:`【${a.name}】${a.description}`})),
   h('details.mt-3',null,h('summary',{text:`选择铭刻装备 · ${items.length} 件可用`}),items.length?items.map(eq=>h('div.mt-2',null,h('strong.t-sm',{text:eq.name+(equipped.includes(eq)?' · 已装备':' · 装备库')}),h('p.t-xs.t-dim',{text:affixDescription(eq) || '暂无机制词条'}),h('div.btn-row.mt-2',null,Object.entries(AFFIXES).filter(([,a])=>a.slots.includes(eq.slot)).map(([id,a])=>h('button.btn.btn-sm',{text:`铭刻${a.name}`,disabled:s.player.stage<11 || eq.rule===id || s.currency.stone<1000,onclick:()=>ctx.modal({title:'确认替换机制词条',body:h('p',{text:`为「${eq.name}」铭刻${a.name}，永久消耗1000灵石和灵金×2，替换原机制词条。${a.description}`}),actions:[{label:'取消'},{label:'确认铭刻',primary:true,onClick:()=>run(build_inscribeAffix,eq.uid,id)}]})}))))):h('p.t-xs',{text:'可从秘境或炼器取得宝品装备；太虚遗迹与灵金铸等都能产出。'}))),

  panel('配装与战术',path?.name || '尚未择道',h('p.t-sm',{text:path?.passive || '在修炼页选择道途。'}),h('p.t-xs.t-dim.mt-2',{text:'战术仅影响秘境；竞技对战使用公平结算。神经接口需要阵法传感器和经脉模型，自适应护甲需要灵能电池和复合灵金。'}),
   h('div.btn-row.mt-3',null,Object.entries(TACTICS).map(([id,t])=>h('button.btn.btn-sm',{text:t.name,class:(s.dungeon.tactic || 'balanced')===id?'btn-solid':'',title:t.description,onclick:()=>run(build_setTactic,id)}))),
   h('p.t-xs.mt-2',{text:equipped.map(affixDescription).filter(Boolean).join(' · ') || '当前未装备机制词条。'}),
   h('p.t-xs.t-dim',{text:`黑水套 ${equipped.filter(e=>e.set==='blackwater').length}/2：黑水沼泽掉落装备带套装标记，两件提高毒丹流持续毒伤25%。`}),
   h('p.t-xs.mt-2',{text:(TACTICS[s.dungeon.tactic] || TACTICS.balanced).description}),
   h('div.btn-row.mt-3',null,h('button.btn.btn-sm',{text:'调整装备与功法',onclick:()=>ctx.navigate('character')}),h('button.btn.btn-sm',{text:'查看灵科研究',onclick:()=>ctx.navigate('research')}))),
  panel('双槽动力装甲','占用衣服与头盔',h('p.t-xs.t-dim',{text:'筑基中期与对应研究开放。500灵石+灵金×2制造一件，之后在人物页装备。替换的旧头盔回到装备库；卸装需操作衣服槽。'}),h('button.btn.btn-sm.mt-2',{text:'制造动力装甲',disabled:s.player.stage<11 || !s.research.done.powerarmor,onclick:()=>run(build_createPowerArmor)})),
  s.dungeon.lastBattleStats ? panel('最近秘境战报',s.dungeon.lastBattleStats.name,h('p.t-xs',{text:`人物伤害 ${s.dungeon.lastBattleStats.playerDamage} · 灵兽伤害 ${s.dungeon.lastBattleStats.petDamage} · 机制伤害 ${s.dungeon.lastBattleStats.mechanicDamage} · 承受伤害 ${s.dungeon.lastBattleStats.incomingDamage}`}),h('p.t-xs.t-dim',{text:s.dungeon.lastBattleStats.mechanicDamage > s.dungeon.lastBattleStats.playerDamage*.3 ? '机制伤害占比较高，优先准备克制装备或改用守阵。' : '根据敌人的蓄力、反击和护盾调整战术；战力仅作参考。'})) : null,
  s.path==='merchant' || s.reincarnation.fate==='merchant' ? panel('商修锁价','每日一次，消耗20灵石，持续12小时',h('p.t-xs.t-dim',{text:'锁定目的地当前收购基价；品质和销量衰减仍照常结算，不影响玩家交易行。'}),h('p.t-xs',{text:s.market.quoteLock ? `已锁定：${TRADE_ITEMS.find(x=>x.id===s.market.quoteLock.itemId)?.name || s.market.quoteLock.itemId}` : '请选择计划跨界运输的商品。'}),h('div.btn-row.mt-2',null,TRADE_ITEMS.map(item=>h('button.btn.btn-sm',{text:item.name,disabled:s.currency.stone<20,onclick:()=>run(build_lockQuote,item.id)})))) : null,
  s.path==='speed' ? panel('速修冲刺','每秒消耗0.1灵石，额外修为+35%',h('p.t-xs',{text:`仅在修仙界生效；预算不足立即停止。剩余预算 ${Number(s.player.trainingBudget || 0).toFixed(1)} 灵石。`} ),h('div.btn-row.mt-2',null,[0,10,100,1000].map(n=>h('button.btn.btn-sm',{text:n?`预算 ${n} 灵石`:'停止冲刺',disabled:n>s.currency.stone,onclick:()=>run(build_setTraining,n)})))) : null,
  s.path==='artifact' ? panel('器修属性转移','消耗供体装备，保留目标其他属性',h('p.t-xs.t-dim',{text:'选择同部位、更高属性的供体。费用100+目标强化等级×20灵石；供体会被永久消耗。'}),s.bag.flatMap(d=>{const target=s.equipment[d.slot];return !target || d.tech || target.tech ? [] : Object.keys(target.stats).filter(k=>d.stats[k]>target.stats[k]).map(k=>h('button.btn.btn-sm.mt-2',{text:`${d.name} → ${target.name}：${k} ${target.stats[k]} → ${d.stats[k]}`,onclick:()=>ctx.modal({title:'确认消耗供体',body:h('p',{text:`永久消耗「${d.name}」与 ${100+(target.enhance||0)*20} 灵石，将 ${k} 转移给「${target.name}」。`}),actions:[{label:'取消'},{label:'确认转移',primary:true,onClick:()=>run(build_transferStat,d.uid,d.slot,k)}]})}));})) : null);
}
