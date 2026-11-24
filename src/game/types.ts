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

export type CardType = 'attack' | 'skill' | 'tactic';

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
  name: string;
  cost: number;
  type: CardType;
  desc: string;
  flavor: string;
  /** 图鉴站图标对应的原技能名称；卡牌效果与机制为本项目原创。 */
  sourceSkill?: string;
  image?: string;
  unlocked: boolean;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export type PersonRole = 'target' | 'civilian' | 'police';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  room: RoomId;
  hp: number;
  marked: boolean;
  image?: string;
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
}

/** 每回合重置，用于结算原创杀手机制的一次性效果 */
export interface KillerRuntime {
  killUsed: boolean;
  moveUsed: boolean;
  attackUsed: boolean;
  witnessUsed: boolean;
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
  targetEscaped: boolean;
  decoyRoom: RoomId | null;
  lockedRooms: RoomId[];
  freeMove: boolean;
  discount: number;
  bonusDamage: number;
  noAlarmTurn: boolean;
  lastCrimeRoom: RoomId | null;
  result: ResultKind | null;
  score: number;
  rewardCards: string[];

  /** 布局阶段 */
  setupPoints: number;
  setupHand: string[];
  phoneCut: boolean;
  wiretap: boolean;
  poltergeist: boolean;
  firstTurnSilent: boolean;
  luredRoom: RoomId | null;
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
}
