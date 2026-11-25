import type { RoomId } from './types';

/**
 * ============================================================================
 *  效果程序（Effect DSL）
 * ============================================================================
 *
 * 这是整个游戏里唯一需要你改的地方：卡牌效果、杀手能力全部由下面的
 * 「指令列表」描述，engine.ts 里的解释器会逐条执行。改数字、改顺序、
 * 加条件都在 src/game/data/cards.ts 与 src/game/data/killers.ts 里，
 * 不需要动引擎，也不需要 AI。
 *
 * 一条指令长这样：{ op: 'damage', who: 'victim', amount: 2 }
 *
 * —— 可选的对象（who）——
 *   victim        当前房间最优先的一个人（标记目标 > 目标 > 平民）
 *   lowestHpHere  当前房间血量最低的人
 *   highestAlert  全场警觉最高的人
 *   targetsHere   当前房间所有“目标”
 *   civilsHere    当前房间所有平民
 *   allHere       当前房间所有非警察
 *   markedAny     全场被标记的目标
 *   allAny        全场所有非警察
 *   fleeing       全场正在逃跑的人
 *   randomAny     全场随机一人
 *
 * —— 可选的指令（op）——
 *   damage     造成伤害          { who, amount, maxHp? }
 *   kill       直接击杀          { who }
 *   wanted     通缉值增减        { amount }（负数就是降低）
 *   alert      警觉度增减        { who, amount }
 *   block      无法移动 N 回合   { who, turns }
 *   pin        击杀前无法逃离    { who }
 *   move       强制移动          { who, to, clearAlert? }
 *   draw       抽牌              { amount }
 *   energy     能量增减          { amount }
 *   steps      步数增减          { amount }
 *   evidence   证据增减          { amount }
 *   heal       恢复生命          { who, amount }
 *   bleed      流血（回合结束掉血）{ who, amount }
 *   flag       设置一个全局开关  { key, value? }
 *   log        往行动日志写一句   { text }
 *   if         条件分支          { cond, then, else? }
 *
 * —— 全局开关（flag）——
 *   phoneCut       电话线被剪断，没有人能报警
 *   wiretap        窃听，回合结束会报出警察下一步去向
 *   poltergeist    灵异事件，目击导致的通缉再 -1
 *   policeBlocked  警察下回合无法移动
 *   noAlarm        本回合所有目击无效
 *   exitBlocked    封锁逃生点（配合 turns）
 *   clearbarricade 拆掉当前房间的堵门
 *   freeMove       本回合移动无视相邻限制
 *   possessReady   允许进入恶魔附身
 */

/* ------------------------------------------------------------------ */
/* 选择目标                                                             */
/* ------------------------------------------------------------------ */

export type Who =
  | 'victim'
  | 'lowestHpHere'
  | 'highestAlert'
  | 'targetsHere'
  | 'civilsHere'
  | 'allHere'
  | 'markedAny'
  | 'allAny'
  | 'fleeing'
  | 'randomAny';

export type Dest = 'here' | 'adjacent' | 'far' | 'exit' | 'garden' | RoomId;

export type FlagKey =
  | 'phoneCut'
  | 'wiretap'
  | 'poltergeist'
  | 'policeBlocked'
  | 'noAlarm'
  | 'exitBlocked'
  | 'clearBarricade'
  | 'freeMove'
  | 'possessReady';

/* ------------------------------------------------------------------ */
/* 条件                                                                */
/* ------------------------------------------------------------------ */

export type Cond =
  | { c: 'killsThisTurn'; gte: number }
  | { c: 'peopleHere'; gte: number }
  /** 当前房间有没有能下手的人（可选限定血量上限） */
  | { c: 'victimHere'; maxHp?: number }
  /** 场上有没有不在你房间里的目标 */
  | { c: 'targetAway' }
  | { c: 'energy'; gte: number }
  | { c: 'wanted'; gte?: number; lte?: number }
  | { c: 'stalk'; gte: number }
  | { c: 'possession' }
  | { c: 'flag'; key: FlagKey }
  | { c: 'room'; is: RoomId }
  | { c: 'markedAlive' }
  | { c: 'escaped'; gte: number }
  | { c: 'hasThreat'; v: 'alarm' | 'lead' | 'team' | 'spiritual' };

/* ------------------------------------------------------------------ */
/* 指令                                                                */
/* ------------------------------------------------------------------ */

export type Op =
  | { op: 'damage'; who: Who; amount: number; maxHp?: number }
  | { op: 'kill'; who: Who }
  | { op: 'wanted'; amount: number }
  /** 通缉值减半（向下取整） */
  | { op: 'wantedHalf' }
  | { op: 'alert'; who: Who; amount: number }
  | { op: 'block'; who: Who; turns: number }
  | { op: 'pin'; who: Who }
  /** 把某个 NPC 挪到别处 */
  | { op: 'move'; who: Who; to: Dest; clearAlert?: boolean }
  /** 把玩家自己挪到别处 */
  | { op: 'teleportPlayer'; to: Dest }
  /** 锁住一个房间：NPC 与警察都无法穿过，玩家可以进 */
  | { op: 'lockRoom'; room: Dest; turns: number }
  | { op: 'draw'; amount: number }
  | { op: 'energy'; amount: number }
  | { op: 'steps'; amount: number }
  | { op: 'evidence'; amount: number }
  /** 本回合后续卡牌费用减少 */
  | { op: 'discount'; amount: number }
  /** 本回合下次攻击的额外伤害 */
  | { op: 'bonusDamage'; amount: number }
  /** 提高警察的逮捕阈值 */
  | { op: 'arrestThreshold'; amount: number }
  /** 暴露全场所有人的位置（写进日志 + 地图上显示意图） */
  | { op: 'reveal' }
  | { op: 'heal'; who: Who; amount: number }
  | { op: 'bleed'; who: Who; amount: number }
  /** 尾随值增减（迈尔斯专用，其它杀手没有这条槽） */
  | { op: 'stalk'; amount: number }
  /** 让全场在 N 回合内无法报警 */
  | { op: 'silenceAlarm'; turns: number }
  | { op: 'flag'; key: FlagKey; value?: number | boolean }
  | { op: 'log'; text: string }
  | { op: 'if'; cond: Cond; then: Op[]; else?: Op[] };

/** 出牌前的检查：返回一段话表示“这张牌现在打不出去”，返回 null 表示可以打。 */
export interface Precheck {
  cond: Cond;
  /** 不满足时给玩家的提示，会被写进行动日志 */
  hint: string;
}

/** 杀手能力 */
export interface KillerPower {
  id: string;
  name: string;
  desc: string;
  /** 冷却回合数：1 表示每回合都能用 */
  cooldown: number;
  /** 大招：冷却更长，通常还带额外开启条件 */
  ultimate?: boolean;
  /** 开启条件（全部满足才亮起） */
  requires?: Cond[];
  ops: Op[];
}
