import { CROPS } from '../data/crops.js';
import { BATTLE_BEASTS, RANCH_BEASTS } from '../data/beasts.js';
import { SLOTS, TIERS } from '../data/equipment.js';
import { fmtDuration } from '../core/util.js';
import { ALL_ITEMS, getItem } from '../data/items.js';

import { DUNGEONS, DIFFICULTIES } from '../data/dungeons.js';
import { STORY_ARCS, STORY_TALES } from '../data/stories.js';
import { PROJECTS } from '../data/research.js';
import { EQUIPMENT_DESIGNS } from '../data/equipmentDesigns.js';
import { SKILL_TIERS } from '../data/skills.js';
import { SECRETS } from '../data/secrets.js';

const EQUIPMENT_SET = SLOTS.flatMap(slot => TIERS.map(tier => ({
  id: `${slot.id}:${tier.id}`, name: `${tier.name}${slot.name}`,
})));

export function markCollection(state, kind, id) {
  if (!['beasts', 'ranch', 'crops', 'equipment', 'items', 'dungeons', 'drops', 'designs', 'secrets', 'skills'].includes(kind) || typeof id !== 'string' || !id) return;
  state.collection ||= {};
  const list = state.collection[kind] || (state.collection[kind] = []);
  if (!list.includes(id)) list.push(id);
}

export function collectionSections(state) {
  const learned = state.collection || {};
  const found=(kind,id)=>(learned[kind] || []).includes(id);
  const endingName=value=>({open:'公开合作',private:'匿名合作',restore:'保留补痕',keep:'保存原貌',sword:'青穗攻势',robe:'雨露守护',recorded:'记录留存',cooperate:'调停',contain:'守界',investigate:'求证',protect:'守护',aid:'援助',search:'寻迹',carry:'传信',care:'供货',study:'研究',listen:'倾听'})[value] || '记忆留存';
  const people=['林教授','陈老板','炼器大师','丹阁掌柜','黑市商人','神秘买家'];
  return [
    {id:'people',label:'人物志',rows:people.map(name=>({id:name,name,note:`客户关系 ${state.commissions?.relations?.[name] || 0}/100；往来与故事选择随轮回保留。`,source:'交付该客户委托，建立真实往来',view:'gate',unlocked:(state.commissions?.relations?.[name] || 0)>0}))},
    {id:'items',label:'万物志',rows:ALL_ITEMS.map(x=>({id:x.id,name:x.name,note:x.desc || '两界之间的材料与商品。',source:x.craftOnly?'炼制异变发现':x.cat==='mat'?'秘境掉落 / 材料库':x.origin==='modern'?'现代采购': '市场、生产、炼制或秘境发现',view:x.craftOnly?'craft':'market',unlocked:found('items',x.id) || state.inventory.some(e=>e.itemId===x.id && e.qty>0)}))},
    {id:'dungeons',label:'秘境志',rows:DUNGEONS.map(d=>{
      const difficulties=d.worldChallenge?DIFFICULTIES.filter(x=>x.id==='normal'):DIFFICULTIES;
      const drops=[...new Set([...(d.matPool || []),...(d.goodsPool || [])])];
      const done=difficulties.filter(x=>found('dungeons',`${d.id}:${x.id}`) || state.dungeon.cleared[`${d.id}:${x.id}`]>0).length;
      const loot=drops.filter(id=>found('drops',`${d.id}:${id}`)).length;
      return {id:d.id,name:d.name,note:`探索度 ${Math.round((done+loot)/(difficulties.length+drops.length)*100)}% · ${difficulties.map(x=>`${found('dungeons',`${d.id}:${x.id}`)?'✓':'○'}${x.name}`).join(' / ')} · 素材发现 ${loot}/${drops.length}：${drops.filter(id=>found('drops',`${d.id}:${id}`)).map(id=>getItem(id)?.name || id).join('、') || '尚无记录'}${state.tales.flags[`map_${d.id}`]?' · 地图残片已发现':''}`,source:'通关难度与实际掉落分别记录；劫境需一次轮回，灵脉源头仅事件期间开放',view:'dungeon',unlocked:done>0 || !!state.tales.flags[`map_${d.id}`]};
    })},
    {id:'stories',label:'奇闻录',rows:STORY_ARCS.map(a=>({id:a.id,name:a.name,note:`${a.note} · ${state.tales.flags[a.done]?'结局：'+endingName(state.tales.flags[a.done]):'故事未完结'}`,source:'探索中追寻线索；留意世界、客户关系与前置章节',view:'exploration',unlocked:!!state.tales.flags[a.done] || STORY_TALES.some(t=>t.arc===a.id && state.tales.seen[t.id])}))},
    {id:'research',label:'灵科图谱',rows:PROJECTS.map(x=>({id:x.id,name:x.secret && !found('secrets',x.secret)?'未解的灵科线索':x.name,note:x.effectDesc,source:x.secret && !found('secrets',x.secret)?'隐秘发现可能提供研究线索':`研究消耗 ${x.cost} 点；完成前置研究`,view:'research',unlocked:!!state.research.done[x.id]}))},
    {id:'skills',label:'功法志',rows:['heart','move','special'].flatMap(slot=>SKILL_TIERS.map(t=>({id:`${slot}:${t.id}`,name:`${t.name}·${({heart:'心法',move:'招式',special:'秘术'})[slot]}`,note:'记录功法类型与品阶，具体词条、档次与等级由实际功法决定。',source:'秘境掉落或人物中的功法配装',view:'character',unlocked:found('skills',`${slot}:${t.id}`)})))},
    {id:'designs',label:'定向器物志',rows:EQUIPMENT_DESIGNS.map(x=>({id:x.id,name:x.secret && !found('secrets',x.secret)?'未知器物':x.name,note:x.note,source:x.secret && !found('secrets',x.secret)?'秘密发现可能解锁图谱':(['qingsui','yulu'].includes(x.id)?'丹器中按指定图谱炼成；工坊后续故事也提供一次试作品':'丹器中按指定图谱炼成'),view:'craft',unlocked:found('designs',x.id)}))},
    {id:'secrets',label:'隐秘手记',rows:SECRETS.map(x=>({...x,source:found('secrets',x.id)?'发现记录随轮回保留。':x.hint,unlocked:found('secrets',x.id)}))},
    { id: 'beasts', label: '异兽志 · 战斗灵兽', reward: '御灵博闻（发现全部 5 种）', rows: BATTLE_BEASTS.map(x => ({ id: x.id, name: x.name, note: x.traitDesc, source: '秘境通关时有概率捕获', view: 'dungeon', unlocked: (learned.beasts || []).includes(x.id) })) },
    { id: 'ranch', label: '异兽志 · 牧场灵兽', reward: '牧野春风（发现全部 3 种）', rows: RANCH_BEASTS.map(x => ({ id: x.id, name: x.name, note: `${x.desc} · 每 ${fmtDuration(x.cycleMs)} 产出 ${getItem(x.produceId).name} ×${x.qty}`, source: '牧场购买并养殖；产物可交付现代委托', view: 'farm', unlocked: (learned.ranch || []).includes(x.id) || state.ranch.slots.some(s => s?.beastId === x.id) })) },
    { id: 'crops', label: '万物志 · 灵田作物', reward: '百草识途（发现全部 5 种）', rows: CROPS.map(x => ({ id: x.id, name: x.name, note: `${x.desc} · 生长 ${fmtDuration(x.growMs)} · 基础收成 ${x.yieldQty}`, source: '灵田种植后首次收获；可用于委托、炼丹和经营', view: 'farm', unlocked: (learned.crops || []).includes(x.id) })) },
    { id: 'equipment', label: '装备品阶', reward: '藏器三十五（发现全部 35 种部位与品阶）', rows: EQUIPMENT_SET.map(x => ({ ...x, note: '记录部位与品阶，实际属性随档次、词条和强化变化。', source: '秘境掉落或炼器制作', view: 'craft', unlocked: (learned.equipment || []).includes(x.id) })) },
  ];
}


// 旧存档只补录当前仍持有的物品与已通关难度，未知历史掉落不补造。
export function syncCollection(state) {
 for(const item of [...state.inventory,...Object.values(state.cargo?.storage || {}).flat()])if(item.qty>0)markCollection(state,'items',item.itemId);
 for(const eq of [...state.bag,...Object.values(state.equipment)].filter(Boolean)){
  if(!eq.tech){markCollection(state,'equipment',`${eq.slot}:${eq.tier}`);if(eq.design)markCollection(state,'designs',eq.design);}
 }
 for(const sk of [...state.skillBag,...Object.values(state.skills)].filter(Boolean))markCollection(state,'skills',`${sk.slot}:${sk.tier}`);
 for(const [key,count] of Object.entries(state.dungeon.cleared))if(count>0)markCollection(state,'dungeons',key);
}
