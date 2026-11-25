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
 *  —— 六种战术职责（每张卡至少占一种）——
 *    搜寻   猎鹿者 / 黑暗启迪 / 致命追踪者：点亮地图、找出躲藏者
 *    诱导   鬼鸦谍影 / 人肉烧烤 / 支配之力：制造噪声，把人挪到你想要的位置
 *    破坏   失效开关 / 厄咒：直面黑暗：剪电话、拉电闸
 *    封锁   死锁 / 花言巧语：锁房间、钉死后院
 *    潜行   静止隐身 / 折磨路径 / 恐惧释放：压暴露度、伏击进门
 *    追击   疾速残暴：贴到逃跑的人身后；配合伏击就是「偷袭 → 补刀」的两张牌组合
 *    追猎   辣手屠夫 / 牢牢紧握 / 优胜劣汰 / 恩赐解脱：咬住伤口、按住人、磨刀、处决
 *
 *  —— 伤害只有一处来源 ——
 *    界面上的「挥刀」按钮才是唯一能造成伤害的东西：消耗 1 点能量，
 *    健康 → 受伤，受伤 → 倒地，而且砍完必须再做一件事（挪一步 / 出一张牌）才能砍第二刀。
 *    卡牌不再直接造成伤害，它们只负责：让这一刀更狠（优胜劣汰）、让人跑不掉（牢牢紧握）、
 *    或者告诉你人跑哪去了（辣手屠夫 / 鲜血回响 靠血迹，也就是地板上的红色划痕）。
 *    倒地的人不会自己死，必须用「恩赐解脱」处决，期间可能被同伴救起。
 */

export const CARDS: CardDef[] = [
  /* ------------------------------------------------------------------ */
  /* 追猎：把目标从健康打到倒地，再处决                                   */
  /* ------------------------------------------------------------------ */
  {
    id: 'shuriken',
    name: '辣手屠夫',
    cost: 1,
    type: 'skill',
    desc: '血迹会说话：所有已经受伤的人，接下来 3 回合位置始终可见。先挥一刀，再用这张牌咬住他。',
    flavor: '伤口不深，但一直不肯合上。',
    sourceSkill: 'Sloppy Butcher',
    sourceText: '普通攻击命中后使逃生者出血、重伤。',
    unlocked: true,
    ops: [
      { op: 'track', who: 'injuredAny', turns: 3 },
      { op: 'log', text: '你低头看着地上的血迹——它比他跑得更快。' },
    ],
  },
  {
    id: 'choke',
    name: '牢牢紧握',
    cost: 2,
    type: 'tactic',
    desc: '把当前房间的一名目标死死按住：本回合他跑不掉，也没人能把他拖走。按住了再挥刀。',
    flavor: '抓稳了，就别指望他还能自己走。',
    sourceSkill: 'Iron Grasp',
    sourceText: '搬运逃生者时，其扭动速度大幅减慢。',
    unlocked: true,
    precheck: { cond: { c: 'victimHere' }, hint: '这间屋子里没有能抓住的人。' },
    ops: [
      { op: 'pin', who: 'victim' },
      { op: 'block', who: 'victim', turns: 2 },
      { op: 'log', text: '你攥住他的领口，把他按在墙上，膝盖顶住他的后腰。' },
    ],
  },
  {
    id: 'execute',
    name: '恩赐解脱',
    cost: 3,
    type: 'attack',
    desc: '处决当前房间一名已经倒地的人。挥刀只能把人打倒，最后这一下得靠这张牌。暴露度 +3。',
    flavor: '名单上的人不该开口。',
    sourceSkill: 'Coup de Grâce',
    sourceText: '消耗印记使突进攻击距离增加。',
    unlocked: true,
    precheck: { cond: { c: 'downedHere' }, hint: '当前房间没有倒地的人，处决需要先把目标打倒。' },
    ops: [
      { op: 'execute', who: 'downedHere' },
      { op: 'wanted', amount: 3 },
      { op: 'log', text: '你蹲下去，把最后一点声音按回他喉咙里。' },
    ],
  },
  {
    id: 'harvest',
    name: '鲜血回响',
    cost: 2,
    type: 'skill',
    desc: '伤口连成一条线：所有受伤的人位置暴露 2 回合，暴露度 -6。他们想躲，血先出卖他们。',
    flavor: '第一个之后，剩下的只是惯性。',
    sourceSkill: 'Blood Echo',
    sourceText: '钩住逃生者后，所有受伤逃生者陷入疲劳与出血。',
    unlocked: false,
    ops: [
      { op: 'track', who: 'injuredAny', turns: 2 },
      { op: 'alarm', amount: -6 },
      { op: 'log', text: '血顺着地板缝渗下去，整栋房子的味道都变了。' },
    ],
  },
  {
    id: 'final_blow',
    name: '优胜劣汰',
    cost: 1,
    type: 'skill',
    desc: '磨刀：本回合下一刀的伤害 +1——对健康的人就是一刀倒地。',
    flavor: '结束要干脆。',
    sourceSkill: 'Cull the Weak',
    sourceText: '钩住非血祭品时积累印记，拖慢其他人。',
    unlocked: false,
    precheck: { cond: { c: 'victimHere' }, hint: '这间屋子里没有能下手的人。' },
    ops: [
      { op: 'bonusDamage', amount: 1 },
      { op: 'log', text: '你换了只手握刀，这一下不会再留力。' },
    ],
  },
  {
    id: 'break_in',
    name: '所向无敌',
    cost: 1,
    type: 'skill',
    desc: '撞碎堵门，本回合移动无视相邻限制并清除相邻的障碍物。',
    flavor: '墙从来不是真正的边界。',
    sourceSkill: 'Brutal Strength',
    sourceText: '破坏木板、墙壁和发电机的速度加快。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'clearBarricade' },
      { op: 'flag', key: 'freeMove' },
      { op: 'alarm', amount: 4 },
      { op: 'log', text: '你撞开挡路的家具，木屑落了一地。' },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 潜行：压低暴露度                                             */
  /* ------------------------------------------------------------------ */
  {
    id: 'silent_step',
    name: '静止隐身',
    cost: 1,
    type: 'skill',
    desc: '伏击：本回合进门不惊动任何人，接着挥刀就是偷袭。暴露度 -2，暴露度 -8，目击无效。',
    flavor: '影子不会留下脚印。',
    sourceSkill: 'Insidious',
    sourceText: '闲置后获得无法侦测状态。',
    unlocked: true,
    ops: [
      { op: 'ambush' },
      { op: 'wanted', amount: -2 },
      { op: 'alarm', amount: -8 },
      { op: 'flag', key: 'noAlarm' },
    ],
  },
  {
    id: 'sprint',
    name: '疾速残暴',
    cost: 1,
    type: 'skill',
    desc: '追击：立刻贴到逃跑的人身后（不计行动点，最远两间屋），贴上去就能再挥一刀。行动点 +2。',
    flavor: '脚步声追不上你。',
    sourceSkill: 'Rapid Brutality',
    sourceText: '普通攻击命中后获得急速。',
    unlocked: true,
    ops: [
      { op: 'pursue', who: 'fleeing', distance: 2 },
      { op: 'steps', amount: 2 },
      { op: 'log', text: '本回合行动点 +2。' },
    ],
  },
  {
    id: 'clean',
    name: '折磨路径',
    cost: 1,
    type: 'skill',
    desc: '抹掉痕迹：暴露度 -1、暴露度 -10，并让相邻房间的地面重新安静下来。',
    flavor: '地板干净得像什么都没发生。',
    sourceSkill: 'Trail of Torment',
    sourceText: '破坏发电机后获得无法侦测状态。',
    unlocked: true,
    ops: [
      { op: 'wanted', amount: -1 },
      { op: 'alarm', amount: -10 },
    ],
  },
  {
    id: 'night_cover',
    name: '黑暗启迪',
    cost: 0,
    type: 'skill',
    desc: '抽 1 张牌，同时感知全场：地图上每个人的位置浮出红色人影——只有影子，没有名字，而且只亮这一回合。',
    flavor: '黑暗是你最好的同伙。',
    sourceSkill: 'Darkness Revealed',
    sourceText: '搜索储物柜时显示附近逃生者气场。',
    unlocked: true,
    ops: [
      { op: 'draw', amount: 1 },
      { op: 'pulse' },
      { op: 'log', text: '你闭上眼睛，听见了每一扇门后面的呼吸。' },
    ],
  },
  {
    id: 'silence',
    name: '厄咒：猎手摇篮曲',
    cost: 1,
    type: 'skill',
    desc: '本回合后续卡牌费用 -1（最低为 0），暴露度 -5。',
    flavor: '低语比喊叫更致命。',
    sourceSkill: 'Hex: Huntress Lullaby',
    sourceText: '每层印记让检定更难，五层时没有预警。',
    unlocked: false,
    ops: [
      { op: 'discount', amount: 1 },
      { op: 'alarm', amount: -5 },
      { op: 'log', text: '摇篮曲响起来，房子里的人开始走神。' },
    ],
  },
  {
    id: 'disguise',
    name: '黑暗奉献',
    cost: 2,
    type: 'skill',
    desc: '暴露度减半（向下取整）。',
    flavor: '换一件外套，换一个人。',
    sourceSkill: 'Dark Devotion',
    sourceText: '血祭品受伤时把恐惧范围转移过去。',
    unlocked: true,
    ops: [{ op: 'wantedHalf' }],
  },
  {
    id: 'intimidate',
    name: '恐惧释放',
    cost: 2,
    type: 'skill',
    desc: '本回合无人报警，当前房间所有人警觉 -20，暴露度 -12。',
    flavor: '他们听见了，却不敢说。',
    sourceSkill: 'Distressing',
    sourceText: '恐惧范围扩大，范围内逃生者修理变慢。',
    unlocked: true,
    ops: [
      { op: 'flag', key: 'noAlarm' },
      { op: 'alert', who: 'allHere', amount: -20 },
      { op: 'alarm', amount: -12 },
    ],
  },
  {
    id: 'fear',
    name: '小丑恐惧症',
    cost: 2,
    type: 'skill',
    desc: '全场所有人僵住 1 回合无法移动、无法救援，本回合无人报警。',
    flavor: '他们不是不想跑，是腿不听使唤。',
    sourceSkill: 'Coulrophobia',
    sourceText: '恐惧范围内的逃生者治疗变慢、检定更难。',
    unlocked: false,
    ops: [
      { op: 'block', who: 'allAny', turns: 1 },
      { op: 'flag', key: 'noAlarm' },
      { op: 'log', text: '整栋房子安静下来，连呼吸都停了半拍。' },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 搜寻：把战争迷雾打开                                                 */
  /* ------------------------------------------------------------------ */
  {
    id: 'aim',
    name: '猎鹿者',
    cost: 1,
    type: 'skill',
    desc: '感知全场红色人影，并咬住警觉最高的那个人：接下来 3 回合他的位置始终可见。下一刀 +1 伤害。',
    flavor: '找准那一个瞬间。',
    sourceSkill: 'Deerstalker',
    sourceText: '显示濒死逃生者的气场。',
    unlocked: false,
    ops: [
      { op: 'pulse' },
      { op: 'track', who: 'highestAlert', turns: 3 },
      { op: 'bonusDamage', amount: 1 },
    ],
  },
  {
    id: 'search',
    name: '囤积者',
    cost: 1,
    type: 'skill',
    desc: '搜索当前房间：把躲在柜子、床底的人揪出来（他们无法再躲），证据 +1。',
    flavor: '每一张纸都可能是一把钥匙。',
    sourceSkill: 'Hoarder',
    sourceText: '额外生成箱子，并提示有人开箱。',
    // 这是「证据销毁」唯一稳定的证据来源，必须起始就有
    unlocked: true,
    ops: [
      { op: 'search' },
      { op: 'evidence', amount: 1 },
      { op: 'log', text: '你翻开每一个能藏人的角落。' },
    ],
  },
  {
    id: 'evacuate',
    name: '血腥狱长',
    cost: 3,
    type: 'skill',
    desc: '立即移动到车库（撤离点），暴露度 -2。',
    flavor: '收工也是一种技术。',
    sourceSkill: 'Blood Warden',
    sourceText: '出口开启后封锁两扇大门。',
    unlocked: false,
    ops: [
      { op: 'teleportPlayer', to: 'exit' },
      { op: 'wanted', amount: -2 },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 诱导：制造噪声、把人挪到你要的位置                                   */
  /* ------------------------------------------------------------------ */
  {
    id: 'false_lead',
    name: '鬼祟追杀',
    cost: 2,
    type: 'tactic',
    desc: '本回合没有人能移动，并把一名目标引向远处的房间。',
    flavor: '他们会跑，只是跑错了方向。',
    sourceSkill: 'Furtive Chase',
    sourceText: '钩住血祭品后获得急速与无法侦测。',
    unlocked: true,
    ops: [
      { op: 'block', who: 'allAny', turns: 1 },
      { op: 'move', who: 'victim', to: 'far' },
      { op: 'log', text: '你把脚步声留在反方向，有人真的跟着走了。' },
    ],
  },
  {
    id: 'bait',
    name: '鬼鸦谍影',
    cost: 1,
    type: 'tactic',
    desc: '惊动乌鸦：把当前房间的人引到相邻房间，并侦查那里 1 回合。制造噪声会降低暴露度。',
    flavor: '让他们追逐声音，而不是你。',
    sourceSkill: 'Spies from the Shadows',
    sourceText: '逃生者惊动乌鸦时获得提示。',
    unlocked: true,
    ops: [
      { op: 'lure', to: 'adjacent', count: 2 },
      { op: 'scout', to: 'adjacent', turns: 1 },
      { op: 'alarm', amount: -4 },
    ],
  },
  {
    id: 'mind_control',
    name: '支配之力',
    cost: 2,
    type: 'tactic',
    desc: '把一名远处的目标直接拽到你所在的房间，警觉清零。',
    flavor: '他们会自己走进门里。',
    sourceSkill: 'Dominance',
    sourceText: '图腾首次被祝福时封锁并暴露该逃生者。',
    unlocked: false,
    precheck: { cond: { c: 'targetAway' }, hint: '没有可以被支配的目标。' },
    ops: [{ op: 'move', who: 'victim', to: 'here', clearAlert: true }],
  },
  {
    id: 'lock_door',
    name: '死锁',
    cost: 1,
    type: 'tactic',
    desc: '当前房间封锁 2 回合：NPC 与警察都无法穿过，房间内的人也动不了 1 回合。',
    flavor: '一扇门，换一分钟。',
    sourceSkill: 'Deadlock',
    sourceText: '修理进度最高的发电机被封锁。',
    unlocked: true,
    ops: [
      { op: 'lockRoom', room: 'here', turns: 2 },
      { op: 'block', who: 'allHere', turns: 1 },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 破坏与封锁：切断他们的求救与退路                                     */
  /* ------------------------------------------------------------------ */
  {
    id: 'cut_line',
    name: '失效开关',
    cost: 1,
    type: 'setup',
    desc: '剪断电话线：本局再没有人能打电话报警，正在打电话的人会被打断。',
    flavor: '沉默从一根线开始。',
    sourceSkill: "Dead Man's Switch",
    sourceText: '逃生者停止修理时封锁发电机。',
    unlocked: true,
    ops: [
      { op: 'sabotage', key: 'phone' },
      { op: 'flag', key: 'phoneCut' },
      { op: 'alarm', amount: -6 },
      { op: 'log', text: '电话线被剪断，听筒里只剩下沙沙声。' },
    ],
  },
  {
    id: 'lure',
    name: '人肉烧烤',
    cost: 1,
    type: 'setup',
    desc: '在远处制造动静，把两个人引过去，暴露度 -5。',
    flavor: '一声脆响，就够了。',
    sourceSkill: 'Barbecue & Chilli',
    sourceText: '钩住逃生者后显示远处逃生者气场。',
    unlocked: true,
    ops: [
      { op: 'lure', to: 'far', count: 2 },
      { op: 'alarm', amount: -5 },
      { op: 'log', text: '远处的铁皮桶倒了一地，脚步朝那边去了。' },
    ],
  },
  {
    id: 'wiretap',
    name: '护士的呼唤',
    cost: 1,
    type: 'setup',
    desc: '之后每回合都会报出警察的下一步目的地。',
    flavor: '他们说话的时候，你已经在听了。',
    sourceSkill: "A Nurse's Calling",
    sourceText: '看见正在治疗的逃生者气场。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'wiretap' },
      { op: 'log', text: '你把听筒塞进墙缝，楼下的一切都传了上来。' },
    ],
  },
  {
    id: 'poltergeist',
    name: '厄咒：闹鬼之地',
    cost: 1,
    type: 'setup',
    desc: '本局目击造成的暴露度再 -1（可与失效开关叠加），暴露度 -8。',
    flavor: '家具自己移动时，没人顾得上门口。',
    sourceSkill: 'Hex: Haunted Ground',
    sourceText: '图腾被净化时让所有逃生者陷入危险状态。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'poltergeist' },
      { op: 'alarm', amount: -8 },
      { op: 'log', text: '椅子自己挪了位置，没有人敢承认自己看见了。' },
    ],
  },
  {
    id: 'blackout',
    name: '厄咒：直面黑暗',
    cost: 2,
    type: 'setup',
    desc: '拉闸断电：本回合所有目击无效，封锁逃生点 1 回合，暴露度 -10。',
    flavor: '黑暗是最好的共犯。',
    sourceSkill: 'Hex: Face the Darkness',
    sourceText: '恐惧范围外的人会尖叫并暴露气场。',
    unlocked: false,
    ops: [
      { op: 'sabotage', key: 'lights' },
      { op: 'flag', key: 'noAlarm' },
      { op: 'flag', key: 'exitBlocked', value: 1 },
      { op: 'alarm', amount: -10 },
      { op: 'log', text: '总闸落下，整栋房子连同后院一起沉进黑里。' },
    ],
  },
  {
    id: 'block_gate',
    name: '花言巧语',
    cost: 2,
    type: 'setup',
    desc: '封死逃生点 2 回合，并把车库锁死：期间没有人能翻出后院。',
    flavor: '他们被一扇不该锁的门挡住了。',
    sourceSkill: 'Bamboozle',
    sourceText: '翻窗后封锁该窗户。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'exitBlocked', value: 2 },
      { op: 'lockRoom', room: 'exit', turns: 2 },
      { op: 'log', text: '你把后门的木条一根根钉死。' },
    ],
  },
  {
    id: 'ghost_light',
    name: '致命追踪者',
    cost: 1,
    type: 'setup',
    desc: '本回合行动点 +2，并感知全场红色人影。',
    flavor: '跟着光走的人，不会回头看。',
    sourceSkill: 'Lethal Pursuer',
    sourceText: '开局显示所有逃生者气场。',
    unlocked: false,
    ops: [
      { op: 'steps', amount: 2 },
      { op: 'pulse' },
    ],
  },
  {
    id: 'false_report',
    name: '厄咒：惩戒',
    cost: 2,
    type: 'setup',
    desc: '抹去现场痕迹，大幅压低暴露度（原「提高逮捕阈值」，合并后改为直接降压）。',
    flavor: '给他们一份错误的档案，他们会照着查。',
    sourceSkill: 'Hex: Retribution',
    sourceText: '逃生者祝福图腾时陷入浑然不觉。',
    unlocked: false,
    ops: [
      { op: 'arrestThreshold', amount: 1 },
      { op: 'alarm', amount: -8 },
    ],
  },
];

export const CARD_MAP: Record<string, CardDef> = CARDS.reduce(
  (acc, card) => {
    acc[card.id] = card;
    return acc;
  },
  {} as Record<string, CardDef>,
);

export const STARTING_DECK: string[] = [
  // 伤害全部来自「挥刀」按钮，所以起始牌组是一套「怎么把这一刀砍到人身上」的工具箱：
  // 两张伏击（进门不惊动）、两张追击（追上去）、两张按住（砍第二刀）、一张磨刀。
  'silent_step',
  'silent_step',
  'sprint',
  'sprint',
  'choke',
  'choke',
  'final_blow',
  'shuriken',
  'night_cover',
  'bait',
  'clean',
  'lock_door',
  'cut_line',
  'lure',
  'search',
];

export const UNLOCK_REWARDS: Record<string, string> = {
  assassinate: 'harvest',
  bodyCount: 'final_blow',
  evidence: 'search',
  escape: 'evacuate',
};
