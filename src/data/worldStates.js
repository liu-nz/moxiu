import {riftDayIndex,riftDayStart} from '../core/clock.js';
const ANCHOR=riftDayIndex(Date.parse('2026-10-04T08:00:00Z'));
const STATES={
 depletion:{name:'灵脉衰竭',days:[
  {text:'地脉失去光泽：修炼速度降低10%，修士开始寻找源头。',cultMult:.9},
  {text:'药圃供货紧张：灵草行情提高30%，修炼速度降低10%。',cultMult:.9,price:{herb:1.3}},
  {text:'灵兽暴躁：秘境敌人攻击提高10%；灵脉源头可挑战。',enemyAtk:1.1,challenge:true},
 ]},
 leak:{name:'现代灵气泄漏',days:[
  {text:'城市新闻报道异常光晕，神秘买家开始联系知情行者。'},
  {text:'异质物收藏热：现代法器行情提高40%，调查仍在继续。',priceByWorld:{modern:{artifact:1.4}}},
  {text:'林教授发起调查：现代灵植行情提高20%，知情行者可追寻泄漏线索。',priceByWorld:{modern:{herb:1.2}}},
 ]},
};
export function worldState(s){
 const day=riftDayIndex(s.world.clockMs), offset=((day-ANCHOR)%12+12)%12;
 const id=offset<3?'depletion':offset>=6 && offset<9?'leak':'calm';
 const phase=id==='depletion'?offset+1:id==='leak'?offset-5:0;
 const next=offset<6?'现代灵气泄漏':'灵脉衰竭',wait=offset<6?6-offset:12-offset;
 return {id,name:STATES[id]?.name || '两界休整',phase,day,cycle:Math.floor((day-ANCHOR)/12),endsAt:riftDayStart(day+1),forecast:`${wait}天后进入${next}`,text:'两界休整；每日行情仍照常变化。',...(STATES[id]?.days[phase-1] || {})};
}
export function worldPriceMult(s,world,item){const w=worldState(s);return (w.price?.[item.cat] || 1)*(w.priceByWorld?.[world]?.[item.cat] || 1);}
export function sourceOpen(s){return s.player.stage>=11 && worldState(s).challenge===true;}
