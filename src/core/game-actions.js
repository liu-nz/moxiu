import * as trade from '../systems/trade.js';
import * as rift from '../systems/rift.js';
import * as cargo from '../systems/cargo.js';
import * as gear from '../systems/gear.js';
import * as cultivation from '../systems/cultivation.js';
import * as modern from '../systems/modern.js';
import * as farm from '../systems/farm.js';
import * as ranch from '../systems/ranch.js';
import * as beasts from '../systems/beasts.js';
import * as alchemy from '../systems/alchemy.js';
import * as forging from '../systems/forging.js';
import * as research from '../systems/research.js';
import * as estate from '../systems/estate.js';
import * as industries from '../systems/industries.js';
import * as projects from '../systems/projects.js';
import * as finance from '../systems/finance.js';
import * as companion from '../systems/companion.js';
import * as sect from '../systems/sect.js';
import * as guild from '../systems/guild.js';
import * as reincarnation from '../systems/reincarnation.js';
import * as lifestyle from '../systems/lifestyle.js';
import * as commissions from '../systems/commissions.js';
import * as objectives from '../systems/objectives.js';
import * as tutorial from '../systems/tutorial.js';
import * as dungeon from '../systems/dungeon.js';
import * as tales from '../systems/tales.js';
import * as tradehouse from '../systems/tradehouse.js';
import * as build from '../systems/build.js';
import * as daily from '../systems/daily.js';

// Explicit player commands only; no reward, tick or state-import helpers.
export const actions = Object.freeze({
  'build.selectBuild': {run:build.selectBuild,min:1,max:1},
  'build.inscribeAffix': {run:build.inscribeAffix,min:2,max:2},
  'build.createPowerArmor': {run:build.createPowerArmor,min:0,max:0},
  'build.lockQuote': {run:build.lockQuote,min:1,max:1},
  'build.setTactic': {run:build.setTactic,min:1,max:1},
  'build.setTraining': {run:build.setTraining,min:1,max:1},
  'build.transferStat': {run:build.transferStat,min:3,max:3},
  'trade.buy': { run: trade.buy, min: 2, max: 3 },
  'trade.sellOne': { run: trade.sellOne, min: 3, max: 3 },
  'trade.sellAllForeign': { run: trade.sellAllForeign, min: 1, max: 1 },
  'trade.buyConsumable': { run: trade.buyConsumable, min: 1, max: 1 },
  'trade.dropEntry': { run: trade.dropEntry, min: 1, max: 2 },
  'rift.cross': { run: rift.cross, min: 1, max: 1 },
  'cargo.depositCargo': { run: cargo.depositCargo, min: 2, max: 2 },
  'cargo.withdrawCargo': { run: cargo.withdrawCargo, min: 3, max: 3 },
  'gear.equipItem': { run: gear.equipItem, min: 1, max: 1 },
  'gear.unequip': { run: gear.unequip, min: 1, max: 1 },
  'gear.enhance': { run: gear.enhance, min: 1, max: 1 },
  'gear.scrapEquipment': { run: gear.scrapEquipment, min: 1, max: 1 },
  'gear.switchPath': { run: gear.switchPath, min: 1, max: 1 },
  'gear.equipTech': { run: gear.equipTech, min: 1, max: 1 },
  'gear.unequipTech': { run: gear.unequipTech, min: 1, max: 1 },
  'gear.equipSkill': { run: gear.equipSkill, min: 2, max: 2 },
  'gear.unequipSkill': { run: gear.unequipSkill, min: 1, max: 1 },
  'gear.upgradeSkill': { run: gear.upgradeSkill, min: 1, max: 1 },
  'gear.scrapSkill': { run: gear.scrapSkill, min: 1, max: 1 },
  'gear.useConsumable': { run: gear.useConsumable, min: 1, max: 2 },
  'cultivation.attemptBreakthrough': { run: cultivation.attemptBreakthrough, min: 0, max: 0 },
  'cultivation.setBreakthroughAutomation': { run: cultivation.setBreakthroughAutomation, min: 1, max: 1 },
  'modern.chooseJob': { run: modern.chooseJob, min: 1, max: 1 },
  'modern.upgradeJob': { run: modern.upgradeJob, min: 0, max: 0 },
  'modern.upgradeBusiness': { run: modern.upgradeBusiness, min: 0, max: 0 },
  'modern.toggleWork': { run: modern.toggleWork, min: 0, max: 0 },
  'farm.plant': { run: farm.plant, min: 2, max: 2 },
  'farm.plantAll': { run: farm.plantAll, min: 1, max: 1 },
  'farm.harvest': { run: farm.harvest, min: 1, max: 2 },
  'farm.harvestAll': { run: farm.harvestAll, min: 0, max: 0 },
  'farm.buyPlot': { run: farm.buyPlot, min: 0, max: 0 },
  'farm.setPlotPlan': { run: farm.setPlotPlan, min: 2, max: 2 },
  'farm.setFarmAutomation': { run: farm.setFarmAutomation, min: 0, max: 1 },
  'ranch.buyBeast': { run: ranch.buyBeast, min: 1, max: 1 },
  'ranch.buySlot': { run: ranch.buySlot, min: 0, max: 0 },
  'ranch.collect': { run: ranch.collect, min: 1, max: 1 },
  'ranch.collectAll': { run: ranch.collectAll, min: 0, max: 1 },
  'ranch.removeBeast': { run: ranch.removeBeast, min: 1, max: 1 },
  'ranch.setRanchAutoCollect': { run: ranch.setRanchAutoCollect, min: 1, max: 1 },
  'beasts.deploy': { run: beasts.deploy, min: 1, max: 2 },
  'beasts.undeploy': { run: beasts.undeploy, min: 1, max: 1 },
  'beasts.upgrade': { run: beasts.upgrade, min: 1, max: 1 },
  'beasts.release': { run: beasts.release, min: 1, max: 1 },
  'alchemy.craft': { run: alchemy.craft, min: 1, max: 3 },
  'alchemy.setAlchemyPlan': { run: alchemy.setAlchemyPlan, min: 0, max: 1 },
  'forging.forge': { run: forging.forge, min: 2, max: 2 },
  'research.doResearch': { run: research.doResearch, min: 1, max: 1 },
  'research.upgradeLab': { run: research.upgradeLab, min: 0, max: 0 },
  'research.exchangeMaterial': { run: research.exchangeMaterial, min: 1, max: 2 },
  'estate.buyEstate': { run: estate.buyEstate, min: 1, max: 1 },
  'estate.buyShop': { run: estate.buyShop, min: 0, max: 0 },
  'estate.upgradeWarehouse': { run: estate.upgradeWarehouse, min: 0, max: 0 },
  'estate.toggleAutoSell': { run: estate.toggleAutoSell, min: 0, max: 0 },
  'estate.setShopPolicy': { run: estate.setShopPolicy, min: 0, max: 1 },
  'industries.buildIndustry': { run: industries.buildIndustry, min: 1, max: 1 },
  'industries.setIndustryRunning': { run: industries.setIndustryRunning, min: 2, max: 2 },
  'industries.stockIndustry': { run: industries.stockIndustry, min: 1, max: 1 },
  'projects.start': { run: projects.start, min: 1, max: 1 },
  'projects.setProjectTarget': { run: projects.setProjectTarget, min: 1, max: 1 },
  'finance.setInvestmentReserve': { run: finance.setInvestmentReserve, min: 1, max: 1 },
  'companion.meet': { run: companion.meet, min: 1, max: 1 },
  'companion.gift': { run: companion.gift, min: 1, max: 1 },
  'sect.joinSect': { run: sect.joinSect, min: 1, max: 1 },
  'sect.leaveSect': { run: sect.leaveSect, min: 0, max: 0 },
  'sect.promote': { run: sect.promote, min: 0, max: 0 },
  'sect.claimQuest': { run: sect.claimQuest, min: 1, max: 1 },
  'sect.claimAllQuests': { run: sect.claimAllQuests, min: 0, max: 0 },
  'sect.tribute': { run: sect.tribute, min: 1, max: 2 },
  'sect.buySecret': { run: sect.buySecret, min: 1, max: 1 },
  'sect.challengeTournament': { run: sect.challengeTournament, min: 0, max: 0 },
  'guild.joinGuild': { run: guild.joinGuild, min: 1, max: 1 },
  'guild.leaveGuild': { run: guild.leaveGuild, min: 0, max: 0 },
  'guild.claimQuest': { run: guild.claimQuest, min: 1, max: 1 },
  'guild.claimAllQuests': { run: guild.claimAllQuests, min: 0, max: 0 },
  'guild.buyFromShop': { run: guild.buyFromShop, min: 1, max: 1 },
  'guild.challengeBoss': { run: guild.challengeBoss, min: 0, max: 1 },
  'guild.joinChamber': { run: guild.joinChamber, min: 0, max: 0 },
  'reincarnation.ascend': { run: reincarnation.ascend, min: 0, max: 0 },
  'reincarnation.chooseFate': { run: reincarnation.chooseFate, min: 1, max: 1 },
  'reincarnation.buyBlessing': { run: reincarnation.buyBlessing, min: 1, max: 1 },
  'lifestyle.upgrade': { run: lifestyle.upgrade, min: 1, max: 1 },
  'lifestyle.upgradeAll': { run: lifestyle.upgradeAll, min: 1, max: 1 },
  'commissions.fulfillCommission': { run: commissions.fulfillCommission, min: 1, max: 1 },
  'commissions.acceptCommission': { run: commissions.acceptCommission, min: 1, max: 1 },
  'commissions.abandonCommission': { run: commissions.abandonCommission, min: 1, max: 1 },
  'daily.signIn': { run: daily.signIn, min: 0, max: 0 },
  'daily.claimHelp': { run: daily.claimHelp, min: 0, max: 0 },
  'tales.followStory': { run: tales.followStory, min: 1, max: 1 },
  'objectives.setObjective': { run: objectives.setObjective, min: 1, max: 1 },
  'tutorial.skipTutorial': { run: tutorial.skipTutorial, min: 0, max: 0 },
  'dungeon.runDungeon': { run: dungeon.runDungeon, min: 2, max: 3 },
  'dungeon.setAutoBattle': { run: dungeon.setAutoBattle, min: 3, max: 3 },
  'dungeon.setMaterialTarget': { run: dungeon.setMaterialTarget, min: 2, max: 2 },
  'tales.resolveTale': { run: tales.resolveTale, min: 1, max: 1 },
  'tradehouse.expandSlots': { run: tradehouse.expandSlots, min: 0, max: 0 },
  'tradehouse.list': { run: tradehouse.list, min: 4, max: 4 },
  'tradehouse.unlist': { run: tradehouse.unlist, min: 1, max: 1 },
});
