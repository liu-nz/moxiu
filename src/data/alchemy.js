/** 辅材只改变这一炉；品质药效与 UI 共用同一组规则。 */
import { CONSUMABLE_MAP } from './items.js';
export const AUXILIARIES = [
  { id: 'plain', name: '原方', stage: 0, mats: {}, cost: 0, rate: 0, tox: 1, fine: 0, rare: 0, desc: '节省辅材，产出普通品质。' },
  { id: 'steady', name: '稳火', stage: 0, mats: { lingjidan: 1 }, cost: 10, rate: .08, tox: .65, fine: .15, rare: 0, desc: '增加成功率，降低反噬，少量机会出优质。' },
  { id: 'potent', name: '凝药', stage: 2, mats: { huangjing: 2 }, cost: 30, rate: -.08, tox: 1.15, fine: .45, rare: .20, desc: '牺牲成功率，争取更强药效，反噬风险增加。' },
  { id: 'pure', name: '清毒', stage: 14, mats: { lurong: 1 }, cost: 80, rate: .03, tox: .35, fine: .30, rare: .10, desc: '额外消耗鹿茸，大幅降低反噬风险。' },
];
AUXILIARIES.push({id:'sustained',name:'缓释丹衣',stage:10,mats:{huangjing:1},cost:30,rate:-.03,tox:.65,fine:0,rare:0,desc:'丹修完成灵金缓释丹衣研究后可用：修炼丹持续三倍，效果降低25%。'});
export const AUX_MAP = Object.fromEntries(AUXILIARIES.map(a => [a.id, a]));
export const PILL_QUALITY = { sustained: {name:'缓释',potency:.75}, common: { name: '普通', potency: 1 }, fine: { name: '优质', potency: 1.15 }, rare: { name: '稀有', potency: 1.30 } };
export function pillEffect(id, quality = 'common') {
  const base = CONSUMABLE_MAP[id]?.effect;
  if (!base) return null;
  const potency = PILL_QUALITY[quality]?.potency || 1;
  return { ...base, durationMs: base.type === 'cultivation_boost' && quality === 'sustained' ? base.durationMs * 3 : base.durationMs, add: base.type === 'pity' ? base.add + (quality === 'rare' ? 1 : 0) : base.type === 'stamina' ? Math.round(base.add * potency) : base.add * potency };
}
export function pillDescription(id, quality = 'common') {
  const e = pillEffect(id, quality);
  if (!e) return '跨界贸易商品；品质影响售价。';
  if (e.type === 'battle_poison') return '一小时激活毒丹流，最多五层持续毒；品质不增强该战斗机制，同类不叠加';
  if (e.type === 'stamina') return `恢复 ${e.add} 点体力（不超过上限）`;
  if (e.type === 'breakthrough') return `下次突破成功率 +${Number((e.add * 100).toFixed(1))}%`;
  if (e.type === 'cultivation_boost') return `${e.durationMs / 3600000} 小时修炼速度 +${Number((e.add * 100).toFixed(1))}%；同类丹药替换，不叠加`;
  if (e.type === 'pity') return `推进 ${e.add} 次突破保底（最多达到下次必成）`;
  return '';
}
