/**
 * items.js —— 商品 / 材料 / 消耗品数据
 *
 * 两界货币互不相通（修仙界=灵石 stone，现代=人民币 cny），
 * 玩家必须双向带货才能同时供养两条线 —— 这是「两界信息差」的落地方式。
 *
 * 字段说明：
 *   origin   出产于哪个世界（在本地便宜）
 *   noBuy    在该世界不可直接购买（只能自产，如灵田作物）
 *   capacity 各世界每日市场容量，用于 GDD 4.3 的饱和机制
 *   material 炼丹/炼器材料，不参与跨界贸易
 */

export const CATEGORIES = {
  herb:     { name: '灵植',     cls: 'q-fine' },
  pill:     { name: '丹药',     cls: 'q-rare' },
  beast:    { name: '妖兽材料', cls: 'q-epic' },
  artifact: { name: '法器',     cls: 'q-legend' },
  food:     { name: '食品',     cls: 'q-common' },
  medicine: { name: '医药',     cls: 'q-fine' },
  tool:     { name: '工具',     cls: 'q-common' },
  tech:     { name: '科技制品', cls: 'q-rare' },
  material: { name: '灵材',     cls: 'q-epic' },
};

/* ================= 跨界贸易商品 ================= */
export const TRADE_ITEMS = [
  /* ---------------- 修仙界出产 ---------------- */
  {
    id: 'lingmi', name: '灵米', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 12, modern: 620 },
    weight: 1.0,
    capacity: { cultivation: 40, modern: 24 },
    desc: '以灵泉水灌溉的稻米。在修仙界是口粮，在现代是实验室里解释不了的东西。',
  },
  {
    id: 'huangjing', name: '黄精草', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 20, modern: 1100 },
    weight: 0.5,
    capacity: { cultivation: 34, modern: 20 },
    desc: '三年一熟的灵草。现代药企愿意为它开出一个不讲道理的价钱。',
  },
  {
    id: 'juqi', name: '聚气丹', cat: 'pill', origin: 'cultivation',
    price: { cultivation: 45, modern: 2400 },
    weight: 0.4,
    capacity: { cultivation: 26, modern: 16 },
    desc: '低阶修士的日用丹药。现代收藏市场把它当成「无法复制的古代工艺」。',
  },
  {
    id: 'yaodan', name: '妖丹', cat: 'beast', origin: 'cultivation',
    price: { cultivation: 90, modern: 4600 },
    weight: 1.2,
    capacity: { cultivation: 20, modern: 12 },
    desc: '妖兽内丹，蕴含精纯灵气。在现代，它被称作「未知能量源」。',
  },
  {
    id: 'gufaqi', name: '古法器', cat: 'artifact', origin: 'cultivation',
    price: { cultivation: 260, modern: 13000 },
    weight: 8.0,
    capacity: { cultivation: 10, modern: 6 },
    desc: '前朝修士的遗物。沉，但一件顶得上你搬十趟灵米。',
  },

  /* ---------------- 灵田作物（只能种，不能买） ---------------- */
  {
    id: 'bainian', name: '百年人参', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 120, modern: 5200 },
    weight: 0.4,
    capacity: { cultivation: 20, modern: 14 },
    noBuy: ['cultivation'],
    desc: '灵田十二年的收成。现代拍卖行会为它单独开一场。',
  },
  {
    id: 'binglian', name: '冰莲', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 600, modern: 26000 },
    weight: 0.6,
    capacity: { cultivation: 12, modern: 8 },
    noBuy: ['cultivation'],
    desc: '只在极寒灵泉里开两天的花。收获后可保存在背包，供灵元丹、渡劫丹或跨界贸易。',
  },
  {
    id: 'jiuzhuan', name: '九转还魂草', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 3000, modern: 130000 },
    weight: 0.5,
    capacity: { cultivation: 6, modern: 4 },
    noBuy: ['cultivation'],
    desc: '七年一熟。整座坊市一年也见不到几株，你却有一整块田。',
  },

  /* ---------------- 现代出产 ---------------- */
  {
    id: 'yasuo', name: '压缩食品', cat: 'food', origin: 'modern',
    price: { cultivation: 3, modern: 80 },
    weight: 1.0,
    capacity: { cultivation: 40, modern: 60 },
    desc: '一块顶一顿。在修士眼里这是仙家干粮，在你眼里这是楼下超市。',
  },
  {
    id: 'kangshengsu', name: '抗生素', cat: 'medicine', origin: 'modern',
    price: { cultivation: 8, modern: 200 },
    weight: 0.4,
    capacity: { cultivation: 30, modern: 40 },
    desc: '在修仙界，这叫「解百毒之药」。带进毒系副本可自动解毒。',
    equip: { slot: 'artifact', effect: 'poison_immunity' },
  },
  {
    id: 'qiangguang', name: '强光手电', cat: 'tool', origin: 'modern',
    price: { cultivation: 7, modern: 160 },
    weight: 0.8,
    capacity: { cultivation: 30, modern: 45 },
    desc: '一束不需要真元的光。阴系副本中伤害 ×2。',
    equip: { slot: 'artifact', effect: 'light_boost' },
  },
  {
    id: 'jingmi', name: '精密工具', cat: 'tool', origin: 'modern',
    price: { cultivation: 16, modern: 380 },
    weight: 2.5,
    capacity: { cultivation: 24, modern: 30 },
    desc: '一套完整的现代量具。修仙界的炼器师看一眼就再也放不下。',
  },
  {
    id: 'hejin', name: '合金刀', cat: 'tech', origin: 'modern',
    price: { cultivation: 19, modern: 460 },
    weight: 1.5,
    capacity: { cultivation: 24, modern: 30 },
    desc: '工业级合金刀具。前期开荒，相当于一件灵器下品。',
    equip: { slot: 'weapon', effect: 'flat_atk', atk: 18 },
  },
  {
    id: 'fangkui', name: '防火服', cat: 'tech', origin: 'modern',
    price: { cultivation: 26, modern: 720 },
    weight: 2.0,
    capacity: { cultivation: 20, modern: 26 },
    desc: '炼钢厂同款。炼狱系副本中受到伤害 -25%。',
    equip: { slot: 'armor', effect: 'heat_shield' },
  },

  /* ---------------- 跨界商会专属 ---------------- */
  {
    id: 'lingxixiang', name: '灵犀香', cat: 'herb', origin: 'cultivation',
    price: { cultivation: 80, modern: 4200 },
    weight: 0.3,
    capacity: { cultivation: 14, modern: 10 },
    chamberOnly: true,
    desc: '商会内部流通的香料。点一支，两个世界的人都能闻到——这话是商会自己说的。',
  },
  {
    id: 'gongyemu', name: '工业母机', cat: 'tech', origin: 'modern',
    price: { cultivation: 95, modern: 2200 },
    weight: 6.0,
    capacity: { cultivation: 12, modern: 14 },
    chamberOnly: true,
    desc: '商会从产业园里拆出来的一台。修仙界没人会用，但所有人都想买。',
  },
];

/* ================= 炼丹 / 炼器材料（不参与跨界贸易） ================= */
export const MATERIALS = [
  { id: 'yinjing', name: '阴精', cat: 'material', weight: 0.3, tier: 1, price: { cultivation: 40 },
    desc: '阴煞之地凝结的浊气结晶。炼阴属法器的主料。' },
  { id: 'lingjin', name: '灵金', cat: 'material', weight: 0.8, tier: 2, price: { cultivation: 120 },
    desc: '浸过灵脉的金属矿。现代冶金学解释不了它的延展性。' },
  { id: 'jianpo', name: '剑魄', cat: 'material', weight: 0.2, tier: 3, price: { cultivation: 400 },
    desc: '断剑里残存的一缕剑意。握久了手心会疼。' },
  { id: 'huojing', name: '火晶', cat: 'material', weight: 0.4, tier: 4, price: { cultivation: 1200 },
    desc: '地火中结出的晶体，常温下也在发烫。' },
  { id: 'xuanjing', name: '玄晶', cat: 'material', weight: 0.5, tier: 5, price: { cultivation: 4000 },
    desc: '前朝阵法核心的残片，仍有余温般的灵力流动。' },
  { id: 'xingchen', name: '星尘', cat: 'material', weight: 0.2, tier: 6, price: { cultivation: 15000 },
    desc: '陨铁在海底泡了万年剩下的东西。它比任何现代合金都重。' },

  /* ---- 牧场产出 ---- */
  { id: 'lingjidan', name: '灵鸡蛋', cat: 'material', weight: 0.1, tier: 1, price: { cultivation: 18 },
    desc: '炼丹的万用辅料。现代早餐店买不到，修仙界人人家里都有。' },
  { id: 'lingyangmao', name: '灵羊毛', cat: 'material', weight: 0.1, tier: 2, price: { cultivation: 90 },
    desc: '纺出来的布比任何现代防弹材料都耐磨。' },
  { id: 'lurong', name: '鹿茸', cat: 'material', weight: 0.2, tier: 3, price: { cultivation: 520 },
    desc: '灵鹿每年掉一次，你每年赚一次。炼丹里最贵的一味。' },
];

/* ================= 消耗品 ================= */
export const CONSUMABLES = [
 {id:'fanzhao',name:'返照丹',cat:'pill',price:{cultivation:0},craftOnly:true,weight:.1,effect:{type:'cultivation_boost',add:.15,durationMs:15*60000},desc:'每份丹方累计失败三炉后首次收获的变异丹。修炼速度+15%，持续15分钟；同类丹药不叠加。'},
 {id:'shilingdan',name:'蚀灵丹',cat:'pill',price:{cultivation:180},weight:.1,effect:{type:'battle_poison',add:.03,durationMs:3600000},desc:'一小时内激活毒丹流；命中叠毒，最多五层。需丹修与药性数据库；普通攻击降低15%。'},
  {
    id: 'zhujidan', name: '筑基丹', cat: 'pill', price: { cultivation: 300 },
    weight: 0.1,
    effect: { type: 'breakthrough', add: 0.20 },
    desc: '一次性。下一次突破成功率 +20%。失败不可惜，可惜的是没带。',
  },
  {
    id: 'dujiedan', name: '渡劫丹', cat: 'pill', price: { cultivation: 4000 },
    weight: 0.1,
    effect: { type: 'breakthrough', add: 0.30 },
    desc: '高阶突破用的重药。据说是拿别人的失败炼出来的。',
  },
  {
    id: 'huiyuandan', name: '回元丹', cat: 'pill', price: { cultivation: 60 },
    weight: 0.1,
    effect: { type: 'stamina', add: 30 },
    desc: '恢复 30 点体力。副本刷到一半没体力的人，都懂。',
  },
  {
    id: 'ningshendan', name: '凝神丹', cat: 'pill', price: { cultivation: 180 },
    weight: 0.1,
    effect: { type: 'cultivation_boost', add: 1.0, durationMs: 3600 * 1000 },
    desc: '一小时内修炼速度 +100%。闭关前的最后一口。',
  },
  {
    id: 'lingyuandan', name: '灵元丹', cat: 'pill', price: { cultivation: 1500 },
    weight: 0.1,
    effect: { type: 'cultivation_boost', add: 2.0, durationMs: 2 * 3600 * 1000 },
    desc: '两小时内修炼速度 +200%。灵田里的东西炼出来的，效果不一样。',
  },
  {
    id: 'jiuzhuandan', name: '九转还魂丹', cat: 'pill', price: { cultivation: 20000 },
    weight: 0.1,
    effect: { type: 'pity', add: 2 },
    desc: '直接推进两次突破保底。命不好的人，只能靠钱。',
  },
];

/* ================= 索引 ================= */
export const ITEM_MAP = Object.fromEntries(TRADE_ITEMS.map((i) => [i.id, i]));
export const MATERIAL_MAP = Object.fromEntries(MATERIALS.map((i) => [i.id, i]));
export const CONSUMABLE_MAP = Object.fromEntries(CONSUMABLES.map((i) => [i.id, i]));
export const ALL_ITEMS = [...TRADE_ITEMS, ...MATERIALS, ...CONSUMABLES];

export function getItem(id) {
  return ITEM_MAP[id] || MATERIAL_MAP[id] || CONSUMABLE_MAP[id] || null;
}

export function isTradeItem(id) { return !!ITEM_MAP[id]; }
export function isMaterial(id) { return !!MATERIAL_MAP[id]; }
export function isConsumable(id) { return !!CONSUMABLE_MAP[id]; }

export function currencyOf(world) { return world === 'modern' ? 'cny' : 'stone'; }

export const CURRENCY_NAME = { stone: '灵石', cny: '人民币' };
export const CURRENCY_SIGN = { stone: '灵石', cny: '¥' };
