// A single active routine; prerequisites are rechecked whenever an effect settles.
export const BUILDS = {
 balanced:{name:'自由配装',effect:'沿用装备、道途与战术，没有套路额外加成或代价。',needs:[]},
 poison:{name:'毒丹流',effect:'服蚀灵丹后，命中叠毒最多5层，每层每回合造成当前攻击3%伤害；人物直伤-15%。黑水套两件将毒伤提高25%。',needs:[['丹修',s=>s.path==='alchemy'],['药性数据库',s=>!!s.research.done.database]]},
 burst:{name:'暴击剑修',effect:'前三回合暴击伤害额外+35%，之后人物伤害-15%。上阵火凤时开场暴击率额外+15%；逐日词条让高速优势变为必暴击。',needs:[['战修',s=>s.path==='war'],['装备至少一门招式',s=>!!(s.skills.move1 || s.skills.move2)]]},
 merchant:{name:'极限商修',effect:'跨界载重+5kg、NPC异界收购价+12%；人物秘境伤害-25%。商骨再增10kg，客户关系和锁价仍独立生效。',needs:[['商修',s=>s.path==='merchant'],['加入商会',s=>!!s.social.chamber.joined]]},
 tech:{name:'灵科流',effect:'人物伤害-10%；每波第四回合恢复15%气血，并追加当前攻击40%的脉冲伤害。动力装甲与自动灵田保持各自机制。',needs:[['程序员职业',s=>s.modern.job==='dev'],['灵气神经接口',s=>!!s.research.done.neuralinterface]]},
};
export function buildStatus(s,id=s.player.build || 'balanced'){
 const def=Object.hasOwn(BUILDS,id)?BUILDS[id]:BUILDS.balanced;
 const missing=def.needs.filter(([,test])=>!test(s)).map(([name])=>name);
 if(id==='poison' && !s.player.buffs.some(b=>b.id==='poison_pill' && b.until>s.world.clockMs))missing.push('服用蚀灵丹（可先选择套路）');
 return {id,def,missing,ready:!missing.length};
}
export function activeBuild(s){const b=buildStatus(s);return b.ready?b.id:'balanced';}
