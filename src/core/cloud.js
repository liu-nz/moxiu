import { registerProvider, localProvider } from './storage.js';
import { readPlayerProfile, validRoleName } from './profile.js';

// Publishable key only: authorization is enforced by Supabase Auth and RLS.
export const CLOUD_URL = 'https://zqgcijakvjzvvtecdacj.supabase.co';
export const CLOUD_KEY = 'sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN';
const MODE_KEY = 'moxiu.cloud.enabled';
let clientPromise;
export let cloudSession = null;
export let playerProfile = null;
export let passwordRecovery = false;

export function useCloud(enabled) {
  const res = localProvider.write(MODE_KEY, enabled ? '1' : '0');
  if (!res.ok) throw new Error(res.message);
}

export function getCloudClient() {
  if (!clientPromise) clientPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../../assets/vendor/supabase-2.117.2.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.supabase.createClient(CLOUD_URL, CLOUD_KEY, {
      auth: { storageKey: 'moxiu.supabase.auth', detectSessionInUrl: true },
      global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
    }));
    script.onerror = () => reject(new Error('账号组件载入失败，请刷新重试'));
    document.head.append(script);
  }).catch(e => { clientPromise = null; throw e; });
  return clientPromise;
}

export async function setInitialRoleName(name) {
  if (!cloudSession || !validRoleName(name)) throw new Error('角色名须为 2–16 位中文、字母、数字或下划线');
  const client = await getCloudClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || sessionData?.session?.user?.id !== cloudSession.user.id) throw new Error('登录状态已改变，请重新登录');
  const { error } = await client.rpc('moxiu_set_initial_name', { p_role_name: name.trim() });
  if (error) throw new Error('名称未设置成功，可能已设置过，请重新载入后查看');
  playerProfile = await readPlayerProfile(client, cloudSession.user.id);
  return playerProfile;
}

export function createCloudProvider(client, userId, cache = localProvider) {
  let revision = null, blocked = false, queue = Promise.resolve();
  const draftKey = `moxiu.cloud.draft.${userId}`;
  async function checkIdentity() {
    const { data, error } = await client.auth.getSession();
    if (error || data?.session?.user?.id !== userId) throw new Error('登录状态已改变，请重新登录');
  }
  return {
    id: 'cloud', label: '云端测试存档', isAsync: true, strictRead: true,
    hint: '账号独立保存，当前设备保留待同步备份。测试进度暂不参与真实玩家交易。',
    available: () => ({ ok: true }),
    read: () => cache.read(draftKey),
    async readAsync() {
      await checkIdentity();
      const { data, error } = await client.from('moxiu_test_saves')
        .select('payload,revision').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('云端存档读取失败，请检查网络后重试');
      revision = data ? Number(data.revision) : 0;
      if (data && (!Number.isSafeInteger(revision) || !data.payload?.player || !data.payload?.currency)) {
        throw new Error('云端存档格式异常，已停止载入以保护进度');
      }
      return data ? JSON.stringify(data.payload) : null;
    },
    writeAsync(_key, text) {
      // Keep a per-account recovery copy even when the remote write fails.
      const backup = cache.write(draftKey, text);
      const task = queue.then(async () => {
        if (blocked || revision === null) return { ok: false, message: '云端保存已暂停，请导出备份并重新载入' };
        try {
          await checkIdentity();
          const { data, error } = await client.rpc('moxiu_write_test_save', {
            p_payload: JSON.parse(text), p_expected_revision: revision,
          });
          if (error) throw error;
          if (!data?.length) {
            blocked = true;
            return { ok: false, reason: 'conflict', message: '另一设备已更新进度，已停止覆盖；请导出备份后重新载入' };
          }
          revision = Number(data[0].revision);
          return { ok: true };
        } catch {
          // A lost response may hide a committed write. Re-read before writing again.
          blocked = true;
          return { ok: false, reason: 'network', message: backup?.ok === false
            ? '云端保存未确认，本机备份也未能写入；请先导出备份，再检查网络并重新载入'
            : '云端保存未确认，本机备份已保留；请检查网络并重新载入' };
        }
      });
      queue = task.catch(() => {});
      return task;
    },
    remove: () => ({ ok: false, message: '云端存档需要等待重置完成' }),
  };
}

export async function prepareCloud() {
  passwordRecovery = /type=recovery/.test(location.hash);
  const callback = /(?:access_token|type=recovery|error_description)=/.test(location.hash);
  if (localProvider.read(MODE_KEY) !== '1' && !callback) return null;
  const client = await getCloudClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('账号连接失败，请检查网络后重新载入');
  if (!data.session) {
    if (callback) throw new Error('邮箱验证链接已失效，请重新获取');
    useCloud(false);
    return null;
  }
  playerProfile = await readPlayerProfile(client, data.session.user.id);
  cloudSession = data.session;
  useCloud(true);
  const provider = registerProvider('cloud', createCloudProvider(client, cloudSession.user.id));
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') setTimeout(() => import('../ui/account.js').then(m => m.showAccount(true)), 0);
    if (event === 'SIGNED_OUT' || (session && session.user.id !== cloudSession.user.id)) {
      playerProfile = null;
      setTimeout(() => { useCloud(false); location.reload(); }, 0);
    }
  });
  return provider;
}
