import { CROPS } from '../data/crops.js';
import { BATTLE_BEASTS, RANCH_BEASTS } from '../data/beasts.js';
import { SLOTS, TIERS } from '../data/equipment.js';
import { fmtDuration } from '../core/util.js';
import { getItem } from '../data/items.js';

const EQUIPMENT_SET = SLOTS.flatMap(slot => TIERS.map(tier => ({
  id: `${slot.id}:${tier.id}`, name: `${tier.name}${slot.name}`,
})));

export function markCollection(state, kind, id) {
  if (!['beasts', 'ranch', 'crops', 'equipment'].includes(kind) || typeof id !== 'string' || !id) return;
  state.collection ||= {};
  const list = state.collection[kind] || (state.collection[kind] = []);
  if (!list.includes(id)) list.push(id);
}

export function collectionSections(state) {
  const learned = state.collection || {};
  return [
    { id: 'beasts', label: '战斗灵兽', reward: '御灵博闻（发现全部 5 种）', rows: BATTLE_BEASTS.map(x => ({ id: x.id, name: x.name, note: x.traitDesc, source: '秘境通关时有概率捕获', view: 'dungeon', unlocked: (learned.beasts || []).includes(x.id) })) },
    { id: 'ranch', label: '牧场灵兽', reward: '牧野春风（发现全部 3 种）', rows: RANCH_BEASTS.map(x => ({ id: x.id, name: x.name, note: `${x.desc} · 每 ${fmtDuration(x.cycleMs)} 产出 ${getItem(x.produceId).name} ×${x.qty}`, source: '牧场购买并养殖；产物可交付现代委托', view: 'farm', unlocked: (learned.ranch || []).includes(x.id) || state.ranch.slots.some(s => s?.beastId === x.id) })) },
    { id: 'crops', label: '灵田作物', reward: '百草识途（发现全部 5 种）', rows: CROPS.map(x => ({ id: x.id, name: x.name, note: `${x.desc} · 生长 ${fmtDuration(x.growMs)} · 基础收成 ${x.yieldQty}`, source: '灵田种植后首次收获；可用于委托、炼丹和经营', view: 'farm', unlocked: (learned.crops || []).includes(x.id) })) },
    { id: 'equipment', label: '装备品阶', reward: '藏器三十五（发现全部 35 种部位与品阶）', rows: EQUIPMENT_SET.map(x => ({ ...x, note: '记录部位与品阶，实际属性随档次、词条和强化变化。', source: '秘境掉落或炼器制作', view: 'craft', unlocked: (learned.equipment || []).includes(x.id) })) },
  ];
}
