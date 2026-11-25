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
  | 'storage';

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

/** NPC 这一回合的打算，会显示在平面图上供玩家预判 */
export type NpcIntent =
  | 'idle'
  | 'wary'
  | 'flee'
  | 'barricade'
  | 'call'
  | 'hide'
  | 'escape'
  | 'stunned';

/** 个人目的：决定他慌乱时往哪跑，是这一局 NPC 的行为主轴 */
export type NpcGoal = 'phone' | 'exit' | 'hide' | 'gather' | 'weapon' | 'panic';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  room: RoomId;
  hp: number;
  marked: boolean;
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
  /** 流血：每回合结束掉血，被「辣手屠夫」类卡牌造成 */
  bleed: number;
  /** 已经跑到逃生点的人，再待一回合就会真的逃出去（0 未开始，1 正在翻篱笆） */
  escapeProgress: number;
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
