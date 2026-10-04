/**
 * worldEvents.js —— 世界事件（GDD 14.2）
 * 与界潮同步刷新的全服事件，影响当日市场行情与修炼。
 */

export const WORLD_EVENTS = [
  {
    id: 'calm', name: '两界平稳', weight: 30,
    desc: '界潮照常，行情随缘。没有消息就是最好的消息。',
    price: {},
    priceByWorld: {},
    cultSpeedAdd: 0,
    breakthroughPenalty: 0,
  },
  {
    id: 'pill_rush', name: '丹药热潮', weight: 20,
    desc: '今日丹药价格翻倍，炼丹师赚翻。',
    price: { pill: 2.0 },
    priceByWorld: {},
    cultSpeedAdd: 0,
    breakthroughPenalty: 0,
  },
  {
    farmYield: .5,
    id: 'herb_harvest', name: '灵植丰收', weight: 20,
    desc: '今日灵草产量 +50%，但售价下跌。',
    price: { herb: 0.6 },
    priceByWorld: {},
    cultSpeedAdd: 0,
    breakthroughPenalty: 0,
  },
  {
    id: 'modern_collect', name: '现代收藏热', weight: 15,
    desc: '今日修仙法器在现代卖出天价。',
    price: {},
    priceByWorld: { modern: { artifact: 3.0 } },
    cultSpeedAdd: 0,
    breakthroughPenalty: 0,
  },
  {
    id: 'qi_anomaly', name: '灵气异常', weight: 15,
    desc: '今日修炼速度 +30%，但突破失败率 +10%。',
    price: {},
    priceByWorld: {},
    cultSpeedAdd: 0.30,
    breakthroughPenalty: 0.10,
  },
];

WORLD_EVENTS.push(
 {id:'workshop_festival',name:'两界工坊节',weight:8,desc:'现代精密工具在修仙界需求 +25%；作物产量 +10%。',price:{},priceByWorld:{cultivation:{tool:1.25}},farmYield:.1,cultSpeedAdd:0,breakthroughPenalty:0},
 {id:'rift_storm',name:'界潮风暴',weight:6,desc:'灵气涌动：修炼速度 +15%，突破失败率 +5%。',price:{},priceByWorld:{},cultSpeedAdd:.15,breakthroughPenalty:.05}
);

export const EVENT_MAP = Object.fromEntries(WORLD_EVENTS.map((e) => [e.id, e]));

export function getEvent(id) { return EVENT_MAP[id] || EVENT_MAP.calm; }
