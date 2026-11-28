import type { Op, Precheck } from './effect';
import type { HuntingGroundId } from './maps';

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
  | 'laundry'
  | 'dining'
  | 'bathroom'
  | 'conservatory'
  | 'foyer'
  | 'library'
  | 'wine'
  | 'guestroom'
  | 'workshop'
  | 'stairwell'
  | 'chapel'
  | 'balcony'
  | 'pantry'
  | 'servants_quarters'
  | 'guest_bath'
  | 'infirmary'
  | 'archives'
  | 'cold_storage'
  | 'greenhouse_annex'
  | 'loading_dock'
  | 'billiard_room'
  | 'observatory';

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
  /** 当前地图中房间的实际空间等级，仅影响显示面积与内容密度。 */
  size: 'small' | 'medium' | 'large' | 'open';
  neighbors: RoomId[];
  desc: string;
  /** 房间在网格里的格子范围（不渲染，只用于「隔几格」这类几何判定，例如护士闪现）。 */
  cell: { left: number; top: number; width: number; height: number };
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
  /** 打出后不推进 NPC 行动、状态计时与世界时间 */
  noAction?: boolean;
  /** 出牌前的条件检查：不满足时不消耗行动点、不弃牌 */
  precheck?: Precheck;
  /** initial = 通用初始卡；killer = 对应杀手专属卡；未标记的旧卡仅保留兼容。 */
  /** initial = 初始解锁；killer = 杀手专属；shop = 商店购买后可用 */
  pool?: 'initial' | 'killer' | 'shop';
  killerOnly?: string;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

/** 配件稀有度：与图鉴一致，决定图标底图与血点价格。 */
export type AccessoryRarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'visceral';

/**
 * 统一修正层的键。每个键在 engine 里只有一个生效点，
 * 配件只负责往这里加数，不允许各自另写一套数值。
 */
export type AccessoryModKey =
  /** 每回合行动点上限 */
  | 'ap'
  /** 挥刀基础伤害 */
  | 'attackDamage'
  /** 恐惧范围（0–2） */
  | 'fearRadius'
  /** 命中时额外恐惧值 */
  | 'fearOnHit'
  /** 开局警报值（负数=更安静） */
  | 'startAlarm'
  /** 结算时额外血点百分比（正负都允许） */
  | 'bloodPointPct'
  /** 专属能力冷却回合（负数=更快） */
  | 'cooldown'
  /** 开局捕兽夹数量 */
  | 'trapCount'
  /** 捕兽夹伤害 */
  | 'trapDamage'
  /** 被捕兽夹困住的额外回合 */
  | 'trapHold'
  /** 开局飞斧数量 */
  | 'hatchetCount'
  /** 飞斧伤害 */
  | 'hatchetDamage'
  /** 闪现距离（间房） */
  | 'blinkRange'
  /** 尾随值获取百分比 */
  | 'stalkGain'
  /** 恶魔附身每次行动消耗的尾随值 */
  | 'possessCost'
  /** 开局无法侦测行动次数 */
  | 'startStealth';

export interface AccessoryMod {
  key: AccessoryModKey;
  value: number;
}

/** 统一修正层的汇总表：每个键的最终加值。 */
export type AccessoryMods = Record<AccessoryModKey, number>;

/**
 * 力量配件：每位杀手专属，开局最多带 2 件，带入即永久消耗。
 * 机制按本作简化，名称与图标取自图鉴（dbdwiki / 迷雾笔记）。
 */
export interface AccessoryDef {
  id: string;
  name: string;
  /** 所属杀手；与 KILLER_MAP 的 owner 一致 */
  owner: string;
  rarity: AccessoryRarity;
  /** 本作效果说明，直接显示给玩家 */
  desc: string;
  /** 图鉴英文原名，供图标导入与卡名核对使用 */
  sourceSkill: string;
  /** 图鉴原始效果，只作考据，不参与结算 */
  sourceText?: string;
  /** 供统一修正层汇总的数值 */
  mods: AccessoryMod[];
  /** 作者自定义配件：上传图标后以 dataURL 存这里（内置配件为空） */
  iconData?: string;
  /** 已发布配件：图标文件路径（public/assets/custom/...） */
  iconPath?: string;
}

export type PersonRole = 'target' | 'civilian' | 'police';

/** 设陷者放置的捕兽夹；触发或被幸存者拆除后会变成未武装状态。 */
export interface BearTrap {
  id: string;
  room: RoomId;
  armed: boolean;
  discovered: boolean;
  triggeredBy?: string;
  triggeredTurn?: number;
}

/** 健康 / 受伤 / 倒地。死亡等于从 people 里移除，所以没有第四态。 */
export type Health = 'healthy' | 'injured' | 'downed';

export type SurvivorStatus = 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed';

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  room: RoomId;
  /** 4 = 健康；累计受到 2 点伤害进入受伤，累计 4 点伤害倒地 */
  hp: number;
  marked: boolean;
  /** 本局随机选中的血祭品；仅作身份标记，供卡牌与能力引用 */
  bloodSacrifice: boolean;
  /** 警戒值 0–100：越高越容易报警、求助或寻找逃生点。 */
  alert: number;
  /** 恐惧值 0–100：满值后崩溃；此时再次受到攻击会直接倒地。 */
  fear: number;
  /** 当前头顶显示的短暂对白 */
  dialogue: string;
  /** 当前行为，用于档案与人物名单 */
  activity: string;
  /** 被限制移动的剩余回合（支配、钉住、恐惧、夹子） */
  blockedTurns: number;
  /** 刚踩中捕兽夹：地图短暂显示红色人影。 */
  trapTriggered?: boolean;
  /** 流血：每回合结束掉血 */
  bleed: number;
  /** 幸存者状态剩余行动次数；诅咒还受图腾存续影响。 */
  statusEffects?: Partial<Record<SurvivorStatus, number>>;
  /** 倒地后已经过去的回合数，撑满 BLEEDOUT 就死 */
  downedTurns: number;
  /** 已经跑到逃生点的人，再待一回合就会真的逃出去（0 未开始，1 正在翻篱笆） */
  escapeProgress: number;
  /** 打电话 / 用无线电的进度：电话 1 回合，无线电要 2 回合 */
  callTurns: number;
  /** 躲在柜子/床底：不搜出来就看不见，也吃不到大部分卡牌 */
  hidden: boolean;
  /** 刚被惊动、还没反应过来的回合数：进门当回合只会观察 */
  startleTurns?: number;
  /** 找到武器：反抗时能让玩家掉行动点 */
  armed: boolean;
  /** 随机高价值目标：击杀后获得大量额外血点 */
  highValue?: boolean;
  /** 老练的幸存者：有时能悄无声息地移动，仍会留下脚印，但不会惊动乌鸦 */
  sneaky: boolean;
  /** 鬼面「夜幕」对这名幸存者的监视值 0–100 */
  watchValue: number;
  /** 监视完成：持续透视，下一刀可以直接击倒 */
  watched: boolean;
  /** 被追踪的剩余回合：位置始终可见 */
  trackedTurns: number;
  /** 通过情报卡显形的剩余玩家行动次数 */
  revealedActions?: number;
  /** 最近一次亲眼目击袭击、死亡或搬运事件的玩家行动时钟，防止同一动作重复行动。 */
  lastWitnessedEventClock?: number;
  /** 最近一次听到谁呼喊；用于后续区分亲眼所见与他人告知。 */
  lastHeardFrom?: string;
  lastHeardRoom?: RoomId;
  lastHeardTurn?: number;
  /** 玩家最后一次看到他的房间与回合，用于地图上的"最后已知位置" */
  lastSeenRoom: RoomId;
  lastSeenTurn: number;
  /**
   * 本回合已经"跑"过几间屋（含被砍后夺路而逃的那几步）。
   * 玩家每做一个动作，逃跑中的人会跟着动一格，但一回合最多 REACT_MOVE_CAP 格——
   * 不然四条腿永远追不上。
   */
  movesThisTurn: number;
}

/**
 * 地板上的痕迹：逃跑 / 受伤的人刮出来的鞋印，从一间屋指到下一间。
 * 这是「他跑远了」之后唯一能把人找回来的线索。
 */
export interface Trail {
  /** 痕迹留在哪个房间 */
  room: RoomId;
  /** 朝哪个方向延伸出去 */
  to: RoomId;
  /** 留下的回合，用来淡出 */
  turn: number;
  /** 留下痕迹时的玩家行动计数：痕迹只保留最近几次行动，跟丢了就断 */
  clock: number;
  /** 带血：受伤的人留下的痕迹更红 */
  blood: boolean;
}

/** 有人经过某间屋子留下的动静（乌鸦叫、地板响）——不靠技能也能找人的线索 */
export interface Disturbance {
  room: RoomId;
  /** 留下的回合 */
  turn: number;
  /** 留下的玩家行动计数，用来短线淡出 */
  clock: number;
  label: string;
}

export type MissionTaskKind = 'kill_count' | 'marked_kill' | 'break_circuit' | 'alarm_below' | 'killer_stat';
export type MissionTaskMetric = 'myers_stalk' | 'trap_triggers' | 'nurse_blink_attacks' | 'hatchet_hits';

export interface MissionTask {
  id: string;
  kind: MissionTaskKind;
  label: string;
  target: number;
  /** optional 仅提供额外奖励，不阻止核心任务通关。 */
  optional?: boolean;
  /** 警报限制任务的上限值。 */
  limit?: number;
  metric?: MissionTaskMetric;
}

export interface Mission {
  id: string;
  /** contract = 契约模式；free = 玩家自主选择猎物与结束时机。 */
  mode?: 'contract' | 'free';
  title: string;
  desc: string;
  turns: number;
  /** 本局随机组合的主要任务与额外奖励任务 */
  tasks?: MissionTask[];
  /** 一句话主目标：任务条上永远看得见 */
  objective?: string;
  /** 达成条件：写清楚「做到什么就算成功」 */
  successText?: string;
  /** 失败条件：写清楚「没做到什么就失败」 */
  failText?: string;
}

/** 每回合重置，用于结算杀手被动的一次性效果 */
export interface KillerRuntime {
  killUsed: boolean;
  moveUsed: boolean;
  attackUsed: boolean;
  witnessUsed: boolean;
}

/** 本局杀手专属能力的命中统计，用于契约与血点。 */
export interface HuntCounters {
  hatchetHits: number;
  nurseBlinkAttacks: number;
}

/** 血点五类：猎杀 / 凶残 / 阴险 / 控场 / 契约 */
export type BloodCategory = 'hunt' | 'brutal' | 'cunning' | 'control' | 'contract';

/** 结算面板上的一行血点明细 */
export interface BloodPointLine {
  category: BloodCategory;
  label: string;
  value: number;
}

/** 本局获得的特殊表现称号 */
export interface PerformanceTitle {
  id: string;
  label: string;
  points: number;
  category: BloodCategory;
}

export type ExecutionKind = 'normal' | 'special' | 'qte';

/** 一次处决的演出文本；由 execution 模块统一生成，界面只负责显示。 */
export interface ExecutionScene {
  seq: number;
  kind: ExecutionKind;
  title: string;
  line: string;
  description: string;
  motion: string;
  room: RoomId;
  victimId?: string;
  siteId?: string;
  success: boolean;
}

export type GamePhase = 'menu' | 'setup' | 'playing' | 'gameover';

export type ResultKind = 'win' | 'caught' | 'timeout' | 'failed';

export interface PowerCircuit {
  id: string;
  name: string;
  breakerRoom: RoomId;
  affectedRooms: RoomId[];
  broken: boolean;
  /** 控制箱的开关状态；未定义的旧状态按开启处理。 */
  enabled?: boolean;
  /** 环境事件造成的临时熄灯回合数，不等于电闸被破坏。 */
  flickerTurns?: number;
}

export interface GameState {
  phase: GamePhase;
  /** 本局实际使用的主题猎场，与主菜单展示插画保持一致。 */
  mapId: HuntingGroundId;
  killer: string;
  /** 本局带入的配件 id（最多 2 件）；进局时已从库存永久扣除 */
  accessories: string[];
  /** 由带入配件汇总出的统一修正表；引擎只读这一份。 */
  modifiers: AccessoryMods;
  killerRuntime: KillerRuntime;
  arrestThreshold: number;
  turn: number;
  /**
   * 行动点（AP）：走路、砍人、打牌、搜索全都从这一个池子里扣。
   * 原来「能量」和「步数」是两套资源，现在合并——想多走就少出牌，想连砍就别乱跑。
   */
  energy: number;
  maxEnergy: number;
  wanted: number;
  /** 最后一次被追查/目击的回合号：暴露度只在这个回合里保持，之后开始降温 */
  heatTurn: number;
  /** 警察已经盯上你几回合：连续两回合同屋才会真的被铐走 */
  policeLock: number;
  /** 伏击生效的回合号：等于当前回合时，进门不会惊动任何人 */
  ambushTurn: number;
  /** 周围范围红色轮廓剩余行动次数 */
  revealAuraActions: number;
  /** 最近脚印高亮剩余行动次数 */
  trailRevealActions: number;
  /** 当前被猎鹿者显现的脚印 */
  highlightedTrail: Trail | null;
  /** 当前回合是否禁止攻击（戏耍食物） */
  attackBlockedTurn: number;
  /** 玩家正在为恶灵低语选择目标房间 */
  auraTargeting: boolean;
  /** 静止隐身剩余行动次数 */
  stealthActions: number;
  /** 辣手屠夫：下一次命中附加流血 */
  bleedNextHit: boolean;
  /** 苦涩低语：下一次击杀后显露幸存者 */
  bitterMurmurReady: boolean;
  /** 鬼魔神龛所在房间 */
  scourgeShrineRoom: RoomId | null;
  /** 放置神龛时已在房间内的人 */
  scourgeShrineOccupants: string[];
  /** 这一次挥刀是否已经收回来：砍完必须再做一件事才能砍第二刀 */
  attackReady: boolean;
  /** 玩家已经做了几次行动：痕迹按这个计数衰减，而不是按回合 */
  trailClock: number;
  /** 杀戮值 0–100：连续踩着脚印追会涨，满 50 后每回合多 2 行动点；见血或被击晕清零 */
  frenzy: number;
  /** 连续踩中脚印的次数：断了就不算「持续追踪」 */
  frenzyStreak: number;
  /** 地板上的痕迹，按留下顺序排列，越新越红 */
  trails: Trail[];
  /** 最近有人经过的房间：乌鸦叫 / 地板响，给玩家一个不靠技能的找人方向 */
  disturbances: Disturbance[];
  playerRoom: RoomId;
  /** 上一次行动结束时杀手所在房间：用来区分「走进屋」和「站在屋里行动」 */
  lastPlayerRoom: RoomId | '';
  /** 玩家已进入查看选择模式，等待点选一个相邻房间；此时尚未消耗 AP。 */
  lookingAround: boolean;
  /** 玩家当前朝向的单位向量；用于判断正前方一格房间 */
  playerFacing: { x: number; y: number };
  people: Person[];
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  mission: Mission;
  missionPrimaryCompleted: boolean;
  myersStalkedIds: string[];
  watchedRoom: RoomId | null;
  log: string[];
  kills: number;
  killsThisTurn: number;
  executions: number;
  survivorKills: number;
  /** 本局使用过的特殊处决方式；用于结算与永久图鉴记录。 */
  executionMethodsUsed: string[];
  /** 本局打出过的卡牌 id（可重复）；用于结算的「构筑多样性」加分。 */
  cardsPlayed: string[];
  npcAlarmed: boolean;
  carryPersonId: string | null;
  /** 欣喜若狂标出的最近特殊处决地点。 */
  executionSiteHint: RoomId | null;
  /** 当前搬运已走过的房间数；前 3 格安全，继续搬运需要 D6 检定。 */
  carryDistance: number;
  markedKilled: number;
  decoyRoom: RoomId | null;
  /** 房间锁：房间 -> 还锁着几回合。NPC 与警察都不能进入或离开该房间 */
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
  /** 本局累积的血点明细；结算按五类汇总。 */
  bloodPointLines: BloodPointLine[];
  /** 防刷分计数：行为 key → 已奖励次数 */
  bloodPointCounts: Record<string, number>;
  /** 本局获得的特殊表现称号 */
  performanceTitles: PerformanceTitle[];
  /** 本局杀手专属能力命中统计 */
  huntCounters: HuntCounters;
  /** 最近一次处决的演出文本与序号 */
  executionScene: ExecutionScene | null;
  executionSceneSeq: number;
  /** 本回合是否用过杀手专属能力；用于「专属攻击完成击杀」奖励。 */
  powerUsedThisAction: boolean;
  rewardCards: string[];

  phoneCut: boolean;
  /** 设陷者的可布设捕兽夹、携带数量与地图补给点。 */
  bearTraps: BearTrap[];
  /** 本局捕兽夹触发次数；供界面播放一次尖叫音效。 */
  trapTriggerCount: number;
  /** 最近一次触发捕兽夹的幸存者 ID，供性别匹配的音效使用。 */
  lastTrapTriggerId: string | null;
  trapInventory: number;
  trapCaches: RoomId[];
  /** 女猎手瞄准状态与当前剩余飞斧。 */
  huntressAiming: boolean;
  hatchets: number;
  /** 护士闪现选点、闪现后的普通攻击窗口与待结算疲惫。 */
  nurseBlinkTargeting: boolean;
  nurseFollowUp: boolean;
  nurseFatiguePending: boolean;
  wiretap: boolean;
  poltergeist: boolean;
  policeBlocked: boolean;
  /** 被处刑者锁住、无法逃离的目标 */
  pinnedPeople: string[];

  /** 杀手基础恐惧范围：0潜行、1同屋惊动/隔壁起疑、2可感知两格外 */
  fearRadius: number;
  /** 迈尔斯是否处于尾随者模式：移动缓慢且无法侦测 */
  myersStalking: boolean;
  /** 本回合是否移动过；移动会打断尾随积累 */
  myersMovedThisTurn: boolean;
  /** 当前目标持续尾随压力 0–100 */
  stalkPressure: number;
  /** 迈尔斯：尾随值 0–100，满值可进入恶魔附身 */
  stalkMeter: number;
  stalkTargetId: string | null;
  possessed: boolean;
  /** 恶魔附身剩余回合：>0 时挥刀直接把健康的人放倒 */
  possessTurns: number;
  /** 三种迈尔斯专属印记分开计数 */
  myersEclipseMarks: number;
  myersLastBestActive: boolean;
  myersLastBestMarks: number;
  myersFoodMarks: number;
  /** 通用卡牌的持续效果 */
  hexHuntressActive: boolean;
  hexHuntressUsed: boolean;
  hexNoedActive: boolean;
  hexNoedBonusGranted: boolean;
  distressingActive: boolean;
  totems: RoomId[];
  /** 本局随机停着乌鸦的房间 */
  crows: RoomId[];
  /** 幸存者放下木板的累计次数（表现层用来放音效） */
  palletDropCount: number;
  /** 乌鸦被惊动的累计次数（表现层用来放音效） */
  crowAlertCount: number;
  /** 每间屋上次乌鸦被惊动的行动计数，用来做冷却 */
  crowAlerts: Record<string, number>;
  /** 本局已经被幸存者惊动过乌鸦的房间（地图上乌鸦图标要一直红着） */
  crowTriggered: RoomId[];
  /** 本局随机布置的电话所在房间 */
  phones: RoomId[];
  /** 已经被玩家砸坏的电话（按房间记） */
  brokenPhones: RoomId[];
  /** 本局已经从哪些图腾领取过一次性互动奖励，防止反复刷取。 */
  totemInteractions: RoomId[];
  /** 图腾提供的下回合额外行动点 */
  bonusEnergyNextTurn: number;
  /** 已被破坏的障碍物房间 */
  clearedObstacles: RoomId[];

  /* ---------- NPC 逃跑系统 ---------- */
  /** 已经逃出这栋房子的人数 */
  escaped: number;
  /** 幸存者放下木板封住入口；强行冲门会被砸晕，也可花行动点主动破坏。 */
  barricades: RoomId[];
  /** 逃生点被封锁的剩余回合 */
  exitBlockedTurns: number;
  /** 玩家被 NPC 反击造成的眩晕：下回合行动点减少 */
  stunTurns: number;
  /** 被手电筒致盲的剩余回合（只做显示，实际惩罚走 stunTurns） */
  blindTurns: number;
  /** 连续追同一名幸存者的回合数：其他人干活效率随之提高 */
  chaseTargetId: string | null;
  chaseTurns: number;
  /** 鬼面夜幕是否正在监视 */
  nightfallActive: boolean;
  /** 上一次被玩家砍中的人：同屋目击者要反应，但他本人不重复行动 */
  lastAttackedId: string | null;
  /** 是否已经袭击过警员（袭警后警察会更紧地咬住你） */
  policeAssaulted: boolean;
  /** 杀手能力冷却：powerId -> 剩余回合 */
  cooldowns: Record<string, number>;
  /** 本局结果说明（为什么失败），给结算面板用 */
  resultReason: string;

  /* ---------- 战争迷雾与暴露度 ---------- */
  /** 全局警报值 0–100：达到阈值开放逃生点，满值进入最终危机阶段。 */
  alarm: number;
  /** 警报值满后进入最终阶段；普通杀手召来警察，灵异杀手迫使所有人逃亡。 */
  emergencyActive: boolean;
  /** 已探索的房间：进过、或侦查过 */
  explored: RoomId[];
  /** 临时视野：房间 -> 还看得见几回合 */
  scouted: Partial<Record<RoomId, number>>;
  /** 本回合被制造噪声的房间：会把附近的人吸过去 */
  noiseRoom: RoomId | null;
  /** 消防斧/电闸这类设施被破坏后的标记 */
  sabotage: string[];

  /** 警报升高后开放的实际逃生点 */
  escapeRooms: RoomId[];
  /** 本局幸存者总人数（不包含警察），用于判定是否全部逃离 */
  survivorTotal: number;
  /** 独立区域电闸及其供电范围 */
  powerCircuits: PowerCircuit[];
}

export interface SaveData {
  deck: string[];
  unlockedCards: string[];
  wins: number;
  killer?: string;
  /** 血点：商店货币，完成任务获得 */
  credits: number;
  /** 暗金细胞：用于解锁额外杀手 */
  darkCells: number;
  unlockedKillers: string[];
  /** 已经亲自使用过的特殊处决方式，永久收录到处决图鉴。 */
  executionRecords?: string[];
  /** 配件拥有表：配件 id → 1 表示已解锁（买过即永久拥有，不再消耗）。 */
  accessories: Record<string, number>;
  /** 肉鸽猎杀：进行中的 run；null / undefined 表示没有在跑。 */
  rogue?: import('./rogue').RogueRun | null;
  /** 每位杀手的血网等级（等级 / 经验 / 转生 / 待领取次数）。 */
  progress?: import('./progress').ProgressMap;
  /** 公共卡池：别的杀手练到 30 的倍数后共享出来的专属卡。 */
  sharedCards?: string[];
  /** 上一次选择带入的配件 id（最多 2 件），作为下局的默认装配。 */
  accessoryLoadout: string[];
  /** 存档里记一下版本，方便以后迁移 */
  version?: number;
}
