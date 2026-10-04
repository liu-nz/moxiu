import assert from 'node:assert/strict';
import { initialGame, settleGame, validateCommand } from '../src/core/game-engine.js';
import { riftDayIndex } from '../src/core/clock.js';
import { signIn, claimHelp } from '../src/systems/daily.js';
import { addItem, countOf } from '../src/systems/inventory.js';
import { commissionBoard, acceptCommission, abandonCommission, fulfillCommission } from '../src/systems/commissions.js';
import { storyJournal, followStory, resolveTale } from '../src/systems/tales.js';
import { talesFor } from '../src/data/tales.js';
import { collectionSections } from '../src/systems/collection.js';
import { buyBeast } from '../src/systems/ranch.js';
const now = Date.parse('2026-10-03T20:59:59.000Z'), day = riftDayIndex(now);
let n = 0; const check = (x, label) => { assert(x, label); n++; }, fresh = () => initialGame(now);
const activity = { signInDay: null, signInTotal: 0, signInStreak: 0, helpClaimedDay: null, help: null };
let s = settleGame(fresh(), 'daily.signIn', [], now, [], null, activity);
check(s.result.ok && s.state.currency.stone === fresh().currency.stone + 20, 'sign in grants exactly twenty stone');
check(!settleGame(s.state, 'daily.signIn', [], now).result.ok, 'duplicate sign in is rejected');
s = settleGame(s.state, 'daily.signIn', [], now + 1000);
check(s.result.ok && s.state.daily.signInStreak === 2 && s.state.daily.signInDay === day + 1, '05:00 Shanghai boundary grants next day');
s = settleGame(s.state, 'daily.signIn', [], now + 1000 + 2 * 86400000);
check(s.state.daily.signInStreak === 1 && s.state.daily.signInTotal === 3, 'missed day resets streak but retains total');
let malicious = fresh(); malicious.daily.signInDay = null;
const trusted = { ...activity, signInDay: day, signInTotal: 1, signInStreak: 1 };
check(!settleGame(malicious, 'daily.signIn', [], now, [], null, trusted).result.ok, 'account context supersedes reset character marker');
const reset = settleGame(malicious, 'reset', [], now, [], null, trusted);
check(reset.state.daily.signInDay === day && !settleGame(reset.state, 'daily.signIn', [], now, [], null, trusted).result.ok, 'reset cannot remint sign in');
for (const action of ['daily.signIn', 'daily.claimHelp']) { assert.throws(() => validateCommand(action, [{ reward: 1e9 }])); n++; }
s = fresh(); s.farm.plots[0] = { cropId: 'lingmi', readyAt: now + 60000 }; s.daily.help = { id: 'help-1', author_name: 'QA' };
check(claimHelp(s).ok && s.farm.plots[0].readyAt === now, 'care shortens one crop without going before current time');
check(!claimHelp(s).ok, 'care cannot be claimed twice');
s = fresh(); s.ranch.slots[0] = { beastId: 'lingji', acc: 44 * 60000, pending: 0 }; s.daily.help = { id: 'help-2' };
check(claimHelp(s).ok && s.ranch.slots[0].pending === 2 && s.ranch.slots[0].acc === 0, 'care actually advances ranch accumulator by at most remainder of one cycle');
s = fresh(); s.daily.help = { id: 'help-3' }; check(!claimHelp(s).ok && s.daily.help, 'empty farm and ranch do not consume care');
s = fresh(); s.side = 'modern'; const egg = commissionBoard(s).find(x => x.id === 'breakfast-eggs');
check(egg && egg.reward === 160 && egg.itemName === '灵鸡蛋', 'ranch produce has explicit modern destination and fixed reward');
check(acceptCommission(s, egg.id).ok, 'optional commission can be accepted');
const second = commissionBoard(s, 'cultivation')[0]; check(acceptCommission(s, second.id).ok, 'commission in other world can be accepted');
check(!acceptCommission(s, 'lab-grain').ok && s.commissions.active.length === 2, 'at most two tracked commissions');
check(abandonCommission(s, second.id).ok, 'abandoning a commission has no cost');
const lockedReward = s.commissions.active[0].reward;
s.world.clockMs += 86400000; check(commissionBoard(s).find(x => x.id === egg.id).accepted.reward === lockedReward, 'accepted commission survives refresh and locks reward');
addItem(s, 'lingjidan', 4); const funds = s.currency.cny;
check(fulfillCommission(s, egg.id).ok && countOf(s, 'lingjidan') === 0 && s.currency.cny === funds + 160, 'delivery consumes exact produce and credits reward');
check(!fulfillCommission(s, egg.id).ok && s.commissions.total === 1, 'no double delivery');
check(s.commissions.sources.includes('ranch') && s.commissions.history[0].title === egg.title, 'completion records source and receipt');
check(!acceptCommission(s, 'shop-rice').ok, 'shop supply requires an owned shop');
s.estate.shops = 1; check(acceptCommission(s, 'shop-rice').ok, 'owning shop opens supply commission');
s.world.clockMs += 72 * 3600000; commissionBoard(s); check(s.commissions.active.length === 0, 'expired commissions release tracking slots');
s = fresh(); s.currency.stone = 1000; check(buyBeast(s, 'lingji').ok, 'ranch animal can be bought');
check(collectionSections(s).find(x => x.id === 'ranch').rows.find(x => x.id === 'lingji').unlocked, 'ranch animal unlocks persistent collection');
s.ranch.slots = [null, null]; check(collectionSections(s).find(x => x.id === 'ranch').rows[0].unlocked, 'releasing livestock does not erase discovery');
for (const [arc, choices, worlds, ending] of [
 ['broken_relay', [0, 0, 0], ['modern', 'cultivation', 'modern'], 'aid'],
 ['broken_relay', [0, 1, 0], ['modern', 'cultivation', 'modern'], 'search'],
 ['broken_relay', [1, 0, 0], ['modern', 'modern', 'cultivation'], 'carry'],
 ['broken_relay', [1, 1, 0], ['modern', 'modern', 'modern'], 'keep'],
 ['clinic_lights', [0, 0, 0], ['modern', 'cultivation', 'modern'], 'care'],
 ['clinic_lights', [1, 0, 0], ['modern', 'cultivation', 'modern'], 'study'],
]) {
 s = fresh(); s.player.stage = 2;
 for (let i = 0; i < choices.length; i++) {
  s.side = worlds[i]; s.world.clockMs = now + i * 86400000;
  check(followStory(s, arc).ok, `${arc}/${ending} eligible chapter opens`);
  check(resolveTale(s, choices[i]).ok, `${arc}/${ending} choice resolves`);
 }
 const entry = storyJournal(s).find(x => x.id === arc);
 check(entry.done && s.tales.flags[entry.done ? entry.id === 'broken_relay' ? 'relay_complete' : 'clinic_complete' : ''] === ending, `${arc}/${ending} choices preserve distinct ending`);
 check(!followStory(s, arc).ok && !talesFor(s.side, 2, s).some(x => x.arc === arc), `${arc}/${ending} completed chapters cannot repeat`);
}
s = fresh(); followStory(s, 'broken_relay'); check(!followStory(s, 'broken_relay').ok, 'pending event blocks second chapter');
resolveTale(s, 0); s.side = 'cultivation'; check(!followStory(s, 'broken_relay').ok, 'three hour pacing prevents instant chain reward');
check(!followStory(s, 'arbitrary-story').ok, 'client cannot request arbitrary event or grant');
console.log(JSON.stringify({ passed: n }));
