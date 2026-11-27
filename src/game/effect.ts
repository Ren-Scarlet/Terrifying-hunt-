import type { RoomId } from './types';

/**
 * ============================================================================
 *  效果程序（Effect DSL）
 * ============================================================================
 *
 * 卡牌效果、杀手能力全部由下面的「指令列表」描述，engine.ts 的解释器逐条执行。
 * 平时调平衡不需要改引擎，在游戏主菜单的「平衡调整」里直接改数字即可，
 * 想写成固定数据就改 src/game/data/cards.ts 与 src/game/data/killers.ts。
 *
 * 一条指令长这样：{ op: 'pin', who: 'victim' }；一张牌的 ops 就是一串这样的指令。
 * 卡牌与杀手能力可以造成伤害、控制、侦查、追踪、封锁和资源变化；具体效果以 cards.ts 与 killers.ts 中的指令配置为准。
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
 *   downedHere    当前房间倒地的人（处决目标）
 *   downedAny     全场倒地的人（仅用于明确的全场效果）
 *   injuredAny    全场受伤的人（生命值 1–2）
 *   bloodSacrifice 本局随机标记的血祭品
 *   randomAny     全场随机一人
 *
 * —— 伤害与生死 ——
 *   damage     造成指定点数伤害；伤害来源可以是普通攻击、卡牌或杀手能力。
 *   down       击倒目标；具体限制由执行器和目标状态决定。
 *   execute    处决倒地目标，直接死亡。
 *   kill       立即死亡，保留给明确的即死效果。
 *   heal       治疗受伤目标；倒地目标使用 rescue。
 *   rescue     救援：倒地→受伤。
 *   bleed      流血：每回合结束造成伤害。
 *
 * —— 情报与掌控 ——
 *   scout      侦查一个房间（或全场），点亮地图、看见里面的人
 *   pulse      感知全场：只在地图上浮出红色人影，不告诉你那是谁，也只亮这一回合
 *   search     搜索当前房间：把躲在柜子里的人揪出来
 *   track      追踪一个人 N 回合，位置始终可见
 *   reveal     暴露全场所有人的位置（写进日志）
 *   lure       制造噪声，把附近的人吸引到指定房间
 *   alarm      增减警报；60 开放逃生点，100 触发最终危机，回合结束按规则衰减
 *
 * —— 移动与封锁 ——
 *   block      无法移动 N 回合        { who, turns }
 *   pin        击杀前无法逃离         { who }
 *   move       强制移动              { who, to, clearAlert? }
 *   teleportPlayer  把自己挪走        { to }
 *   lockRoom   锁住房间 N 回合        { room, turns }
 *   sabotage   破坏设施              { key: 'phone' | 'exit' | 'radio' | 'lights' }
 *   flag       设置一个全局开关        { key, value? }
 *
 * —— 潜行与追击（把「进门就惊动」「跑了追不上」交给卡牌）——
 *   ambush     伏击：本回合进门不惊动任何人（不加警觉、不喊人、不会夺门而逃）
 *   pursue     追击：立刻贴到目标所在房间，不计步数
 *
 * —— 资源 ——
 *   draw / energy / steps / discount / bonusDamage / arrestThreshold
 *   wanted / wantedHalf / stalk / silenceAlarm / stun
 *
 * —— 流程 ——
 *   log        往行动日志写一句   { text }
 *   if         条件分支          { cond, then, else? }
 *
 * —— 全局开关（flag）——
 *   phoneCut       电话线被剪断，没有人能报警
 *   wiretap        窃听，回合结束会报出警察下一步去向
 *   poltergeist    灵异事件，目击导致的暴露度再 -10
 *   policeBlocked  警察下回合无法移动
 *   noAlarm        本回合所有目击无效
 *   exitBlocked    封锁逃生点（配合 value 指定回合）
 *   clearBarricade 拆掉当前房间的堵门
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
  | 'downedHere'
  | 'downedAny'
  | 'injuredAny'
  | 'bloodSacrifice'
  | 'randomAny'
  /** 相邻房间里还没察觉到你的人（藏起来的除外） */
  | 'unawareNearby';

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
  | 'possessReady'
  | 'myersStalk'
  | 'hexHuntress'
  | 'hexNoed'
  | 'scourgeShrine'
  | 'distressing'
 
  | 'stealthNext'
  | 'revealAura'
  | 'revealNearestTrail'
  | 'myersLastBest'
  | 'bitterMurmur'
  | 'bleedNextHit'
  | 'noAttackTurn';

export type SabotageKey = 'phone' | 'exit' | 'radio' | 'lights';

/* ------------------------------------------------------------------ */
/* 条件                                                                */
/* ------------------------------------------------------------------ */

export type Cond =
  | { c: 'killsThisTurn'; gte: number }
  | { c: 'peopleHere'; gte: number }
  /** 当前房间有没有能下手的人（可选限定血量上限） */
  | { c: 'victimHere'; maxHp?: number }
  /** 当前房间有没有倒地的人：处决类卡牌的前提 */
  | { c: 'downedHere' }
  /** 当前房间有没有受伤的人：治疗类卡牌的前提 */
  | { c: 'injuredHere' }
  /** 场上有没有不在你房间里的目标 */
  | { c: 'targetAway' }
  | { c: 'energy'; gte: number }
  | { c: 'wanted'; gte?: number; lte?: number }
  | { c: 'alarm'; gte?: number; lte?: number }
  | { c: 'stalk'; gte: number }
  | { c: 'possession' }
  /** 视野中至少有一名存活幸存者 */
  | { c: 'visibleSurvivor' }
  | { c: 'survivorNearby' }
  | { c: 'carryingPerson' }
  | { c: 'currentDestructible' }
  | { c: 'flag'; key: FlagKey }
  | { c: 'room'; is: RoomId }
  | { c: 'markedAlive' }
  | { c: 'escaped'; gte: number }
  | { c: 'hasThreat'; v: 'alarm' | 'lead' | 'brave' | 'spiritual' }
  | { c: 'hasArchetype'; a: 'alert' | 'defiant' | 'caller' | 'rescuer' | 'hider' | 'brave' };

/* ------------------------------------------------------------------ */
/* 指令                                                                */
/* ------------------------------------------------------------------ */

export type Op =
  | { op: 'damage'; who: Who; amount: number; maxHp?: number }
  /** 发动一次真正的攻击；仅命中时施加流血 / 状态。 */
  | { op: 'attack'; who: Who; bleedTurns: number; status: 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed'; statusTurns: number }
  /** 把受伤的人击倒；对健康的人无效 */
  | { op: 'down'; who: Who }
  /** 处决倒地的人 */
  | { op: 'execute'; who: Who }
  | { op: 'kill'; who: Who }
  | { op: 'wanted'; amount: number }
  /** 暴露度减半（向下取整） */
  | { op: 'wantedHalf' }
  | { op: 'alert'; who: Who; amount: number }
  | { op: 'block'; who: Who; turns: number }
  | { op: 'status'; who: Who; status: 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed'; turns: number }
  | { op: 'pin'; who: Who }
  /** 把某个 NPC 挪到别处 */
  | { op: 'move'; who: Who; to: Dest; clearAlert?: boolean }
  /** 把玩家自己挪到别处 */
  | { op: 'teleportPlayer'; to: Dest }
  /** 锁住一个房间：NPC 与警察都无法穿过，玩家可以进 */
  | { op: 'lockRoom'; room: Dest; turns: number }
  /** 侦查：点亮房间并看见里面的人；adj 表示同时点亮相邻的所有房间 */
  | { op: 'scout'; to?: Dest; all?: boolean; adj?: boolean; turns?: number }
  /** 追踪一个人 N 回合 */
  | { op: 'track'; who: Who; turns: number }
  /** 制造噪声：把附近的人吸到目标房间 */
  | { op: 'lure'; to: Dest; count: number }
  /** 暴露度增减 */
  | { op: 'alarm'; amount: number }
  /** 破坏设施 */
  | { op: 'sabotage'; key: SabotageKey }
  | { op: 'contextSabotage' }
  /** 令当前房间或相邻房间的一名幸存者恐惧上升，并向远离杀手的方向移动一间房。 */
  | { op: 'fearFlee'; amount: number }
  /** 恐惧波：全场恐惧 + amount × （受伤 + 倒地 + 已死亡 的幸存者数量）。 */
  | { op: 'fearWave'; amount: number }
  /** 免费破坏杀手当前房间内的一处可破坏设施。 */
  | { op: 'destroyCurrentObject' }
  /** 标记最近的特殊处决地点，并短暂侦查该房间。 */
  | { op: 'revealExecutionSite'; turns: number }
  | { op: 'draw'; amount: number }
  | { op: 'energy'; amount: number }
  | { op: 'steps'; amount: number }
  /** 玩家下回合少走几步（反抗型 NPC 的反击也用这条） */
  | { op: 'stun'; amount: number }
  /** 本回合后续卡牌费用减少 */
  | { op: 'discount'; amount: number }
  /** 本回合下次攻击的额外伤害 */
  | { op: 'bonusDamage'; amount: number }
  /** 提高警察的逮捕阈值 */
  | { op: 'arrestThreshold'; amount: number }
  /** 暴露全场所有人的位置（写进日志 + 地图上显示意图） */
  | { op: 'reveal' }
  | { op: 'heal'; who: Who; amount: number }
  /** 救援倒地的人：倒地 → 受伤 */
  | { op: 'rescue'; who: Who }
  | { op: 'bleed'; who: Who; amount: number }
  /** 尾随值增减（迈尔斯专用，其它杀手没有这条槽） */
  | { op: 'stalk'; amount: number }
  /** 让全场在 N 回合内无法报警 */
  | { op: 'silenceAlarm'; turns: number }
  /**
   * 伏击：本回合推门进去不会惊动任何人——不加警觉、不喊人、
   * 也不会在回合结束时夺门而逃。给「偷袭」留出一个白打的回合。
   * 灵异感知者（threat: spiritual）例外，她能直接看见你。
   */
  | { op: 'ambush' }
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
