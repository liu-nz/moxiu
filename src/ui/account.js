import { h, modal, closeOverlay, showToast } from './dom.js';
import { cloudSession, playerProfile, setInitialRoleName, getCloudClient, useCloud } from '../core/cloud.js';
import { validRoleName } from '../core/profile.js';
import { equippedTitleInfo } from '../core/shards.js';
import { titleBadge } from './titles.js';
import { emit, EV } from '../core/bus.js';
import * as Save from '../core/save.js';

export function accountIdentity() {
  if (!playerProfile) return h('p.t-xs.t-dim', { text: '本地试玩 · 登录账号后获得 UID' });
  return h('div.account-identity', { style: 'overflow-wrap:anywhere' },
    h('div.t-sm.t-strong', { text: playerProfile.roleName }),
    titleBadge(equippedTitleInfo()),
    h('div.btn-row.mt-1', null,
      h('span.t-xs.t-num', { text: `UID：${playerProfile.uid}`, style: 'user-select:text' }),
      h('button.btn.btn-sm', { text: '复制 UID', onclick: async () => {
        try { await navigator.clipboard.writeText(playerProfile.uid); showToast('UID 已复制', 'good'); }
        catch { showToast('无法自动复制，请选中页面上的 UID 手动复制', 'warn'); }
      } })));
}

export function showAccount(recovery = false) {
  const signedIn = !!cloudSession && !recovery;
  const needsName = signedIn && !playerProfile?.nameConfirmed;
  const roleName = h('input', { id: 'account-role-name', type: 'text', autocomplete: 'nickname', maxlength: 16,
    placeholder: '例如：墨山行者', style: 'width:100%;min-height:44px;padding:8px;font-size:16px' });
  const email = h('input', { id: 'account-email', type: 'email', autocomplete: 'email', required: true, style: 'width:100%;min-height:44px;padding:8px;font-size:16px' });
  const password = h('input', { id: 'account-password', type: 'password', autocomplete: recovery ? 'new-password' : 'current-password', minlength: 8, required: true, style: 'width:100%;min-height:44px;padding:8px;font-size:16px' });
  const message = h('p.t-sm.mt-2', { role: 'status', 'aria-live': 'polite' });
  const controls = [];
  let busy = false;
  const redirectTo = new URL('index.html', location.href).href.split('#')[0].split('?')[0];
  async function run(action) {
    if (busy) return;
    if ((action === 'register' || action === 'name') && !validRoleName(roleName.value)) {
      roleName.focus(); message.textContent = '角色名须为 2–16 位中文、字母、数字或下划线'; return;
    }
    if (['login', 'register', 'reset'].includes(action) && !email.reportValidity()) { message.textContent = '请输入有效邮箱'; return; }
    if (['login', 'register', 'update'].includes(action) && !password.reportValidity()) { message.textContent = '密码至少 8 位'; return; }
    busy = true; controls.forEach(b => { b.disabled = true; }); message.textContent = '正在处理…';
    try {
      if (action === 'name') {
        await setInitialRoleName(roleName.value); closeOverlay(); emit(EV.STATE);
        showToast('角色名称已设置，UID 保持不变', 'good'); return;
      }
      const client = await getCloudClient();
      if (action === 'logout') {
        Save.stopAutoSave({ pauseUnload: true });
        const saved = await Save.saveAsync();
        if (!saved.ok) throw new Error(saved.message + '。请先导出备份');
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error) throw error;
        useCloud(false); location.reload(); return;
      }
      let result;
      if (action === 'login') result = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (action === 'register') result = await client.auth.signUp({ email: email.value.trim(), password: password.value,
        options: { emailRedirectTo: redirectTo, data: { role_name: roleName.value.trim() } } });
      if (action === 'reset') result = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo });
      if (action === 'update') result = await client.auth.updateUser({ password: password.value });
      if (result.error) {
        const code = result.error.code;
        const msg = code === 'email_address_not_authorized' ? '邮件服务未允许向该地址发信，请稍后重试或联系管理员' :
          code === 'email_not_confirmed' ? '请先在邮箱中确认注册' :
          code === 'over_email_send_rate_limit' || result.error.status === 429 ? '请求过于频繁，请稍后重试' :
          action === 'login' ? '邮箱或密码不正确，或连接失败，请检查后重试' : '操作未完成，请检查网络、邮箱及邮件服务设置后重试';
        throw new Error(msg);
      }
      if (action === 'update') { closeOverlay(); showToast('密码已更新', 'good'); return; }
      if (result.data?.session) {
        // Saving the guest save remains local; it is never imported into another account.
        await Save.saveAsync(); useCloud(true); location.reload(); return;
      }
      message.textContent = action === 'register' ? '若该邮箱可注册，验证邮件已提交，请查收收件箱或垃圾邮件，确认后即可登录' : '若该邮箱可找回，重置邮件已提交，请查收邮箱';
    } catch (e) {
      message.textContent = e.message || '连接失败，请稍后重试';
      if (action === 'logout') Save.startAutoSave(() => window.__moxiu.state, 30000);
    } finally { busy = false; controls.forEach(b => { b.disabled = false; }); }
  }
  const button = (label, action) => {
    const b = h('button.btn', { text: label, onclick: () => run(action) }); controls.push(b); return b;
  };
  const nameField = () => h('div.mt-2', null,
    h('label.t-sm', { for: 'account-role-name', text: needsName ? '设置角色名称' : '角色名称（注册必填，登录可留空）', style: 'display:block' }), roleName,
    h('p.t-xs.t-dim.mt-1', { text: '2–16 位中文、字母、数字或下划线。名字可以重复，UID 唯一。名称确认后暂不支持改名。' }));
  modal({ title: recovery ? '设置新密码' : '云端账号', sticky: true,
    body: h('div', null,
      signedIn ? h('div', null, accountIdentity(), h('p.t-xs.t-dim.mt-2', { text: cloudSession.user.email || '已登录' }),
        needsName ? nameField() : null) : h('div', null,
        !recovery ? h('label.t-sm', { for: 'account-email', text: '邮箱', style: 'display:block' }) : null,
        !recovery ? email : null,
        h('label.t-sm.mt-2', { for: 'account-password', text: recovery ? '新密码（至少 8 位）' : '密码（至少 8 位）', style: 'display:block' }), password,
        !recovery ? nameField() : null),
      h('p.t-xs.t-dim.mt-2', { text: '云端测试角色独立保存。本地试玩进度保留在这台设备，登录后从账号角色开始。' }),
      !signedIn && !recovery ? h('p.t-xs.t-dim.mt-2', { text: '邮箱注册已开放。首次登录需先完成邮箱验证；本地试玩进度不会自动并入账号存档。' }) : null,
      message,
      h('div.btn-row.mt-3', null, signedIn ? [needsName ? button('确认角色名称', 'name') : null, button('保存并退出账号', 'logout')] : recovery ? button('更新密码', 'update') : [button('邮箱登录', 'login'), button('注册邮箱账号', 'register'), button('找回密码', 'reset')])),
    actions: [{ label: '返回游戏' }],
  });
}
