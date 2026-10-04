const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], checks = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (ok, name) => { assert(ok, name); checks.push(name); };
  const nav = async view => { await page.evaluate(async v => { (await import('/src/ui/app.js')).navigate(v); }, view); await page.waitForTimeout(100); };
  const shot = async name => { await page.locator('#toast-root').evaluate(e => e.replaceChildren()); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150); await page.screenshot({ path: `test-results/${name}.png`, fullPage: page.viewportSize().width > 500 }); };
  fs.mkdirSync('test-results', { recursive: true });
  await page.goto(process.env.MOXIU_URL || 'http://127.0.0.1:8080'); await page.waitForFunction(() => !!window.__moxiu?.ready); await page.evaluate(async () => { await window.__moxiu.ready; });
  await page.getByRole('button', { name: '开始', exact: true }).click();
  // Only stop the clock to isolate UI actions. This is an actual new save with no money/item grants.
  await page.evaluate(async () => (await import('/src/core/loop.js')).stopLoop());
  const started = Date.now();
  await page.evaluate(async () => { const app = await import('/src/ui/app.js'); (await import('/src/ui/views/cultivation.js')).pathModal(window.__moxiu.state, app.ctx); });
  await page.getByRole('button', { name: '择此道', exact: true }).first().click();
  await nav('modern'); await page.getByRole('button', { name: '入职', exact: true }).first().click();
  await nav('home'); await shot('单机新手首页');
  for (const side of ['cultivation', 'modern']) {
   const money = await page.evaluate(() => ({ ...window.__moxiu.state.currency }));
   await page.getByRole('button', { name: '预览建议试单', exact: true }).click();
   check(JSON.stringify(await page.evaluate(() => window.__moxiu.state.currency)) === JSON.stringify(money), '新手试单预览不扣款');
   await page.getByRole('button', { name: '确认试单', exact: true }).click();
   await nav('gate'); await page.getByRole('button', { name: '确认背包并开启界门', exact: true }).click();
   await page.getByRole('heading', { name: side === 'cultivation' ? '已抵达修仙界' : '已抵达现代都市', exact: true }).waitFor();
   await page.getByRole('button', { name: '前往当地市场', exact: true }).click();
   await page.getByRole('tab', { name: '出货', exact: true }).click();
   await page.getByRole('button', { name: '整包报价', exact: true }).click();
   await page.getByRole('button', { name: '确认成交', exact: true }).click(); await nav('home');
  }
  check(await page.evaluate(() => window.__moxiu.state.tutorial.journey.inboundSold && window.__moxiu.state.rift.crossings === 2), '真实按钮完成双向贸易，无调钱免载重');
  check(Date.now() - started < 900000, '引导点击流程在15分钟内完成');
  const journeySeconds = (Date.now() - started) / 1000; await shot('单机双向贸易完成');
  // Separate controlled fixtures for later systems; never operate the user's current browser/save.
  await page.evaluate(async () => {
   const s = window.__moxiu.state; Object.assign(s, (await import('/src/core/state.js')).createInitialState(Date.now())); s.side = 'modern'; s.player.stage = 30; s.currency.cny = 3000000; s.currency.stone = 1000000; s.modern.businessLevel = 4;
   s.research.done.alloy = s.research.done.database = true; s.projects.done.teleport = true;
   (await import('/src/systems/rift.js')).syncGateLevel(s);
   const inv = await import('/src/systems/inventory.js'); inv.addItem(s, 'bainian', 12, 'fine'); inv.addItem(s, 'lurong', 10);
  });
  await nav('modern'); const money = await page.evaluate(() => window.__moxiu.state.currency.cny);
  await page.getByRole('button', { name: '筹建灵植制剂公司', exact: true }).click();
  check(await page.evaluate(() => window.__moxiu.state.currency.cny) === money, '公司筹建预览不扣款');
  await page.getByRole('button', { name: '确认筹建', exact: true }).click();
  check(await page.evaluate(() => !window.__moxiu.state.modern.industries.biotech.on), '筹建后默认暂停');
  await page.getByRole('button', { name: '为灵植制剂公司备料入库', exact: true }).click();
  check(await page.evaluate(() => window.__moxiu.state.cargo.storage.modern.some(e => e.itemId === 'bainian' && e.qty === 10 && e.quality === 'fine')), '备料按钮真实入当地仓库并保留品质');
  await page.getByRole('button', { name: '运行灵植制剂公司', exact: true }).click(); await shot('单机灵科公司');
  await nav('gate'); await page.getByText('把行囊货物暂存此地', { exact: true }).click();
  await page.getByRole('button', { name: '暂存百年人参', exact: true }).click();
  check(await page.evaluate(() => !window.__moxiu.state.inventory.some(e => e.itemId === 'bainian')), '行囊暂存释放载重');
  await page.getByRole('button', { name: '提取百年人参', exact: true }).click();
  check(await page.evaluate(() => window.__moxiu.state.inventory.some(e => e.itemId === 'bainian' && e.qty === 10)), '当地提取真实减少库存'); await shot('单机当地仓库');
  await page.evaluate(async () => { const s = window.__moxiu.state; s.side = 'cultivation'; s.currency.stone = 0; s.tales.pending = null; (await import('/src/systems/tales.js')).trigger(s, 'black_market'); });
  await nav('home'); await page.getByRole('button', { name: '稍后处理', exact: true }).click();
  await page.getByRole('button', { name: '处理奇闻：黑市摊主', exact: true }).click();
  check(await page.getByRole('button', { name: /资金不足/ }).isDisabled(), '付费奇闻按钮余额不足时禁用');
  await page.getByRole('button', { name: '稍后处理', exact: true }).click(); await shot('单机奇闻手记');
  await page.getByRole('button', { name: '处理奇闻：黑市摊主', exact: true }).click();
  await page.locator('.overlay button').filter({ hasText: '掉头就走' }).click(); await page.getByRole('button', { name: '继续', exact: true }).click();
  check(await page.evaluate(() => window.__moxiu.state.tales.history.length === 1 && !window.__moxiu.state.tales.pending), '奇闻可延后、重新打开并写入手记');
  await nav('cultivation'); await page.getByRole('button', { name: '开启突破托管', exact: true }).click();
  check(await page.evaluate(() => window.__moxiu.state.player.autoBreakthrough), '突破托管可自行开启');
  await nav('craft'); await page.getByText('辅材长期产出比较', { exact: true }).click(); await shot('单机辅材比较');
  await nav('dungeon'); await page.getByLabel('太虚遗迹采材目标', { exact: true }).selectOption('xuanjing');
  await page.getByRole('button', { name: /普通准备/ }).nth(5).click();
  check((await page.locator('.overlay').innerText()).includes('残阵护盾') && (await page.locator('.overlay').innerText()).includes('保证1件玄晶'), '副本准备展示独立机制与采材代价');
  await page.waitForTimeout(250); await page.screenshot({ path: 'test-results/单机副本机制.png' }); await page.getByRole('button', { name: '返回', exact: true }).click();
  const views = await page.evaluate(async () => {
   const { VIEWS, ctx } = await import('/src/ui/app.js'), s = window.__moxiu.state; const rows = [];
   for (const side of ['modern', 'cultivation']) { s.side = side; for (const v of VIEWS[side]) { const el = v.render(s, ctx); rows.push({ side, id: v.id, ok: el instanceof HTMLElement }); } }
   return rows;
  }); check(views.every(v => v.ok), `全部${views.length}个世界视图可渲染`);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [side, id] of [['modern', 'modern'], ['modern', 'gate'], ['cultivation', 'home'], ['cultivation', 'dungeon'], ['cultivation', 'craft'], ['cultivation', 'cultivation']]) {
   await page.evaluate(w => { window.__moxiu.state.side = w; }, side); await nav(id);
   check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `手机无横向溢出 ${side}/${id}`);
   check(!(await page.locator('body').innerText()).match(/undefined|Infinity|NaN/), `手机有效文案 ${id}`);
  }
  await shot('单机手机修炼');
  const persisted = await page.evaluate(() => ({ cargo: window.__moxiu.state.cargo, industries: Object.fromEntries(Object.entries(window.__moxiu.state.modern.industries).map(([id, r]) => [id, { on: r.on, orders: r.orders }])), history: window.__moxiu.state.tales.history, auto: window.__moxiu.state.player.autoBreakthrough }));
  await page.evaluate(() => window.__moxiu.Save.save()); await page.reload(); await page.evaluate(async () => { await window.__moxiu.ready; (await import('/src/core/loop.js')).stopLoop(); });
  check(JSON.stringify(await page.evaluate(() => ({ cargo: window.__moxiu.state.cargo, industries: Object.fromEntries(Object.entries(window.__moxiu.state.modern.industries).map(([id, r]) => [id, { on: r.on, orders: r.orders }])), history: window.__moxiu.state.tales.history, auto: window.__moxiu.state.player.autoBreakthrough }))) === JSON.stringify(persisted), '仓库、公司、手记与托管设置重载保存');
  check(errors.length === 0, `页面无脚本错误 ${errors.join('; ')}`);
  check(await page.evaluate(async () => {
   const { createInitialState, SAVE_KEY } = await import('/src/core/state.js'); const old = createInitialState(Date.now());
   delete old.cargo; delete old.modern.industries; delete old.player.autoBreakthrough; delete old.tales.history; delete old.tales.schedule; delete old.tutorial.journey; delete old.dungeon.materialTargets;
   localStorage.setItem(SAVE_KEY, JSON.stringify(old)); const s = window.__moxiu.Save.load();
   return !!s.cargo.storage.modern && !!s.modern.industries && s.player.autoBreakthrough === false && s.tales.history.length === 0 && !!s.dungeon.materialTargets && !!s.tutorial.journey;
  }), '旧版本地存档补齐字段，默认不开启托管或公司生产');
  const report = { checks: checks.length, details: checks, views: views.length, firstJourneySeconds: journeySeconds, errors };
  fs.writeFileSync('test-results/single-player-ui.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
