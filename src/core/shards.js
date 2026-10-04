import { cloudSession, getCloudClient } from './cloud.js';
import { emit, EV } from './bus.js';

export const RECHARGE_AMOUNTS = Object.freeze([1, 5, 10, 25, 50, 100]);
const boundStates = new WeakSet();
const serverRights = new WeakMap();
const serverTitles = new WeakMap();
export function bindServerRights(state, owned, title = null) {
  serverRights.set(state, new Set(owned));
  bindServerTitle(state, owned, title);
}
export function bindServerTitle(state, owned, title = null) {
  serverTitles.set(state, owned.includes(title) ? title : null);
}
let account = null, snapshot = null;
export let shardError = '';

export function bindShardState(state) { boundStates.add(state); }
export function shardAccount() {
  return cloudSession?.user.id === account ? snapshot : null;
}
export function capacityBonus(state, sku) {
  if (serverRights.has(state)) return serverRights.get(state).has(sku) ? 1 : 0;
  return boundStates.has(state) && shardAccount()?.owned.includes(sku) ? 1 : 0;
}
export function equippedTitle() {
  return equippedTitleInfo()?.name || null;
}
export function equippedTitleInfo() {
  const data = shardAccount();
  return data?.owned.includes(data.title) ? data.catalog.find(c => c.sku === data.title && c.kind === 'title') : null;
}
export function founderMultiplier(state) {
  const title = serverTitles.has(state) ? serverTitles.get(state) : boundStates.has(state) ? equippedTitleInfo()?.sku : null;
  return title === 'title_creator' ? 100 : 1;
}

export async function shardAction(action = 'read', payload = {}) {
  const user = cloudSession?.user.id;
  if (!user) throw new Error('请先登录账号');
  const client = await getCloudClient();
  try {
    const { data: session, error: authError } = await client.auth.getSession();
    if (authError || session?.session?.user.id !== user) throw new Error('登录状态已改变，请重新登录');
    const { data, error } = await client.rpc('moxiu_shards', { p_action: action, p_data: payload });
    if (error) throw new Error(error.code === '22023' || error.code === '42501' ? error.message : '服务器未确认操作，请刷新余额和记录后再重试');
    if (cloudSession?.user.id !== user) throw new Error('登录状态已改变，请重新登录');
    if (!Number.isSafeInteger(data?.balance) || data.balance < 0 || !Array.isArray(data.catalog) ||
        !Array.isArray(data.owned) || !Array.isArray(data.orders) || !Array.isArray(data.ledger) || !Array.isArray(data.review) || !Array.isArray(data.history) ||
        typeof data.admin !== 'boolean' || !data.catalog.every(c => typeof c.sku === 'string' && typeof c.name === 'string' && Number.isSafeInteger(c.price) && c.price > 0 && ['title','capacity'].includes(c.kind))) {
      throw new Error('碎片资料读取异常，请刷新重试');
    }
    const arrivals = action === 'read' ? (snapshot?.orders || []).flatMap(old => {
      const updated = data.orders.find(order => order.id === old.id);
      return old.status === 'pending' && updated?.status === 'approved' ? [updated] : [];
    }) : [];
    // No snapshot import or local storage can supply paid rights.
    snapshot = Object.freeze({ ...data, owned: Object.freeze([...data.owned]),
      catalog: Object.freeze(data.catalog.map(c => Object.freeze({ ...c }))),
      orders: Object.freeze(data.orders.map(o => Object.freeze({ ...o }))),
      ledger: Object.freeze(data.ledger.map(l => Object.freeze({ ...l }))),
      review: Object.freeze(data.review.map(o => Object.freeze({ ...o }))),
      history: Object.freeze(data.history.map(o => Object.freeze({ ...o }))),
      arrivals: Object.freeze(arrivals.map(o => Object.freeze({ ...o }))) });
    account = user;
    shardError = '';
    emit(EV.STATE);
    return snapshot;
  } catch (e) {
    shardError = e.message || '碎片服务连接失败，请重试';
    throw e;
  }
}
