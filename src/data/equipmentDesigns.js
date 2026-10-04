// 定向灵品图谱：小幅属性偏向，沿用普通装备、强化与重铸规则。
export const EQUIPMENT_DESIGNS = [
 {id:'qingsui',name:'青穗剑',slot:'weapon',stage:5,stat:'critRate',bonus:.012,note:'暴击率额外 +1.2%，适合开场爆发。'},
 {id:'yulu',name:'雨露袍',slot:'armor',stage:5,stat:'dmgReduce',bonus:.012,note:'减伤额外 +1.2%，为长战留余地。'},
 {id:'xinglv',name:'行旅履',slot:'boots',stage:5,stat:'spd',bonus:2,note:'速度额外 +2，提前行动。'},
 {id:'shouji',name:'守记环',slot:'ring2',stage:11,stat:'lifesteal',bonus:.008,note:'吸血额外 +0.8%，持续作战。'},
 {id:'pinlv',name:'频律盘',slot:'artifact',stage:23,stat:'skillPower',bonus:.02,secret:'signal',note:'功法威力额外 +2%；遗迹异界频率解锁图谱。'},
 {id:'yechao',name:'夜潮冠',slot:'helmet',stage:27,stat:'dodge',bonus:.012,secret:'night',note:'闪避额外 +1.2%；星陨夜潮解锁图谱。'},
];
export const DESIGN_MAP = Object.fromEntries(EQUIPMENT_DESIGNS.map(x=>[x.id,x]));
export function applyDesign(eq,id) {
 const d=DESIGN_MAP[id];
 if(!d || eq.slot!==d.slot)return eq;
 eq.name=d.name;eq.design=id;eq.stats[d.stat]=(eq.stats[d.stat] || 0)+d.bonus;
 return eq;
}
