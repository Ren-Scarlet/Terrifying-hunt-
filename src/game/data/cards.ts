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
 *  —— 伤害与生死 ——
 *    默认挥刀造成 1 点伤害；幸存者生命值为 4，累计受到 2 点伤害进入受伤，再累计 2 点倒地。
 *    卡牌可通过 bonusDamage、damage、down 等 DSL 指令改变伤害或状态；血祭品由独立 who 目标选择器引用。
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
    desc: '磨刀：本回合下一刀的伤害 +1（总计 2 点）；健康者进入受伤，已受伤者会被击倒。',
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
    desc: '伏击：本回合进门不惊动任何人。目标独处且尚未察觉时，第一刀造成 2 点伤害，打开致命窗口。暴露度 -2，目击无效。',
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
    desc: '剪断电话线路：阻断电话报警与跨区域救援协调；附近幸存者仍能听见呼救，无线电若未被破坏仍可在有限范围内协调。正在打电话的人会被打断。',
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

  /* ------------------------------------------------------------------ */
  /* 新版初始卡池：基础追猎 / 情报 / 压制                                  */
  /* ------------------------------------------------------------------ */
  {
    id: 'unbreakable',
    name: '不屈不挠',
    cost: 0,
    type: 'skill',
    desc: '抽 1 张牌，并立即收回刀锋；本次收刀不额外消耗行动点。',
    flavor: '只要还站着，就还有下一步。',
    sourceSkill: 'Unbreakable',
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
    desc: '启用图腾诅咒。首次对幸存者造成伤害时，在地图上生成一个图腾。',
    flavor: '第一滴血，唤醒了诅咒。',
    sourceSkill: 'Hex: Blood Favour',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'hexHuntress' }],
  },
  {
    id: 'hex_noed',
    name: '厄咒：难逃一死',
    cost: 1,
    type: 'setup',
    desc: '启用末局诅咒：团队进度达到第 4 阶段且至少有一个图腾存留时，获得 2 点行动点，攻击可直接击倒站立的幸存者。',
    flavor: '最后一道门打开时，真正的猎杀才开始。',
    sourceSkill: 'Hex: No One Escapes Death',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'hexNoed' }],
  },
  {
    id: 'scourge_shrine',
    name: '天灾：鬼魔神龛',
    cost: 1,
    type: 'setup',
    desc: '准备下一次攻击：若命中的幸存者位于厨房特殊处决地点，团队任务进度倒退。',
    flavor: '神龛从不接受免费的供奉。',
    sourceSkill: 'Scourge Hook: Gift of Pain',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'scourgeShrine' }],
  },
  {
    id: 'distressing',
    name: '恐惧释放',
    cost: 1,
    type: 'skill',
    desc: '启用恐惧压制：处于你的恐惧范围内的幸存者，团队任务推进速度降低。',
    flavor: '恐惧会吞掉他们的时间。',
    sourceSkill: 'Distressing',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'distressing' }],
  },
  {
    id: 'hell',
    name: '恶灵地狱',
    cost: 1,
    type: 'skill',
    desc: '短暂感知你周围一格房间内的幸存者；迷雾地图上浮现红色人影，持续 1 次后续行动。',
    flavor: '墙壁挡得住视线，挡不住恶意。',
    sourceSkill: 'Hellish Ground',
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
    ops: [{ op: 'pin', who: 'victim' }],
  },
  {
    id: 'deerstalker',
    name: '猎鹿者',
    cost: 1,
    type: 'skill',
    desc: '短暂显现距离你最近的一条脚印路线，持续 1 次后续行动。',
    flavor: '猎物留下的每一步，都会成为路标。',
    sourceSkill: 'Deerstalker',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'revealNearestTrail', value: 1 }],
  },
  {
    id: 'hex_ruin',
    name: '粉碎希望',
    cost: 1,
    type: 'setup',
    desc: '启用破坏诅咒：首次破坏道具箱、发电机或电闸时，额外降低团队任务进度。',
    flavor: '他们辛苦完成的东西，会再次归于废墟。',
    sourceSkill: 'Hex: Ruin',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'hexRuin' }],
  },
  {
    id: 'bitter_murmur',
    name: '苦涩低语',
    cost: 1,
    type: 'skill',
    desc: '显示正在推进团队任务的幸存者，持续 2 次后续行动；若团队进度已进入第 4 阶段，则显示所有幸存者。',
    flavor: '每一次努力，都在黑暗中留下回声。',
    sourceSkill: 'Bitter Murmur',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'revealWorkers', value: 2 }],
  },
  {
    id: 'sloppy_butcher',
    name: '辣手屠夫',
    cost: 1,
    type: 'skill',
    desc: '下一次攻击伤害 +1。',
    flavor: '刀口不必很深，只要足够致命。',
    sourceSkill: 'Sloppy Butcher',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'bonusDamage', amount: 1 }],
  },
  {
    id: 'insidious',
    name: '静止隐身',
    cost: 1,
    type: 'skill',
    desc: '下一次行动期间，恐惧范围暂时变为 0。',
    flavor: '不动的时候，连恐惧也找不到你。',
    sourceSkill: 'Insidious',
    unlocked: true,
    pool: 'initial',
    ops: [{ op: 'flag', key: 'stealthNext', value: 2 }],
  },

  /* ------------------------------------------------------------------ */
  /* 迈尔斯专属构筑：三种印记独立计数                                      */
  /* ------------------------------------------------------------------ */
  {
    id: 'myers_eclipse_light',
    name: '湮灭之光',
    cost: 1,
    type: 'skill',
    desc: '击倒非血祭品后才能打出，获得 1 枚湮灭印记。每枚印记降低普通幸存者的团队进度效率，同时让血祭品推进得更快。',
    flavor: '光越亮，影子就越深。',
    sourceSkill: 'Dying Light',
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
    desc: '打出后启用效果：攻击非血祭品时获得 1 枚独立印记。擦刀时移除 2 枚此类印记；移除印记不会额外消耗行动。',
    flavor: '真正的猎杀，总要留到最后。',
    sourceSkill: 'Save the Best for Last',
    unlocked: true,
    killerOnly: '迈克尔·迈尔斯',
    pool: 'killer',
    ops: [{ op: 'flag', key: 'myersLastBest' }],
  },
  {
    id: 'myers_plaything',
    name: '戏耍食物',
    cost: 1,
    type: 'tactic',
    desc: '视野内存在血祭品时才能打出：血祭品立即额外行动一次并逃离你的视线，你获得 1 枚食物印记。每 2 枚印记使你获得 1 点行动点，最多获得 4 点；攻击命中后失去 1 枚。',
    flavor: '让他跑。你知道他终究会回来。',
    sourceSkill: 'Play with Your Food',
    unlocked: true,
    killerOnly: '迈克尔·迈尔斯',
    pool: 'killer',
    ops: [],
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

export const UNLOCK_REWARDS: Record<string, string> = {
  assassinate: 'harvest',
  bodyCount: 'final_blow',
  evidence: 'search',
  escape: 'evacuate',
};
