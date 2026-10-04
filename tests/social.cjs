const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const { gameFixture } = require('./game-fixture.cjs');
const user = { id: '6135c290-a19a-4892-9e9b-80d64ba14811', email: 'social@example.invalid', aud: 'authenticated', role: 'authenticated' };
const data = {
  friends: [{ id: 'f-1', uid: 10000002, role_name: '青云客' }],
  incoming: [{ id: 'f-2', uid: 10000003, role_name: '灵田散人' }],
  outgoing: [], notes: [],
};
const calls = [];
let remote = null;

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url')}.fixture`;
    await page.addInitScript(({ user, exp, token }) => {
      localStorage.setItem('moxiu.cloud.enabled', '1');
      localStorage.setItem('moxiu.supabase.auth', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: exp, token_type: 'bearer', user }));
    }, { user, exp, token });
    const game = await gameFixture();
    await page.route('https://zqgcijakvjzvvtecdacj.supabase.co/**', async route => {
      const req = route.request(), endpoint = req.url(); let result;
      if (endpoint.includes('/functions/v1/moxiu-game')) return game.handle(route);
      if (endpoint.includes('/auth/v1/user')) result = user;
      else if (endpoint.includes('/moxiu_player_profiles')) result = { uid: 10000001, role_name: '墨山行者', name_confirmed: true };
      else if (endpoint.includes('/rpc/moxiu_social')) {
        const { p_action: action, p_data: payload } = req.postDataJSON(); calls.push({ action, payload });
        if (action === 'request') data.outgoing.push({ id: 'f-3', uid: payload.uid, role_name: '新同行' });
        if (action === 'accept') { const item = data.incoming.find(x => x.id === payload.id); data.incoming = data.incoming.filter(x => x.id !== payload.id); data.friends.push(item); }
        if (action === 'post') data.notes.unshift({ id: `n-${data.notes.length}`, kind: payload.kind, content: payload.content, created_at: new Date().toISOString(), author_uid: 10000001, author_name: '墨山行者', owner_uid: payload.uid });
        result = data;
      } else if (endpoint.includes('/moxiu_write_test_save')) {
        const payload = req.postDataJSON();
        remote = { revision: (remote?.revision || 0) + 1, payload: payload.p_payload };
        result = [{ revision: remote.revision }];
      } else if (endpoint.includes('/moxiu_test_saves')) result = remote ? [remote] : [];
      else result = [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto(process.env.MOXIU_URL || 'http://127.0.0.1:3000/');
    await page.waitForFunction(() => !!window.__moxiu?.ready);
    await page.evaluate(() => window.__moxiu.ready);
    await page.evaluate(() => import('./src/ui/app.js').then(m => m.navigate('social')));
    await page.getByRole('button', { name: '同行', exact: true }).click();
    await page.getByText('青云客 · UID 10000002').waitFor();
    await page.getByRole('button', { name: '接受', exact: true }).click();
    await page.getByText('灵田散人 · UID 10000003').waitFor();
    await page.getByLabel('行者 UID').fill('10000004');
    await page.getByRole('button', { name: '发送好友申请', exact: true }).click();
    await page.getByText('新同行', { exact: false }).waitFor();
    const textarea = page.getByLabel('给 青云客 留言');
    await textarea.fill('愿道友修行顺遂。');
    await page.locator('.shard-record').filter({ has: textarea }).getByRole('button', { name: '留言', exact: true }).click();
    await page.getByText('愿道友修行顺遂。').waitFor();
    assert(calls.some(x => x.action === 'accept') && calls.some(x => x.action === 'request' && x.payload.uid === 10000004) && calls.some(x => x.action === 'post' && x.payload.kind === 'message'), 'friend, request and async guestbook flows call server RPC');
    console.log(JSON.stringify({ passed: true, rpcCalls: calls.map(x => x.action) }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
