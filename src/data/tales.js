import {worldState} from './worldStates.js';
/**
 * tales.js —— 奇闻事件（GDD 14.1）
 *
 * 随机触发的小事件，玩家上线时可能遇到，做选择获得奖励或损失。
 * 事件效果里的 stone / cny / cult 数值会随境界放大（scale: true），
 * 避免后期遇到「捡到 50 灵石」这种毫无意义的文本。
 */

import { EXTRA_TALES } from './tales-extra.js';
import { STORY_TALES } from './stories.js';

export const TALES = [
  ...EXTRA_TALES,
  ...STORY_TALES,
  {
    id: 'sealed_letter', name: '封存的来信', world: 'any', arc: 'broken_relay', blockedFlag: 'broken_relay',
    text: '界门附近的旧驿站夹着一封未寄出的信。纸上只有一句：“若两界仍能互通，请把这封信交给青云城的药师。”',
    choices: [
      { label: '替寄信人送到药师手里', result: '你把信收进衣襟，决定沿着留下的印记追查寄信人。', effect: { rp: 3 }, flags: { broken_relay: 'deliver' } },
      { label: '先交给驿站保管', result: '驿站老板认得纸上的徽记，答应查一查旧账簿。', effect: { cny: 100, scale: true }, flags: { broken_relay: 'archive' } },
    ],
  },
  {
    id: 'sealed_letter_followup', name: '药师的回信', world: 'cultivation', arc: 'broken_relay', requiresFlag: 'broken_relay:deliver', blockedFlag: 'broken_relay_ending',
    text: '青云城的药师认出信上的字迹。那是多年前失踪的弟子写的，信里记着一批留给病患的灵药。',
    choices: [
      { label: '把药材交给城中义诊', result: '义诊棚收下药材，药师答应将弟子的事继续查下去。', effect: { items: [{ id: 'huangjing', qty: 2 }] }, flags: { broken_relay_ending: 'aid' } },
      { label: '请药师继续寻找弟子', result: '药师留下联络暗号，约定找到人后再告知你。', effect: { rp: 8 }, flags: { broken_relay_ending: 'search' } },
    ],
  },
  {
    id: 'sealed_letter_archive', name: '驿站旧账', world: 'modern', arc: 'broken_relay', requiresFlag: 'broken_relay:archive', blockedFlag: 'broken_relay_ending',
    text: '驿站老板翻出一册旧账：当年有人带着药材穿过界门，之后再没回来。信件地址仍指向青云城。',
    choices: [
      { label: '亲自把信送去', result: '旧账里附着一枚通行符。老板托你把信和符一并送回修仙界。', effect: { cny: 120, scale: true }, flags: { broken_relay_ending: 'carry' } },
      { label: '留下通行符作纪念', result: '你把通行符收入收藏，信件留在驿站等待下一位旅人。', effect: { rp: 6 }, flags: { broken_relay_ending: 'keep' } },
    ],
  },
  /* ================= 修仙界 ================= */
  {
    id: 'ancient_book', name: '古书残卷', world: 'cultivation',
    text: '路边的泥里露出半本书角。抽出来一看，纸已经烂了大半，只剩中间几页还能认。',
    choices: [
      { label: '带回去慢慢研究', result: '你花了半夜把残页抄了一遍，居然真拼出一段吐纳法。', effect: { cult: 800, scale: true } },
      { label: '拿到坊市卖掉', result: '书贩子只肯给个低价，说「残卷不值钱」。你还是卖了。', effect: { stone: 120, scale: true } },
    ],
  },
  {
    id: 'wandering_cultivator', name: '散修请教', world: 'cultivation',
    text: '一个背着破剑的散修拦住你，说看你气息稳，想请教一个问题。',
    choices: [
      { label: '认真答他', result: '他听完抱拳道谢，塞给你一小袋灵石就走了。', effect: { stone: 150, scale: true } },
      { label: '敷衍两句', result: '他看出你不想搭理，笑了笑走开。你有点后悔。', effect: {} },
    ],
  },
  {
    id: 'old_man_bones', name: '骨骼惊奇', world: 'cultivation',
    text: '街边一个老头盯着你看了半天，说：「小友骨骼惊奇，可惜来晚了三十年。」',
    choices: [
      { label: '请他喝酒细聊', result: '老头喝到一半睡着了。醒来后留下一张纸条，上面是一段口诀。', effect: { cult: 1200, scale: true, cny: -30 } },
      { label: '客气告辞', result: '你走了。回头时老头已经不见了。', effect: {} },
    ],
  },
  {
    id: 'spirit_spring', name: '灵泉一眼', world: 'cultivation',
    text: '山道旁的岩缝里冒出一小股泉水，靠近时毛孔都在发麻——是灵泉。',
    choices: [
      { label: '灌满水囊', result: '灵泉水带回去兑进丹炉，药效好了不少。', effect: { items: [{ id: 'huangjing', qty: 4 }] } },
      { label: '就地打坐吸收', result: '你在泉边坐了两个时辰，修为涨了一截。', effect: { cult: 1500, scale: true } },
    ],
  },
  {
    id: 'hurt_beast', name: '受伤的灵兽', world: 'cultivation',
    text: '一只小灵兽卡在石缝里，后腿流着血，看见你也没跑。',
    choices: [
      { label: '替它包扎', result: '它舔了舔你的手，钻回林子里了。走前在地上刨了两下。', effect: { items: [{ id: 'yaodan', qty: 1 }] } },
      { label: '不惹麻烦', result: '你绕开了。走出很远还能听见它的叫声。', effect: {} },
    ],
  },
  {
    id: 'gambling_den', name: '坊市赌坊', world: 'cultivation',
    text: '坊市角落的赌坊里人声鼎沸。庄家是个笑眯眯的胖子，说新手运气好。',
    choices: [
      { label: '押一把小的', result: '你赢了。胖子笑得有点勉强。', effect: { roll: { chance: 0.45, success: { stone: 300, scale: true }, fail: { stone: -150, scale: true } } } },
      { label: '不赌', result: '你转身走了。身后有人输光了本钱在骂街。', effect: {} },
    ],
  },
  {
    id: 'black_market', name: '黑市摊主', world: 'cultivation',
    text: '一个蒙面摊主压低声音：「这枚妖丹来路不太正，但价钱好商量。」',
    choices: [
      { label: '低价买下', result: '你买了。妖丹的灵气很足，就是沾着点血。', effect: { items: [{ id: 'yaodan', qty: 2 }], stone: -120 } },
      { label: '掉头就走', result: '你走了。摊主在背后喊了两句，也没追。', effect: {} },
    ],
  },
  {
    id: 'street_quarrel', name: '当街争执', world: 'cultivation',
    text: '两个修士为了谁先看到一株灵草吵了起来，眼看就要动手。',
    choices: [
      { label: '上前劝架', result: '两人各退一步。其中一人塞给你一株草当谢礼。', effect: { items: [{ id: 'huangjing', qty: 3 }] } },
      { label: '等他们打完再捡漏', result: '两人打得两败俱伤，灵草被踩烂了。你捡到一块碎玉。', effect: { items: [{ id: 'yinjing', qty: 1 }] } },
    ],
  },
  {
    id: 'rainy_shelter', name: '雨夜借宿', world: 'cultivation',
    text: '山雨来得急。你敲开一户农家的门，老两口什么也没问就让你进了屋。',
    choices: [
      { label: '留下些灵石', result: '老太太执意给你装了满满一袋灵米。', effect: { items: [{ id: 'lingmi', qty: 8 }], stone: -60 } },
      { label: '只借一宿', result: '你睡了个好觉，天亮前悄悄走了。', effect: { stamina: 20 } },
    ],
  },
  {
    id: 'tomb_sword_song', name: '剑冢异动', world: 'cultivation',
    text: '路过剑冢时，风里传来细密的剑鸣，像是上万把剑在同时颤。',
    choices: [
      { label: '走近听', result: '剑鸣里有一段韵律。你把它记住了。', effect: { cult: 2000, scale: true } },
      { label: '远远绕开', result: '你绕开了。身后剑鸣骤停，山谷安静得可怕。', effect: {} },
    ],
  },
  {
    id: 'herb_garden_tea', name: '药园老者', world: 'cultivation',
    text: '药园的老者招手让你进去喝茶，说他很久没见过生面孔了。',
    choices: [
      { label: '坐下喝茶', result: '茶很苦。喝完却觉得神清气爽，他随手摘了几味药给你。', effect: { items: [{ id: 'bainian', qty: 2 }] } },
      { label: '婉拒', result: '你谢过老人继续赶路。回头时药园的门已经关上了。', effect: {} },
    ],
  },
  {
    id: 'arena', name: '坊市擂台', world: 'cultivation',
    text: '坊市擂台挂着彩头：胜三场，得灵石五十。台下已经围了一圈人。',
    choices: [
      { label: '上台试试', result: '你连胜两场，第三场输得很干脆，但彩头还是给了一半。', effect: { roll: { chance: 0.55, success: { stone: 400, scale: true }, fail: { stone: 80, stamina: -15 } } } },
      { label: '当观众', result: '你在台下看了一下午，学到了两招。', effect: { cult: 600, scale: true } },
    ],
  },
  {
    id: 'bounty_board', name: '悬赏榜', world: 'cultivation',
    text: '坊市口的悬赏榜上贴着一张新榜：城南有妖物作乱，赏灵石三百。',
    choices: [
      { label: '接下这活', result: '你花了一天找到那东西——是只受伤的灵鹿，赶走就完事了。赏钱照拿。', effect: { stone: 300, scale: true, stamina: -20 } },
      { label: '撕下来卖情报', result: '你把情报转手卖给了另一个修士，小赚一笔。', effect: { stone: 90, scale: true } },
    ],
  },
  {
    id: 'caravan_raid', name: '落难的商队', world: 'cultivation',
    text: '一队商人在山道被劫了，货物散了一地，人倒是都还在。',
    choices: [
      { label: '帮他们收拾', result: '商队头领千恩万谢，硬塞给你几件货当谢礼。', effect: { items: [{ id: 'lingmi', qty: 5 }, { id: 'huangjing', qty: 2 }] } },
      { label: '趁乱捡走一些', result: '你捡了几件没人注意的货。走的时候没敢回头。', effect: { items: [{ id: 'juqi', qty: 3 }], karma: -1 } },
    ],
  },
  {
    id: 'abandoned_cave', name: '废弃洞府', world: 'cultivation',
    text: '山壁上有个半塌的洞府，门口的禁制早就失效了。',
    choices: [
      { label: '进去探一探', result: '里面只剩一张石床和一具枯骨。床头放着一枚玉简。', effect: { roll: { chance: 0.6, success: { items: [{ id: 'yinjing', qty: 2 }], cult: 1500 }, fail: { cult: 300, stamina: -25 } } } },
      { label: '不进去', result: '你走开了。第二天听说洞府塌了。', effect: {} },
    ],
  },
  {
    id: 'sermon', name: '高人讲经', world: 'cultivation',
    text: '城中广场上有人在讲经，围了三四百人，连屋顶上都坐满了。',
    choices: [
      { label: '挤进去听', result: '你听了一整天。有些地方没听懂，但确实有用。', effect: { cult: 2500, scale: true } },
      { label: '在外面听个大概', result: '你在外围站了半个时辰，记下了几句。', effect: { cult: 700, scale: true } },
    ],
  },
  {
    id: 'beast_market', name: '妖兽集市', world: 'cultivation',
    text: '妖兽集市今天开市，笼子里关着各式各样的幼兽，叫声此起彼伏。',
    choices: [
      { label: '买一只幼兽', result: '你挑了只看着顺眼的，摊主说它「有灵性」。', effect: { stone: -400, items: [{ id: 'yaodan', qty: 1 }] } },
      { label: '只看不买', result: '你在集市里转了一圈，摸清了行情。', effect: { cult: 400, scale: true } },
    ],
  },
  {
    id: 'stone_tablet', name: '古碑文字', world: 'cultivation',
    text: '荒野里立着一块古碑，字迹已经风化得看不清了。你只认出几个。',
    choices: [
      { label: '拓下来', result: '你把碑文拓在布上带回去，对照着看了一整夜。', effect: { cult: 1800, scale: true } },
      { label: '拍张照（现代手机）', result: '你掏出手机拍了照。回到现代用软件放大处理，字居然认全了。', effect: { cult: 3000, scale: true } },
    ],
  },
  {
    id: 'night_watchman', name: '深夜打更人', world: 'cultivation',
    text: '三更天，打更人敲着梆子走过长街。他经过你身边时停了一下。',
    choices: [
      { label: '问他城中传闻', result: '他压低声音说了件旧事，末了说「信不信随你」。', effect: { cult: 900, scale: true } },
      { label: '给他几块灵石', result: '他愣了愣，把梆子递给你敲了一下，说「沾沾喜气」。', effect: { stone: -50, cult: 1400, scale: true } },
    ],
  },
  {
    id: 'apothecary_mistake', name: '药铺算错账', world: 'cultivation',
    text: '药铺伙计把账算错了，多找给你一大把灵石。他还没发现。',
    choices: [
      { label: '还回去', result: '伙计红着脸道谢，掌柜的送了你两味药。', effect: { items: [{ id: 'huangjing', qty: 4 }] } },
      { label: '揣走', result: '你揣走了。走出三条街，心里还是不太舒服。', effect: { stone: 200, scale: true, karma: -1 } },
    ],
  },
  {
    id: 'cliff_herb', name: '悬崖采药人', world: 'cultivation',
    text: '一个采药人吊在悬崖上，绳子快磨断了，他还在往上够一株草。',
    choices: [
      { label: '拉他上来', result: '他上来后把采到的草分了你一半，说「这东西值钱」。', effect: { items: [{ id: 'bainian', qty: 2 }], stamina: -15 } },
      { label: '帮他够那株草', result: '你用灵力把草摘了下来。他看得目瞪口呆。', effect: { items: [{ id: 'bainian', qty: 3 }] } },
    ],
  },
  {
    id: 'hunted_cultivator', name: '被追杀的修士', world: 'cultivation',
    text: '一个人浑身是血地冲进巷子，看见你，把一枚玉简塞进你手里就跑了。',
    choices: [
      { label: '藏好玉简', result: '追兵没找到你。玉简里是一套功法残篇。', effect: { cult: 2200, scale: true } },
      { label: '交给追兵', result: '追兵拿了玉简，给了你一笔封口费，警告你别多嘴。', effect: { stone: 350, scale: true, karma: -1 } },
    ],
  },
  {
    id: 'field_thief', name: '灵田被偷吃', world: 'cultivation',
    text: '你的灵田边上有新鲜的脚印，几株灵米被啃掉了穗子。',
    choices: [
      { label: '顺着脚印追', result: '是只半大的灵兔。你把它赶走，顺手捡回了它藏起来的东西。', effect: { items: [{ id: 'lingmi', qty: 3 }, { id: 'yinjing', qty: 1 }] } },
      { label: '在田边设个阵', result: '你花了点灵石布了个简易阵法，之后就没再丢过。', effect: { stone: -80, buff: { name: '灵田守阵', mods: { cultSpeed: 0.05 }, durationMs: 6 * 3600 * 1000 } } },
    ],
  },
  {
    id: 'gate_hum', name: '界门异响', world: 'cultivation',
    text: '夜里界门方向传来低沉的嗡鸣，像有什么东西在另一侧敲。',
    choices: [
      { label: '贴近听', result: '嗡鸣里混着人声，你听清了一句：「……价差三倍。」', effect: { buff: { name: '界感', mods: { tradeProfit: 0.15 }, durationMs: 8 * 3600 * 1000 } } },
      { label: '退开', result: '你退开了。嗡鸣持续了半炷香，然后停了。', effect: {} },
    ],
  },

  /* ================= 现代都市 ================= */
  {
    id: 'flyer', name: '地铁口传单', world: 'modern',
    text: '地铁口有人在发传单，塞给你一张，是家新开的保健品公司。',
    choices: [
      { label: '随手看看', result: '你翻了两页，发现他们在收「不明来源的药材」。留了个联系方式。', effect: { cny: 400, scale: true } },
      { label: '丢进垃圾桶', result: '你丢了。走出两步又觉得那纸上的图案有点眼熟。', effect: {} },
    ],
  },
  {
    id: 'old_classmate', name: '老同学', world: 'modern',
    text: '在便利店门口撞见老同学。他现在做外贸，说最近在找「有故事的货」。',
    choices: [
      { label: '聊聊', result: '他当场下了个小单，说以后有货直接找他。', effect: { cny: 800, scale: true } },
      { label: '说改天再约', result: '你留了电话。他挥挥手走了，背影比记忆里胖了一圈。', effect: {} },
    ],
  },
  {
    id: 'flea_market', name: '二手市场', world: 'modern',
    text: '周末的二手市场人挤人。一个摊子上摆着几件说不出年代的东西。',
    choices: [
      { label: '淘一件', result: '你花小钱买了个铜盒，回去一打开，里面是枚旧戒指。', effect: { cny: -200, items: [{ id: 'gufaqi', qty: 1 }] } },
      { label: '只逛逛', result: '你逛了一圈，摸清了行情。', effect: { cny: 100, scale: true } },
    ],
  },
  {
    id: 'late_night', name: '深夜加班', world: 'modern',
    text: '凌晨两点，办公室只剩你一个人。窗外城市的灯还亮着。',
    choices: [
      { label: '继续干', result: '你干到天亮，项目过了。绩效奖金到账。', effect: { cny: 1200, scale: true, stamina: -20 } },
      { label: '回家睡觉', result: '你回家了。路上买了份夜宵，睡得特别沉。', effect: { stamina: 25 } },
    ],
  },
  {
    id: 'lottery', name: '一张彩票', world: 'modern',
    text: '便利店老板说这期奖池特别大，问你要不要来一张。',
    choices: [
      { label: '买一张', result: '你买了。刮开的时候手有点抖。', effect: { roll: { chance: 0.08, success: { cny: 8000, scale: true }, fail: { cny: -20 } } } },
      { label: '不买', result: '你没买。第二天开奖，号码和你想的完全不一样。', effect: {} },
    ],
  },
  {
    id: 'auction', name: '拍卖会', world: 'modern',
    text: '一场小型拍卖会对外开放。压轴那件东西被描述为「来源不明的东方器物」。',
    choices: [
      { label: '举牌', result: '你举了三次牌，最后拿下了。同行的人看你的眼神有点怪。', effect: { cny: -3000, items: [{ id: 'gufaqi', qty: 1 }] } },
      { label: '只看', result: '你看着它被一个收藏家买走，成交价比你的估价高十倍。', effect: { cny: 200, scale: true } },
    ],
  },
  {
    id: 'mystery_buyer', name: '神秘买家', world: 'modern',
    text: '网上有个匿名账号私信你，说愿意高价收「任何解释不了的东西」。',
    choices: [
      { label: '试探性卖一件', result: '对方秒付，还留了一句：「有好货随时找我。」', effect: { cny: 2200, scale: true } },
      { label: '拉黑', result: '你拉黑了。三天后又收到一个同样头像的账号。', effect: {} },
    ],
  },
  {
    id: 'wrong_delivery', name: '快递送错门', world: 'modern',
    text: '门口多了个快递箱，收件人不是你，地址却写得清清楚楚是你家。',
    choices: [
      { label: '打开看看', result: '里面是一台小型仪器，说明书上写着「便携式元素分析仪」。', effect: { items: [{ id: 'jingmi', qty: 1 }] } },
      { label: '退回去', result: '你联系了快递公司。第二天箱子又出现在门口。', effect: { cny: 100 } },
    ],
  },
  {
    id: 'pitch_day', name: '创业路演', world: 'modern',
    text: '朋友拉你去听一场路演。台上的人在讲「新型储能材料」。',
    choices: [
      { label: '认真听', result: '你听出了门道——他们缺的正是一种你没在市面上见过的东西。', effect: { rp: 6 } },
      { label: '投点钱', result: '你投了一笔。三个月后，这家公司估值翻了两倍。', effect: { roll: { chance: 0.4, success: { cny: 9000, scale: true }, fail: { cny: -2500 } } } },
    ],
  },
  {
    id: 'gym_trainer', name: '健身房教练', world: 'modern',
    text: '教练看着你，说：「你这身体素质……不太像坐办公室的。」',
    choices: [
      { label: '办张卡', result: '你练了两个月。体力和精神都好了不少。', effect: { cny: -1200, stamina: 30, buff: { name: '体能训练', mods: { hpMax: 0 }, durationMs: 3600000 } } },
      { label: '敷衍过去', result: '你笑了笑走了。教练在后面喊「有空来玩」。', effect: {} },
    ],
  },
  {
    id: 'convenience_store', name: '深夜便利店', world: 'modern',
    text: '凌晨的便利店只有店员和你。店员在打瞌睡，收银台上摆着一排过期打折的货。',
    choices: [
      { label: '把打折的都买了', result: '你拎着两大袋回家。吃不完，但便宜。', effect: { cny: -300, items: [{ id: 'yasuo', qty: 6 }] } },
      { label: '只买一瓶水', result: '你买了瓶水。店员抬起头说了句「慢走」。', effect: { cny: -5 } },
    ],
  },
  {
    id: 'demolition', name: '拆迁传闻', world: 'modern',
    text: '听说老城区要改造，有几处老房子正在低价甩卖。',
    choices: [
      { label: '买一处', result: '你买下了。半年后规划图公布，正好划在红线里。', effect: { roll: { chance: 0.5, success: { cny: 30000, scale: true }, fail: { cny: -4000 } } } },
      { label: '观望', result: '你没动。后来消息是假的，你松了口气。', effect: {} },
    ],
  },
  {
    id: 'livestream', name: '直播间', world: 'modern',
    text: '刷到一个直播间，主播正在卖「古法手工制作」的香囊，销量惊人。',
    choices: [
      { label: '联系主播供货', result: '你寄了一批样品过去。对方说「这香不太对，但很有意思」。', effect: { cny: 1500, scale: true } },
      { label: '自己也开一个', result: '你注册了账号，试着播了半小时。没人看，但你摸清了流程。', effect: { cny: 60, rp: 2 } },
    ],
  },
  {
    id: 'open_lab', name: '大学实验室', world: 'modern',
    text: '母校的实验室对外开放日。仪器随便看，教授随便问。',
    choices: [
      { label: '泡一整天', result: '你跟教授聊了很久。他给了你一份自己用不上的旧数据。', effect: { rp: 10 } },
      { label: '借设备测点东西', result: '你偷偷测了随身带的一件东西。结果让教授沉默了很久。', effect: { rp: 6, cny: -500 } },
    ],
  },
  {
    id: 'bank_wealth', name: '银行理财', world: 'modern',
    text: '银行客户经理拦下你，推荐一款「年化 8%」的产品。',
    choices: [
      { label: '买', result: '你买了。到期赎回，收益比说的少一点，但确实赚了。', effect: { cny: 900, scale: true } },
      { label: '不买', result: '你走了。客户经理的笑容维持了三秒。', effect: {} },
    ],
  },
  {
    id: 'old_library', name: '图书馆旧书区', world: 'modern',
    text: '图书馆旧书区在清库存，一摞摞的书按斤卖。',
    choices: [
      { label: '翻一翻', result: '你在一本地方志里翻到一段记载，提到了你熟悉的地名。', effect: { cult: 1500, scale: true } },
      { label: '买一摞回去', result: '你按斤买了三十斤。里面夹着几张旧地图。', effect: { cny: -200, rp: 4 } },
    ],
  },
  {
    id: 'repair_shop', name: '修车铺老板', world: 'modern',
    text: '修车铺老板是个老手，什么都能修。他看见你车上的一个零件，愣了一下。',
    choices: [
      { label: '问他在看什么', result: '他说这零件的材质「不该出现在这个年代」。', effect: { rp: 5 } },
      { label: '让他顺便改改车', result: '他给你加了点东西。车跑起来顺多了。', effect: { cny: -800, items: [{ id: 'jingmi', qty: 1 }] } },
    ],
  },
  {
    id: 'rooftop_stranger', name: '天台上的陌生人', world: 'modern',
    text: '写字楼天台上站着一个人，背对着你，看着远处的云。',
    choices: [
      { label: '过去搭话', result: '他转过头，说了句「你也看到了吧」，然后走了。', effect: { cult: 1800, scale: true } },
      { label: '安静地待一会儿', result: '你什么也没说。风很大，脑子却很清楚。', effect: { stamina: 15, buff: { name: '心静', mods: { cultSpeed: 0.10 }, durationMs: 4 * 3600 * 1000 } } },
    ],
  },

  /* ================= 两界通用 ================= */
  {
    id: 'rift_anomaly', name: '界潮异常', world: 'any',
    text: '这一波界潮比往常更猛。界门边缘的空气在轻微地扭曲。',
    choices: [
      { label: '趁势多带点货', result: '你在界门关闭前多塞了一批货进去，居然带过去了。', effect: { items: [{ id: 'lingmi', qty: 6 }], stamina: -10 } },
      { label: '先退开观察', result: '你退到安全距离。界潮平息后，地上留下了一层细密的晶粉。', effect: { items: [{ id: 'xingchen', qty: 1 }] } },
    ],
  },
  {
    id: 'worlds_overlap', name: '两界重叠', world: 'any',
    text: '有那么一瞬间，两个世界的景象叠在了一起：古树穿过写字楼，飞剑和无人机擦身而过。',
    choices: [
      { label: '记下这个瞬间', result: '你把这个画面记在心里。后来它成了你某个判断的根据。', effect: { cult: 2600, scale: true, rp: 4 } },
      { label: '伸手去碰', result: '你碰到了——手上一阵麻，多了一道浅浅的痕。', effect: { buff: { name: '界痕', mods: { tradeProfit: 0.20 }, durationMs: 12 * 3600 * 1000 } } },
    ],
  },
  {
    id: 'dream_teacher', name: '梦里有人', world: 'any',
    text: '梦里有人在你耳边念了一段口诀。醒来只记得前两句。',
    choices: [
      { label: '赶紧记下来', result: '你摸黑写了下来。虽然不全，但确实管用。', effect: { cult: 3200, scale: true } },
      { label: '再睡一会儿', result: '你睡回去了。醒来什么都不记得，只觉得可惜。', effect: { stamina: 20 } },
    ],
  },
  {
    id: 'wrong_shadow', name: '影子不太对', world: 'any',
    text: '你注意到自己的影子比动作慢了半拍。',
    choices: [
      { label: '盯着看', result: '影子停了一下，然后恢复正常。你觉得自己可能眼花了。', effect: { cult: 1400, scale: true } },
      { label: '不去想', result: '你加快脚步。影子跟上了，一切正常。', effect: {} },
    ],
  },
  {
    id: 'time_slip', name: '时间错位', world: 'any',
    text: '你看了下表，比刚才倒退了三分钟。',
    choices: [
      { label: '趁机多做点事', result: '你用这三分钟跑了趟市场，成交了一笔小单。', effect: { stone: 200, cny: 600, scale: true } },
      { label: '站着不动等它过去', result: '三分钟后一切恢复正常。你什么也没损失。', effect: {} },
    ],
  },
  {
    id: 'gate_echo', name: '界门回响', world: 'any',
    text: '界门里传出声音，像是很多人在同时说话，又像是水声。',
    choices: [
      { label: '仔细听', result: '你听出其中有报价、有讨价还价、有一声很轻的叹息。', effect: { buff: { name: '界门回响', mods: { tradeProfit: 0.12, cultSpeed: 0.08 }, durationMs: 10 * 3600 * 1000 } } },
      { label: '关上门', result: '你关上了。安静下来之后，反而有点不习惯。', effect: { stamina: 20 } },
    ],
  },
  {
    id: 'mystery_parcel', name: '无名包裹', world: 'any',
    text: '门口放着一个包裹，没有寄件人，也没有快递单。',
    choices: [
      { label: '拆开', result: '里面是一小袋材料，附着一张字条：「上次的货不错。」', effect: { items: [{ id: 'lingjin', qty: 2 }] } },
      { label: '原样放着', result: '你放了两天，包裹自己消失了。', effect: {} },
    ],
  },
  {
    id: 'old_photo', name: '一张老照片', world: 'any',
    text: '旧物里夹着一张照片，拍的是个陌生的山门，背后写着一行小字。',
    choices: [
      { label: '按小字去找', result: '你按着线索找到了一处废弃的山门。里面还有东西。', effect: { roll: { chance: 0.55, success: { items: [{ id: 'gufaqi', qty: 1 }] }, fail: { stamina: -25 } } } },
      { label: '收起来', result: '你把照片收进抽屉。偶尔想起来会拿出来看一眼。', effect: { cult: 800, scale: true } },
    ],
  },
  {
    id: 'unknown_call', name: '陌生来电', world: 'any',
    text: '一个陌生号码打进来。接起来，对方沉默了两秒，说：「你手上的东西，别急着出手。」',
    choices: [
      { label: '问他什么意思', result: '对方挂了。第二天你收到一条短信，是一个报价。', effect: { buff: { name: '内线消息', mods: { tradeProfit: 0.18 }, durationMs: 8 * 3600 * 1000 } } },
      { label: '拉黑', result: '你拉黑了。之后几天风平浪静。', effect: {} },
    ],
  },
  {
    id: 'fellow_crosser', name: '同修', world: 'any',
    text: '路边有个人正在往一个帆布包里塞东西，塞不进去。你一眼就认出那是什么包——你自己也有一个。',
    choices: [
      { label: '上前搭话', result: '对方警惕了半天，最后叹了口气，跟你换了个联系方式。', effect: { rp: 6, buff: { name: '同行交流', mods: { tradeProfit: 0.10 }, durationMs: 12 * 3600 * 1000 } } },
      { label: '装作没看见', result: '你走开了。回头看时，那个人已经不见了。', effect: {} },
    ],
  },
  {
    id: 'sign_in_sky', name: '天象', world: 'any',
    text: '傍晚的天色不太对，云层被染成一种说不出的颜色，两个世界都能看到。',
    choices: [
      { label: '就地打坐', result: '你借着这股气机冲了一小段修为。', effect: { cult: 4200, scale: true } },
      { label: '拍下来发出去', result: '照片火了。有人私信你，问这是在哪拍的。', effect: { cny: 1600, scale: true } },
    ],
  },
  {
    id: 'self_claimed_elder', name: '自称前辈', world: 'any',
    text: '一个衣着讲究的人拦住你，自称是你「将来的前辈」，说有笔生意要谈。',
    choices: [
      { label: '听他讲', result: '他讲了一套说法，逻辑自洽，但你总觉得哪里不对。他给了你一点甜头。', effect: { stone: 400, cny: 900, scale: true } },
      { label: '不理会', result: '你走了。他在背后喊：「你会后悔的。」你回头看，人已经不见了。', effect: {} },
    ],
  },
];

export const TALE_MAP = Object.fromEntries(TALES.map((t) => [t.id, t]));

export function talesFor(world, stage, state = null) {
  const context = { farm: state?.farm?.plots?.some(Boolean), ranch: state?.ranch?.slots?.some(Boolean), pet: state?.beasts?.deployed?.length > 0, research: Object.values(state?.research?.done || {}).some(Boolean), estate: Object.values(state?.estate?.owned || {}).some(n => n > 0), shop: state?.estate?.shops > 0, companion: Object.values(state?.companions || {}).some(c => c.affection >= 20) };
  return TALES.filter(t => (t.world === 'any' || t.world === world) && stage >= (t.minStage || 0) && (!t.minReincarnation || (state?.reincarnation?.count || 0) >= t.minReincarnation) && (!t.companion || (state?.companions?.[t.companion]?.affection || 0) >= t.affection) && (!t.context || context[t.context]) && (!t.worldState || (state && worldState(state).id===t.worldState)) && (!t.requiresAnyFlag || !!state?.tales?.flags?.[t.requiresAnyFlag]) && (!t.blockedFlag || !state?.tales?.flags?.[t.blockedFlag]) && (!t.requiresFlag || state?.tales?.flags?.[t.requiresFlag.split(':')[0]] === t.requiresFlag.split(':')[1]));
}

/** 机会之间的最短间隔；每日2–4次机会由系统排定。 */
export const TALE_RATE = {
  minGapMs: 3 * 60 * 60 * 1000,
};
