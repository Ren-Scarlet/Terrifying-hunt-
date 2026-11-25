import type { CardDef } from '../types';

/**
 * ============================================================================
 *  卡牌数据库 —— 你以后唯一需要改的文件
 * ============================================================================
 *
 *  每张卡的「效果」由 ops 里的指令列表描述，引擎会逐条执行。
 *  指令清单、可选对象（who）与条件的完整写法见 src/game/effect.ts 顶部。
 *
 *  常见改法：
 *    · 改数值            → 改 amount / turns / gte
 *    · 加一个附带效果     → 往 ops 数组里再写一条指令
 *    · 做成有条件的卡     → { op:'if', cond:{...}, then:[...], else:[...] }
 *    · 让它不能空放       → 补一个 precheck，不满足时不扣能量也不弃牌
 *
 *  卡名采用《黎明杀机》图鉴技能的官方中文名，与 public/assets/dbd/perks
 *  里的图标严格一一对应；sourceSkill 记录英文原名，sourceText 记录原技能
 *  效果，仅作考据，不参与结算。
 */

export const CARDS: CardDef[] = [
  /* ------------------------------------------------------------------ */
  /* 攻击：靠卡牌造成伤害                                                 */
  /* ------------------------------------------------------------------ */
  {
    id: 'shuriken',
    name: '辣手屠夫',
    cost: 1,
    type: 'attack',
    desc: '对当前房间的一名目标造成 2 点伤害，并使其流血：之后每次回合结束再掉 1 点生命。',
    flavor: '伤口不深，但一直不肯合上。',
    sourceSkill: 'Sloppy Butcher',
    sourceText: '普通攻击命中后使逃生者出血、重伤。',
    unlocked: true,
    ops: [
      { op: 'damage', who: 'victim', amount: 2 },
      { op: 'bleed', who: 'victim', amount: 1 },
    ],
  },
  {
    id: 'choke',
    name: '牢牢紧握',
    cost: 2,
    type: 'attack',
    desc: '对当前房间的一名目标造成 4 点伤害；活下来的人会被你死死按住，无法逃离。',
    flavor: '抓稳了，就别指望他还能自己走。',
    sourceSkill: 'Iron Grasp',
    sourceText: '搬运逃生者时，其扭动速度大幅减慢。',
    unlocked: true,
    ops: [
      { op: 'damage', who: 'victim', amount: 4 },
      { op: 'pin', who: 'victim' },
    ],
  },
  {
    id: 'execute',
    name: '恩赐解脱',
    cost: 3,
    type: 'attack',
    desc: '立即击杀当前房间的一名目标；现场痕迹让通缉值再 +3。',
    flavor: '名单上的人不该开口。',
    sourceSkill: 'Coup de Grâce',
    sourceText: '消耗印记使突进攻击距离增加。',
    unlocked: true,
    precheck: { cond: { c: 'victimHere' }, hint: '当前房间没有可以下手的人。' },
    ops: [
      { op: 'kill', who: 'victim' },
      { op: 'wanted', amount: 3 },
    ],
  },
  {
    id: 'harvest',
    name: '鲜血回响',
    cost: 2,
    type: 'attack',
    desc: '若本回合已击杀过目标，对当前房间所有目标造成 3 点伤害并让他们流血。',
    flavor: '第一个之后，剩下的只是惯性。',
    sourceSkill: 'Blood Echo',
    sourceText: '钩住逃生者后，所有受伤逃生者陷入疲劳与出血。',
    unlocked: false,
    precheck: { cond: { c: 'killsThisTurn', gte: 1 }, hint: '本回合还没有击杀，鲜血暂时不会回响。' },
    ops: [
      { op: 'damage', who: 'targetsHere', amount: 3 },
      { op: 'bleed', who: 'targetsHere', amount: 1 },
    ],
  },
  {
    id: 'final_blow',
    name: '优胜劣汰',
    cost: 1,
    type: 'attack',
    desc: '对当前房间生命值不高于 2 的目标造成 5 点伤害；没有合适目标时不会浪费。',
    flavor: '结束要干脆。',
    sourceSkill: 'Cull the Weak',
    sourceText: '钩住非血祭品时积累印记，拖慢其他人。',
    unlocked: false,
    precheck: { cond: { c: 'victimHere', maxHp: 2 }, hint: '当前房间没有生命值不高于 2 的目标。' },
    ops: [{ op: 'damage', who: 'lowestHpHere', amount: 5, maxHp: 2 }],
  },
  {
    id: 'break_in',
    name: '所向无敌',
    cost: 1,
    type: 'skill',
    desc: '撞碎当前房间的堵门，本回合移动无视相邻限制并清除相邻的障碍物。',
    flavor: '墙从来不是真正的边界。',
    sourceSkill: 'Brutal Strength',
    sourceText: '破坏木板、墙壁和发电机的速度加快。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'clearBarricade' },
      { op: 'flag', key: 'freeMove' },
      { op: 'log', text: '你撞开挡路的家具，木屑落了一地。' },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 技能：改变自身的状态与节奏                                           */
  /* ------------------------------------------------------------------ */
  {
    id: 'silent_step',
    name: '静止隐身',
    cost: 1,
    type: 'skill',
    desc: '通缉值 -2，本回合不会惊动任何目击者。',
    flavor: '影子不会留下脚印。',
    sourceSkill: 'Insidious',
    sourceText: '闲置后获得无法侦测状态。',
    unlocked: true,
    ops: [
      { op: 'wanted', amount: -2 },
      { op: 'flag', key: 'noAlarm' },
    ],
  },
  {
    id: 'sprint',
    name: '疾速残暴',
    cost: 1,
    type: 'skill',
    desc: '本回合移动步数 +2。',
    flavor: '脚步声追不上你。',
    sourceSkill: 'Rapid Brutality',
    sourceText: '普通攻击命中后获得急速。',
    unlocked: true,
    ops: [
      { op: 'steps', amount: 2 },
      { op: 'log', text: '本回合步数 +2。' },
    ],
  },
  {
    id: 'clean',
    name: '折磨路径',
    cost: 1,
    type: 'skill',
    desc: '通缉值 -1，本回合目击者不会报警。',
    flavor: '地板干净得像什么都没发生。',
    sourceSkill: 'Trail of Torment',
    sourceText: '破坏发电机后获得无法侦测状态。',
    unlocked: true,
    ops: [
      { op: 'wanted', amount: -1 },
      { op: 'flag', key: 'noAlarm' },
    ],
  },
  {
    id: 'night_cover',
    name: '黑暗启迪',
    cost: 0,
    type: 'skill',
    desc: '抽 1 张牌。',
    flavor: '黑暗是你最好的同伙。',
    sourceSkill: 'Darkness Revealed',
    sourceText: '搜索储物柜时显示附近逃生者气场。',
    unlocked: true,
    ops: [
      { op: 'draw', amount: 1 },
      { op: 'log', text: '你在黑暗里摸到了另一样东西。' },
    ],
  },
  {
    id: 'silence',
    name: '厄咒：猎手摇篮曲',
    cost: 1,
    type: 'skill',
    desc: '本回合后续卡牌费用 -1（最低为 0）。',
    flavor: '低语比喊叫更致命。',
    sourceSkill: 'Hex: Huntress Lullaby',
    sourceText: '每层印记让检定更难，五层时没有预警。',
    unlocked: false,
    ops: [
      { op: 'discount', amount: 1 },
      { op: 'log', text: '摇篮曲响起来，房子里的人开始走神。' },
    ],
  },
  {
    id: 'disguise',
    name: '黑暗奉献',
    cost: 2,
    type: 'skill',
    desc: '通缉值减半（向下取整）。',
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
    desc: '本回合无人报警，当前房间所有人的警觉 -20。',
    flavor: '他们听见了，却不敢说。',
    sourceSkill: 'Distressing',
    sourceText: '恐惧范围扩大，范围内逃生者修理变慢。',
    unlocked: true,
    ops: [
      { op: 'flag', key: 'noAlarm' },
      { op: 'alert', who: 'allHere', amount: -20 },
    ],
  },
  {
    id: 'fear',
    name: '小丑恐惧症',
    cost: 2,
    type: 'skill',
    desc: '全场所有 NPC 僵住 1 回合无法移动，本回合无人报警。',
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
  {
    id: 'aim',
    name: '猎鹿者',
    cost: 1,
    type: 'skill',
    desc: '暴露全场所有人的位置，本回合下次攻击伤害 +2。',
    flavor: '找准那一个瞬间。',
    sourceSkill: 'Deerstalker',
    sourceText: '显示濒死逃生者的气场。',
    unlocked: false,
    ops: [
      { op: 'reveal' },
      { op: 'bonusDamage', amount: 2 },
    ],
  },
  {
    id: 'evacuate',
    name: '血腥狱长',
    cost: 3,
    type: 'skill',
    desc: '立即移动到车库（撤离点），通缉值 -2。',
    flavor: '收工也是一种技术。',
    sourceSkill: 'Blood Warden',
    sourceText: '出口开启后封锁两扇大门。',
    unlocked: false,
    ops: [
      { op: 'teleportPlayer', to: 'exit' },
      { op: 'wanted', amount: -2 },
    ],
  },
  {
    id: 'search',
    name: '囤积者',
    cost: 1,
    type: 'skill',
    desc: '证据 +1。',
    flavor: '每一张纸都可能是一把钥匙。',
    sourceSkill: 'Hoarder',
    sourceText: '额外生成箱子，并提示有人开箱。',
    unlocked: false,
    ops: [
      { op: 'evidence', amount: 1 },
      { op: 'log', text: '你翻出一份不该留在这里的档案。' },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* 战术：操控警察与 NPC 的走向                                          */
  /* ------------------------------------------------------------------ */
  {
    id: 'false_lead',
    name: '鬼祟追杀',
    cost: 2,
    type: 'tactic',
    desc: '本回合没有人能逃出这栋房子，并把一个目标引向错误方向。',
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
    id: 'lock_door',
    name: '死锁',
    cost: 1,
    type: 'tactic',
    desc: '当前房间封锁 2 回合：NPC 与警察都无法穿过。',
    flavor: '一扇门，换一分钟。',
    sourceSkill: 'Deadlock',
    sourceText: '修理进度最高的发电机被封锁。',
    unlocked: true,
    ops: [
      { op: 'lockRoom', room: 'here', turns: 2 },
      { op: 'block', who: 'allHere', turns: 1 },
    ],
  },
  {
    id: 'bait',
    name: '鬼鸦谍影',
    cost: 1,
    type: 'tactic',
    desc: '惊动乌鸦：暴露全场位置，并把警觉最高的人引到相邻房间。',
    flavor: '让他们追逐声音，而不是你。',
    sourceSkill: 'Spies from the Shadows',
    sourceText: '逃生者惊动乌鸦时获得提示。',
    unlocked: true,
    ops: [
      { op: 'reveal' },
      { op: 'move', who: 'highestAlert', to: 'adjacent' },
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

  /* ------------------------------------------------------------------ */
  /* 布局：布置现场，改变整局的规则                                       */
  /* ------------------------------------------------------------------ */
  {
    id: 'cut_line',
    name: '失效开关',
    cost: 1,
    type: 'setup',
    desc: '剪断电话线：本局再没有人能打电话报警。',
    flavor: '沉默从一根线开始。',
    sourceSkill: "Dead Man's Switch",
    sourceText: '逃生者停止修理时封锁发电机。',
    unlocked: true,
    ops: [
      { op: 'flag', key: 'phoneCut' },
      { op: 'log', text: '电话线被剪断，听筒里只剩下沙沙声。' },
    ],
  },
  {
    id: 'lure',
    name: '人肉烧烤',
    cost: 1,
    type: 'setup',
    desc: '把一名目标引到远处房间并清空警觉，同时暴露全场位置。',
    flavor: '一声脆响，就够了。',
    sourceSkill: 'Barbecue & Chilli',
    sourceText: '钩住逃生者后显示远处逃生者气场。',
    unlocked: true,
    ops: [
      { op: 'move', who: 'victim', to: 'far', clearAlert: true },
      { op: 'reveal' },
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
    desc: '本局目击造成的通缉值再 -1（可与失效开关叠加）。',
    flavor: '家具自己移动时，没人顾得上门口。',
    sourceSkill: 'Hex: Haunted Ground',
    sourceText: '图腾被净化时让所有逃生者陷入危险状态。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'poltergeist' },
      { op: 'log', text: '椅子自己挪了位置，没有人敢承认自己看见了。' },
    ],
  },
  {
    id: 'blackout',
    name: '厄咒：直面黑暗',
    cost: 2,
    type: 'setup',
    desc: '拉闸断电：本回合所有目击无效，并封锁逃生点 1 回合。',
    flavor: '黑暗是最好的共犯。',
    sourceSkill: 'Hex: Face the Darkness',
    sourceText: '恐惧范围外的人会尖叫并暴露气场。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'noAlarm' },
      { op: 'flag', key: 'exitBlocked', value: 1 },
      { op: 'log', text: '总闸落下，整栋房子连同后院一起沉进黑里。' },
    ],
  },
  {
    id: 'block_gate',
    name: '花言巧语',
    cost: 2,
    type: 'setup',
    desc: '封死逃生点 2 回合，期间没有人能翻出后院。',
    flavor: '他们被一扇不该锁的门挡住了。',
    sourceSkill: 'Bamboozle',
    sourceText: '翻窗后封锁该窗户。',
    unlocked: false,
    ops: [
      { op: 'flag', key: 'exitBlocked', value: 2 },
      { op: 'log', text: '你把后门的木条一根根钉死。' },
    ],
  },
  {
    id: 'ghost_light',
    name: '致命追踪者',
    cost: 1,
    type: 'setup',
    desc: '本回合步数 +2，并暴露全场所有人的位置。',
    flavor: '跟着光走的人，不会回头看。',
    sourceSkill: 'Lethal Pursuer',
    sourceText: '开局显示所有逃生者气场。',
    unlocked: false,
    ops: [
      { op: 'steps', amount: 2 },
      { op: 'reveal' },
    ],
  },
  {
    id: 'false_report',
    name: '厄咒：惩戒',
    cost: 2,
    type: 'setup',
    desc: '本局警察逮捕阈值提高 1。',
    flavor: '给他们一份错误的档案，他们会照着查。',
    sourceSkill: 'Hex: Retribution',
    sourceText: '逃生者祝福图腾时陷入浑然不觉。',
    unlocked: false,
    ops: [{ op: 'arrestThreshold', amount: 1 }],
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
  'shuriken',
  'shuriken',
  'shuriken',
  'choke',
  'choke',
  'silent_step',
  'silent_step',
  'sprint',
  'bait',
  'clean',
  'night_cover',
  'lock_door',
  'cut_line',
  'lure',
];

export const UNLOCK_REWARDS: Record<string, string> = {
  assassinate: 'harvest',
  bodyCount: 'final_blow',
  evidence: 'search',
  ritual: 'silence',
  escape: 'evacuate',
};
