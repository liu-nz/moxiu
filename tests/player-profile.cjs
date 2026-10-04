const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { gameFixture } = require('./game-fixture.cjs');
const checks = [];
const check = (value, label) => { assert(value, label); checks.push(label); };
const url = process.env.MOXIU_URL || 'http://localhost:3000/';
const uid = '5135c290-a19a-4892-9e9b-80d64ba14811';

(async () => {
  const { validRoleName, readPlayerProfile } = await import('../src/core/profile.js');
  check(['墨山行者', 'AB', 'A_12', 'abcdefghijklmnop'].every(validRoleName), '名称允许中文、字母、数字、下划线及长度边界');
  check(['', '墨', 'abcdefghijklmnopq', '<script>', 'bad name', '😀😀', null, 123].every(v => !validRoleName(v)), '空名、过长、特殊字符和非字符串被拒绝');
  const client = row => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => row }) }) }) });
  const parsed = await readPlayerProfile(client({ data: { uid: 10000001, role_name: '墨山行者', name_confirmed: true } }), uid);
  check(Object.isFrozen(parsed) && parsed.uid === '10000001', '服务端身份使用固定字符串 UID 并冻结');
  await assert.rejects(readPlayerProfile(client({ error: { message: 'offline' } }), uid));
  await assert.rejects(readPlayerProfile(client({ data: { uid: 1, role_name: '假名称', name_confirmed: true } }), uid));
  check(true, '读取失败或档案异常不会伪造本地 UID');

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let signups = [], logins = 0;
    await page.route('https://zqgcijakvjzvvtecdacj.supabase.co/**', route => {
      const req = route.request();
      if (req.url().includes('/signup')) {
        signups.push(req.postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: uid, email: 'tester@example.com', identities: [] }) });
      }
      logins++;
      return route.fulfill({ status: 400, contentType: 'application/json', body: '{"code":"invalid_credentials","msg":"Invalid login credentials"}' });
    });
    await page.goto(url); await page.waitForFunction(() => !!window.__moxiu?.ready); await page.evaluate(() => window.__moxiu.ready);
    await page.getByRole('button', { name: '开始', exact: true }).click();
    const state = await page.evaluate(() => window.__moxiu.state);
    check((await page.locator('#col-left').innerText()).includes('登录账号后获得 UID'), '访客明确显示尚无账号 UID');
    await page.locator('summary').filter({ hasText: '设置' }).click();
    await page.getByRole('button', { name: '邮箱登录 / 云存档', exact: true }).click();
    await page.locator('#account-email').fill('tester@example.com');
    await page.locator('#account-password').fill('fixture-password');
    await page.getByRole('button', { name: '注册邮箱账号', exact: true }).click();
    check(signups.length === 0 && (await page.getByRole('status').innerText()).includes('角色名'), '注册缺少角色名不会请求服务器');
    await page.locator('#account-role-name').fill('bad name');
    await page.getByRole('button', { name: '注册邮箱账号', exact: true }).click();
    check(signups.length === 0, '注册非法角色名不会请求服务器');
    await page.locator('#account-role-name').fill('  墨山行者  ');
    await page.getByRole('button', { name: '注册邮箱账号', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#overlay-root [role=status]').textContent.includes('验证邮件'));
    check(signups.length === 1 && signups[0].data.role_name === '墨山行者', '真实 SDK 注册提交经过校验的角色名');
    await page.locator('#account-role-name').fill('');
    await page.getByRole('button', { name: '邮箱登录', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#overlay-root [role=status]').textContent.includes('不正确'));
    check(logins === 1, '已有账号登录不要求重复填写角色名');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机注册表单无横向溢出');
    await page.screenshot({ path: 'test-results/角色名称注册.png' });

    const cloudPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const user = { id: uid, email: 'tester@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { role_name: '伪造名字', uid: 1 } };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp, role: 'authenticated' })).toString('base64url')}.fixture`;
    await cloudPage.addInitScript(({ token, user, exp }) => {
      localStorage.setItem('moxiu.cloud.enabled', '1');
      localStorage.setItem('moxiu.supabase.auth', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__copiedUID = text; } } });
    }, { token, user, exp });
    state.player.uid = 1; state.player.roleName = '假名称';
    let profile = { uid: 10000022, role_name: '初来行者', name_confirmed: false }, remote = { payload: state, revision: 1 };
    let profileFail = false;
    const game = await gameFixture();
    await cloudPage.route('https://zqgcijakvjzvvtecdacj.supabase.co/**', async route => {
      const req = route.request(), endpoint = req.url();
      if (endpoint.includes('/functions/v1/moxiu-game')) return game.handle(route);
      let data;
      if (endpoint.includes('/auth/v1/user')) data = user;
      else if (endpoint.includes('/moxiu_player_profiles')) {
        if (profileFail) return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
        data = profile;
      } else if (endpoint.includes('/moxiu_set_initial_name')) {
        const p = req.postDataJSON();
        profile = { ...profile, role_name: p.p_role_name, name_confirmed: true }; data = [profile];
      } else if (endpoint.includes('/moxiu_shards')) {
        data = { balance: 0, title: null, catalog: [], owned: [], orders: [], ledger: [], admin: false, review: [], history: [] };
      } else if (endpoint.includes('/moxiu_write_test_save')) {
        const p = req.postDataJSON();
        remote = { payload: p.p_payload, revision: remote.revision + 1 }; data = [{ revision: remote.revision }];
      } else data = remote;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await cloudPage.goto(url); await cloudPage.waitForFunction(() => !!window.__moxiu?.ready); await cloudPage.evaluate(() => window.__moxiu.ready);
    check((await cloudPage.locator('#col-left').innerText()).includes('UID：10000022'), '行者档案展示真实服务端 UID');
    await cloudPage.evaluate(() => import('./src/ui/account.js').then(m => m.showAccount()));
    await cloudPage.locator('.modal').getByRole('button', { name: '复制 UID', exact: true }).click();
    check(await cloudPage.evaluate(() => window.__copiedUID) === '10000022', '复制 UID 使用当前账号身份');
    await cloudPage.locator('#account-role-name').fill('青云来客');
    await cloudPage.getByRole('button', { name: '确认角色名称', exact: true }).click();
    await cloudPage.waitForFunction(() => document.querySelector('#col-left').textContent.includes('青云来客'));
    check(profile.name_confirmed && profile.uid === 10000022, '已有账号补设名称后 UID 不变');
    await cloudPage.evaluate(() => import('./src/ui/app.js').then(m => m.navigate('character')));
    await cloudPage.getByRole('heading', { name: '账号身份', exact: true }).waitFor();
    check((await cloudPage.locator('#col-mid').innerText()).includes('青云来客'), '人物页也展示角色名和 UID');
    await cloudPage.setViewportSize({ width: 390, height: 844 });
    check(await cloudPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机账号身份无横向溢出');
    await cloudPage.screenshot({ path: 'test-results/玩家UID手机.png' });
    await cloudPage.evaluate(async () => {
      const state = window.__moxiu.state;
      const { ascend } = await import('./src/systems/reincarnation.js');
      const { FLAT_STAGES, stageInfo } = await import('./src/data/realms.js');
      state.player.stage = FLAT_STAGES.length - 1; state.player.cultivation = stageInfo(state.player.stage).stage.need; state.player.ascensionReady = true;
      if (!ascend(state).ok) throw new Error('Cannot ascend');
    });
    check(await cloudPage.evaluate(() => import('./src/core/cloud.js').then(m => m.playerProfile.uid)) === '10000022', '轮回不改变账号 UID');
    await cloudPage.evaluate(() => import('./src/core/game.js').then(m => m.resetGame()));
    await cloudPage.reload(); await cloudPage.waitForFunction(() => !!window.__moxiu?.ready); await cloudPage.evaluate(() => window.__moxiu.ready);
    check(await cloudPage.evaluate(() => import('./src/core/cloud.js').then(m => m.playerProfile.roleName)) === '青云来客', '重置角色进度后名称和 UID 保留');
    profileFail = true;
    await cloudPage.reload(); await cloudPage.getByRole('button', { name: '重新载入', exact: true }).waitFor();
    check(await cloudPage.evaluate(() => window.__moxiu.state) === null, '账号档案读取失败停止载入，避免错认身份');
    check(errors.length === 0, '注册与访客页面无运行错误');
    fs.writeFileSync('test-results/player-profile-checks.json', JSON.stringify({ checks, total: checks.length }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
