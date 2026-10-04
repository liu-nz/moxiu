const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(process.env.MOXIU_URL || 'http://127.0.0.1:8080'); await page.evaluate(async () => { await window.__moxiu.ready; });
  await page.getByRole('button', { name: '开始', exact: true }).click();
  const checks = await page.evaluate(async () => {
   const { createInitialState } = await import('/src/core/state.js');
   const finance = await import('/src/systems/finance.js'), growth = await import('/src/systems/progression.js');
   const city = await import('/src/systems/projects.js'), estate = await import('/src/systems/estate.js'), modern = await import('/src/systems/modern.js'), research = await import('/src/systems/research.js');
   const alchemy = await import('/src/systems/alchemy.js'), farm = await import('/src/systems/farm.js'), ranch = await import('/src/systems/ranch.js');
   const inv = await import('/src/systems/inventory.js'), char = await import('/src/systems/character.js');
   const { ensureDay, carryCapacity } = await import('/src/systems/rift.js');
   const { CITY_PROJECTS, canStart } = await import('/src/data/projects.js'), { PROJECTS } = await import('/src/data/research.js');
   const { DUNGEONS } = await import('/src/data/dungeons.js');
   const { advance, stopLoop } = await import('/src/core/loop.js'), { applyOffline } = await import('/src/systems/offline.js'); stopLoop();
   const checked = [], check = (ok, label) => { if (!ok) throw Error(label); checked.push(label); };
   const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
   const fresh = (stage = 30, t = Date.parse('2026-10-01T20:40:00Z')) => { const s = createInitialState(t); s.player.stage = stage; s.tales = null; s.currency.cny = s.currency.stone = 1e10; ensureDay(s, { silent: true }); return s; };
   const fixedRandom = (rng, fn) => { const old = Math.random; try { Math.random = rng; return fn(); } finally { Math.random = old; } };
   {
    const s = fresh(); const before = JSON.stringify(s);
    for (const v of [-1, .5, Infinity, NaN, '100']) check(!finance.setInvestmentReserve(s, v).ok && before === JSON.stringify(s), `非法投资保留线无副作用 ${String(v)}`);
    s.modern.job = 'dev'; s.modern.businessLevel = 1; s.research.done.battery = s.research.done.sensor = true;
    for (const [id, n] of Object.entries(CITY_PROJECTS[0].cost.mats)) inv.addItem(s, id, n);
    finance.setInvestmentReserve(s, s.currency.cny);
    for (const [name, fn] of [['工资', () => modern.upgradeJob(s)], ['商业', () => modern.upgradeBusiness(s)], ['地产', () => estate.buyEstate(s, 'suburb')], ['店铺', () => estate.buyShop(s)], ['仓库', () => estate.upgradeWarehouse(s)], ['研究所', () => research.upgradeLab(s)], ['城市工程', () => city.start(s, 'spiritvein')]]) {
     const old = JSON.stringify(s); check(!fn().ok && old === JSON.stringify(s), `${name}投资不能越过资金保留线`);
    }
    const a = fresh(); a.currency.cny = 10000; finance.setInvestmentReserve(a, 1000);
    check(estate.buyEstate(a, 'suburb').ok && a.currency.cny === 1000 && a.estate.owned.suburb === 1, '恰好满足保留线的投资正常成交');
    check(!finance.investmentAllowed(a, 'estate', 'suburb') && !finance.investmentAllowed(a, 'unknown'), '按钮资格与系统预算一致，未知投资被拦截');
   }
   {
    const s = fresh(); s.modern.job = 'dev'; s.modern.businessLevel = 2; s.estate.shops = 2; s.estate.owned.street = 1;
    const before = JSON.stringify(s); const options = growth.investmentOptions(s); const plan = growth.growthRoadmap(s); const impact = city.projectImpact(s, 'powergrid');
    check(before === JSON.stringify(s) && options.list.length > 0 && plan.steps.length === 8 && impact.after.income > impact.before.income, '成长、投资与工程预览均不修改存档');
    check(options.fastest.hours === Math.min(...options.list.filter(x => x.hours !== null).map(x => x.hours)), '最快稳定回本来自真实比较');
    check(options.list.filter(x => ['lab', 'shop', 'warehouse'].includes(x.id)).every(x => x.hours === null), '研究点、吞吐和载重不虚报人民币回本');
    const b = JSON.parse(JSON.stringify(s)); b.side = 'cultivation';
    check(near(growth.investmentOptions(b).list.find(x => x.id === 'street').hours, options.list.find(x => x.id === 'street').hours * 2), '异界半速收益计入投资回本');
    s.modern.workOn = false; check(growth.investmentOptions(s).list.find(x => x.id === 'job').hours === null, '停工不推荐虚构工资回本');
    const zero = createInitialState(Date.now()); check(growth.growthRoadmap(zero).next.id === 'income', '新手先建立现金流');
    zero.research.done.battery = true; check(growth.growthRoadmap(zero).currentPhase === 1, '已有研究知识进入灵科融合阶段');
    zero.side = 'cultivation'; check(growth.goalDestination(zero, 'estate').view === 'gate' && growth.goalDestination(zero, 'research').view === 'research', '跨世界目标先引导界门，不偷扣穿越次数');
    city.setProjectTarget(s, 'teleport'); check(growth.growthRoadmap(s).next.project.project.id === 'teleport', '玩家追踪工程覆盖默认建议');
    const snap = JSON.stringify(s); check(!city.setProjectTarget(s, 'missing').ok && snap === JSON.stringify(s), '无效工程目标不污染存档');
   }
   {
    for (const p of CITY_PROJECTS) for (const id of Object.keys(p.cost.mats)) {
     const source = DUNGEONS.find(d => d.matPool.includes(id)); check(source && source.unlockStage <= p.stage, `${p.name}解锁时有可进入的${id}来源`);
    }
    const s = fresh(); for (const [id, n] of Object.entries(CITY_PROJECTS[0].cost.mats)) inv.addItem(s, id, n);
    const old = JSON.stringify(s); check(!city.start(s, 'spiritvein').ok && city.status(s, 'spiritvein').reason.includes('阵法传感器') && old === JSON.stringify(s), '城市工程前置研究实际校验且使用中文名称');
    s.research.done.sensor = true; s.player.stage = 22; check(!city.status(s, 'spiritvein').canStart && !canStart(s, 'spiritvein').ok, '聚灵阵境界与材料来源对齐至化神中期');
    s.player.stage = 23; check(city.status(s, 'spiritvein').canStart === canStart(s, 'spiritvein').ok, '系统与数据层城市资格一致');
    s.estate.shops = 2; s.modern.job = 'dev'; s.modern.businessLevel = 4; s.estate.owned.park = 1;
    for (const p of PROJECTS) s.research.done[p.id] = true;
    s.player.stage = 41;
    for (const p of CITY_PROJECTS) {
     for (const [id, n] of Object.entries(p.cost.mats)) inv.addItem(s, id, n);
     const impact = city.projectImpact(s, p.id), money = s.currency.cny, stone = s.currency.stone;
     check(city.start(s, p.id).ok && near(s.currency.cny, money - p.cost.cny) && near(s.currency.stone, stone - p.cost.stone), `${p.name}扣款一次并完工`);
     check(near(char.cultivationRate(s), impact.after.cultivation) && near(modern.totalIncomePerHour(s), impact.after.income) && near(estate.rentPerHour(s), impact.after.rent) && carryCapacity(s) === impact.after.carry && near(estate.shopCapacity(s) * s.estate.shops, impact.after.throughput), `${p.name}预估与实际收益一致`);
     const snap = JSON.stringify(s); check(!city.start(s, p.id).ok && snap === JSON.stringify(s), `${p.name}重复动工不扣款`);
    }
    check(growth.growthRoadmap(s).currentPhase === 2 && !city.setProjectTarget(s, 'spiritvein').ok, '完工工程不能重复追踪，路线进入修仙反哺阶段');
    const dep = fresh(); for (const [id, n] of Object.entries(CITY_PROJECTS.find(p => p.id === 'teleport').cost.mats)) inv.addItem(dep, id, n);
    check(!city.start(dep, 'teleport').ok && city.status(dep, 'teleport').reason.includes('灵能电网'), '传送阵必须先接通灵能电网');
   }
   {
    const s = fresh(); s.estate.shops = 1; s.estate.autoSell = true; inv.addItem(s, 'huangjing', 5); inv.addItem(s, 'lingmi', 5); inv.addItem(s, 'lingmi', 3, 'rare');
    estate.setShopPolicy(s, { itemId: 'lingmi', keepQty: 4 });
    const stock = estate.shopStock(s), money = s.currency.cny;
    check(stock.qty === 7 && stock.keep.huangjing === 2 && stock.keep.lingmi === 4, '默认保留一炉炼丹药草与指定货物，跨品质按总量计算');
    const sale = estate.autoSell(s, stock.qty); check(sale.sold === stock.qty && near(sale.revenue, stock.net) && near(s.currency.cny - money, stock.net), '店铺可售库存净报价等于实际回款');
    check(inv.countOf(s, 'huangjing') === 2 && inv.countOf(s, 'lingmi') === 4, '自动售货保留量实际生效');
    alchemy.setAlchemyPlan(s, { auxId: 'potent' }); check(estate.shopReservations(s).huangjing === 4 && estate.shopStock(s).rows.every(r => r.itemId !== 'huangjing'), '辅材改变后店铺动态保护新材料需求');
    estate.setShopPolicy(s, { mode: 'all' }); check(estate.shopStock(s).qty === 2, '全部货物模式允许出售炼丹药草，但仍尊重指定库存');
    const old = JSON.stringify(s); for (const options of [{ mode: 'bad' }, { itemId: 'lingmi', keepQty: -1 }, { itemId: 'huangjing', keepQty: .5 }, { itemId: 'qiangguang', keepQty: 1 }]) check(!estate.setShopPolicy(s, options).ok && old === JSON.stringify(s), '非法售货策略和保留量无副作用');
    s.side = 'cultivation'; const paused = estate.shopStock(s); check(paused.status.includes('暂停') && !estate.autoSell(s, 10).ok, '离开现代界暂停售货，不突破库存策略');
   }
   {
    const s = fresh(); inv.addItem(s, 'xuanjing', 5); const before = JSON.stringify(s);
    for (const n of [0, -1, .5, NaN, Infinity, '2']) check(!research.exchangeMaterial(s, 'xuanjing', n).ok && before === JSON.stringify(s), `兑换研究点拒绝非法数量 ${String(n)}`);
    const r = research.exchangeMaterial(s, 'xuanjing', 2); check(r.ok && r.rp === 60 && inv.countOf(s, 'xuanjing') === 3 && s.research.points === 60, '研究兑换点数与实际扣材一致');
   }
   {
    const t = Date.parse('2026-10-01T20:40:00Z'), a = fresh(14, t), b = fresh(14, t);
    for (const s of [a, b]) {
     s.modern.job = 'dev'; s.modern.businessLevel = 1; s.estate.owned.suburb = 1; s.estate.shops = 1; s.estate.autoSell = true;
     s.research.done.autoirrigate = s.research.done.autopill = true;
     inv.addItem(s, 'lingmi', 15); inv.addItem(s, 'huangjing', 30); farm.plant(s, 0, 'lingmi'); farm.plant(s, 1, 'huangjing'); farm.setPlotPlan(s, 2, null); ranch.buyBeast(s, 'lingji');
     alchemy.setAlchemyPlan(s, { on: true });
    }
    let report;
    fixedRandom(() => 0, () => { const duration = 6 * 3600000; for (let elapsed = 0; elapsed < duration;) { const chunk = Math.min(137000, duration - elapsed); advance(a, chunk); elapsed += chunk; } report = applyOffline(b, t + duration); });
    check(near(a.currency.cny, b.currency.cny) && near(a.currency.stone, b.currency.stone) && near(a.stats.shopCny, b.stats.shopCny), '跨日离线与在线的店铺策略和两界收益一致');
    check(report.production.harvests > 0 && report.production.ranchCollected > 0 && report.production.attempts > 0 && report.production.pills > 0 && report.production.sold > 0, '离线报告记录收获、养殖、炼丹与售货');
    check(near(report.production.seedsStone, b.stats.farmSeedStone - 80) && report.production.alchemyStone > 0 && near(report.production.shopCny, b.stats.shopCny), '离线支出明细只统计离开后的种子与炼丹投入');
    check(report.production.items.some(i => i.id === 'huiyuandan' && i.delta === inv.countOf(b, 'huiyuandan')), '离线物资变化显示净值，不把已消耗材料虚报为库存');
    const snap = JSON.stringify(b); check(applyOffline(b, t + 6 * 3600000) === null && snap === JSON.stringify(b), '离线报告不会重复计数和发收益');
   }
   return checked;
  });
  console.log(JSON.stringify({ gameplayChecks: checks.length, checks }, null, 2));
  fs.mkdirSync('test-results', { recursive: true });
  await page.evaluate(async () => {
   const s = window.__moxiu.state; Object.assign(s, (await import('/src/core/state.js')).createInitialState(Date.now())); s.side = 'modern'; s.player.stage = 30; s.currency.cny = 100000; s.currency.stone = 3000000; s.modern.job = 'dev'; s.modern.businessLevel = 1; s.estate.shops = 1;
   (await import('/src/systems/rift.js')).ensureDay(s, { silent: true }); (await import('/src/ui/app.js')).navigate('modern');
  });
  await page.getByLabel('投资后保留资金').fill('99000'); await page.getByLabel('投资后保留资金').press('Tab'); await page.waitForTimeout(250);
  const jobButton = page.getByRole('button', { name: /职级提升（/ }); assert(await jobButton.isDisabled());
  await page.evaluate(async () => { window.__moxiu.state.currency.cny += 1000; const { emit, EV } = await import('/src/core/bus.js'); emit(EV.TICK); });
  assert.equal(await jobButton.isDisabled(), false);
  await page.getByLabel('投资后保留资金').fill('0'); await page.getByLabel('投资后保留资金').press('Tab');
  await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(e => e.replaceChildren());
  assert(!(await page.locator('body').innerText()).match(/undefined|null|Infinity|NaN/));
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/第五阶段投资比较.png', fullPage: true });
  await page.getByRole('button', { name: '入职', exact: true }).first().click();
  await page.getByRole('heading', { name: '转行预览', exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.__moxiu.state.modern.job), 'dev');
  await page.getByRole('button', { name: '保留职业', exact: true }).click();
  await page.evaluate(async () => { (await import('/src/ui/app.js')).navigate('estate'); });
  await page.getByRole('button', { name: '追踪目标', exact: true }).first().click();
  assert.equal(await page.evaluate(() => window.__moxiu.state.projects.target), 'spiritvein');
  await page.getByRole('button', { name: '查看筹备', exact: true }).first().click();
  assert.equal(await page.getByRole('button', { name: '确认投资动工', exact: true }).count(), 0);
  await page.getByText(/前置：阵法传感器/).waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByLabel('店铺售货方式').selectOption('all');
  await page.getByText('指定货物保留数量', { exact: true }).click();
  await page.getByLabel('保留灵米', { exact: true }).fill('8'); await page.getByLabel('保留灵米', { exact: true }).press('Tab');
  assert.equal(await page.evaluate(() => window.__moxiu.state.estate.keep.lingmi), 8);
  await page.evaluate(async () => {
   const s = window.__moxiu.state; s.currency.cny = 1000000; s.research.done.sensor = true;
   const inv = await import('/src/systems/inventory.js'); inv.addItem(s, 'xuanjing', 5); inv.addItem(s, 'huojing', 2); (await import('/src/ui/app.js')).scheduleRender();
  });
  await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(e => e.replaceChildren());
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/第五阶段工程目标.png', fullPage: true });
  await page.getByRole('button', { name: '查看筹备', exact: true }).first().click();
  const money = await page.evaluate(() => window.__moxiu.state.currency.cny);
  assert.equal(await page.evaluate(() => window.__moxiu.state.currency.cny), money);
  await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(e => e.replaceChildren());
  await page.screenshot({ path: 'test-results/第五阶段工程预览.png' });
  await page.evaluate(() => { window.__moxiu.state.player.buffs.push({ id: 'change', until: Date.now() + 1e6, mods: { cultSpeed: .2 } }); });
  await page.getByRole('button', { name: '确认投资动工', exact: true }).click();
  await page.getByText('工程条件或收益已变化，预览已更新，请再次确认。').waitFor();
  assert.equal(await page.evaluate(() => window.__moxiu.state.currency.cny), money);
  await page.getByRole('button', { name: '确认投资动工', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__moxiu.state.currency.cny), money - 150000);
  await page.getByRole('button', { name: '购入', exact: true }).first().click();
  const before = await page.evaluate(() => window.__moxiu.state.estate.owned.suburb || 0);
  await page.getByRole('heading', { name: '地产投资确认', exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.__moxiu.state.estate.owned.suburb || 0), before);
  await page.getByRole('button', { name: '确认购入', exact: true }).click(); assert.equal(await page.evaluate(() => window.__moxiu.state.estate.owned.suburb), before + 1);
  await page.evaluate(async () => { const s = window.__moxiu.state; (await import('/src/systems/projects.js')).setProjectTarget(s, 'urbancore'); (await import('/src/systems/inventory.js')).addItem(s, 'xuanjing', 8); (await import('/src/ui/app.js')).navigate('research'); });
  await page.getByRole('button', { name: '全换', exact: true }).first().click(); await page.getByText(/全部兑换会减少工程备料/).waitFor();
  await page.getByRole('button', { name: '保留材料', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ['home', 'modern', 'estate', 'research']) {
   await page.evaluate(async view => { (await import('/src/ui/app.js')).navigate(view); }, view); await page.waitForTimeout(80);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `手机溢出${view}`);
   assert(!(await page.locator('body').innerText()).match(/undefined|null|Infinity|NaN/));
  }
  await page.evaluate(async () => { (await import('/src/ui/app.js')).navigate('estate'); });
  await page.getByRole('button', { name: '查看筹备', exact: true }).first().click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '手机工程预览溢出');
  await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(e => e.replaceChildren()); await page.screenshot({ path: 'test-results/第五阶段手机工程.png' });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.evaluate(async () => { const s = window.__moxiu.state; (await import('/src/systems/finance.js')).setInvestmentReserve(s, 20000); (await import('/src/core/save.js')).save(s); });
  await page.reload(); await page.evaluate(async () => { await window.__moxiu.ready; });
  assert.equal(await page.evaluate(() => window.__moxiu.state.modern.reserveCny), 20000); assert.equal(await page.evaluate(() => window.__moxiu.state.estate.keep.lingmi), 8); assert.equal(await page.evaluate(() => window.__moxiu.state.estate.saleMode), 'all'); assert.equal(await page.evaluate(() => window.__moxiu.state.projects.target), 'urbancore');
  const files = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => '/src/' + f); await page.evaluate(async files => { for (const f of files) await import(f); }, files);
  assert.deepEqual(errors, []); console.log(JSON.stringify({ modules: files.length, ui: '投资保留线与挂机按钮、转行预览、工程追踪/缺口/重确认、库存保留、地产确认、兑换冲突提醒、390px手机、设置重载', errors }));
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
