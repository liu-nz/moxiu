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
    try { await page.getByRole('button', { name: '开始', exact: true }).click(); }
    catch (e) { console.error(JSON.stringify({ startupErrors: errors, screen: await page.locator('body').innerText() })); throw e; }
    const checks = await page.evaluate(async () => {
      const { createInitialState } = await import('/src/core/state.js');
      const dungeon = await import('/src/systems/dungeon.js');
      const combat = await import('/src/systems/combat.js');
      const gear = await import('/src/systems/gear.js');
      const char = await import('/src/systems/character.js');
      const cult = await import('/src/systems/cultivation.js');
      const reinc = await import('/src/systems/reincarnation.js');
      const pets = await import('/src/systems/beasts.js');
      const { ensureDay } = await import('/src/systems/rift.js');
      const { stageInfo, BREAKTHROUGH_FAIL_LOSS } = await import('/src/data/realms.js');
      const { rollEquipment, techEquipment } = await import('/src/data/equipment.js');
      const { ITEM_MAP } = await import('/src/data/items.js');
      const { addItem } = await import('/src/systems/inventory.js');
      const { GUILDS } = await import('/src/data/guild.js');
      (await import('/src/core/loop.js')).stopLoop();
      const checked = [], check = (ok, label) => { if (!ok) throw Error(label); checked.push(label); };
      const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
      const fresh = (stage = 5) => { const s = createInitialState(Date.now()); s.side = 'cultivation'; s.player.stage = stage; ensureDay(s, { silent: true }); return s; };
      const fixedRandom = (rng, fn) => { const original = Math.random; try { Math.random = rng; return fn(); } finally { Math.random = original; } };
      const enemy = { name: '试炼靶', hp: 1e9, atk: 1e9, def: 0, spd: 0 };
      {
        const s = fresh(); const pet = { id: 'xuangui', name: '测试灵兽', level: 5, atk: 100, hp: 1 };
        const r = combat.simulateBattle(s, enemy, { pets: [pet], rng: () => .99 });
        check(r.metrics.petDamage === 50, '灵兽最终攻击不会再次乘等级成长');
        const fox = combat.simulateBattle(s, enemy, { pets: [{ ...pet, id: 'linghu' }], rng: () => .1 });
        const wolf = combat.simulateBattle(s, enemy, { pets: [{ ...pet, id: 'canglang' }], rng: () => .1 });
        check(fox.metrics.petDamage === 80 && fox.log.some(t => t.includes('暴击')), '灵狐暴击造成1.6倍合击');
        check(wolf.metrics.petDamage === 100 && wolf.log.some(t => t.includes('连击')), '苍狼连击追加一次合击');
        s.beasts.owned = [{ uid: 'fire', id: 'huofeng', level: 1 }]; s.beasts.deployed = ['fire'];
        const fire = combat.simulateBattle(s, enemy, { pets: [pet], rng: () => .99 });
        check(fire.metrics.petDamage === 56 && fire.metrics.playerDamage > r.metrics.playerDamage, '火凤加成同时作用于人物与灵兽伤害');
        check(r.outcome === 'defeat' && r.metrics.incomingDamage > 0, '败退统计承受伤害');
        const timeout = combat.simulateBattle(fresh(0), { ...enemy, atk: 0 }, { rng: () => .99 });
        check(timeout.outcome === 'timeout' && timeout.rounds === 60 && timeout.playerHp > 0, '60回合超时与气血耗尽区分');
      }
      {
        const s = fresh(22); s.tech = ['qiangguang', 'kangshengsu', 'fanghuo'].filter(id => ITEM_MAP[id]).map(id => techEquipment(ITEM_MAP[id]));
        // 防火服由物品实际效果定位，避免测试绑定显示名。
        const fireItem = Object.values(ITEM_MAP).find(i => i.equip?.effect === 'heat_shield');
        if (!s.tech.some(t => t.tech === 'heat_shield')) s.tech.push(techEquipment(fireItem));
        check(combat.elementMultiplier(s, { tags: ['dark', 'poison'] }) === 2.7 && combat.techDamageReduce(s, { tags: ['fire', 'poison'] }) === .45, '科技克制组合实际生效');
        const p = dungeon.dungeonPreparation(s, 'purgatory', 'normal');
        check(p.ok && p.counters.every(c => c.equipped) && p.tips.some(t => t.includes('第 5 回合')), '战前机制提示使用实际克制与大招规则');
        s.side = 'modern'; const before = JSON.stringify(s);
        check(!dungeon.runDungeon(s, 'bandit', 'normal').ok && JSON.stringify(s) === before, '异地手动战斗无体力和进度副作用');
        s.side = 'cultivation'; check(!dungeon.canEnter(s, 'ascension', 'normal').ok && !dungeon.canEnter(s, 'bandit', 'missing').ok, '未解锁和未知难度被拦截');
        s.player.stamina = 0; const free = dungeon.runDungeon(s, 'bandit', 'normal', { free: true, silent: true, rng: () => .99 });
        check(free.ok && free.win && s.player.stamina === 0, '道侣免费代刷不需要体力且正常结算');
      }
      {
        const s = fresh(); const snap = JSON.stringify(s.auto);
        for (const [id, diff] of [['ascension', 'normal'], ['bandit', 'bad'], ['bad', 'normal']]) check(!dungeon.setAutoBattle(s, true, id, diff).ok && JSON.stringify(s.auto) === snap, `无效自动目标不修改状态 ${id}/${diff}`);
        check(dungeon.setAutoBattle(s, true).ok && s.auto.dungeonId === 'bandit', '未指定时默认选择首个已解锁副本');
        s.side = 'modern'; dungeon.tickAutoBattle(s, 90000);
        check(s.auto.runs === 0 && s.player.stamina === 100 && dungeon.autoBattleView(s).status.includes('暂停'), '自动战斗跨界暂停不消耗');
        s.side = 'cultivation'; s.player.stamina = 0; dungeon.tickAutoBattle(s, 30000);
        check(s.auto.runs === 0 && dungeon.autoBattleView(s).status.includes('等待体力'), '体力不足时等待恢复');
        s.player.stage = 0; dungeon.tickAutoBattle(s, 30000);
        check(!s.auto.battleOn && s.auto.stopReason.includes('失效'), '失效自动目标停止并给出原因');
        const weak = fresh(2); weak.equipment.armor = { stats: { hpMax: -100000 }, enhance: 0 }; weak.player.stamina = 200;
        dungeon.setAutoBattle(weak, true, 'bandit', 'hard'); weak.auto.fails = 2;
        fixedRandom(() => .99, () => dungeon.tickAutoBattle(weak, 120000));
        check(weak.player.stamina === 145 && weak.auto.losses === 4 && weak.auto.diffId === 'normal', '自动降档后当批后续战斗使用新体力消耗');
        check(!weak.auto.battleOn && weak.auto.stopReason.includes('三次'), '普通难度三败停机并提示调整配装');
        check(weak.dungeon.log.length === 4 && dungeon.autoBattleView(weak).lastResult.wave === 1, '自动战绩进入历史并显示最近结果');
      }
      {
        const { advance } = await import('/src/core/loop.js');
        const { applyOffline } = await import('/src/systems/offline.js');
        const t = Date.parse('2026-10-01T18:00:00Z');
        const a = fresh(), b = fresh();
        for (const s of [a, b]) {
          s.world.clockMs = s.savedAt = t; s.tales = null; s.lifestyle.levels.food = 2;
          dungeon.setAutoBattle(s, true, 'bandit', 'normal');
        }
        fixedRandom(() => .99, () => { advance(a, 3600000, 3600000); applyOffline(b, t + 3600000); });
        check(a.auto.runs === b.auto.runs && a.player.stamina === b.player.stamina && near(a.currency.stone, b.currency.stone), '饮食加成下在线与离线自动战斗结算一致');
        const paused = fresh(); paused.tales = null; paused.side = 'modern'; paused.auto = { battleOn: true, dungeonId: 'bandit', diffId: 'normal', acc: 0, runs: 0 }; paused.savedAt = paused.world.clockMs = t;
        fixedRandom(() => .99, () => applyOffline(paused, t + 3600000));
        check(paused.auto.runs === 0 && paused.player.stamina === 100, '现代界离线不会绕过自动战斗暂停');
      }
      {
        const s = fresh(); s.player.stamina = 50; s.lifestyle.levels.food = 2;
        const interval = dungeon.staminaInterval(s);
        check(near(interval, 480000 / 1.24), '饮食体力恢复速度接入计算');
        dungeon.tickStamina(s, interval * 2 + 1000);
        check(s.player.stamina === 52 && near(s.player.staminaAcc, 1000), '体力批量恢复保留不足一点的累计时间');
        check(near(dungeon.staminaEta(s, true), interval - 1000) && near(dungeon.staminaEta(s), interval * 48 - 1000), '下一点与回满体力时间分开显示');
        s.social.guild.id = GUILDS.find(g => g.mods.staminaMax)?.id; s.player.stamina = 100; addItem(s, 'huiyuandan', 1);
        gear.useConsumable(s, 'huiyuandan');
        check(s.player.stamina === dungeon.staminaMax(s) && s.player.stamina === 120, '恢复丹药尊重道盟体力上限');
        dungeon.tickStamina(s, 1e12); check(s.player.stamina === 120 && s.player.staminaAcc === 0, '体力回满清除累计时间');
        const b = fresh(9); b.player.cultivation = stageInfo(9).stage.need; b.research.done.battery = true; b.lifestyle.levels.fun = 5;
        const before = b.player.cultivation;
        const res = fixedRandom(() => .999, () => cult.attemptBreakthrough(b));
        check(res.ok && !res.success && near(before - b.player.cultivation, before * BREAKTHROUGH_FAIL_LOSS * .5 * .8), '休闲与研究共同降低实际突破损失');
        const m = fresh(); m.market.eventId = 'calm'; const rate = char.cultivationRate(m); m.reincarnation.fate = 'merchant';
        check(near(char.cultivationRate(m), rate * .8), '商道天命修炼减速不再被归零');
      }
      {
        const s = fresh(); const eq = rollEquipment('weapon', 2, 50); s.bag = [eq];
        const old = JSON.stringify(s); const p = gear.previewBuildSwap(s, 'equipment', eq.uid);
        check(p.ok && JSON.stringify(s) === old && p.powerAfter > p.powerBefore, '装备比较无副作用并展示整套收益');
        gear.equipItem(s, eq.uid); check(char.combatPower(s) === p.powerAfter && near(char.computeAttrs(s).atk, p.after.atk), '装备预估与真实换装一致');
        s.skillBag = [{ uid: 'a', name: '保命诀', slot: 'heart', level: 3, maxLevel: 10, stats: { hpMax: 100, cultSpeed: .1 } }];
        const sk = gear.previewBuildSwap(s, 'skill', 'a', 'heart'); gear.equipSkill(s, 'a', 'heart');
        check(sk.ok && char.combatPower(s) === sk.powerAfter && near(char.computeAttrs(s).cultSpeed, sk.after.cultSpeed), '功法比较计入等级成长与最终属性');
        const snap = JSON.stringify(s); check(!gear.previewBuildSwap(s, 'skill', 'missing', 'heart').ok && !gear.previewBuildSwap(s, 'skill', 'a', 'bad').ok && JSON.stringify(s) === snap, '过期功法与非法槽位无副作用');
      }
      {
        const s = fresh(41); const snap = JSON.stringify(s);
        check(!reinc.ascend(s).ok && JSON.stringify(s) === snap, '最高境界尚未渡劫不能直接轮回');
        s.player.cultivation = stageInfo(41).stage.need;
        check(!reinc.canAscend(s), '满修为仍需成功渡劫');
        const trial = fixedRandom(() => 0, () => cult.attemptBreakthrough(s));
        check(trial.success && trial.ascension && reinc.canAscend(s) && !cult.attemptBreakthrough(s).ok, '渡劫成功标记生效且不能重复试劫');
        s.reincarnation.points = 12; s.reincarnation.earned = 20; s.reincarnation.fate = 'merchant'; s.reincarnation.blessings.cult = 2;
        s.companions.lingyao = { affection: 80, met: true }; s.research.done.battery = true; s.research.points = 11; s.research.labLevel = 4;
        s.tales.seen.saved = true; s.tales.count = 3; s.tales.pending = { id: 'stale' };
        s.stats.maxCny = 1e7; s.modern.job = 'dev'; s.modern.businessLevel = 3; s.estate.owned.home = 3; s.lifestyle.levels.food = 4; s.projects.done.battery = true;
        s.auto.battleOn = true; s.sect.id = 'qingyunjian'; s.social.chamber.joined = true; s.social.ranking.bestRanks.power = 1;
        const preview = reinc.ascensionPreview(s), clock = s.world.clockMs, identity = s;
        const res = reinc.ascend(s);
        check(res.ok && s === identity && s.reincarnation.points === 12 + preview.total && s.reincarnation.earned === 20 + preview.total, '轮回按本世结算且保留状态引用');
        check(s.player.stage === 0 && s.currency.cny === 2000 && s.stats.maxCny === 0 && s.reincarnation.fate === null && reinc.fateChoicePending(s), '新一世重置统计、天命与开局资源');
        check(!s.modern.job && s.modern.businessLevel === 0 && !Object.keys(s.estate.owned).length && !Object.keys(s.projects.done).length && !Object.keys(s.lifestyle.levels).length && !s.sect.id && !s.auto.battleOn && !s.social.chamber.joined, '产业生活势力与自动设置统一重置');
        check(s.companions.lingyao.affection === 80 && s.research.done.battery && s.research.points === 5 && s.research.labLevel === 0 && s.tales.seen.saved && !s.tales.pending && s.social.ranking.bestRanks.power === 1, '知识缘分见闻保留、研究点减半、实验室重建');
        check(s.world.clockMs === clock && s.rift.day === s.market.day && s.rift.toCultivation === 1 && Object.keys(s.reincarnation.codex).length === 9, '轮回重新初始化当日界潮并保留时钟图鉴');
        const newLife = JSON.stringify(s); check(!reinc.ascend(s).ok && newLife === JSON.stringify(s), '重复飞升不重复发点');
        check(reinc.chooseFate(s, 'war').ok && s.bag.length === 1 && !reinc.fateChoicePending(s), '天命开局武器只发一次');
        const after = JSON.stringify(s); check(!reinc.chooseFate(s, 'war').ok && !reinc.chooseFate(s, 'merchant').ok && after === JSON.stringify(s), '不能改选天命或重复领取资源');
        const first = fresh(); check(!reinc.chooseFate(first, 'merchant').ok && first.currency.cny === 2000, '首世不能直接领取轮回开局奖励');
        const legacy = fresh(0); legacy.reincarnation.count = 1; check(reinc.fateChoicePending(legacy), '旧存档未选天命开局可以恢复选择');
      }
      return checked;
    });
    console.log(JSON.stringify({ gameplayChecks: checks.length, checks }, null, 2));
    fs.mkdirSync('test-results', { recursive: true });
    await page.evaluate(async () => {
      const s = window.__moxiu.state; const { createInitialState } = await import('/src/core/state.js'); Object.assign(s, createInitialState(Date.now()));
      s.side = 'cultivation'; s.player.stage = 5; s.currency.stone = 10000;
      (await import('/src/systems/rift.js')).ensureDay(s, { silent: true }); (await import('/src/ui/app.js')).navigate('dungeon');
    });
    await page.getByRole('button', { name: /普通准备/ }).first().click();
    const stamina = await page.evaluate(() => window.__moxiu.state.player.stamina);
    assert.equal(stamina, 100);
    await page.getByRole('heading', { name: '战前准备', exact: true }).waitFor();
    assert(!await page.locator('.modal-body').innerText().then(t => /null|undefined/.test(t)));
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.waitForTimeout(250);
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第三阶段战前准备.png' });
    await page.evaluate(() => { window.__moxiu.state.equipment.weapon = { uid: 'boost', name: '试炼剑', slot: 'weapon', stats: { atk: 300 }, enhance: 0 }; });
    await page.getByRole('button', { name: '确认进入秘境', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.player.stamina), stamina);
    await page.getByText('配装或世界已变化，准备信息已更新，请再次确认。').waitFor();
    await page.getByRole('button', { name: '确认进入秘境', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.player.stamina), 90);
    await page.getByRole('heading', { name: '战斗反馈', exact: true }).waitFor();
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.waitForTimeout(250);
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第三阶段战斗反馈.png' });
    await page.getByRole('button', { name: '知道了', exact: true }).click();
    await page.getByRole('button', { name: '开启自动战斗', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.auto.battleOn), false);
    await page.getByRole('button', { name: '确认开启自动战斗', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.auto.battleOn), true);
    await page.getByRole('button', { name: '停止自动战斗', exact: true }).click();
    await page.evaluate(async () => { window.__moxiu.state.player.stamina = 0; (await import('/src/ui/app.js')).scheduleRender(); });
    await page.getByRole('button', { name: /普通准备/ }).first().click();
    await page.getByRole('button', { name: '确认进入秘境', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.player.stamina), 0);
    await page.getByRole('heading', { name: '战前准备', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '开启自动战斗', exact: true }).click();
    await page.getByRole('button', { name: '确认开启自动战斗', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.auto.battleOn), true);
    await page.getByText('等待体力恢复', { exact: true }).waitFor();
    await page.getByRole('button', { name: '停止自动战斗', exact: true }).click();
    await page.evaluate(() => { window.__moxiu.state.player.stamina = 90; });
    await page.evaluate(async () => {
      const s = window.__moxiu.state;
      s.skillBag = [{ uid: 'one', name: '养气测试诀', slot: 'heart', level: 1, maxLevel: 10, stats: { cultSpeed: .3 } }, { uid: 'two', name: '护体测试诀', slot: 'heart', level: 3, maxLevel: 10, stats: { hpMax: 200, dmgReduce: .1 } }];
      const { rollEquipment } = await import('/src/data/equipment.js'); s.bag = [rollEquipment('weapon', 2, 200)];
      (await import('/src/ui/app.js')).navigate('character');
    });
    await page.getByRole('button', { name: '换（2）', exact: true }).click();
    await page.getByRole('button', { name: '比较此功法', exact: true }).nth(1).click();
    await page.getByRole('heading', { name: '功法替换预览', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__moxiu.state.skills.heart), null);
    await page.waitForTimeout(250);
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第三阶段功法比较.png' });
    await page.getByRole('button', { name: '确认替换', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.skills.heart.uid), 'two');
    await page.getByRole('button', { name: '比较装备', exact: true }).first().click();
    await page.getByRole('heading', { name: '装备替换预览', exact: true }).waitFor();
    await page.getByRole('button', { name: '确认替换', exact: true }).click();
    await page.evaluate(async () => { (await import('/src/ui/app.js')).navigate('reincarnation'); });
    await page.getByText('轮回保留与重置规则', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '轮回后可选', exact: true }).count(), 4);
    assert(await page.getByRole('button', { name: '轮回后可选', exact: true }).first().isDisabled());
    await page.waitForTimeout(250);
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第三阶段轮回规则.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const view of ['dungeon', 'character', 'reincarnation']) {
      await page.evaluate(async view => { (await import('/src/ui/app.js')).navigate(view); }, view);
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `手机溢出 ${view}`);
    }
    await page.evaluate(async () => { (await import('/src/ui/app.js')).navigate('dungeon'); });
    await page.getByRole('button', { name: /普通准备/ }).first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '手机战前浮层溢出');
    await page.waitForTimeout(250);
    await page.locator('#toast-root').evaluate(el => el.replaceChildren());
    await page.screenshot({ path: 'test-results/第三阶段手机准备.png' });
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.evaluate(async () => {
      const s = window.__moxiu.state; s.reincarnation.count = 1; s.reincarnation.fate = null; s.reincarnation.awaitingFate = true; s.player.stage = 0;
      const { emit, EV } = await import('/src/core/bus.js'); emit(EV.TICK);
    });
    await page.getByRole('button', { name: '择此天命', exact: true }).first().click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.reincarnation.fate), 'merchant');
    await page.evaluate(async () => {
      const s = window.__moxiu.state; s.reincarnation.fate = null; s.reincarnation.awaitingFate = true;
      const { GUILDS } = await import('/src/data/guild.js'); s.social.guild.id = GUILDS.find(g => g.mods.staminaMax)?.id; s.player.stamina = 100;
      (await import('/src/core/save.js')).save(s);
    });
    await page.reload();
    await page.evaluate(async () => { await window.__moxiu.ready; });
    // 很短的重载不会显示离线报告；如有报告先关闭，待选天命仍需恢复。
    const offline = page.getByRole('button', { name: '知道了', exact: true });
    if (await offline.isVisible()) await offline.click();
    await page.getByRole('button', { name: '择此天命', exact: true }).first().click();
    assert.equal(await page.evaluate(() => window.__moxiu.state.reincarnation.fate), 'merchant');
    await page.evaluate(async () => {
      (await import('/src/core/loop.js')).stopLoop();
      const s = window.__moxiu.state; s.side = 'cultivation'; s.player.stage = 5;
      (await import('/src/ui/app.js')).navigate('dungeon');
    });
    await page.getByText('100 / 120', { exact: true }).first().waitFor();
    assert(await page.getByText('100 / 120', { exact: true }).count(), '界面使用道盟体力上限');

    const sourceFiles = fs.readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => '/src/' + f);
    await page.evaluate(async files => { for (const file of files) await import(file); }, sourceFiles);
    console.log(JSON.stringify({ moduleImports: sourceFiles.length }));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ui: '战前不扣体力、配装变化重新确认、战斗反馈、自动准备、手动挑选功法、装备比较、轮回规则、恢复天命选择、390px手机检查', errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
