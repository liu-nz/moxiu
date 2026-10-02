/**
 * estate.js —— 现代地产与店铺（GDD 13.3）
 * 城郊小区 → 商业街 → CBD → 产业园；公寓收租、店铺卖货、仓库扩货架。
 * 一期所有商铺均可购买、无竞争；二期加入地皮限量与玩家竞拍。
 */

export const ESTATES = [
  {
    id: 'suburb', name: '城郊小区', tier: 1,
    price: 9000, rent: 20, maxOwn: 12,
    desc: '离地铁两公里。租客都是刚毕业的年轻人，和刚起步的你。',
  },
  {
    id: 'street', name: '商业街', tier: 2,
    price: 45000, rent: 128, maxOwn: 10,
    desc: '人流量最大的那条街。开在这里的店，三分之一活过第一年。',
  },
  {
    id: 'cbd', name: 'CBD', tier: 3,
    price: 260000, rent: 880, maxOwn: 8,
    desc: '玻璃幕墙，落地窗。你第一次来这里是面试，第二次是买房。',
  },
  {
    id: 'park', name: '产业园', tier: 4,
    price: 1400000, rent: 5600, maxOwn: 6,
    desc: '整栋厂房。你在这里放的东西，隔壁的工程师不会问。',
  },
];

export const ESTATE_MAP = Object.fromEntries(ESTATES.map((e) => [e.id, e]));

/** 店铺：可购买数量随商业等级提升 */
export const SHOP = {
  maxOwn: 6,
  priceOf(owned) { return Math.round(60000 * Math.pow(2.4, owned)); },
  /** 店铺自动售货：把外来货按当日价卖出，渠道抽成 */
  channelFee: 0.08,
  /** 每间店铺每小时自动处理多少件货 */
  throughputPerHour: 1.2,
  unlockBusinessLevel: 1,
};

/** 仓库：每级 +1kg 跨界载重（扩货架的隐喻落点） */
export const WAREHOUSE = {
  maxLevel: 10,
  costOf(level) { return Math.round(15000 * Math.pow(2.2, level)); },
  carryBonus(level) { return level * 1; },
};
