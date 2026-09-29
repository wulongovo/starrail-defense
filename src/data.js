// wulong · 星穹守卫：供渲染器与模拟器共享的角色档案。
import { GENERATED_ROSTER, PLAYABLE_ROSTER } from './generated-roster.js';
export { PLAYABLE_ROSTER, ROSTER_GAME_IDS } from './generated-roster.js';
export const ECONOMY = Object.freeze({ startingJade: 200, skyInterval: 7, robinInterval: 8, harmonyInterval: 10, holyflameInterval: 18 });
export const ENEMY_HP_SCALE = 1.35;
export const BOSS_HP_SCALE = 1.2;
export const WAVE_COUNT_SCALE = 1.5;
const character = (id, name, role, cost, cooldown, hp, color, hair, description, extra = {}) => ({
  id, name, role, cost: cost === 0 ? 0 : Math.max(10, Math.round(cost * 0.85 / 5) * 5), baseCost: cost, cooldown: Math.max(0.5, cooldown - 1), baseCooldown: cooldown, metadata: { baseCost: cost, baseCooldown: cooldown }, hp, color, hair, description,
  kind: 'ranged', damage: 24, interval: 1.5, range: 10, ...extra,
});

export const CHARACTERS = {
  ...Object.fromEntries(GENERATED_ROSTER.map(({ id, name, role, cost, baseCooldown, hp, color, hair, description, ...extra }) => [id, character(id, name, role, cost, baseCooldown, hp, color, hair, description, extra)])),
  robin: character('robin', '知更鸟', '星琼歌者', 50, 3, 280, '#91d4ff', '#c8ddff', '每 8 秒唱出 50 星琼。歌声让开拓之旅持续闪耀。', { kind: 'producer', damage: 0, interval: ECONOMY.robinInterval, range: 0 }),
  march: character('march', '三月七', '冰箭射手', 100, 3, 320, '#ee9eda', '#ffbddc', '冰箭造成 30 伤害，并令目标减速 35%，持续 2 秒。', { damage: 30, interval: 1.35, slow: 0.65 }),
  gepard: character('gepard', '杰帕德', '坚盾守卫', 75, 6, 1600, '#729dde', '#e9d497', '1600 生命的坚盾。每 8 秒恢复自身 100 点护盾。', { kind: 'tank', damage: 0, range: 0, shield: 100 }),
  aventurine: character('aventurine', '砂金', '反击壁垒', 175, 8, 3000, '#e6ba63', '#e3cd90', '3000 生命的高墙。每承受 3 次攻击，向近处敌人反击 110 伤害。', { kind: 'counter', damage: 110, interval: 0, range: 1.8 }),
  trailblazer: character('trailblazer', '毁灭开拓者', '球棒连击', 150, 5, 700, '#d9ba66', '#a7a5af', '球棒连续挥击前方 1.25 格的敌人。部署前可选择其他开拓者命途。', { kind: 'melee', damage: 42, interval: 0.55, range: 1.25 }),
  preservation: character('preservation', '存护开拓者', '九宫嘲讽', 150, 5, 1400, '#ee9d52', '#a7a5af', '生命为毁灭的 2 倍。九宫范围嘲讽相邻路敌人，每挨打 3 次反击 90 伤害。', { kind: 'taunt', damage: 90, interval: 0, range: 1.6 }),
  remembrance: character('remembrance', '记忆开拓者', '召唤迷迷', 150, 5, 650, '#c59bef', '#a7a5af', '召唤不会因策反而消失的迷迷。迷迷攻击前方 4 格，并每 9 秒策反一个敌人。', { kind: 'summoner', damage: 0, interval: 8, range: 0 }),
  elation: character('elation', '欢愉开拓者', '五秒惊喜', 150, 5, 600, '#e897d0', '#a7a5af', '娱乐设定：每 5 秒在随机空位召唤角色。召出的敌方投影会被策反。', { kind: 'randomSummoner', damage: 0, interval: 5, range: 0 }),
  harmony: character('harmony', '同谐开拓者', '协奏增益', 150, 5, 650, '#d7b878', '#a7a5af', '为相邻九宫内的伙伴提供 25% 攻速。每 10 秒额外产生 25 星琼。', { kind: 'buffer', damage: 0, interval: ECONOMY.harmonyInterval, range: 1.5 }),
  herta: character('herta', '黑塔', '转圈清场', 150, 5, 450, '#aa91e2', '#b6a2d6', '挥动大锤转圈，攻击周围 1.8 格与相邻路内的所有敌人。', { kind: 'spin', damage: 55, interval: 1.8, range: 1.8 }),
  himeko: character('himeko', '姬子', '轨道轰击', 225, 7, 400, '#d36958', '#cf5e4d', '激光命中造成 72 伤害，并对目标附近敌人造成范围伤害。', { damage: 72, interval: 2.5, splash: 0.8 }),
  dan: character('dan', '丹恒', '穿云长枪', 150, 4, 380, '#67b8ac', '#304d50', '穿透射击，贯穿同一路最多 3 个敌人，每次造成 40 伤害。', { damage: 40, interval: 1.65, pierce: 3 }),
  bailu: character('bailu', '白露', '疗愈龙女', 125, 6, 480, '#b397e9', '#c2b6ef', '每 3 秒为自身周围两格的伙伴恢复 75 生命。', { kind: 'healer', damage: 0, interval: 3, range: 2 }),
  kafka: character('kafka', '卡芙卡', '言灵与雷', 200, 8, 420, '#b262a4', '#8d476e', '雷击造成 44 伤害；每 5 秒用言灵策反同路前方最近的一只怪物，普通召唤物也有效，小 Boss 和地区 Boss 免疫。', { damage: 44, interval: 1.8, charmInterval: 5 }),
  silverWolf: character('silverWolf', '银狼', '弱点植入', 175, 5, 350, '#9ca0ee', '#a4a8bb', '射击造成 25 伤害；为目标植入弱点，使其受到的伤害提高 40%，持续 5 秒。', { damage: 25, interval: 1.3, vulnerable: true }),
  firefly: character('firefly', '流萤', '熔火突击', 225, 7, 800, '#82dfcd', '#cdd2d8', '装甲近战，斩击前方 1.8 格敌人，造成 95 伤害。', { kind: 'melee', damage: 95, interval: 1.1, range: 1.8 }),
  fugue: character('fugue', '忘归人', '狐火击破', 200, 6, 440, '#e7a283', '#7c4c3e', '狐火造成 36 伤害并施加易伤；与流萤共同攻击可蓄满「云火熔星」联动。', { damage: 36, interval: 1.8, vulnerable: true, element: 'fire', adaptation: '将原作的击破辅助简化为易伤与联动增伤。' }),
  yunli: character('yunli', '云璃', '重剑招架', 200, 7, 1900, '#e4ac83', '#40382e', '以重剑守住前线，每次受到攻击后反击近处敌人，造成 120 伤害。', { kind: 'counter', damage: 120, interval: 0, range: 1.8, counterEvery: 1, element: 'physical', adaptation: '保留受击反击主题；招架频率与伤害为塔防规则。' }),
  imbibitor: character('imbibitor', '丹恒·饮月', '苍龙贯阵', 275, 7, 560, '#7dddd3', '#263f42', '苍龙水击贯穿同路最多 3 个敌人，造成 80 伤害；与景元蓄力释放「龙吟天将」。', { damage: 80, interval: 2.1, pierce: 3, element: 'imaginary', adaptation: '强化普攻和龙形意象改为穿透攻击，不消耗原作战技点。' }),
  permansor: character('permansor', '丹恒·腾荒', '龙灵守土', 225, 7, 1350, '#d1b47c', '#354343', '龙灵协助攻击，并周期性为附近伙伴提供 100 护盾；与丹恒联动守护防线。', { kind: 'guardian', damage: 32, interval: 2.4, shield: 100, shieldInterval: 6, range: 10, element: 'physical', adaptation: '原作的护盾、龙灵与同袍机制简化为邻近护盾和联动。' }),
  jingyuan: character('jingyuan', '景元', '神君雷击', 250, 7, 570, '#e8c777', '#e3e0d7', '雷击造成 45 伤害，每 3 次攻击引发神君追加雷击；可与饮月释放联动技。', { kind: 'lightningLord', damage: 45, interval: 1.8, lordEvery: 3, lordDamage: 110, element: 'lightning', adaptation: '神君行动与段数改为固定攻击次数触发。' }),
  ruanmei: character('ruanmei', '阮·梅', '弦音协律', 175, 6, 460, '#8ac6be', '#54433c', '以弦音强化附近伙伴的伤害与攻击节奏，每 5 秒维持支援效果。', { kind: 'support', damage: 0, interval: 5, range: 2.2, supportDamage: 1.2, supportSpeed: 1.15, element: 'ice', adaptation: '增伤与速度支援保留主题；未照搬原作击破效率数值。' }),
  acheron: character('acheron', '黄泉', '断雨雷刃', 300, 8, 650, '#ae83e3', '#44305f', '拔刀雷击造成 90 伤害，并波及目标周围 1.1 格的敌人。', { damage: 90, interval: 2.8, splash: 1.1, element: 'lightning', adaptation: '雷刃范围攻击为塔防简化，未复刻残梦充能规则。' }),
  topaz: character('topaz', '托帕', '账账追击', 175, 5, 470, '#e9999a', '#e3ded1', '与账账追击同路敌人，造成 35 伤害；每 3 次攻击回收 10 星琼。', { kind: 'accountant', damage: 35, interval: 1.3, jadeEvery: 3, jadeAmount: 10, element: 'fire', adaptation: '账账追击和寻宝主题改为攻击回收星琼。' }),
  blade: character('blade', '刃', '支离剑阵', 200, 6, 1150, '#786091', '#313347', '挥动支离剑攻击前方 1.8 格，造成 78 伤害。以高生命承担前线压力。', { kind: 'melee', damage: 78, interval: 1.2, range: 1.8 }),
  sampo: character('sampo', '桑博', '风刃诡商', 150, 4, 410, '#78b9aa', '#35485a', '风刃贯穿同路两个敌人，每次造成 32 伤害。', { damage: 32, interval: 1.45, pierce: 2 }),
  sparkle: character('sparkle', '花火', '两击变身', 175, 5, 530, '#e699a6', '#453347', '每两次真实命中攻击后变成另一名角色，保留花火标记并继续变身；不会变成当前角色。', { kind: 'shapeshifter', damage: 30, interval: 1.4, transformEvery: 2 }),
  bronya: character('bronya', '布洛妮娅', '银鬃统御', 175, 5, 520, '#a6c7e4', '#c8ced7', '以统御号令提高附近伙伴的伤害与攻击节奏。', { kind: 'support', damage: 0, interval: 5, range: 2.2, supportDamage: 1.2, supportSpeed: 1.15 }),
  sunday: character('sunday', '星期日', '协奏祝祷', 200, 6, 560, '#c8b7e9', '#b9bfd8', '协奏祝祷提高附近伙伴的伤害与攻击节奏，辅助召唤与追击队伍。', { kind: 'support', damage: 0, interval: 5, range: 2.5, supportDamage: 1.2, supportSpeed: 1.15 }),
  mimi: character('mimi', '迷迷', '四格策反', 0, 0, 480, '#e2a5e8', '#ecd4f3', '每 9 秒策反一个前方敌人且不会消失；挥爪连击前方 4 格的敌人。', { kind: 'pet', damage: 24, interval: 0.75, range: 4, charmInterval: 9 }),
};

export const TRAILBLAZER_FORMS = ['trailblazer', 'preservation', 'remembrance', 'elation', 'harmony'];
const STARTER_ORDER = ['robin', 'march', 'gepard', 'aventurine', 'trailblazer', 'herta', 'himeko', 'dan', 'bailu', 'kafka', 'silverWolf', 'firefly', 'fugue', 'yunli', 'imbibitor', 'permansor', 'jingyuan', 'ruanmei', 'acheron', 'topaz', 'blade', 'sampo', 'sparkle', 'bronya', 'sunday'];
export const DECK = [...STARTER_ORDER, ...PLAYABLE_ROSTER.map(({ id }) => id).filter(id => !STARTER_ORDER.includes(id))];
export const BOX = { id: 'box', name: '奇遇盲盒', cost: 105, baseCost: 125, baseCooldown: 2.5, metadata: { baseCost: 125, baseCooldown: 2.5 }, cooldown: 1.5, description: '随机开出特殊伙伴，或已经被策反的敌方投影。' };

// 联动为本作同人机制。两个成员均在场，真实攻击累计五次后由玩家释放。
export const LINK_SKILLS = [
  { id: 'dragon_thunder', name: '龙吟天将', members: ['imbibitor', 'jingyuan'], chargeRequired: 5, description: '饮月与景元联手，对全场敌人造成 360 伤害。', effect: { kind: 'blast', damage: 360 } },
  { id: 'earthbound_oath', name: '青龙守土', members: ['permansor', 'dan'], chargeRequired: 5, description: '腾荒与丹恒为全队提供 300 护盾，并对全场敌人造成 120 伤害。', effect: { kind: 'shield', damage: 120, shield: 300 } },
  { id: 'foxflame_meteor', name: '云火熔星', members: ['fugue', 'firefly'], chargeRequired: 5, description: '忘归人与流萤造成 200 范围伤害，附加 8 秒易伤与 5 秒减速。', effect: { kind: 'break', damage: 200, vulnerableSeconds: 8, slowSeconds: 5 } },
];

export const ENEMY_SPEED_SCALE = 0.75;
const enemy = (id, name, hp, speed, damage, interval, color, hair, extra = {}) => ({ id, name, hp: Math.round(hp * (extra.isBoss ? BOSS_HP_SCALE : ENEMY_HP_SCALE)), baseHp: hp, speed: speed * ENEMY_SPEED_SCALE, damage, interval, color, hair, role: '演算投影', ...extra });
export const ENEMIES = {
  reaver: enemy('reaver', '虚卒·掠夺者', 220, 0.105, 30, 1.3, '#9776bd', '#37314b', { model: 'reaver', isMonster: true, behavior: 'melee', role: '近战突袭', description: '反物质军团基础近战单位，持续推进并攻击阻挡者。' }),
  antibaryon: enemy('antibaryon', '反重子', 170, 0.09, 24, 2.2, '#bb8bea', '#67518a', { model: 'antibaryon', isMonster: true, behavior: 'ranged', range: 3.5, role: '远程压制', description: '接近防线后在 3.5 格外发射反物质攻击。' }),
  baryon: enemy('baryon', '重子', 300, 0.08, 25, 1.6, '#a291e8', '#544775', { model: 'baryon', isMonster: true, behavior: 'shield', shield: 90, skillInterval: 8, radius: 1.8, role: '护盾支援', description: '每 8 秒为附近敌人补充护盾，优先击破可削弱整路。' }),
  distorter: enemy('distorter', '虚卒·篡改者', 280, 0.09, 36, 2, '#9769bb', '#443454', { model: 'distorter', isMonster: true, behavior: 'ranged', range: 3, role: '虚数远射', description: '在前方 3 格进行远程攻击，不必贴身便能威胁伙伴。' }),
  trampler: enemy('trampler', '虚卒·践踏者', 760, 0.075, 65, 1.8, '#ab77bc', '#463450', { model: 'trampler', isMonster: true, behavior: 'charge', chargeMultiplier: 1.8, skillInterval: 9, armor: 0.12, role: '蓄力冲锋', description: '短暂蓄力后冲向防线；护盾角色仍能阻挡冲锋。' }),
  maraSoldier: enemy('maraSoldier', '魔阴身士卒', 330, 0.09, 34, 1.4, '#b2bb71', '#647b58', { model: 'maraSoldier', isMonster: true, behavior: 'regenerate', heal: 55, skillInterval: 7, role: '再生推进', description: '以魔阴再生主题改编，每 7 秒恢复 55 生命。' }),
  goldenHound: enemy('goldenHound', '丰饶灵兽·娄金', 280, 0.12, 28, 1.3, '#d8c680', '#9b914e', { model: 'goldenHound', isMonster: true, behavior: 'heal', heal: 60, skillInterval: 7, radius: 1.8, role: '丰饶治疗', description: '每 7 秒治疗附近敌人，恢复 60 生命。' }),
  woodLupus: enemy('woodLupus', '丰饶灵兽·奎木', 640, 0.085, 42, 1.7, '#87b79e', '#446b69', { model: 'woodLupus', isMonster: true, behavior: 'summon', summonId: 'maraSoldier', skillInterval: 12, summonLimit: 3, role: '呼唤援军', description: '每 12 秒召来士卒协战，最多同时维持 3 名援军。' }),
  dragonfish: enemy('dragonfish', '入魔机巧·灯昼龙鱼', 210, 0.13, 22, 1.5, '#e2b67e', '#967b51', { model: 'dragonfish', isMonster: true, behavior: 'explode', explosionDamage: 110, explosionRadius: 1.5, explosionDelay: 1.5, role: '预警自爆', description: '接近伙伴后开始自爆读条，及时击破可以阻止爆炸。' }),
  bubbleHound: enemy('bubbleHound', '惊梦剧团的气泡锂犬', 260, 0.12, 32, 1.4, '#d391c4', '#7e537f', { model: 'bubbleHound', isMonster: true, behavior: 'leap', leapDistance: 2.3, skillInterval: 10, role: '跃进扰阵', description: '每 10 秒跃进一段距离，绕过松散防线；本作塔防改编。' }),
  domescreen: enemy('domescreen', '惊梦剧团的圆幕先生', 320, 0.08, 34, 2.4, '#a891d2', '#595576', { model: 'domescreen', isMonster: true, behavior: 'ranged', range: 3.5, role: '屏幕远射', description: '圆幕读条后攻击前方伙伴，射程 3.5 格。' }),
  springDealer: enemy('springDealer', '惊梦剧团的弹簧荷官', 420, 0.08, 32, 1.6, '#e2b879', '#80684f', { model: 'springDealer', isMonster: true, behavior: 'shield', shield: 100, skillInterval: 9, radius: 1.8, role: '筹码护盾', description: '以筹码为附近敌人提供护盾，保护推进中的剧团。' }),
  tideBlade: enemy('tideBlade', '黑潮蚀刃', 340, 0.11, 40, 1.3, '#ba7e8f', '#493443', { model: 'tideBlade', isMonster: true, behavior: 'melee', role: '黑潮近战', description: '黑潮侵蚀的刃兵，持续挥刃推进。' }),
  tideBow: enemy('tideBow', '黑潮朽弓', 270, 0.085, 30, 2.1, '#ae8cbd', '#43374e', { model: 'tideBow', isMonster: true, behavior: 'ranged', range: 4, role: '远距弓手', description: '在前方 4 格射出朽箭，对后方支援角色形成压力。' }),
  tideAxe: enemy('tideAxe', '黑潮蚀斧', 620, 0.085, 58, 1.8, '#ca927b', '#564049', { model: 'tideAxe', isMonster: true, behavior: 'charge', chargeMultiplier: 1.7, skillInterval: 10, armor: 0.1, role: '重斧冲阵', description: '蓄力后携重斧加速压向防线，以高生命换取突进。' }),
  tideCouncil: enemy('tideCouncil', '黑潮参议', 590, 0.075, 35, 1.8, '#b9a28b', '#52434c', { model: 'tideCouncil', isMonster: true, behavior: 'summon', summonId: 'tideBlade', skillInterval: 13, summonLimit: 3, role: '黑潮召集', description: '每 13 秒召集蚀刃，每个召集者最多维持 3 名援军。' }),
  voidranger: enemy('voidranger', '刃·训练投影', 240, 0.105, 34, 1.2, '#784f67', '#343448', { model: 'blade' }),
  stormbringer: enemy('stormbringer', '萨姆·熔火投影', 500, 0.085, 55, 1.6, '#94c7bb', '#c9d9d6', { model: 'sam', armor: 0.12 }),
  sparkle: enemy('sparkle', '花火·诡戏投影', 200, 0.175, 28, 0.9, '#d5656e', '#3b344c', { model: 'sparkle' }),
  sampo: enemy('sampo', '桑博·幻影', 300, 0.145, 36, 1.15, '#689a98', '#3c5669', { model: 'sampo' }),
  bronya: enemy('bronya', '布洛妮娅·统御投影', 420, 0.09, 45, 1.4, '#8fadd1', '#c7cedd', { model: 'bronya' }),
  gepardEnemy: enemy('gepardEnemy', '杰帕德·壁垒投影', 880, 0.065, 45, 1.4, '#8fa9d0', '#e9d497', { model: 'gepard', armor: 0.18 }),
  boss: enemy('boss', '星期日·秩序投影', 3000, 0.055, 90, 1.6, '#c2b9e5', '#a9b6d1', { model: 'sunday', armor: 0.1, breachDamage: 3 }),
  boss_doomsday: enemy('boss_doomsday', '末日兽', 8800, 0, 100, 2, '#9673d5', '#302d55', { isBoss: true, model: 'doomsday', armor: 0.08, bossSkills: ['三部位装甲', '末日蓄能', '核心暴露'], description: '先击破左右手与反物质引擎，再攻击暴露的核心。危险路读条结束时受到轰击。', adaptation: '部位结构取自原战斗；秒数、路数和伤害为塔防改编。' }),
  boss_phantylia: enemy('boss_phantylia', '不死神实·幻胧', 9200, 0, 90, 2, '#82c89a', '#554377', { isBoss: true, model: 'phantylia', armor: 0.06, bossSkills: ['丰饶玄莲', '破灭玄莲', '丰饶与毁灭'], description: '玄莲汲取星琼；第二阶段压制前排生命上限。净化可解除压制，优先击破玄莲。', adaptation: '玄莲、战技点汲取与生命上限压制改为星琼和塔防单位效果。' }),
  boss_dominicus: enemy('boss_dominicus', '齐响诗班·神主日', 9500, 0, 90, 2, '#ead49c', '#ddd5eb', { isBoss: true, model: 'dominicus', armor: 0.04, bossSkills: ['同谐屏障', '七日倒计时', '齐响审判'], description: '击破屏障会为全队赋予护盾，并打断七日审判。第三阶段七秒倒计时后连续轰击全场。', adaptation: '屏障与七日主题改成即时读条；并非原版回合数值。' }),
  boss_lycurgus: enemy('boss_lycurgus', '神礼观众·来古士', 9400, 0, 100, 2, '#dd9c68', '#a8b8bb', { isBoss: true, model: 'lycurgus', armor: 0.06, bossSkills: ['眷属召集', '论证', '求解第一因之果'], description: '召集四名眷属后进入论证；忆灵也会触发论证。十次战场退场后求解第一因，全体伙伴分摊冲击。', adaptation: '眷属、忆灵、论证与十次退场取自战斗机制；范围和数值为塔防改编。' }),
  boss_guiji: enemy('boss_guiji', '万色返空主·归寂', 9600, 0, 100, 2, '#c98ce7', '#373750', { isBoss: true, model: 'guiji', armor: 0.06, bossSkills: ['成·热场嘉宾', '住·埋梗时刻', '坏·爆梗狂欢'], description: '三面轮转：召来喜剧学家、标记四格、引爆标记。净化清除标记；星琼屏障阻止噬命恢复。', adaptation: '成住坏、埋梗、嘉宾与屏障克制来自原战斗；随机落格、读条和数值为塔防改编。' }),
  enemy_lotus: enemy('enemy_lotus', '玄莲', 300, 0, 15, 5, '#b878d1', '#a4d488', { model: 'lotus', summon: true }),
  enemy_retainer: enemy('enemy_retainer', '天谴斗士', 310, 0.12, 26, 1.4, '#be9c77', '#776d81', { model: 'retainer', summon: true }),
  enemy_comedian: enemy('enemy_comedian', '喜剧学家', 330, 0.15, 28, 1.3, '#d782b5', '#4a435b', { model: 'comedian', summon: true }),
};

export const MAPS = [
  { id: 'herta', name: '黑塔空间站', subtitle: 'HERTA SPACE STATION', description: '湛蓝星海中的模拟训练舱。守住星穹列车的数据核心。', accent: '#7bd9f4', rows: 6, cols: 10, boss: 'boss_doomsday', objective: '守住空间站核心，击破末日兽的三部位与核心。', story: [
    { speaker: '黑塔', text: '欢迎来到我的新测试。别紧张，敌人都是演算投影——但星琼是真的……模拟出来的。' },
    { speaker: '三月七', text: '把伙伴放到轨道上！知更鸟负责补给，我来冻住他们！' },
  ] },
  { id: 'xianzhou', name: '仙舟「罗浮」', subtitle: 'XIANZHOU LUOFU', description: '玉阙与星槎之间，建木的枝影侵入战场。击破玄莲，阻止幻胧吞噬防线。', accent: '#89d1b3', rows: 6, cols: 10, boss: 'boss_phantylia', objective: '保卫仙舟，驱散幻胧的玄莲与生命压制。', story: [
    { speaker: '丹恒', text: '莲花会侵蚀我们的补给。先切断它们，再迎向真正的敌人。' },
    { speaker: '白露', text: '别让生命上限一直被压住。留好星琼，用净化帮大家恢复！' },
  ] },
  { id: 'penacony', name: '匹诺康尼', subtitle: 'PENACONY · DREAMSCAPE', description: '霓虹与美梦之间的六路战场，中间两路化作梦境水道。梦泡平台让所有伙伴都可部署。', accent: '#d4a9fb', rows: 6, cols: 10, boss: 'boss_dominicus', objective: '打破神主日的屏障，让七日审判止于黎明之前。', story: [
    { speaker: '知更鸟', text: '梦境里的歌声会化成星琼。让我们一起守护这个夜晚。' },
    { speaker: '砂金', text: '水道已经准备了梦泡平台。放心下注，每一条路都能放下你的王牌。' },
  ] },
  { id: 'amphoreus', name: '翁法罗斯', subtitle: 'AMPHOREUS · ETERNAL LAND', description: '黄金穹顶上的命途试炼。圣焰每 18 秒带来额外 25 星琼。', accent: '#f4cb76', rows: 6, cols: 10, boss: 'boss_lycurgus', objective: '面对来古士的论证，集结伙伴分摊第一因的冲击。', story: [
    { speaker: '开拓者', text: '金色的台阶延伸向天空。这一次，我们把每一位同伴都留在身边。' },
    { speaker: '迷迷', text: '迷迷！把敌人变成朋友，再一起向前吧！' },
  ] },
  { id: 'planarcadia', name: '二相乐园', subtitle: 'PLANARCADIA', description: '霓虹乐园在归寂的三面之间变换。笑声化作危险标记，守住仍然鲜活的色彩。', accent: '#f2a2cc', rows: 6, cols: 10, boss: 'boss_guiji', objective: '清除四格爆梗标记，阻止归寂吞噬防线的生命。', story: [
    { speaker: '三月七', text: '那些亮起来的格子不是舞台灯！标记爆炸前，用净化把它们清掉。' },
    { speaker: '开拓者', text: '成、住、坏……我们不把结局交给沉寂。星琼屏障会护住这一程。' },
  ] },
];
