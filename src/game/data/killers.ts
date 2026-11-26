import type { KillerPower } from '../effect';

/**
 * ============================================================================
 *  杀手数据库
 * ============================================================================
 *
 *  每位杀手有两个主动能力：
 *    · powers[0]  主力技：冷却 1 回合，每回合都能用，负责建立节奏
 *    · powers[1]  大招：冷却 3 回合，效果强烈，个别还带开启条件
 *
 *  能力效果由 effect.ts 的指令描述。数值可以在游戏主菜单的「平衡调整」里
 *  直接改（冷却、每条指令的数值），改完保存即生效。
 *
 *  幸存者生命值为 4：累计 2 点伤害进入受伤，再累计 2 点倒地。默认挥刀 1 点，
 *  2 点伤害可让健康者受伤、让已受伤者倒地。处决类能力必须先用 `execute` 并带
 *  `requires: [{ c: 'downedHere' }]`，不能凭空秒人。
 */

export type KillerSchool = 'supernatural' | 'grounded';

export interface KillerProfile {
  owner: string;
  title: string;
  /** 力量图标 */
  icon: string;
  /** 立绘；没有就用 icon 兜底 */
  portrait?: string;
  school: KillerSchool;
  sourceNote: string;
  /** 恐惧范围：0潜行、1基础范围、2远距离感知；默认 1 */
  fearRadius?: 0 | 1 | 2;
  /** 被动说明。引擎里真正实现被动的是迈尔斯（尾随值）。 */
  passive?: { name: string; short: string };
  powers: KillerPower[];
}

const NOTE = '力量名称与图标取自图鉴站；能力机制为本作原创。';

export const KILLERS: KillerProfile[] = [
  {
    owner: '设陷者',
    title: '捕兽夹',
    icon: 'assets/dbd/powers/设陷者.png',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'trap_set',
        name: '布设捕兽夹',
        desc: '在当前房间和相邻一个房间布下夹子：逃亡者无法穿过这两个房间 2 回合。',
        cooldown: 1,
        ops: [
          { op: 'lockRoom', room: 'here', turns: 2 },
          { op: 'lockRoom', room: 'adjacent', turns: 2 },
          { op: 'log', text: '你把夹子按下，弹簧的响声被地毯吞掉了。' },
        ],
      },
      {
        id: 'trap_lockdown',
        name: '整层封锁',
        desc: '所有人的腿都被夹住：全场 NPC 2 回合无法移动。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'block', who: 'allAny', turns: 2 },
          { op: 'log', text: '地板下传来一连串金属咬合的声音，再没有人敢迈步。' },
        ],
      },
    ],
  },
  {
    owner: '幽灵',
    title: '骷髅丧钟',
    icon: 'assets/dbd/powers/幽灵.png',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'wraith_bell',
        name: '丧钟',
        desc: '本回合隐身：移动无视相邻限制、不计行动点，进门不会惊动任何人（伏击），也不会惊动目击者。',
        cooldown: 1,
        ops: [
          { op: 'ambush' },
          { op: 'flag', key: 'freeMove' },
          { op: 'flag', key: 'noAlarm' },
          { op: 'steps', amount: 1 },
          { op: 'log', text: '钟声只响了一下，你已经不在原来的位置。' },
        ],
      },
      {
        id: 'wraith_rush',
        name: '穿墙突袭',
        desc: '本回合行动点 +3、无视相邻限制、目击无效，且下次攻击 +2 伤害。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'steps', amount: 3 },
          { op: 'flag', key: 'freeMove' },
          { op: 'flag', key: 'noAlarm' },
          { op: 'bonusDamage', amount: 2 },
          { op: 'log', text: '墙对你来说只是一层薄雾。' },
        ],
      },
    ],
  },
  {
    owner: '护士',
    title: '斯宾塞的濒死之息',
    icon: 'assets/dbd/powers/护士.png',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'nurse_blink',
        name: '瞬步',
        desc: '本回合行动点 +2，移动时不会惊动目击者。',
        cooldown: 1,
        ops: [
          { op: 'steps', amount: 2 },
          { op: 'flag', key: 'noAlarm' },
          { op: 'log', text: '地板在你脚下缩短了一截。' },
        ],
      },
      {
        id: 'nurse_breath',
        name: '窒息之息',
        desc: '当前房间所有人受 1 点伤害，并被压在原地 1 回合；累计伤害达到 2 点才会受伤。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'damage', who: 'allHere', amount: 1 },
          { op: 'block', who: 'allHere', turns: 1 },
          { op: 'log', text: '空气突然变得很重，他们连喊都喊不出来。' },
        ],
      },
    ],
  },
  {
    owner: '女猎手',
    title: '狩猎飞斧',
    icon: 'assets/dbd/powers/女猎手.png',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'huntress_axe',
        name: '投斧',
        desc: '对全场警觉最高的人造成 1 点伤害，不论他躲在哪个房间；可与其他伤害效果叠加。',
        cooldown: 1,
        ops: [
          { op: 'damage', who: 'highestAlert', amount: 1 },
          { op: 'log', text: '斧头穿过走廊，钉在了某扇门框上——后面有人在喘气。' },
        ],
      },
      {
        id: 'huntress_volley',
        name: '连投',
        desc: '对全场警觉最高的人造成 2 点伤害（健康者受伤、受伤者倒地），再对另一人造成 1 点。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'damage', who: 'highestAlert', amount: 2 },
          { op: 'damage', who: 'randomAny', amount: 1 },
          { op: 'log', text: '一把接一把，房子里的每一道门都成了靶子。' },
        ],
      },
    ],
  },
  {
    owner: '鬼面',
    title: '夜幕',
    icon: 'assets/dbd/powers/鬼面.png',
    portrait: 'assets/characters/killers/鬼面.webp',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'ghost_stalk',
        name: '夜幕',
        desc: '拉开夜幕：接下来每回合盯住相邻房间的一名幸存者，监视值累积到 100 他就持续显形（红色小人），下一刀额外造成 1 点伤害；已受伤者会被击倒。有人闯进你所在房间会打断夜幕，且对方能多跑一步。',
        cooldown: 1,
        ops: [
          { op: 'alarm', amount: -10 },
          { op: 'flag', key: 'noAlarm' },
          { op: 'log', text: '你退进阴影里，开始数隔壁的脚步声。' },
        ],
      },
      {
        id: 'ghost_nightfall',
        name: '夜袭 · 收网',
        desc: '本回合行动点 +3、目击无效、下次攻击 +2 伤害。趁监视锁定的已受伤目标还在显形时贴上去，一刀即可击倒。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'steps', amount: 3 },
          { op: 'flag', key: 'noAlarm' },
          { op: 'bonusDamage', amount: 2 },
          { op: 'log', text: '灯灭了，房子开始按你的节奏呼吸。' },
        ],
      },
    ],
  },
  {
    owner: '迈克尔·迈尔斯',
    title: '恶魔附身',
    icon: 'assets/dbd/powers/迈克尔·迈尔斯.png',
    portrait: 'assets/characters/killers/迈尔斯.webp',
    school: 'grounded',
    fearRadius: 1,
    passive: {
      name: '尾随者',
      short: '观察视野内的幸存者积累尾随值；观察本身不会惊动目标。特定配件可重新启用尾随姿态。',
    },
    sourceNote: NOTE,
    powers: [
      {
        id: 'myers_gaze',
        name: '尾随者',
        desc: '每次观察消耗 1 点行动点，对当前视野内任一存活幸存者积累尾随值：未发觉 +15、怀疑 +8、恐慌 +3、警觉 +0。观察不会增加目标警觉、改变其行为，也不会自动进入尾随姿态。特定配件可重新启用旧版尾随姿态。',
        cooldown: 0,
        ops: [],
      },
      {
        id: 'myers_possess',
        name: '恶魔附身',
        desc: '尾随值达到 100 后解锁。开启后每次行动消耗 20 点尾随值，归零时退出；附身期间每次挥刀都能直接击倒一名站立的幸存者。',
        cooldown: 3,
        ultimate: true,
        requires: [{ c: 'stalk', gte: 100 }],
        ops: [
          { op: 'flag', key: 'possessReady' },
          { op: 'log', text: '面具合上了。尾随积攒的恶意终于找到了出口。' },
        ],
      },
    ],
  },
  {
    owner: '贞子',
    title: '怨灵',
    icon: 'assets/dbd/powers/贞子.png',
    portrait: 'assets/characters/killers/贞子.webp',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'sadako_deluge',
        name: '恐惧洪流',
        desc: '全场所有人警觉 +12，并僵住 1 回合。',
        cooldown: 1,
        ops: [
          { op: 'alert', who: 'allAny', amount: 12 },
          { op: 'block', who: 'allAny', turns: 1 },
          { op: 'log', text: '屏幕雪花一闪，每个房间里都多了一道湿脚印。' },
        ],
      },
      {
        id: 'sadako_tape',
        name: '录像带',
        desc: '全场所有人受 1 点伤害，并暴露位置 2 回合。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'damage', who: 'allAny', amount: 1 },
          { op: 'scout', all: true, turns: 2 },
          { op: 'log', text: '七天，从这一秒开始算。' },
        ],
      },
    ],
  },
  {
    owner: '梦魇',
    title: '梦魇之爪',
    icon: 'assets/dbd/powers/梦魇.png',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'freddy_sleep',
        name: '入梦',
        desc: '让全场警觉最高的人陷入梦境：2 回合无法移动，并持续暴露位置。',
        cooldown: 1,
        ops: [
          { op: 'block', who: 'highestAlert', turns: 2 },
          { op: 'track', who: 'highestAlert', turns: 2 },
          { op: 'log', text: '他在走廊里坐了下来，像是突然很困。' },
        ],
      },
      {
        id: 'freddy_nightmare',
        name: '梦魇降临',
        desc: '全场陷入噩梦：所有人警觉 +25、受 1 点伤害，并僵住 1 回合。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'alert', who: 'allAny', amount: 25 },
          { op: 'damage', who: 'allAny', amount: 1 },
          { op: 'block', who: 'allAny', turns: 1 },
          { op: 'log', text: '这栋房子开始按梦的规则运转。' },
        ],
      },
    ],
  },
  {
    owner: '食人魔',
    title: '电锯',
    icon: 'assets/dbd/powers/食人魔.png',
    portrait: 'assets/characters/killers/食人魔.webp',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'cannibal_sprint',
        name: '电锯冲刺',
        desc: '本回合行动点 +2、下次攻击 +1 伤害，但引擎声让暴露度 +1。',
        cooldown: 1,
        ops: [
          { op: 'steps', amount: 2 },
          { op: 'bonusDamage', amount: 1 },
          { op: 'wanted', amount: 1 },
          { op: 'log', text: '引擎拉响，走廊尽头的人开始跑。' },
        ],
      },
      {
        id: 'cannibal_slaughter',
        name: '狂锯',
        desc: '对当前房间所有人造成 2 点伤害（健康直接倒地），暴露度 +3。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'damage', who: 'allHere', amount: 2 },
          { op: 'wanted', amount: 3 },
          { op: 'log', text: '他不再挑选目标了。' },
        ],
      },
    ],
  },
  {
    owner: '处刑者',
    title: '送葬者',
    icon: 'assets/dbd/powers/处刑者.png',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'executioner_chain',
        name: '审判之链',
        desc: '当前房间所有人被钉住，本回合无法逃离。',
        cooldown: 1,
        ops: [
          { op: 'pin', who: 'allHere' },
          { op: 'block', who: 'allHere', turns: 1 },
          { op: 'log', text: '锁链穿过墙壁，另一端握在你手里。' },
        ],
      },
      {
        id: 'executioner_judge',
        name: '处刑',
        desc: '处决当前房间一名倒地的人，暴露度 +2。必须先把他打倒。',
        cooldown: 3,
        ultimate: true,
        requires: [{ c: 'downedHere' }],
        ops: [
          { op: 'execute', who: 'downedHere' },
          { op: 'wanted', amount: 2 },
          { op: 'log', text: '他跪了下来，因为知道自己该跪。' },
        ],
      },
    ],
  },
  {
    owner: '魔王',
    title: '撕裂边界',
    icon: 'assets/dbd/powers/魔王.png',
    school: 'supernatural',
    sourceNote: NOTE,
    powers: [
      {
        id: 'demogorgon_portal',
        name: '裂隙穿行',
        desc: '移动到任意相邻房间且不计行动点，不会惊动目击者。',
        cooldown: 1,
        ops: [
          { op: 'teleportPlayer', to: 'adjacent' },
          { op: 'flag', key: 'noAlarm' },
          { op: 'log', text: '墙面上裂开一道只属于你的门。' },
        ],
      },
      {
        id: 'demogorgon_maul',
        name: '群体撕裂',
        desc: '当前房间所有人受到 2 点伤害，并被按在原地 1 回合。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'damage', who: 'allHere', amount: 2 },
          { op: 'block', who: 'allHere', turns: 1 },
          { op: 'log', text: '花瓣一样的口器张开，房间里的空气被抽走了一半。' },
        ],
      },
    ],
  },
  {
    owner: '医生',
    title: '电击治疗',
    icon: 'assets/dbd/powers/医生.png',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'doctor_shock',
        name: '电击治疗',
        desc: '当前房间所有人僵住 1 回合、警觉 +10，暴露度 +1。',
        cooldown: 1,
        ops: [
          { op: 'block', who: 'allHere', turns: 1 },
          { op: 'alert', who: 'allHere', amount: 10 },
          { op: 'wanted', amount: 1 },
          { op: 'log', text: '他们突然安静下来，服从得不像自己。' },
        ],
      },
      {
        id: 'doctor_madness',
        name: '疯狂',
        desc: '3 回合内没有人能报警，且全场警觉 +20。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'silenceAlarm', turns: 3 },
          { op: 'alert', who: 'allAny', amount: 20 },
          { op: 'log', text: '电流声盖过了所有呼救。' },
        ],
      },
    ],
  },
  {
    owner: '门徒',
    title: '竖锯的洗礼',
    icon: 'assets/dbd/powers/门徒.png',
    portrait: 'assets/characters/killers/门徒.webp',
    school: 'grounded',
    sourceNote: NOTE,
    powers: [
      {
        id: 'pig_ambush',
        name: '伏击',
        desc: '本回合目击无效、行动点 +1，且下次攻击 +1 伤害。',
        cooldown: 1,
        ops: [
          { op: 'flag', key: 'noAlarm' },
          { op: 'steps', amount: 1 },
          { op: 'bonusDamage', amount: 1 },
          { op: 'log', text: '你蹲下去，等到脚步声刚好经过。' },
        ],
      },
      {
        id: 'pig_baptism',
        name: '竖锯的洗礼',
        desc: '全场所有人被套上捕兽夹 2 回合无法移动，并受到 1 点伤害；期间无人能报警。',
        cooldown: 3,
        ultimate: true,
        ops: [
          { op: 'block', who: 'allAny', turns: 2 },
          { op: 'damage', who: 'allAny', amount: 1 },
          { op: 'silenceAlarm', turns: 2 },
          { op: 'log', text: '「我想玩个游戏。」这句话在每个人耳边响起。' },
        ],
      },
    ],
  },
];

export const KILLER_MAP: Record<string, KillerProfile> = KILLERS.reduce(
  (acc, killer) => {
    acc[killer.owner] = killer;
    return acc;
  },
  {} as Record<string, KillerProfile>,
);

/** 当前正式开放的初期角色。其余资料保留在数据库中，待机制实装后再开放。 */
export const ACTIVE_KILLER_NAMES = ['设陷者', '护士', '迈克尔·迈尔斯'] as const;
export const ACTIVE_KILLERS = ACTIVE_KILLER_NAMES.map((name) => KILLER_MAP[name]);
/** 初始解锁名单与当前开放名单保持一致。 */
export const STARTER_KILLERS: string[] = [...ACTIVE_KILLER_NAMES];
