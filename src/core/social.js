import { cloudSession, getCloudClient } from './cloud.js';

let snapshot = null;
let snapshotUser = null;
export let socialError = '';
export let socialBusy = false;

export function socialData() { return cloudSession?.user?.id === snapshotUser ? snapshot : null; }

export async function socialAction(action = 'read', payload = {}) {
  if (!cloudSession?.user?.id) throw new Error('请先登录账号');
  if (socialBusy) return snapshot;
  socialBusy = true;
  try {
    const client = await getCloudClient();
    const { data: session, error: authError } = await client.auth.getSession();
    if (authError || session?.session?.user.id !== cloudSession.user.id) throw new Error('登录状态已改变，请重新登录');
    const { data, error } = await client.rpc('moxiu_social', { p_action: action, p_data: payload });
    if (error) throw new Error(error.code === '22023' || error.code === '42501' ? error.message : '同行服务暂不可用，请刷新重试');
    if (!data || !['friends','incoming','outgoing','notes'].every(k => Array.isArray(data[k]))) throw new Error('同行数据格式无效');
    snapshot = Object.freeze(Object.fromEntries(['friends','incoming','outgoing','notes'].map(k => [k, Object.freeze(data[k].map(x => Object.freeze({ ...x })))])));
    snapshotUser = cloudSession.user.id;
    socialError = '';
    return snapshot;
  } catch (e) {
    socialError = e.message || '同行服务连接失败';
    throw e;
  } finally { socialBusy = false; }
}
