import type { CardDef } from '../types';

/**
 * ============================================================================
 *  卡牌数据库
 * ============================================================================
 *
 *  每张卡的「效果」由 ops 里的指令列表描述，引擎会逐条执行。
 *  指令清单、可选对象（who）与条件的完整写法见 src/game/effect.ts 顶部。
 *
 *  平衡调整不必改这个文件：游戏主菜单 →「平衡调整」可以可视化改费用、
 *  改每条指令的数值、改杀手冷却，改完点保存即生效，还能导出成数据备份。
 *
 *  —— 卡池划分（决定谁能拿到哪些牌）——
 *    pool: 'initial'  12 张通用卡，所有杀手共用，也是存档里的初始解锁池。
 *    pool: 'killer'   专属卡，只有 killerOnly 指定的杀手能带进牌组。
 *    deckCardsForKiller() 按这两个池拼出某位杀手可用的全部卡牌。
 *
 *  —— 图标 ——
 *    一卡一图标，文件名与卡牌 id 相同：public/assets/dbd/perks/<id>.png，
 *    由 scripts/import_dbd_assets.py 从 dbdwiki 官方图集裁切生成。
 *    assetMap.ts 的 cardImage() 直接按 id 推导路径，卡牌本身不存图路径。
 *
 *  —— 伤害与生死 ——
 *    默认挥刀造成 2 点伤害；幸存者生命值为 4，累计受到 2 点伤害进入受伤，再累计 2 点倒地。
 *    也就是「一刀受伤、两刀倒地」，处决只补最后一刀。
 *    卡牌可通过 bonusDamage、damage、down 等 DSL 指令改变伤害或状态；血祭品由独立 who 目标选择器引用。
 *    倒地的人不会自己死，只有处决类指令能终结他们，期间可能被同伴救起。
 */

export const CARDS: CardDef[] = [
  /* ------------------------------------------------------------------ */
  /* 通用卡池：所有杀手共用                                              */
  /* ------------------------------------------------------------------ */

  {
    id: 'unbreakable',
    name: '不屈不挠',
    cost: 0,
    type: 'skill',
    desc: '抽 1 张牌，并立即收回刀锋；本次收刀不额外消耗行动点。',
    flavor: '只要还站着，就还有下一步。',
    sourceSkill: 'Unrelenting',
    sourceText: '本作效果：免费收刀并补充手牌。',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'draw', amount: 1 }],
  },

  {
    id: 'hex_huntress',
    name: '厄咒：猎杀戾气',
    cost: 1,
    type: 'setup',
    desc: '启用猎杀戾气：下一次攻击命中幸存者时，额外获得 50 点猎杀评分。',
    flavor: '第一滴血，唤醒了诅咒。',
    sourceSkill: 'Hex: Thrill of the Hunt',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'hexHuntress' }],
  },

  {
    id: 'hex_noed',
    name: '厄咒：难逃一死',
    cost: 1,
    type: 'setup',
    desc: '启用两座厄咒图腾（阁楼、地下室）：只要至少一座图腾未被破坏，你的攻击命中就会直接击倒幸存者；两座图腾都被破坏后效果失效。',
    flavor: '最后一道门打开时，真正的猎杀才开始。',
    sourceSkill: 'Hex: No One Escapes Death',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'hexNoed' }],
  },

  {
    id: 'scourge_shrine',
    name: '天灾钩子：鬼魔神龛',
    cost: 1,
    type: 'setup',
    desc: '在当前房间安置鬼魔神龛。若房间里已有幸存者会立即触发；否则第一个进入这里的人会恐惧 +35、警觉 +12，并显露气场 3 次后续行动。',
    flavor: '神龛从不接受免费的供奉。',
    sourceSkill: 'Scourge Hook: Monstrous Shrine',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'scourgeShrine' }],
  },

  {
    id: 'distressing',
    name: '恐惧释放',
    cost: 1,
    type: 'skill',
    desc: '相邻房间内的所有人类恐惧值增加 25，并显露气场 2 次后续行动；不会直接提高警戒。',
    flavor: '恐惧会吞掉他们的时间。',
    sourceSkill: 'Distressing',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'distressing' }],
  },

  {
    id: 'hell',
    name: '恶灵低语',
    cost: 0,
    type: 'skill',
    noAction: true,
    desc: '免费选择地图上的任意一个房间；若房间内有人，显示其中所有人类的气场 2 次后续行动。不消耗行动，也不会让幸存者行动。',
    flavor: '墙壁挡得住视线，挡不住恶意。',
    sourceSkill: 'Whispers',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'revealAura', value: 1 }],
  },

  {
    id: 'iron_grasp',
    name: '牢牢紧握',
    cost: 1,
    type: 'tactic',
    desc: '指定当前房间一名站立幸存者：其下一次行动无法逃离当前房间。',
    flavor: '这次，你抓得足够牢。',
    sourceSkill: 'Iron Grasp',
    unlocked: true,
    pool: 'initial',
    precheck: { cond: { c: 'victimHere' }, hint: '当前房间没有可以按住的幸存者。' },
    ops: [{ op: 'block', who: 'victim', turns: 1 }],
  },

  {
    id: 'deerstalker',
    name: '猎鹿者',
    cost: 1,
    type: 'skill',
    desc: '地图上所有尚未消失的脚印路线同时浮现，持续 2 次后续行动；最新的脚印会标出前进方向。',
    flavor: '猎物留下的每一步，都会成为路标。',
    sourceSkill: 'Deerstalker',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'revealNearestTrail', value: 2 }],
  },

  {
    id: 'hex_ruin',
    name: '粉碎希望',
    cost: 1,
    type: 'setup',
    desc: '立即破坏当前房间可触及的一处环境目标（设施、通讯设备或相邻锁门），并使全局警报降低 10 点。',
    flavor: '他们辛苦完成的东西，会再次归于废墟。',
    sourceSkill: 'Shattered Hope',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'contextSabotage' }],
  },

  {
    id: 'bitter_murmur',
    name: '苦涩低语',
    cost: 1,
    type: 'skill',
    desc: '埋下一段不祥的回声：下一次有人死亡时，余下所有人类的气场都会显现 3 次后续行动。',
    flavor: '每一次努力，都在黑暗中留下回声。',
    sourceSkill: 'Bitter Murmur',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'bitterMurmur' }],
  },

  {
    id: 'sloppy_butcher',
    name: '辣手屠夫',
    cost: 1,
    type: 'skill',
    desc: '立即对当前房间一名站立幸存者发动一次攻击；命中后附带流血 2 回合，移动时留下血迹。',
    flavor: '刀口不必很深，只要足够致命。',
    sourceSkill: 'Sloppy Butcher',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'attack', who: 'victim', bleedTurns: 2, status: 'deepWound', statusTurns: 0 }],
  },

  {
    id: 'insidious',
    name: '静止隐身',
    cost: 1,
    type: 'skill',
    desc: '进入无法侦测状态：接下来 2 次玩家行动中，人类即使与你面对面也无法发现你；攻击和破坏仍会产生正常动静。',
    flavor: '不动的时候，连恐惧也找不到你。',
    sourceSkill: 'Insidious',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'stealthNext', value: 3 }],
  },

  /* ------------------------------------------------------------------ */
  /* 迈尔斯专属：三种印记独立计数                                      */
  /* ------------------------------------------------------------------ */

  {
    id: 'myers_eclipse_light',
    name: '优胜劣汰',
    cost: 1,
    type: 'skill',
    desc: '将你刚刚击倒的人类直接处决。若他是血祭品，所有仍存活的人类恐惧值增加 35。',
    flavor: '光越亮，影子就越深。',
    sourceSkill: 'Cull the Weak',
    unlocked: true,
    killerOnly: '迈克尔·迈尔斯',
    pool: 'killer',
    ops: [],
  },

  {
    id: 'myers_last_best',
    name: '把最好的留在最后',
    cost: 1,
    type: 'skill',
    desc: '当地图上只剩最后一名人类时才能打出：显示这个人的气场 5 次后续行动，并获得一次免费的移动。',
    flavor: '真正的猎杀，总要留到最后。',
    sourceSkill: 'Save the Best for Last',
    unlocked: true,
    killerOnly: '迈克尔·迈尔斯',
    pool: 'killer',
    ops: [{ op: 'flag', key: 'freeMove' }],
  },

  {
    id: 'myers_plaything',
    name: '玩弄食物',
    cost: 0,
    type: 'tactic',
    desc: '仅当视野内至少有一名存活幸存者时才能打出。立即获得 2 点行动点；但本回合不能攻击，任何造成伤害或处决的卡牌也无法打出。',
    flavor: '让他跑。你知道他终究会回来。',
    sourceSkill: 'Play with Your Food',
    unlocked: true,
    killerOnly: '迈克尔·迈尔斯',
    pool: 'killer',
    precheck: { cond: { c: 'visibleSurvivor' }, hint: '视野内没有存活的幸存者，不能打出玩弄食物。' },
    ops: [{ op: 'steps', amount: 2 }, { op: 'flag', key: 'noAttackTurn' }],
  },

  /* 设陷者专属卡：用恐惧驱赶目标、免费破坏设施，并为搬运处决提供路线。 */

  {
    id: 'trapper_panic',
    name: '恐慌降临',
    cost: 0,
    type: 'tactic',
    desc: '当前房间或相邻房间有幸存者时才能打出。使其中一名幸存者恐惧 +25，并迫使其立刻向远离你的方向移动一间房。',
    flavor: '恐惧会替你把猎物赶进陷阱。',
    sourceSkill: 'Unnerving Presence',
    unlocked: true,
    killerOnly: '设陷者',
    pool: 'killer',
    precheck: { cond: { c: 'survivorNearby' }, hint: '当前房间及相邻房间没有可受影响的幸存者。' },
    ops: [{ op: 'fearFlee', amount: 25 }],
  },

  {
    id: 'trapper_brutal_strength',
    name: '所向无敌',
    cost: 0,
    type: 'skill',
    desc: '当前房间有可破坏物品时才能打出。免费破坏其中一处可破坏设施。',
    flavor: '挡在面前的东西，都只是下一堆碎片。',
    sourceSkill: 'Brutal Strength',
    unlocked: true,
    killerOnly: '设陷者',
    pool: 'killer',
    precheck: { cond: { c: 'currentDestructible' }, hint: '当前房间没有可破坏的物品。' },
    ops: [{ op: 'destroyCurrentObject' }],
  },

  {
    id: 'trapper_euphoria',
    name: '欣喜若狂',
    cost: 0,
    type: 'skill',
    desc: '抱起倒地幸存者时才能打出。获得 1 点行动点，并在地图上标出最近的特殊处决地点。',
    flavor: '猎物已经在怀里，接下来只需挑选终点。',
    sourceSkill: 'Agitation',
    unlocked: true,
    killerOnly: '设陷者',
    pool: 'killer',
    precheck: { cond: { c: 'carryingPerson' }, hint: '必须先抱起一名倒地幸存者。' },
    ops: [{ op: 'energy', amount: 1 }, { op: 'revealExecutionSite', turns: 3 }],
  },

];

export const CARD_MAP: Record<string, CardDef> = CARDS.reduce(
  (acc, card) => {
    acc[card.id] = card;
    return acc;
  },
  {} as Record<string, CardDef>,
);

export const INITIAL_CARD_IDS = CARDS.filter((card) => card.pool === 'initial').map((card) => card.id);

export function deckCardsForKiller(killer: string): CardDef[] {
  return CARDS.filter((card) => card.pool === 'initial' || (card.pool === 'killer' && card.killerOnly === killer));
}

export const STARTING_DECK: string[] = [
  'unbreakable', 'unbreakable',
  'hex_huntress', 'hex_noed', 'scourge_shrine', 'distressing',
  'hell', 'iron_grasp', 'iron_grasp', 'deerstalker',
  'hex_ruin', 'bitter_murmur', 'sloppy_butcher', 'insidious', 'sloppy_butcher',
];

/**
 * 任务奖励卡：目前 18 张卡全部在 STARTER_CARDS 里默认解锁，
 * 没有「打任务才拿得到」的卡，所以这张表暂时是空的。
 * 以后要加新卡，把 mission.kind 映射到新卡 id 即可，engine 会自动发放。
 */
export const UNLOCK_REWARDS: Record<string, string> = {};
