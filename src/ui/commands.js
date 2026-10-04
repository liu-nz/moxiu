import { actions } from '../core/game-actions.js';
import { isAuthoritative, dispatchAction } from '../core/authority.js';

export function trade_buy(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'trade.buy', args) : actions['trade.buy'].run(state, ...args); }
export function trade_sellOne(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'trade.sellOne', args) : actions['trade.sellOne'].run(state, ...args); }
export function trade_sellAllForeign(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'trade.sellAllForeign', args) : actions['trade.sellAllForeign'].run(state, ...args); }
export function trade_buyConsumable(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'trade.buyConsumable', args) : actions['trade.buyConsumable'].run(state, ...args); }
export function trade_dropEntry(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'trade.dropEntry', args) : actions['trade.dropEntry'].run(state, ...args); }
export function rift_cross(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'rift.cross', args) : actions['rift.cross'].run(state, ...args); }
export function cargo_depositCargo(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'cargo.depositCargo', args) : actions['cargo.depositCargo'].run(state, ...args); }
export function cargo_withdrawCargo(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'cargo.withdrawCargo', args) : actions['cargo.withdrawCargo'].run(state, ...args); }
export function gear_equipItem(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.equipItem', args) : actions['gear.equipItem'].run(state, ...args); }
export function gear_unequip(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.unequip', args) : actions['gear.unequip'].run(state, ...args); }
export function gear_enhance(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.enhance', args) : actions['gear.enhance'].run(state, ...args); }
export function gear_scrapEquipment(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.scrapEquipment', args) : actions['gear.scrapEquipment'].run(state, ...args); }
export function gear_switchPath(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.switchPath', args) : actions['gear.switchPath'].run(state, ...args); }
export function gear_equipTech(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.equipTech', args) : actions['gear.equipTech'].run(state, ...args); }
export function gear_unequipTech(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.unequipTech', args) : actions['gear.unequipTech'].run(state, ...args); }
export function gear_equipSkill(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.equipSkill', args) : actions['gear.equipSkill'].run(state, ...args); }
export function gear_unequipSkill(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.unequipSkill', args) : actions['gear.unequipSkill'].run(state, ...args); }
export function gear_upgradeSkill(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.upgradeSkill', args) : actions['gear.upgradeSkill'].run(state, ...args); }
export function gear_scrapSkill(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.scrapSkill', args) : actions['gear.scrapSkill'].run(state, ...args); }
export function gear_useConsumable(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'gear.useConsumable', args) : actions['gear.useConsumable'].run(state, ...args); }
export function cultivation_attemptBreakthrough(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'cultivation.attemptBreakthrough', args) : actions['cultivation.attemptBreakthrough'].run(state, ...args); }
export function cultivation_setBreakthroughAutomation(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'cultivation.setBreakthroughAutomation', args) : actions['cultivation.setBreakthroughAutomation'].run(state, ...args); }
export function modern_chooseJob(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'modern.chooseJob', args) : actions['modern.chooseJob'].run(state, ...args); }
export function modern_upgradeJob(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'modern.upgradeJob', args) : actions['modern.upgradeJob'].run(state, ...args); }
export function modern_upgradeBusiness(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'modern.upgradeBusiness', args) : actions['modern.upgradeBusiness'].run(state, ...args); }
export function modern_toggleWork(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'modern.toggleWork', args) : actions['modern.toggleWork'].run(state, ...args); }
export function farm_plant(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.plant', args) : actions['farm.plant'].run(state, ...args); }
export function farm_plantAll(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.plantAll', args) : actions['farm.plantAll'].run(state, ...args); }
export function farm_harvest(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.harvest', args) : actions['farm.harvest'].run(state, ...args); }
export function farm_harvestAll(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.harvestAll', args) : actions['farm.harvestAll'].run(state, ...args); }
export function farm_buyPlot(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.buyPlot', args) : actions['farm.buyPlot'].run(state, ...args); }
export function farm_setPlotPlan(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.setPlotPlan', args) : actions['farm.setPlotPlan'].run(state, ...args); }
export function farm_setFarmAutomation(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'farm.setFarmAutomation', args) : actions['farm.setFarmAutomation'].run(state, ...args); }
export function ranch_buyBeast(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.buyBeast', args) : actions['ranch.buyBeast'].run(state, ...args); }
export function ranch_buySlot(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.buySlot', args) : actions['ranch.buySlot'].run(state, ...args); }
export function ranch_collect(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.collect', args) : actions['ranch.collect'].run(state, ...args); }
export function ranch_collectAll(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.collectAll', args) : actions['ranch.collectAll'].run(state, ...args); }
export function ranch_removeBeast(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.removeBeast', args) : actions['ranch.removeBeast'].run(state, ...args); }
export function ranch_setRanchAutoCollect(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'ranch.setRanchAutoCollect', args) : actions['ranch.setRanchAutoCollect'].run(state, ...args); }
export function beasts_deploy(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'beasts.deploy', args) : actions['beasts.deploy'].run(state, ...args); }
export function beasts_undeploy(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'beasts.undeploy', args) : actions['beasts.undeploy'].run(state, ...args); }
export function beasts_upgrade(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'beasts.upgrade', args) : actions['beasts.upgrade'].run(state, ...args); }
export function beasts_release(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'beasts.release', args) : actions['beasts.release'].run(state, ...args); }
export function alchemy_craft(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'alchemy.craft', args) : actions['alchemy.craft'].run(state, ...args); }
export function alchemy_setAlchemyPlan(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'alchemy.setAlchemyPlan', args) : actions['alchemy.setAlchemyPlan'].run(state, ...args); }
export function forging_forge(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'forging.forge', args) : actions['forging.forge'].run(state, ...args); }
export function research_doResearch(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'research.doResearch', args) : actions['research.doResearch'].run(state, ...args); }
export function research_upgradeLab(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'research.upgradeLab', args) : actions['research.upgradeLab'].run(state, ...args); }
export function research_exchangeMaterial(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'research.exchangeMaterial', args) : actions['research.exchangeMaterial'].run(state, ...args); }
export function estate_buyEstate(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'estate.buyEstate', args) : actions['estate.buyEstate'].run(state, ...args); }
export function estate_buyShop(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'estate.buyShop', args) : actions['estate.buyShop'].run(state, ...args); }
export function estate_upgradeWarehouse(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'estate.upgradeWarehouse', args) : actions['estate.upgradeWarehouse'].run(state, ...args); }
export function estate_toggleAutoSell(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'estate.toggleAutoSell', args) : actions['estate.toggleAutoSell'].run(state, ...args); }
export function estate_setShopPolicy(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'estate.setShopPolicy', args) : actions['estate.setShopPolicy'].run(state, ...args); }
export function industries_buildIndustry(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'industries.buildIndustry', args) : actions['industries.buildIndustry'].run(state, ...args); }
export function industries_setIndustryRunning(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'industries.setIndustryRunning', args) : actions['industries.setIndustryRunning'].run(state, ...args); }
export function industries_stockIndustry(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'industries.stockIndustry', args) : actions['industries.stockIndustry'].run(state, ...args); }
export function projects_start(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'projects.start', args) : actions['projects.start'].run(state, ...args); }
export function projects_setProjectTarget(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'projects.setProjectTarget', args) : actions['projects.setProjectTarget'].run(state, ...args); }
export function finance_setInvestmentReserve(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'finance.setInvestmentReserve', args) : actions['finance.setInvestmentReserve'].run(state, ...args); }
export function companion_meet(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'companion.meet', args) : actions['companion.meet'].run(state, ...args); }
export function companion_gift(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'companion.gift', args) : actions['companion.gift'].run(state, ...args); }
export function sect_joinSect(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.joinSect', args) : actions['sect.joinSect'].run(state, ...args); }
export function sect_leaveSect(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.leaveSect', args) : actions['sect.leaveSect'].run(state, ...args); }
export function sect_promote(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.promote', args) : actions['sect.promote'].run(state, ...args); }
export function sect_claimQuest(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.claimQuest', args) : actions['sect.claimQuest'].run(state, ...args); }
export function sect_claimAllQuests(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.claimAllQuests', args) : actions['sect.claimAllQuests'].run(state, ...args); }
export function sect_tribute(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.tribute', args) : actions['sect.tribute'].run(state, ...args); }
export function sect_buySecret(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.buySecret', args) : actions['sect.buySecret'].run(state, ...args); }
export function sect_challengeTournament(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'sect.challengeTournament', args) : actions['sect.challengeTournament'].run(state, ...args); }
export function guild_joinGuild(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.joinGuild', args) : actions['guild.joinGuild'].run(state, ...args); }
export function guild_leaveGuild(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.leaveGuild', args) : actions['guild.leaveGuild'].run(state, ...args); }
export function guild_claimQuest(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.claimQuest', args) : actions['guild.claimQuest'].run(state, ...args); }
export function guild_claimAllQuests(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.claimAllQuests', args) : actions['guild.claimAllQuests'].run(state, ...args); }
export function guild_buyFromShop(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.buyFromShop', args) : actions['guild.buyFromShop'].run(state, ...args); }
export function guild_challengeBoss(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.challengeBoss', args) : actions['guild.challengeBoss'].run(state, ...args); }
export function guild_joinChamber(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'guild.joinChamber', args) : actions['guild.joinChamber'].run(state, ...args); }
export function reincarnation_ascend(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'reincarnation.ascend', args) : actions['reincarnation.ascend'].run(state, ...args); }
export function reincarnation_chooseFate(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'reincarnation.chooseFate', args) : actions['reincarnation.chooseFate'].run(state, ...args); }
export function reincarnation_buyBlessing(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'reincarnation.buyBlessing', args) : actions['reincarnation.buyBlessing'].run(state, ...args); }
export function lifestyle_upgrade(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'lifestyle.upgrade', args) : actions['lifestyle.upgrade'].run(state, ...args); }
export function lifestyle_upgradeAll(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'lifestyle.upgradeAll', args) : actions['lifestyle.upgradeAll'].run(state, ...args); }
export function commissions_fulfillCommission(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'commissions.fulfillCommission', args) : actions['commissions.fulfillCommission'].run(state, ...args); }
export function objectives_setObjective(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'objectives.setObjective', args) : actions['objectives.setObjective'].run(state, ...args); }
export function tutorial_skipTutorial(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tutorial.skipTutorial', args) : actions['tutorial.skipTutorial'].run(state, ...args); }
export function dungeon_runDungeon(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'dungeon.runDungeon', args) : actions['dungeon.runDungeon'].run(state, ...args); }
export function dungeon_setAutoBattle(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'dungeon.setAutoBattle', args) : actions['dungeon.setAutoBattle'].run(state, ...args); }
export function dungeon_setMaterialTarget(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'dungeon.setMaterialTarget', args) : actions['dungeon.setMaterialTarget'].run(state, ...args); }
export function tales_resolveTale(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tales.resolveTale', args) : actions['tales.resolveTale'].run(state, ...args); }
export function tradehouse_expandSlots(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tradehouse.expandSlots', args) : actions['tradehouse.expandSlots'].run(state, ...args); }
export function tradehouse_list(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tradehouse.list', args) : actions['tradehouse.list'].run(state, ...args); }
export function tradehouse_unlist(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tradehouse.unlist', args) : actions['tradehouse.unlist'].run(state, ...args); }

export function commissions_acceptCommission(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'commissions.acceptCommission', args) : actions['commissions.acceptCommission'].run(state, ...args); }

export function commissions_abandonCommission(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'commissions.abandonCommission', args) : actions['commissions.abandonCommission'].run(state, ...args); }

export function daily_signIn(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'daily.signIn', args) : actions['daily.signIn'].run(state, ...args); }

export function daily_claimHelp(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'daily.claimHelp', args) : actions['daily.claimHelp'].run(state, ...args); }

export function tales_followStory(state, ...args) { return isAuthoritative(state) ? dispatchAction(state, 'tales.followStory', args) : actions['tales.followStory'].run(state, ...args); }

export function build_setTactic(state,...args) { return isAuthoritative(state) ? dispatchAction(state,'build.setTactic',args) : actions['build.setTactic'].run(state,...args); }

export function build_setTraining(state,...args) { return isAuthoritative(state) ? dispatchAction(state,'build.setTraining',args) : actions['build.setTraining'].run(state,...args); }

export function build_transferStat(state,...args) { return isAuthoritative(state) ? dispatchAction(state,'build.transferStat',args) : actions['build.transferStat'].run(state,...args); }

export function build_lockQuote(state,...args) {return isAuthoritative(state) ? dispatchAction(state,'build.lockQuote',args) : actions['build.lockQuote'].run(state,...args);}

export function build_createPowerArmor(state,...args) {return isAuthoritative(state) ? dispatchAction(state,'build.createPowerArmor',args) : actions['build.createPowerArmor'].run(state,...args);}

export function build_selectBuild(state,...args){return isAuthoritative(state)?dispatchAction(state,'build.selectBuild',args):actions['build.selectBuild'].run(state,...args);}

export function build_inscribeAffix(state,...args){return isAuthoritative(state)?dispatchAction(state,'build.inscribeAffix',args):actions['build.inscribeAffix'].run(state,...args);}
