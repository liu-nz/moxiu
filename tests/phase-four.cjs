const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(process.env.MOXIU_URL || 'http://127.0.0.1:8080');
    await page.evaluate(async () => { await window.__moxiu.ready; });
    await page.getByRole('button', { name: '开始', exact: true }).click();
    const checks = await page.evaluate(async () => {
      const { createInitialState } = await import('/src/core/state.js');
      const farm = await import('/src/systems/farm.js'), ranch = await import('/src/systems/ranch.js'), alchemy = await import('/src/systems/alchemy.js');
      const inv = await import('/src/systems/inventory.js'), gear = await import('/src/systems/gear.js');
      const { CROPS } = await import('/src/data/crops.js'), { RANCH_MAP } = await import('/src/data/beasts.js');
      const { ALCHEMY_MAP } = await import('/src/data/recipes.js');
      const { pillDescription } = await import('/src/data/alchemy.js');
      const { ensureDay, syncGateLevel } = await import('/src/systems/rift.js');
      const { advance, stopLoop } = await import('/src/core/loop.js');
      const { runDailyDuties } = await import('/src/systems/duties.js');
      stopLoop();
      const checked = [], check = (ok, label) => { if (!ok) throw Error(label); checked.push(label); };
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      const fresh = (stage = 14) => { const s = createInitialState(Date.parse('2026-10-01T00:00:00Z')); s.side = 'cultivation'; s.player.stage = stage; s.currency.stone = 100000; s.tales = null; ensureDay(s, { silent: true }); syncGateLevel(s); s.market.eventId = 'calm'; return s; };
      const fixedRandom = (rng, fn) => { const old = Math.random; try { Math.random = rng; return fn(); } finally { Math.random = old; } };
      {
        const s = fresh(), before = JSON.stringify(s);
        for (const index of [-1, .5, 3, Infinity, NaN]) check(!farm.plant(s, index, 'lingmi').ok && !farm.harvest(s, index).ok && !farm.setPlotPlan(s, index, 'lingmi').ok && JSON.stringify(s) === before, `非法地块不消耗也不修改存档 ${index}`);
        check(!farm.plant(s, 0, 'bad').ok && s.currency.stone === 100000, '未知作物不扣费');
        farm.plant(s, 0, 'lingmi'); farm.plant(s, 1, 'huangjing');
        s.research.done.autoirrigate = true; s.farm.plan[2] = null;
        const ready = s.farm.plots[0].readyAt; s.world.clockMs = ready; s.farm.plots[0].notified = true;
        farm.tickFarm(s);
        check(inv.countOf(s, 'lingmi') === 8 && s.farm.plots[0].cropId === 'lingmi' && s.farm.plots[1].cropId === 'huangjing' && s.farm.plots[2] === null, '已提醒作物自动收获、混种独立续种、休耕不被覆盖');
        const current = s.farm.plots[1].cropId;
        check(farm.setPlotPlan(s, 1, 'bainian').ok && s.farm.plots[1].cropId === current && s.farm.plan[1] === 'bainian', '改下茬计划不销毁当前作物');
        farm.setFarmAutomation(s, { autoHarvest: false, autoReplant: true }); s.world.clockMs = s.farm.plots[0].readyAt; farm.tickFarm(s);
        check(s.farm.plots[0].notified && inv.countOf(s, 'lingmi') === 8, '自动收获可独立关闭');
        farm.setFarmAutomation(s, { autoHarvest: true, autoReplant: false }); farm.tickFarm(s);
        check(s.farm.plots[0] === null && inv.countOf(s, 'lingmi') === 16, '自动补种可独立关闭');
        s.currency.stone = 100; farm.setFarmAutomation(s, { autoReplant: true, reserveStone: 100 }); farm.tickFarm(s);
        check(s.farm.plots[0] === null && s.farm.plots[2] === null && s.farm.plots[1].cropId === 'huangjing' && s.currency.stone === 100, '自动补种不突破灵石保留线');
        check(farm.plant(s, 0, 'lingmi').ok && s.currency.stone === 80, '手动播种不受自动预算线限制');
        const snap = JSON.stringify(s.farm); check(!farm.setFarmAutomation(s, { reserveStone: -1 }).ok && !farm.setFarmAutomation(s, { autoHarvest: 'yes' }).ok && snap === JSON.stringify(s.farm), '无效自动化设置不污染存档');
        const locked = fresh(); check(!farm.setFarmAutomation(locked, { autoHarvest: false }).ok && !ranch.setRanchAutoCollect(locked, true).ok, '未研究不能绕过自动化解锁');
      }
      {
        const s = fresh(); farm.plant(s, 0, 'lingmi'); const ready = s.farm.plots[0].readyAt;
        s.world.clockMs = ready; fixedRandom(() => 0, () => farm.tickFarm(s, 3600000));
        s.world.clockMs = ready + farm.RAID_GRACE_MS; fixedRandom(() => 0, () => farm.tickFarm(s, farm.RAID_GRACE_MS));
        check(!!s.farm.plots[0], '成熟与前12小时不会被偷吃');
        s.world.clockMs++; fixedRandom(() => 0, () => farm.tickFarm(s, 1)); check(s.farm.plots[0] === null, '偷吃只计保护期后的暴露时间');
        farm.plant(s, 0, 'lingmi'); s.beasts.deployed = ['ghost'];
        check(!farm.hasFarmGuard(s), '不存在的上阵灵兽不能提供看护');
        s.beasts.owned = [{ uid: 'fox', id: 'linghu', level: 1 }]; s.beasts.deployed = ['fox'];
        s.world.clockMs += 20 * 3600000; fixedRandom(() => 0, () => farm.tickFarm(s, 20 * 3600000)); check(!!s.farm.plots[0] && farm.hasFarmGuard(s), '真实上阵灵兽免偷吃');
      }
      {
        const s = fresh(); ranch.buyBeast(s, 'lingji'); s.beasts.owned = [{ uid: 'fox', id: 'linghu' }]; s.beasts.deployed = ['fox'];
        ranch.tickRanch(s, RANCH_MAP.lingji.cycleMs * 10);
        check(s.ranch.slots[0].pending === 23 && near(s.ranch.slots[0].yieldFraction, 0), '看护15%增产跨周期累计兑现');
        s.research.done.autoirrigate = true; ranch.setRanchAutoCollect(s, false); ranch.tickRanch(s, RANCH_MAP.lingji.cycleMs);
        check(s.ranch.slots[0].pending === 25 && inv.countOf(s, 'lingjidan') === 0, '牧场自动收取独立暂停');
        ranch.setRanchAutoCollect(s, true); ranch.tickRanch(s, 0);
        check(inv.countOf(s, 'lingjidan') === 25 && s.ranch.slots[0].pending === 0, '已累积产物开启自动收取后入包');
        ranch.setRanchAutoCollect(s, false); ranch.tickRanch(s, RANCH_MAP.lingji.cycleMs);
        const pending = s.ranch.slots[0].pending; ranch.removeBeast(s, 0);
        check(s.ranch.slots[0] === null && inv.countOf(s, 'lingjidan') === 25 + pending, '清栏先收取产物，不吞待收资源');
        const t = fresh(); ranch.buyBeast(t, 'lingji'); const old = JSON.stringify(t); ranch.tickRanch(t, NaN); ranch.tickRanch(t, -1);
        check(old === JSON.stringify(t), '无效养殖时间不产生资源');
        for (const index of [-1, .5, 2]) check(!ranch.collect(t, index).ok && !ranch.removeBeast(t, index).ok, `非法牧场栏位被拦截 ${index}`);
      }
      {
        const s = fresh(); inv.addItem(s, 'huangjing', 3);
        const st = alchemy.recipeStatus(s, 'huiyuan', 'potent');
        check(st.mats.length === 1 && st.mats[0].need === 4 && !st.ok && st.cost === 70, '主辅材相同先合并需求，不能重复使用');
        const old = JSON.stringify(s); check(!alchemy.craft(s, 'huiyuan', 1, { auxId: 'potent' }).ok && old === JSON.stringify(s), '缺辅材不开炉，不静默回落原方');
        inv.addItem(s, 'huangjing', 9);
        const snap = JSON.stringify(s);
        for (const n of [0, -1, .5, Infinity, NaN, 101]) check(!alchemy.craft(s, 'huiyuan', n).ok && snap === JSON.stringify(s), `非法炼制次数不消耗 ${n}`);
        let rolls = [0, .1, 0, .4];
        const res = alchemy.craft(s, 'huiyuan', 2, { auxId: 'potent', rng: () => rolls.shift(), silent: true });
        check(res.made === 4 && res.grades.rare === 2 && res.grades.fine === 2 && inv.countOf(s, 'huiyuandan', 'rare') === 2 && inv.countOf(s, 'huiyuandan', 'fine') === 2, '辅材品质落入真实丹药背包');
        check(inv.countOf(s, 'huangjing') === 4 && s.currency.stone === 99860 && s.stats.crafts === 2, '每炉精确扣费扣材并计入每日炼制次数');
        check(alchemy.recipeStatus(s, 'huiyuan', 'steady').rate > alchemy.recipeStatus(s, 'huiyuan').rate && alchemy.recipeStatus(s, 'huiyuan', 'pure').tox < alchemy.recipeStatus(s, 'huiyuan').tox, '稳火成功率与清毒风险实际进入公式');
        const f = fresh(); f.currency.stone = 45; inv.addItem(f, 'huangjing', 2); let rng = [.99, 0];
        const loss = alchemy.craft(f, 'huiyuan', 1, { rng: () => rng.shift(), silent: true });
        check(loss.extraLoss === 5 && f.currency.stone === 0 && loss.failed === 1, '反噬记录实际扣款，钱包不足不虚报损失');
        const m = fresh(); inv.addItem(m, 'huangjing', 4); inv.addItem(m, 'huangjing', 9, 'rare');
        alchemy.craft(m, 'huiyuan', 1, { auxId: 'potent', rng: () => 0, silent: true });
        check(inv.countOf(m, 'huangjing', 'rare') === 9 && inv.countOf(m, 'huangjing', 'common') === 0, '优先消耗普通材料，保留高品质贸易药草');
        const locked = fresh(0); inv.addItem(locked, 'huangjing', 100); check(!alchemy.recipeStatus(locked, 'huiyuan', 'potent').ok && !alchemy.setAlchemyPlan(locked, { auxId: 'potent' }).ok, '辅材境界限制同时用于手动和自动设置');
        check(alchemy.materialSource(locked, 'bainian').includes('筑基初期') && alchemy.materialSource(locked, 'xingchen').includes('星陨海'), '备料来源包含真实种植与秘境解锁');
      }
      {
        const s = fresh(); s.player.stamina = 0; const rare = inv.addItem(s, 'huiyuandan', 1, 'rare'), common = inv.addItem(s, 'huiyuandan', 1);
        check(gear.useConsumable(s, 'huiyuandan', rare.uid).ok && s.player.stamina === 39 && inv.countOf(s, 'huiyuandan', 'common') === 1, '点击稀有丹药只消耗对应行并使用130%药效');
        check(!gear.useConsumable(s, 'huiyuandan', 'missing').ok && inv.countOf(s, 'huiyuandan') === 1, '过期丹药行不能改吃别的品质');
        gear.useConsumable(s, 'huiyuandan'); check(s.player.stamina === 69, '旧调用默认使用最低品质丹药');
        s.player.stamina = 100; inv.addItem(s, 'huiyuandan', 1); check(!gear.useConsumable(s, 'huiyuandan').ok && inv.countOf(s, 'huiyuandan') === 1, '满体力保留丹药');
        const n = inv.addItem(s, 'ningshendan', 2, 'fine'); gear.useConsumable(s, 'ningshendan', n.uid);
        check(near(s.player.buffs[0].mods.cultSpeed, 1.15) && s.player.buffs[0].until === s.world.clockMs + 3600000, '优质修炼丹药提升强度，时长按配方');
        check(!gear.useConsumable(s, 'ningshendan', n.uid).ok && inv.countOf(s, 'ningshendan') === 1, '重复同效果不叠加，也不消耗');
        const l = inv.addItem(s, 'lingyuandan', 1, 'rare'); gear.useConsumable(s, 'lingyuandan', l.uid);
        check(s.player.buffs.length === 1 && near(s.player.buffs[0].mods.cultSpeed, 2.6) && s.player.buffs[0].until === s.world.clockMs + 7200000, '灵元丹替换弱丹效果，日志与实际2小时260%一致');
        check(!gear.useConsumable(s, 'ningshendan').ok && inv.countOf(s, 'ningshendan') === 1, '更弱丹药不会覆盖现有效果');
        inv.addItem(s, 'jiuzhuandan', 2, 'rare'); gear.useConsumable(s, 'jiuzhuandan');
        check(s.player.breakthroughFails === 3 && !gear.useConsumable(s, 'jiuzhuandan').ok && inv.countOf(s, 'jiuzhuandan') === 1, '九转丹真正推进保底且满保底不吞药');
        check(pillDescription('jiuzhuandan', 'fine').includes('2 次') && pillDescription('jiuzhuandan', 'rare').includes('3 次'), '品质预览对保底丹显示实际整数效果');
      }
      {
        const s = fresh(); inv.addItem(s, 'huangjing', 100); inv.addItem(s, 'bainian', 100); inv.addItem(s, 'lingjidan', 100);
        check(!alchemy.setAlchemyPlan(s, { on: true }).ok, '机器未研究不能启动');
        s.research.done.autopill = true; alchemy.tickAlchemy(s, 1e7); check(inv.countOf(s, 'huiyuandan') === 0, '研究完成不会擅自启动消耗材料');
        alchemy.setAlchemyPlan(s, { recipeId: 'huiyuan', auxId: 'steady', on: true, reserveStone: 99950 });
        fixedRandom(() => 0, () => alchemy.tickAlchemy(s, alchemy.AUTO_ALCHEMY_INTERVAL));
        check(inv.countOf(s, 'huiyuandan') === 2 && inv.countOf(s, 'ningshendan') === 0 && s.currency.stone === 99950, '机器只炼指定丹方并遵守预算线');
        alchemy.tickAlchemy(s, alchemy.AUTO_ALCHEMY_INTERVAL); check(s.crafting.lastAutoResult.reason.includes('保留'), '触及保留线留下等待原因');
        alchemy.setAlchemyPlan(s, { reserveStone: 0, on: false }); const acc = s.crafting.autoAcc; alchemy.tickAlchemy(s, alchemy.AUTO_ALCHEMY_INTERVAL);
        check(s.crafting.autoAcc === acc && inv.countOf(s, 'huiyuandan') === 2, '暂停机器不积累后台炉次');
        alchemy.setAlchemyPlan(s, { recipeId: 'ningshen' }); check(s.crafting.autoAcc === 0, '更换丹方重启周期');
        const c = fresh(); c.companions.moyao = { met: true, affection: 80 }; inv.addItem(c, 'huangjing', 20);
        fixedRandom(() => 0, () => runDailyDuties(c)); check(inv.countOf(c, 'huiyuandan') > 0 && !c.research.done.autopill, '墨瑶每日代炼独立于机器研究');
        const f = fresh(); inv.addItem(f, 'huangjing', 2); f.currency.stone = 50; let rolls = [.99, 0];
        const r = alchemy.craft(f, 'huiyuan', 1, { reserveStone: 10, rng: () => rolls.shift(), silent: true });
        check(r.failed === 1 && f.currency.stone === 10 && r.extraLoss === 0, '失败反噬也不突破自动预算线');
      }
      {
        const a = fresh(), b = fresh();
        for (const s of [a, b]) {
          s.research.done.autoirrigate = s.research.done.autopill = true;
          farm.plant(s, 0, 'huangjing'); farm.plant(s, 1, 'bainian'); farm.setPlotPlan(s, 2, null);
          inv.addItem(s, 'huangjing', 200); inv.addItem(s, 'lingjidan', 200);
          ranch.buyBeast(s, 'lingji'); s.beasts.owned = [{ uid: 'f', id: 'linghu' }]; s.beasts.deployed = ['f'];
          alchemy.setAlchemyPlan(s, { recipeId: 'huiyuan', auxId: 'steady', on: true });
        }
        fixedRandom(() => .1, () => {
          advance(a, 12 * 3600000 + 1234);
          const parts = [800001, 2400001, 999, 4000000, 14000001, 22000001];
          let elapsed = 0; for (const p of parts) { advance(b, p); elapsed += p; }
          advance(b, 12 * 3600000 + 1234 - elapsed);
        });
        const count = s => Object.fromEntries(['huangjing', 'bainian', 'lingjidan', 'huiyuandan'].map(id => [id, inv.countOf(s, id)]));
        check(JSON.stringify(count(a)) === JSON.stringify(count(b)) && near(a.currency.stone, b.currency.stone), '长段离线与不同在线分片的种田养殖炼丹产物及费用一致');
        check(a.farm.plots[0].readyAt === b.farm.plots[0].readyAt && a.farm.plots[1].readyAt === b.farm.plots[1].readyAt && near(a.ranch.slots[0].acc, b.ranch.slots[0].acc) && near(a.crafting.autoAcc, b.crafting.autoAcc), '生产剩余时间与混种计划在线离线一致');
        check(a.crafting.history.length === 10 && a.crafting.history.every(r => r.attempts <= 3), '自动炼丹历史上限与每周期炉数限制');
      }
      return checked;
    });
    console.log(JSON.stringify({ gameplayChecks: checks.length, checks }, null, 2));
    fs.mkdirSync('test-results', { recursive: true });
    await page.evaluate(async () => {
      const s = window.__moxiu.state; Object.assign(s, (await import('/src/core/state.js')).createInitialState(Date.now()));
      s.side = 'cultivation'; s.player.stage = 14; s.currency.stone = 20000;
      s.research.done.autoirrigate = s.research.done.autopill = true;
      (await import('/src/systems/rift.js')).ensureDay(s, { silent: true });
      const f = await import('/src/systems/farm.js'); f.plant(s, 0, 'huangjing'); f.plant(s, 1, 'bainian'); f.setPlotPlan(s, 2, null);
      (await import('/src/systems/ranch.js')).buyBeast(s, 'lingji');
      const inv = await import('/src/systems/inventory.js'); inv.addItem(s, 'huangjing', 20); inv.addItem(s, 'lingjidan', 8);
      (await import('/src/ui/app.js')).navigate('farm');
    });
    await page.getByLabel('第 1 块田续种作物').selectOption('binglian');
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.plots[0].cropId), 'huangjing');
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.plan[0]), 'binglian');
    await page.getByRole('button', { name: '自动补种：开', exact: true }).click();
    await page.getByLabel('补种保留灵石').fill('5000'); await page.getByLabel('补种保留灵石').press('Tab');
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.reserveStone), 5000);
    await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第四阶段洞府.png', fullPage: true });
    await page.getByRole('button', { name: '前往炼丹配置', exact: true }).click();
    assert(!(await page.locator('body').innerText()).match(/undefined|null/));
    await page.getByRole('button', { name: '辅材方案凝药', exact: true }).click();
    await page.getByRole('button', { name: '准备最多 5 炉', exact: true }).click();
    await page.getByRole('heading', { name: '开炉确认', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__moxiu.state.crafting.totalPills), 0);
    assert(!(await page.locator('.modal-body').innerText()).match(/undefined|null/));
    await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第四阶段开炉预览.png' });
    await page.evaluate(() => { window.__moxiu.state.research.done.database = true; });
    await page.getByRole('button', { name: '确认开炉', exact: true }).click();
    await page.getByText('材料、可炼炉数或成功率已变化，请再次确认。').waitFor();
    assert.equal(await page.evaluate(() => window.__moxiu.state.crafting.totalPills), 0);
    await page.getByRole('button', { name: '确认开炉', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.stats.crafts), 5);
    await page.getByRole('button', { name: '自动炼丹：关', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.crafting.autoAlchemy), true);
    await page.getByRole('button', { name: '自动炼丹：开', exact: true }).click();
    await page.getByRole('button', { name: '辅材方案稳火', exact: true }).click();
    await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第四阶段炼丹配置.png', fullPage: true });
    await page.evaluate(async () => {
      const s = window.__moxiu.state; (await import('/src/systems/inventory.js')).addItem(s, 'huiyuandan', 2, 'rare'); s.player.stamina = 0;
      (await import('/src/ui/app.js')).navigate('character');
    });
    await page.getByText('恢复 39 点体力（不超过上限）', { exact: true }).waitFor();
    await page.getByText('恢复 39 点体力（不超过上限）', { exact: true }).locator('..').locator('..').getByRole('button', { name: '使用', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.player.stamina), 39);
    await page.evaluate(async () => { (await import('/src/ui/app.js')).navigate('farm'); const s = window.__moxiu.state; s.ranch.slots[0].pending = 3; (await import('/src/ui/app.js')).scheduleRender(); });
    await page.getByRole('button', { name: '清栏', exact: true }).click();
    assert(await page.evaluate(() => !!window.__moxiu.state.ranch.slots[0]));
    const eggs = await page.evaluate(async () => (await import('/src/systems/inventory.js')).countOf(window.__moxiu.state, 'lingjidan'));
    await page.getByRole('button', { name: '确认清栏', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/systems/inventory.js')).countOf(window.__moxiu.state, 'lingjidan')), eggs + 3);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['farm', 'craft', 'character']) {
      await page.evaluate(async view => { (await import('/src/ui/app.js')).navigate(view); }, view);
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `手机溢出 ${view}`);
    }
    await page.evaluate(async () => { const s = window.__moxiu.state; (await import('/src/systems/inventory.js')).addItem(s, 'huangjing', 20); (await import('/src/ui/app.js')).navigate('craft'); });
    await page.getByRole('button', { name: '准备 1 炉', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '手机开炉预览溢出');
    await page.waitForTimeout(250); await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第四阶段手机开炉.png' });
    await page.getByRole('button', { name: '返回配置', exact: true }).click();
    await page.evaluate(async () => { (await import('/src/core/save.js')).save(window.__moxiu.state); });
    await page.reload(); await page.evaluate(async () => { await window.__moxiu.ready; });
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.plan[0]), 'binglian');
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.autoReplant), false);
    assert.equal(await page.evaluate(() => window.__moxiu.state.farm.reserveStone), 5000);
    assert.equal(await page.evaluate(() => window.__moxiu.state.crafting.selectedAux), 'steady');
    const files = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => '/src/' + f);
    await page.evaluate(async files => { for (const f of files) await import(f); }, files);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ moduleImports: files.length, ui: '逐田计划、保留线、开炉不扣款、变化重确认、品质精确服用、自动开关、清栏确认收取、390px手机与重载保存', errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
