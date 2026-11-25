import type { Op, Precheck } from './effect';

export type RoomId =
  | 'hall'
  | 'corridor'
  | 'kitchen'
  | 'study'
  | 'bedroom'
  | 'basement'
  | 'garage'
  | 'garden'
  | 'attic'
  | 'storage'
  | 'nursery'
  | 'laundry';

export type CardType = 'attack' | 'skill' | 'tactic' | 'setup';

export interface RoomRect {
  /** 相对平面图的百分比坐标，用于拼接成完整房屋 */
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Room {
  id: RoomId;
  name: string;
  x: number;
  y: number;
  rect: RoomRect;
  neighbors: RoomId[];
  desc: string;
}

export interface CardDef {
  id: string;
  /** 卡面主标题：采用图鉴技能的官方中文名，与图标严格一一对应 */
  name: string;
  cost: number;
  type: CardType;
  desc: string;
  flavor: string;
  /** 图标对应的图鉴技能英文原名 */
  sourceSkill: string;
  /** 该技能在图鉴里的原始效果，只作考据说明，不参与结算 */
  sourceText?: string;
  unlocked: boolean;
  /** 效果程序：由 effect.ts 的解释器执行，改这里就能改卡牌效果 */
  ops: Op[];
  /** 出牌前的条件检查：不满足时不消耗能量、不弃牌 */
  precheck?: Precheck;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export type PersonRole = 'target' | 'civilian' | 'police';

/**
 * 六种行为类型。决定这名 NPC 被惊动后做什么，而不是所有 NPC 都用同一套反应。
 *   alert    警觉型：发现杀手就逃，逃跑路上通知同伴
 *   defiant  反抗型：堵门、拿武器反击，会让你掉步数
 *   caller   求救型：摸向电话/无线电报警
 *   rescuer  救援型：治疗受伤、拉起倒地的人
 *   hider    躲藏型：钻进柜子/床底，不搜出来就找不到
 *   brave    英勇型：找武器、聚人、正面挡路
 */
export type Archetype = 'alert' | 'defiant' | 'caller' | 'rescuer' | 'hider' | 'brave';

/** NPC 这一回合的打算，会显示在平面图上供玩家预判 */
export type NpcIntent =
  | 'idle'
  | 'wary'
  | 'flee'
  | 'barricade'
  | 'call'
  | 'hide'
  | 'escape'
  | 'stunned'
  | 'heal'
  | 'rescue';

/** 个人目的：决定他慌乱时往哪跑，是这一局 NPC 的行为主轴 */
export type NpcGoal = 'phone' | 'exit' | 'hide' | 'gather' | 'weapon' | 'panic' | 'help';

/** 健康 / 受伤 / 倒地。死亡等于从 people 里移除，所以没有第四态。 */
export type Health = 'healthy' | 'injured' | 'downed';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  room: RoomId;
  /** 2 = 健康，1 = 受伤，0 = 倒地。伤害只能推进一档，击杀必须走处决 */
  hp: number;
  marked: boolean;
  /** 行为类型 */
  archetype: Archetype;
  /** 警觉度 0–100：越高越可能逃离玩家所在房间 */
  alert: number;
  /** 当前行为，用于档案与人物名单 */
  activity: string;
  /** 这一回合的意图 */
  intent: NpcIntent;
  /** 个人目的 */
  goal: NpcGoal;
  /** 被限制移动的剩余回合（支配、钉住、恐惧、夹子） */
  blockedTurns: number;
  /** 流血：每回合结束掉血 */
  bleed: number;
  /** 倒地后已经过去的回合数，撑满 BLEEDOUT 就死 */
  downedTurns: number;
  /** 已经跑到逃生点的人，再待一回合就会真的逃出去（0 未开始，1 正在翻篱笆） */
  escapeProgress: number;
  /** 打电话 / 用无线电的进度：电话 1 回合，无线电要 2 回合 */
  callTurns: number;
  /** 躲在柜子/床底：不搜出来就看不见，也吃不到大部分卡牌 */
  hidden: boolean;
  /** 找到武器：反抗时能让玩家掉步数 */
  armed: boolean;
  /** 被追踪的剩余回合：位置始终可见 */
  trackedTurns: number;
  /** 玩家最后一次看到他的房间与回合，用于地图上的"最后已知位置" */
  lastSeenRoom: RoomId;
  lastSeenTurn: number;
}

export type MissionKind =
  | 'assassinate'
  | 'bodyCount'
  | 'evidence'
  | 'ritual'
  | 'escape';

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  desc: string;
  turns: number;
  reward: number;
  targetCount?: number;
  targetRoom?: RoomId;
  maxWanted?: number;
  /** 允许逃走的 NPC 上限，超过即任务失败 */
  maxEscaped?: number;
}

/** 每回合重置，用于结算杀手被动的一次性效果 */
export interface KillerRuntime {
  killUsed: boolean;
  moveUsed: boolean;
  attackUsed: boolean;
  witnessUsed: boolean;
}

/** 结算面板上的一行明细 */
export interface ScoreLine {
  label: string;
  value: number;
}

export type GamePhase = 'menu' | 'setup' | 'playing' | 'gameover';

export type ResultKind = 'win' | 'caught' | 'timeout' | 'failed';

export interface GameState {
  phase: GamePhase;
  killer: string;
  killerRuntime: KillerRuntime;
  arrestThreshold: number;
  turn: number;
  energy: number;
  maxEnergy: number;
  steps: number;
  maxSteps: number;
  wanted: number;
  /** 最后一次被追查/目击的回合号：通缉值只在这个回合里保持，之后开始降温 */
  heatTurn: number;
  /** 警察已经盯上你几回合：连续两回合同屋才会真的被铐走 */
  policeLock: number;
  playerRoom: RoomId;
  people: Person[];
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  mission: Mission;
  log: string[];
  kills: number;
  killsThisTurn: number;
  evidence: number;
  ritualStreak: number;
  markedKilled: number;
  decoyRoom: RoomId | null;
  /** 房间锁：房间 -> 还锁着几回合。NPC 与警察都过不去 */
  roomLocks: Partial<Record<RoomId, number>>;
  /** 本回合是否已经暴露过全场位置 */
  revealedThisTurn: boolean;
  freeMove: boolean;
  discount: number;
  bonusDamage: number;
  noAlarmTurn: boolean;
  /** 报警被压制到第几回合（医生「疯狂」这类多回合沉默） */
  alarmSilencedUntilTurn: number;
  lastCrimeRoom: RoomId | null;
  result: ResultKind | null;
  score: number;
  /** 结算面板的加分/扣分明细，由 finish() 生成 */
  scoreBreakdown: ScoreLine[];
  rewardCards: string[];

  phoneCut: boolean;
  wiretap: boolean;
  poltergeist: boolean;
  policeBlocked: boolean;
  /** 被处刑者锁住、无法逃离的目标 */
  pinnedPeople: string[];

  /** 迈尔斯：尾随值 0–100，满值可进入恶魔附身 */
  stalkMeter: number;
  stalkTargetId: string | null;
  possessed: boolean;
  /** 图腾提供的下回合额外能量 */
  bonusEnergyNextTurn: number;
  /** 已被破坏的障碍物房间 */
  clearedObstacles: RoomId[];

  /* ---------- NPC 逃跑系统 ---------- */
  /** 已经逃出这栋房子的人数 */
  escaped: number;
  /** 堵门的房间：玩家进入要多花 1 步，需「所向无敌」清除 */
  barricades: RoomId[];
  /** 逃生点被封锁的剩余回合 */
  exitBlockedTurns: number;
  /** 玩家被 NPC 反击造成的眩晕：下回合步数减少 */
  stunTurns: number;
  /** 杀手能力冷却：powerId -> 剩余回合 */
  cooldowns: Record<string, number>;
  /** 本局结果说明（为什么失败），给结算面板用 */
  resultReason: string;

  /* ---------- 战争迷雾与团队警戒 ---------- */
  /** 团队警戒 0–100：不是某个人的警觉，而是整栋房子的紧张程度。满值任务失败 */
  alarm: number;
  /** 已探索的房间：进过、或侦查过 */
  explored: RoomId[];
  /** 临时视野：房间 -> 还看得见几回合 */
  scouted: Partial<Record<RoomId, number>>;
  /** 本回合被制造噪声的房间：会把附近的人吸过去 */
  noiseRoom: RoomId | null;
  /** 消防斧/电闸这类设施被破坏后的标记 */
  sabotage: string[];
}

export interface SaveData {
  deck: string[];
  unlockedCards: string[];
  bestScore: number;
  wins: number;
  killer?: string;
  /** 血点：商店货币，完成任务获得 */
  credits: number;
  /** 暗金细胞：用于解锁额外杀手 */
  darkCells: number;
  unlockedKillers: string[];
  /** 存档里记一下版本，方便以后迁移 */
  version?: number;
}
