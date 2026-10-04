const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const { gameFixture } = require('./game-fixture.cjs');
const checks = [];
const check = (value, name) => { assert(value, name); checks.push(name); };
const url = process.env.MOXIU_URL || 'http://localhost:3000/';
const user = { id: '6135c290-a19a-4892-9e9b-80d64ba14811', email: 'shards@example.invalid', aud: 'authenticated', role: 'authenticated' };
const catalog = [
  { sku: 'title_cloud', name: '云间闲客', price: 50, kind: 'title', description: '纯展示称号，不增加属性。' },
  { sku: 'farm_extra', name: '灵田扩容', price: 200, kind: 'capacity', description: '灵田上限 12→13。另需支付游戏内开垦费用。' },
  { sku: 'ranch_extra', name: '牧场扩容', price: 150, kind: 'capacity', description: '养殖栏位上限 10→11。' },
  { sku: 'suburb_extra', name: '城郊置业', price: 150, kind: 'capacity', description: '城郊小区持有上限 12→13。' },
];
const wallet = { balance: 1000, catalog, owned: [], title: null, orders: [], ledger: [], admin: true, review: [], history: [] };
const calls = [];
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const guest = await browser.newPage();
    await guest.goto(url); await guest.waitForFunction(() => !!window.__moxiu?.ready); await guest.evaluate(() => window.__moxiu.ready);
    await guest.getByRole('button', { name: '开始', exact: true }).click();
    await guest.evaluate(() => import('./src/ui/app.js').then(m => m.navigate('shards')));
    await guest.getByRole('heading', { name: '天道碎片', exact: true }).waitFor();
    check(await guest.locator('#col-mid').innerText().then(t => t.includes('登录账号')), '访客入口要求登录，不能充值');
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })).toString('base64url')}.fixture`;
    await page.addInitScript(({ user, exp, token }) => {
      localStorage.setItem('moxiu.cloud.enabled', '1');
      localStorage.setItem('moxiu.supabase.auth', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: exp, token_type: 'bearer', user }));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.__copiedUID = text; } } });
    }, { user, exp, token });
    let remote = null, fail = false;
    const game = await gameFixture(() => wallet.owned);
    await page.route('https://zqgcijakvjzvvtecdacj.supabase.co/**', async route => {
      const req = route.request(), endpoint = req.url(); let data;
      if (endpoint.includes('/functions/v1/moxiu-game')) return game.handle(route);
      if (endpoint.includes('/auth/v1/user')) data = user;
      else if (endpoint.includes('/moxiu_player_profiles')) data = { uid: 10000444, role_name: '墨山行者', name_confirmed: true };
      else if (endpoint.includes('/moxiu_shards')) {
        const { p_action: action, p_data: p } = req.postDataJSON(); calls.push({ action, p });
        if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'unavailable' }) });
        if (action === 'request') {
          const order = { id: p.id, amount: p.amount, status: 'pending', created_at: new Date().toISOString(), note: '' };
          wallet.orders.unshift(order); wallet.review.push({ ...order, uid: 10000444, role_name: '墨山行者' });
        } else if (action === 'purchase') {
          const item = catalog.find(i => i.sku === p.sku); wallet.balance -= item.price; wallet.owned.push(p.sku);
          wallet.ledger.push({ id: p.id, delta: -item.price, sku: p.sku, created_at: new Date().toISOString() });
        } else if (action === 'equip') wallet.title = p.sku || null;
        else if (action === 'cancel') {
          const order = wallet.orders.find(o => o.id === p.id); order.status = 'cancelled'; order.reviewed_at = new Date().toISOString();
          wallet.review = wallet.review.filter(o => o.id !== p.id);
          wallet.history.unshift({ ...order, uid: 10000444, role_name: '墨山行者' });
        } else if (action === 'refund') {
          const order = wallet.orders.find(o => o.id === p.id); order.status = 'refunded'; order.refunded_at = new Date().toISOString();
          order.refund_receipt = p.receipt; wallet.balance -= order.amount * 10;
          wallet.ledger.push({ delta: -order.amount * 10, adjustment_note: '充值全额退款', created_at: new Date().toISOString() });
          wallet.history = wallet.history.map(o => o.id === order.id ? { ...order, uid: 10000444, role_name: '墨山行者' } : o);
        } else if (action === 'adjust') {
          wallet.balance += p.delta;
          wallet.ledger.push({ delta: p.delta, adjustment_note: p.note, created_at: new Date().toISOString() });
        }
        else if (action === 'approve') {
          const order = wallet.orders.find(o => o.id === p.id); order.status = 'approved'; wallet.balance += order.amount * 10;
          wallet.review = wallet.review.filter(o => o.id !== p.id);
          wallet.ledger.push({ delta: order.amount * 10, order_id: p.id, created_at: new Date().toISOString() });
          wallet.history.unshift({ ...order, receipt: p.receipt, reviewed_at: new Date().toISOString(), uid: 10000444, role_name: '墨山行者' });
        } else if (action === 'reject') {
          const order = wallet.orders.find(o => o.id === p.id); order.status = 'rejected'; order.note = p.note;
          wallet.review = wallet.review.filter(o => o.id !== p.id);
          wallet.history.unshift({ ...order, reviewed_at: new Date().toISOString(), uid: 10000444, role_name: '墨山行者' });
        }
        data = wallet;
      } else if (endpoint.includes('/moxiu_write_test_save')) {
        const p = req.postDataJSON(); remote = { payload: p.p_payload, revision: (remote?.revision || 0) + 1 }; data = [{ revision: remote.revision }];
      } else data = remote;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(url); await page.waitForFunction(() => !!window.__moxiu?.ready); await page.evaluate(() => window.__moxiu.ready);
    await page.evaluate(() => import('./src/ui/app.js').then(m => m.navigate('more')));
    await page.getByRole('button', { name: '碎片商店', exact: true }).click();
    await page.getByRole('heading', { name: '天道碎片', exact: true }).waitFor();
    check(await page.locator('#col-mid').innerText().then(t => t.includes('1000 碎片')), '服务器余额正确展示');
    check(await page.locator('.shard-tiers button').allTextContents().then(t => JSON.stringify(t) === JSON.stringify(['¥1 → 10 碎片','¥5 → 50 碎片','¥10 → 100 碎片','¥25 → 250 碎片','¥50 → 500 碎片','¥100 → 1000 碎片'])), '六档充值精确按 10:1 显示');
    await page.getByRole('button', { name: '¥25 → 250 碎片', exact: true }).click();
    await page.getByRole('heading', { name: '赞赏 ¥25 · 250 天道碎片' }).waitFor();
    check(wallet.balance === 1000 && wallet.orders.length === 1, '创建申请不会发放碎片');
    check(await page.locator('.modal').innerText().then(t => t.includes('UID：10000444') && t.includes('审核通过才会到账')), '支付说明展示服务器 UID 与人工到账规则');
    check(await page.locator('.shard-qr').evaluate(async img => { await img.decode(); return img.naturalWidth === 1152; }), '原始赞赏码文件可正常加载');
    await page.locator('.modal').getByRole('button', { name: '复制 UID', exact: true }).click();
    check(await page.evaluate(() => window.__copiedUID) === '10000444', '付款 UID 可复制');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机赞赏码浮层无横向溢出');
    await page.screenshot({ path: 'test-results/赞赏码手机.png', fullPage: true });
    await page.getByRole('button', { name: '返回查看申请', exact: true }).click();
    await page.getByRole('button', { name: '未付款，取消申请', exact: true }).click();
    check(await page.locator('.modal').innerText().then(t => t.includes('取消申请不会触发退款')), '取消流程明确区分未付款取消和退款');
    await page.getByRole('button', { name: '确认未付款并取消', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    check(wallet.balance === 1000 && wallet.orders[0].status === 'cancelled', '玩家可取消未审核申请且不产生碎片');
    await page.getByRole('button', { name: '¥25 → 250 碎片', exact: true }).click();
    await page.getByRole('button', { name: '返回查看申请', exact: true }).click();
    await page.getByRole('button', { name: '核对收款', exact: true }).click();
    await page.getByRole('button', { name: '确认收款并发放', exact: true }).click();
    check(!calls.some(c => c.action === 'approve'), '未填实收证明的审核被界面阻止');
    await page.getByRole('textbox', { name: '微信交易单号' }).fill('test_wechat_12345');
    await page.getByRole('spinbutton', { name: '微信实收金额' }).fill('25');
    await page.getByRole('checkbox', { name: '已核对真实收款及 UID' }).check();
    await page.getByRole('button', { name: '确认收款并发放', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    check(wallet.balance === 1250 && wallet.review.length === 0, '审核入口提交金额、交易单号后更新到账记录（模拟服务器）');
    await page.waitForFunction(() => document.querySelector('#col-mid').textContent.includes('已到账'));
    check(await page.locator('#col-mid').innerText().then(t => t.includes('已审核记录') && t.includes('已到账')), '管理员可以查看已审核记录');
    await page.getByRole('button', { name: '登记已完成的全额退款', exact: true }).click();
    await page.getByRole('textbox', { name: '微信退款交易单号' }).fill('test_refund_12345');
    await page.getByRole('checkbox', { name: '已在微信完成全额退款' }).check();
    await page.getByRole('button', { name: '登记退款', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    check(wallet.balance === 1000 && wallet.orders.some(o => o.status === 'refunded'), '退款必须确认真实退款并记入碎片冲回账本');
    await page.getByRole('button', { name: '调整玩家碎片', exact: true }).click();
    await page.getByRole('spinbutton', { name: '玩家 UID' }).fill('10000444');
    await page.getByRole('spinbutton', { name: '碎片调整数量' }).fill('20');
    await page.getByRole('textbox', { name: '调整原因' }).fill('测试管理员更正流程');
    await page.getByRole('button', { name: '确认调整', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    check(wallet.balance === 1020 && wallet.ledger.some(l => l.adjustment_note === '测试管理员更正流程'), '误发更正写入审计账本和玩家明细');
    await page.getByRole('button', { name: '调整玩家碎片', exact: true }).click();
    await page.getByRole('spinbutton', { name: '玩家 UID' }).fill('10000444');
    await page.getByRole('spinbutton', { name: '碎片调整数量' }).fill('-20');
    await page.getByRole('textbox', { name: '调整原因' }).fill('撤回前一笔测试更正');
    await page.getByRole('button', { name: '确认调整', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    check(wallet.balance === 1000, '管理员可记录正向和反向更正');
    for (const sku of ['farm_extra','ranch_extra','suburb_extra','title_cloud']) {
      const tile = page.locator('.production-tile').filter({ has: page.getByRole('heading', { name: catalog.find(i => i.sku === sku).name, exact: true }) });
      await tile.getByRole('button', { name: '购买', exact: true }).click();
      await page.getByRole('button', { name: '确认购买', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('.modal'));
    }
    check(wallet.balance === 450 && wallet.owned.length === 4, '商店购买扣除服务器价格并拥有永久权益');
    check(calls.filter(c => c.action === 'purchase').every(c => /^[0-9a-f-]{36}$/.test(c.p.id) && !Object.hasOwn(c.p,'price')), '购买提交唯一请求编号，不提交客户端价格');
    await page.getByRole('button', { name: '展示称号', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#col-left').textContent.includes('云间闲客'));
    check(true, '称号在行者档案展示');
    const caps = await page.evaluate(async () => {
      const state = window.__moxiu.state;
      const farm = await import('./src/systems/farm.js'), ranch = await import('./src/systems/ranch.js'), estate = await import('./src/systems/estate.js');
      const { investmentAllowed } = await import('./src/systems/finance.js');
      const { createInitialState } = await import('./src/core/state.js');
      const forged = createInitialState(Date.now()); forged.shards = { balance: 99999, owned: ['farm_extra','ranch_extra','suburb_extra'] };
      state.farm.unlocked = 12; farm.ensurePlots(state); state.ranch.unlocked = 10; ranch.ensureSlots(state); state.estate.owned.suburb = 12;
      state.currency.stone = 1e9; state.currency.cny = 1e9;
      const initialStone = state.currency.stone, initialCny = state.currency.cny;
      const allowed = investmentAllowed(state,'estate','suburb');
      const bought = [farm.buyPlot(state).ok, ranch.buySlot(state).ok, estate.buyEstate(state,'suburb').ok];
      const capped = [farm.buyPlot(state).ok, ranch.buySlot(state).ok, estate.buyEstate(state,'suburb').ok];
      const { DEPLOY_LIMIT } = await import('./src/data/beasts.js');
      return { bought,capped,allowed,paidCosts: state.currency.stone < initialStone && state.currency.cny < initialCny,
        free:[farm.farmSummary(forged).max,ranch.ranchSummary(forged).max,estate.estateSummary(forged).list[0].maxOwn],
        premium:[farm.farmSummary(state).max,ranch.ranchSummary(state).max,estate.estateSummary(state).list[0].maxOwn], other:estate.estateSummary(state).list.slice(1).map(e=>e.maxOwn),deployed:DEPLOY_LIMIT };
    });
    check(JSON.stringify(caps.free) === '[12,10,12]', '伪造存档或其他状态对象不能获得付费上限');
    check(JSON.stringify(caps.premium) === '[13,11,13]' && caps.bought.every(Boolean) && caps.capped.every(v=>!v), '三项权益真实改变上限，仅增加一次');
    check(caps.allowed && caps.paidCosts, '地产按钮与购买检查一致，扩容仍需游戏内成本');
    check(caps.deployed === 2 && JSON.stringify(caps.other) === '[10,8,6]', '战斗上阵数量与高阶地产不受付费影响');
    await page.evaluate(async () => {
      const state = window.__moxiu.state, { ascend } = await import('./src/systems/reincarnation.js');
      const { FLAT_STAGES, stageInfo } = await import('./src/data/realms.js');
      state.player.stage = FLAT_STAGES.length-1; state.player.cultivation = stageInfo(state.player.stage).stage.need; state.player.ascensionReady = true;
      if (!ascend(state).ok) throw new Error('Cannot ascend');
    });
    check(await page.evaluate(() => import('./src/core/shards.js').then(m=> m.shardAccount().balance === 450 && m.capacityBonus(window.__moxiu.state,'farm_extra') === 1)), '轮回保留账号余额与扩容权益');
    await page.evaluate(() => import('./src/core/game.js').then(m => m.resetGame()));
    await page.reload(); await page.waitForFunction(() => !!window.__moxiu?.ready); await page.evaluate(() => window.__moxiu.ready);
    check(await page.evaluate(() => import('./src/core/shards.js').then(m=>m.shardAccount().balance === 450 && m.equippedTitle() === '云间闲客')), '清档重载从服务器恢复余额、权益与称号');
    await page.evaluate(() => import('./src/ui/dom.js').then(m=>m.closeAllOverlays()));
    await page.evaluate(() => import('./src/ui/app.js').then(m=>m.navigate('shards')));
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '手机碎片商店与审核列表无横向溢出');
    await page.screenshot({ path: 'test-results/碎片商店手机.png', fullPage: true });
    fail = true;
    await page.getByRole('button', { name: '刷新余额与记录', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '服务器未确认' }).waitFor();
    check(await page.locator('.shard-tiers button:enabled').count() === 0, '服务失败保留最后确认余额，阻止继续申请和购买');
    check(errors.length === 0, '碎片页面与浮层无运行错误');
    fs.writeFileSync('test-results/shard-checks.json',JSON.stringify({ total:checks.length,checks },null,2));
    console.log(JSON.stringify({passed:checks.length,checks},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
