const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const url = process.env.MOXIU_URL || 'http://127.0.0.1:8080';
const uid = '8a47bbe8-44f3-47a0-9258-30644703e6f9';
const checks = [];
const check = (v, name) => { assert(v, name); checks.push(name); };
(async () => {
  const { createCloudProvider } = await import('../src/core/cloud.js');
  let current = uid, row = null, writes = 0;
  const cache = new Map();
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: current } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
    rpc: async (_, p) => {
      writes++;
      if (p.p_expected_revision !== (row?.revision || 0)) return { data: [] };
      row = { payload: p.p_payload, revision: (row?.revision || 0) + 1 };
      return { data: [{ revision: row.revision }] };
    },
  };
  const provider = createCloudProvider(client, uid, { read: k => cache.get(k), write: (k, v) => cache.set(k, v) });
  const text = JSON.stringify({ player: {}, currency: { stone: 1 } });
  check(await provider.readAsync() === null, '空账号读取为空');
  const results = await Promise.all([provider.writeAsync('save', text), provider.writeAsync('save', text)]);
  check(results.every(r => r.ok) && row.revision === 2, '并发保存串行执行，版本连续');
  row.revision++;
  check((await provider.writeAsync('save', text)).reason === 'conflict', '旧版本被拒绝');
  const n = writes;
  check(!(await provider.writeAsync('save', text)).ok && writes === n, '冲突后停止写入');
  check([...cache.keys()][0].endsWith(uid), '恢复备份按账号隔离');
  const other = createCloudProvider(client, uid);
  await other.readAsync(); current = 'other';
  check(!(await other.writeAsync('save', text)).ok && writes === n, '切换账号不会上传旧角色');
  current = uid;
  const failedBackup = createCloudProvider({ ...client, rpc: async () => ({ error: new Error('offline') }) }, uid,
    { read: () => null, write: () => ({ ok: false, reason: 'quota' }) });
  await failedBackup.readAsync();
  check((await failedBackup.writeAsync('save', text)).message.includes('本机备份也未能写入'), '存储满且断网时不误报备份成功');

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => !!window.__moxiu?.ready); await page.evaluate(() => window.__moxiu.ready);
    await page.getByRole('button', { name: '开始', exact: true }).click();
    check(await page.locator('#col-mid').innerText().then(t => t.length > 50), '访客正常进入游戏');
    await page.locator('summary').filter({ hasText: '设置' }).click();
    await page.getByRole('button', { name: '邮箱登录 / 云存档', exact: true }).click();
    check(await page.getByRole('heading', { name: '云端账号' }).isVisible(), '设置打开邮箱登录界面');
    await page.getByRole('button', { name: '邮箱登录', exact: true }).click();
    check((await page.getByRole('status').innerText()).includes('邮箱'), '无效邮箱阻止提交');
    await page.route('https://zqgcijakvjzvvtecdacj.supabase.co/**', route => route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }) }));
    await page.locator('#account-email').fill('tester@example.com');
    await page.locator('#account-password').fill('test-password-only');
    await page.getByRole('button', { name: '邮箱登录', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#overlay-root [role=status]').textContent.includes('不正确'));
    check(await page.getByRole('button', { name: '邮箱登录', exact: true }).isEnabled(), 'SDK登录失败可重试');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机登录表单无横向溢出');
    await page.screenshot({ path: 'test-results/云端邮箱登录手机.png' });
    await page.getByRole('button', { name: '返回游戏', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机页面无横向溢出');
    await page.screenshot({ path: 'test-results/云存档手机试玩.png', fullPage: true });

    check(errors.length === 0, '访客与登录无运行错误');
    console.log(JSON.stringify({passed:checks.length,checks}));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
