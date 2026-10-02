/**
 * lifestyle.js —— 现代「休闲生活」（GDD 1.2 里世界职责）
 *
 * 里世界负责「科技、资金、商业、研究、地产、休闲生活」。
 * 休闲生活是人民币的主要去处，也是两界对比最直观的地方：
 * 你在修仙界省吃俭用攒灵石，回到现代却可以决定自己住哪儿、吃什么。
 */

export const LIFESTYLE = [
  {
    id: 'housing', name: '居所', accent: '居',
    desc: '住得好，休息效率高。离线收益直接受益。',
    effectText: '离线收益 +8% / 级',
    perLevel: 0.08, maxLevel: 10,
    levels: ['合租单间', '老破小一居', '精装公寓', '地铁口两居', '江景大平层', '独栋别墅',
      '带院子的宅子', '半山宅邸', '整层写字楼改的住所', '你自己盖的楼'],
    baseCost: 20000, growth: 2.05,
  },
  {
    id: 'food', name: '饮食', accent: '食',
    desc: '吃得讲究，体力恢复也快。',
    effectText: '体力恢复速度 +12% / 级',
    perLevel: 0.12, maxLevel: 10,
    levels: ['泡面与外卖', '会自己做饭', '每周下馆子', '认得出食材产地', '请了私厨',
      '订了直供农场', '自己包了个菜园', '米其林常客', '食材空运', '你吃的灵米是自己种的'],
    baseCost: 12000, growth: 2.05,
  },
  {
    id: 'fitness', name: '健身', accent: '健',
    desc: '身体是两界通用的资产。气血上限随体质提升。',
    effectText: '气血上限 +6% / 级',
    perLevel: 0.06, maxLevel: 10,
    levels: ['办了卡没去过', '每周两次', '请了私教', '体脂率达标', '能跑半马',
      '综合格斗入门', '常年低碳', '专业康复团队', '运动医学跟踪', '体检报告全优'],
    baseCost: 16000, growth: 2.05,
  },
  {
    id: 'fun', name: '娱乐', accent: '娱',
    desc: '心态稳，雷劫也不慌。突破失败的修为损失降低。',
    effectText: '突破失败损失 -4% / 级（最多 -40%）',
    perLevel: 0.04, maxLevel: 10,
    levels: ['刷短视频', '有固定的剧追', '办了影院年卡', '每年一次长途旅行', '玩上了收藏',
      '有固定的酒友', '包场看演出', '请了乐队', '自己开了间 Livehouse', '你已经不太需要娱乐了'],
    baseCost: 14000, growth: 2.05,
  },
  {
    id: 'travel', name: '旅行', accent: '行',
    desc: '走得远，见得怪事也多。奇闻事件触发率提升。',
    effectText: '奇闻触发率 +15% / 级',
    perLevel: 0.15, maxLevel: 10,
    levels: ['周末近郊', '一年一次出省', '护照用上了', '说走就走', '去过极地',
      '去过无人区', '有自己的越野车', '包过私人飞机', '你在地图上插满了旗子', '两个世界你都走过'],
    baseCost: 18000, growth: 2.05,
  },
  {
    id: 'collection', name: '收藏', accent: '藏',
    desc: '有品味，货也好卖。交易行成交速度提升。',
    effectText: '交易行成交速度 +12% / 级',
    perLevel: 0.12, maxLevel: 10,
    levels: ['随手买的小玩意儿', '有一格展示柜', '开始看拍卖图录', '有一件像样的藏品',
      '入了同好会', '认识了几位藏家', '有自己的库房', '上过拍卖会前排', '鉴定师随叫随到', '你本身就是个招牌'],
    baseCost: 22000, growth: 2.05,
  },
];

export const LIFESTYLE_MAP = Object.fromEntries(LIFESTYLE.map((l) => [l.id, l]));

export function upgradeCost(item, currentLevel) {
  return Math.round(item.baseCost * Math.pow(item.growth, Math.max(0, currentLevel)));
}

/** 生活品质：六个项目的平均等级（0-10） */
export function qualityOf(levels) {
  const total = LIFESTYLE.reduce((a, l) => a + (levels?.[l.id] || 0), 0);
  return total / (LIFESTYLE.length * 10);
}

/** 生活品质对道侣好感的加成 */
export function qualityGiftBonus(levels) {
  return qualityOf(levels) * 0.6;
}
