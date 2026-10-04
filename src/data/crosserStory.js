export const CROSSER_ARC={id:'other_crosser',name:'不属于你的矿泉水',done:'crosser_complete',rewards:'两界记忆 · 调停或守界',note:'金丹开启。追查另一位穿越者；合作与守界留下不同的客户与世界线索。'};
export const CROSSER_TALES=[
 {id:'crosser_water',arc:'other_crosser',name:'坊市的塑料瓶',world:'cultivation',minStage:14,blockedFlag:'crosser_route',text:'丹阁废纸篓里躺着一瓶矿泉水，生产批次正是上周。你没有带过这个牌子。掌柜说，来人用一块灵金换走了整车黄精，还问起现代城里的电网。',choices:[
 {label:'托掌柜追查交易记录',effect:{},flags:{crosser_route:'open'},result:'掌柜留下了来人的封蜡。你决定联系林教授交叉核对，代价是对方可能察觉调查。'},
 {label:'收起空瓶，暗中跟踪',effect:{},flags:{crosser_route:'shadow'},result:'你记下瓶身上的物流标签，准备从现代仓库反查。丹阁不会替你作证，线索只掌握在你手中。'}]},
 {id:'crosser_open',arc:'other_crosser',name:'两份采购清单',world:'modern',minStage:14,requiresFlag:'crosser_route:open',blockedFlag:'crosser_trace',text:'林教授核对封蜡，发现材料出现在同一个能源承包商的采购单上。那家公司先采购修仙材料，再改装现代设备，路线恰好与你相反。教授担心，试验可能让城市出现灵气泄漏。',choices:[{label:'把证据交给调查组',effect:{},flags:{crosser_trace:'public'},result:'一份公开备份保存了证据。林教授请你注意下一次现代灵气泄漏。'}]},
 {id:'crosser_shadow',arc:'other_crosser',name:'仓库里的阵眼',world:'modern',minStage:14,requiresFlag:'crosser_route:shadow',blockedFlag:'crosser_trace',text:'物流地址指向一间废弃仓库。电表后的阵眼正在吸取地脉，桌上留着一封信：我知道你在找我。落款是沈渡。他似乎认为，灵气应当由少数人掌握。',choices:[{label:'保留阵眼照片，不惊动他',effect:{},flags:{crosser_trace:'hidden'},result:'沈渡的阵图成了你的秘密证据。下次灵脉衰竭时，源头或许会暴露。'}]},
 {id:'crosser_rift',arc:'other_crosser',name:'裂隙另一端的人',world:'cultivation',minStage:14,requiresAnyFlag:'crosser_trace',blockedFlag:'crosser_offer',text:'界门边站着一个穿着现代外套的人。沈渡承认抽取地脉：只要控制现代城市的能源，人就不会再为灵石送命。他邀请你共管阵眼，也知道你手里有证据。',choices:[
 {label:'要求停止抽取，共同验证安全路线',effect:{},flags:{crosser_offer:'cooperate'},result:'沈渡答应把控制图交给林教授审查。你保留了他谈判的空间，也必须为合作负责。'},
 {label:'拒绝控制城市，封存阵眼',effect:{},flags:{crosser_offer:'contain'},result:'沈渡转身离开。你把封存方案送到修仙工坊，请他们设计断流装置。'}]},
 {id:'crosser_cooperate',arc:'other_crosser',name:'共同的底线',world:'modern',minStage:14,requiresFlag:'crosser_offer:cooperate',blockedFlag:'crosser_complete',text:'林教授把控制图改成公开监测方案，沈渡同意限制采集量。两份钥匙由不同的人保管，任何一次越界都会留下记录。你不是唯一的穿越者，但终于不必独自保守所有秘密。',choices:[{label:'签署共同监测约定',effect:{},flags:{crosser_complete:'cooperate'},result:'解锁林教授的阵眼校验委托；世界记忆记录「调停」。轮回后保留结局。'}]},
 {id:'crosser_contain',arc:'other_crosser',name:'界门外的守望',world:'cultivation',minStage:14,requiresFlag:'crosser_offer:contain',blockedFlag:'crosser_complete',text:'工坊将断流装置埋入旧阵眼。现代仓库熄灯时，地脉仍然亮着。沈渡留下最后一张纸条：我们都在保护自己的世界，只是方法不同。你将纸条放进封存档案。',choices:[{label:'留守封存坐标',effect:{},flags:{crosser_complete:'contain'},result:'解锁修仙工坊的断流维护委托；世界记忆记录「守界」。轮回后保留结局。'}]},
 {id:'leak_inquiry',arc:'leak_inquiry',name:'光晕的来处',world:'modern',worldState:'leak',minStage:14,requiresAnyFlag:'crosser_trace',blockedFlag:'leak_inquiry_done',text:'灵气泄漏期间，林教授带着城市光晕照片来找你。频谱与仓库阵眼一致，调查终于有了能重复验证的观测窗口。他没有问来源，只问你是否愿意留下匿名记录。',choices:[{label:'留下匿名观测记录',effect:{},flags:{leak_inquiry_done:'recorded'},result:'异常光晕进入两界研究档案。故事手记保留这次世界变化的证据。'}]},
];
