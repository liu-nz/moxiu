export const AFFIXES = {
 due:{name:'渡厄',slots:['armor','helmet'],description:'本场首次受击将跌至30%气血时，先获得最大气血25%的护盾，持续本回合及后两回合；每波一次。'},
 zhuri:{name:'逐日',slots:['weapon','boots'],description:'速度达到敌人130%时，人物攻击必定暴击；只影响秘境。'},
 shiling:{name:'噬灵',slots:['weapon','ring2'],description:'每战胜一波敌人，本次秘境人物攻击+3%，上限30%；离场清零。'},
 shanggu:{name:'商骨',slots:['artifact'],description:'装备此法宝时跨界载重+10kg；同名词条不叠加。'},
};
export function hasAffix(s,id){return Object.values(s.equipment || {}).some(e=>e?.rule===id);}
export function affixDescription(eq){return AFFIXES[eq?.rule] ? `【${AFFIXES[eq.rule].name}】${AFFIXES[eq.rule].description}` : eq?.rule==='execute' ? '【斩决】敌人气血低于30%时，招式威力+20%。' : eq?.rule==='chargeguard' ? '【护阵】首次蓄力伤害降低25%。' : eq?.rule==='powerarmor' ? '【动力装甲】占衣服与头盔，蓄力伤害降低20%。' : '';}
