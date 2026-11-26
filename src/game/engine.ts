import { random, randomOf, shuffle } from './random';
import { getExecutionMethod, type ExecutionMethodId } from './executions';
import { nearestOf, roomDistance } from './navigation';
import { awarenessStage, myersStalkGain } from './npc/awareness';
import { ESCAPE_ROOMS, BASE_AP, SABOTAGE_COST, ITEM_BOX_CHARGES, GENERATOR_JAM_TURNS, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP } from './constants';
import { drawCards } from './deck';
import { executeOps } from './effects/runtime';
import { createGame } from './setup';
export { drawCards } from './deck';
export { createGame } from './setup';
export { BASE_AP, SABOTAGE_COST, ITEM_BOX_CHARGES, GENERATOR_JAM_TURNS, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP } from './constants';
import { ACTIVITIES, createPeople, itemUsesFor } from './npc/factory';
import { ARCH_DESC, ARCH_LABEL, GOAL_LABEL, HEALTH_LABEL, INTENT_LABEL, ROUTINE_PROFILE, SITE_ITEM_LABEL, SURVIVOR_ITEM_LABEL } from './npc/catalog';
export { ARCH_DESC, ARCH_LABEL, GOAL_LABEL, HEALTH_LABEL, INTENT_LABEL, SITE_ITEM_LABEL, SURVIVOR_ITEM_LABEL } from './npc/catalog';
export { ESCAPE_ROOMS } from './constants';
import { CARD_MAP, UNLOCK_REWARDS } from './cards';
import type { Cond, Dest, Op, Who } from './effect';
import { KILLER_MAP } from './killers';
import { generateMission, roomName } from './missions';
import {
  CABINET_ROOMS,
  ENTRY_ROOM,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  PHONE_ROOMS,
  POLICE_START,
  RADIO_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
  WEAPON_ROOMS,
} from './rooms';
import { SURVIVOR_MAP } from './survivors';
import type {
  Archetype,
  CardInstance,
  GameState,
  Health,
  Mission,
  NpcGoal,
  NpcIntent,
  Person,
  PersonRole,
  ResultKind,
  RoomId,
  ScoreLine,
  Trail,
  SiteItem,
  SiteItemKind,
  MissionTask,
  SurvivorItem,
} from './types';

/* ==================================================================== */
/*  常量                                                                */
/* ==================================================================== */

/** 倒地后撑不过这么多回合就会自动流血而死 */
export const BLEEDOUT_TURNS = 4;
/** 兼容旧配置的导出；现在倒地后即可处决，救援窗口由玩家是否选择处决决定。 */
export const DOWNED_LOCK_TURNS = 0;
/** 暴露度上限：到 100 直接判负（实体杀手被捕，灵异鬼怪被驱散） */
export const ALARM_MAX = 100;
/** 1 点旧「暴露度」折算成多少暴露度：暴露度只是暴露度的 0~10 镜像 */
const WANTED_TO_ALARM = 10;
/** 站在后院的人至少要有这么高的警觉，才会想到翻篱笆（否则只是路过） */
const ESCAPE_ALERT_MIN = 35;

/** 挥刀 / 搜索各自消耗 1 点行动点：唯一的伤害来源，不能免费 */
export const ATTACK_COST = 1;
export const SEARCH_COST = 1;
export const LOOK_COST = 1;
/** 主动抽牌消耗的行动点；每次抽 1 张。 */
export const DRAW_CARD_COST = 1;
/** 手牌上限；超过时必须由玩家选择弃牌。 */
export const HAND_LIMIT = 6;
/** 每次牌库耗尽并洗回弃牌堆，幸存者团队进度增加。 */
const DECK_SHUFFLE_TEAM_GAIN = 5;
/**
 * 一个人一回合最多能跑几间屋（含被砍后夺路而逃的那两步）。
 * 玩家一回合 4 点行动点，这个数字必须比它能走的格数小，否则永远追不上；
 * 但它也不能太小，否则「警觉就跑得很远」只是一句台词。
 */
const REACT_MOVE_CAP = 3;
/** 被砍伤后当场夺路而逃的步数：一刀下去，他会连着跑两间屋 */
const PANIC_HOPS_ON_HIT = 2;
/** 痕迹留几回合（含留下的那回合） */
export const TRAIL_TURNS = 3;
/**
 * 痕迹保留最近五次「玩家行动」（不是按回合），给玩家足够时间追踪路线。
 */
const TRAIL_ACTION_WINDOW = 5;
/** 动静（乌鸦叫）也只留最近这么多次行动：短线索，不是常驻雷达 */
const DISTURBANCE_WINDOW = 3;
/** 杀戮值上限 / 激活阈值：满值后每回合多 2 行动点，由玩家自己决定怎么走 */
export const FRENZY_MAX = 100;
export const FRENZY_THRESHOLD = 50;
/** 满值给的额外行动点：不替玩家走第二步，只把「能多走」交到他手里 */
export const FRENZY_AP_BONUS = 2;
/** 每跟对一段脚印涨多少，跟丢一次掉多少 */
const FRENZY_GAIN = 25;
const FRENZY_LOSS = 20;
/** 幸存者团队目标：满了他们就集体逃走，玩家直接失败 */
export const TEAM_GOAL_MAX = 100;
export const TEAM_STAGE_COUNT = 4;
export const TEAM_STAGE_SIZE = TEAM_GOAL_MAX / TEAM_STAGE_COUNT;
/** 一个人在目标房间待一回合推进的进度 */
const OBJECTIVE_GAIN = 5;

/* ---------- 本轮新增：擦刀 / 守尸 / 追击热度 / 眩晕致盲 / 鬼面夜幕 ---------- */
/** 擦刀：原地花 1 点收回刀锋，但这一次动作幸存者也会跟着动 */
export const WIPE_COST = 1;
/** 每多追同一名幸存者一回合，其他人的工作效率 +25%，最多翻倍 */
/** 同屋有倒地同伴时，各原型把人拉起来的意愿（0~1）：人人都可能救，只是有人更奋不顾身 */
const RESCUE_EAGERNESS: Record<Archetype, number> = {
  rescuer: 1,
  brave: 0.85,
  caller: 0.6,
  alert: 0.55,
  defiant: 0.45,
  kiter: 0.4,
  hider: 0.3,
};
/** 同伴倒地后主动「赶过去」的意愿，再打个折：有人会先保自己 */
const AID_RUN_RATE = 0.8;
/** 每击杀一名幸存者，其他人的干活效率加成（恐惧催出来的拼命） */
const KILL_PRESSURE = 0.15;
const KILL_PRESSURE_MAX = 0.6;
/** 场上有人倒地还没死时，全体效率再抬一截 */
const DOWNED_URGENCY = 0.25;
/** 鬼面夜幕每回合累积的监视值 */
const WATCH_GAIN = 34;
/** 医疗包要连续治这么多回合才生效，不能一下就把人治好 */
const MEDKIT_TURNS = 2;
/** 开局就带着道具的幸存者比例 */
const STARTER_ITEM_RATE = 0.32;
const STARTER_ITEMS: SurvivorItem[] = ['medkit', 'toolbox', 'flashlight', 'smoke', 'flare'];

/** 各场地的藏身空间；巴德姆幼儿园额外开放玩具仓库、值班室和幼儿教室。 */
function cabinetRoomsFor(state: GameState): RoomId[] {
  return state.mapId === 'badham'
    ? [...CABINET_ROOMS, 'nursery', 'storage', 'guestroom']
    : CABINET_ROOMS;
}

/** 同伴一个个倒下，剩下的人会红着眼拼命：击杀数与场上倒地者都会催他们干活更快 */
function workPressure(state: GameState): number {
  const downed = state.people.some((p) => p.role !== 'police' && p.hp <= 0);
  return Math.min(KILL_PRESSURE_MAX, state.kills * KILL_PRESSURE) + (downed ? DOWNED_URGENCY : 0);
}

/** 幸存者行动效率受猎杀压力影响；长时间追踪单一目标不再提供团队进度或效率奖励。 */
function scaleSurvivorProgress(state: GameState, person: Person, amount: number): number {
  const radius = effectiveFearRadius(state);
  let multiplier = state.distressingActive && radius > 0 && roomDistance(person.room, state.playerRoom) <= radius ? 0.8 : 1;
  if (state.killer === '迈克尔·迈尔斯' && state.myersEclipseMarks > 0) {
    const marks = Math.min(5, state.myersEclipseMarks);
    multiplier *= person.bloodSacrifice ? 1 + marks * 0.05 : Math.max(0.65, 1 - marks * 0.05);
  }
  return Math.max(1, Math.round(amount * multiplier));
}

function teamWorkGain(state: GameState, person: Person): number {
  const base = Math.round(
    OBJECTIVE_GAIN * (1 + workPressure(state)),
  );
  return scaleSurvivorProgress(state, person, base);
}

/* ---------- 场地物品：道具箱 / 发电机 ---------- */
/** 每局两个道具箱，每个能发三件东西 */
const ITEM_BOX_COUNT = 2;
/** 发电机每局随机 1~2 台 */
const GENERATOR_MIN = 1;
const GENERATOR_MAX = 2;
/** 在发电机房间待一回合推进多少；带工具箱翻倍 */
const GENERATOR_GAIN = 9;
/** 修满一台，一次性给团队进度的奖励 */
const GENERATOR_CHARGED_BONUS = 26;
/** 砸发电机扣掉的修复进度 / 已通电时倒退的团队进度 */
const SABOTAGE_GEN_LOSS = 45;
const SABOTAGE_TEAM_LOSS = 22;
/** 砸坏后停机几回合，这段时间修不了 */

/* ==================================================================== */
/*  小工具                                                              */
/* ==================================================================== */

let uidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${uidCounter++}`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function log(state: GameState, text: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${text}`);
  if (state.log.length > 500) state.log.length = 500;
}

/** 按实际步行路径计算地图上距离最远的一对房间。 */
function farthestRoomPair(): RoomId[] {
  const candidates = ROOMS.map((room) => room.id).filter((id) => id !== ENTRY_ROOM && id !== EXIT_ROOM);
  let farthest = -1;
  let pairs: Array<[RoomId, RoomId]> = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const distance = roomDistance(candidates[i], candidates[j]);
      if (distance > farthest) { farthest = distance; pairs = [[candidates[i], candidates[j]]]; }
      else if (distance === farthest) pairs.push([candidates[i], candidates[j]]);
    }
  }
  return pairs.length ? randomOf(pairs) : [ENTRY_ROOM, EXIT_ROOM];
}

/** 旧团队进度系统已废弃；NPC 不再通过设施劳动推进集体逃生。 */
function addTeamProgress(state: GameState, amount: number): void {
  // 旧团队进度系统已废弃；保留空函数以兼容尚未改版的卡牌脚本。
  void state; void amount;
}

/** 破坏设施只能拖慢当前阶段，不能抹掉已经完成的阶段。 */
function reduceTeamProgress(state: GameState, amount: number): void {
  // 旧团队进度系统已废弃。
  void state; void amount;
}

/** 健康 / 受伤 / 倒地，由血量推导，不单独存一份避免不同步 */
export function conditionOf(person: Person): Health {
  if (person.hp > SURVIVOR_INJURED_HP) return 'healthy';
  if (person.hp > 0) return 'injured';
  return 'downed';
}

/* ==================================================================== */
/*  查询                                                                */
/* ==================================================================== */

/** 房间里的人（包括倒地的人，他们还在原地） */
function peopleInRoom(state: GameState, room: RoomId, role?: PersonRole): Person[] {
  return state.people.filter((p) => p.room === room && (!role || p.role === role));
}

/** 全部 NPC，包括倒地的 */
function npcs(state: GameState): Person[] {
  return state.people.filter((p) => p.role !== 'police');
}

/** 还站着、能做事的 NPC */
function standing(state: GameState): Person[] {
  return npcs(state).filter((p) => p.hp > 0);
}

function findVictim(
  state: GameState,
  room: RoomId,
  maxHp = Infinity,
  allowDowned = false,
  targetId?: string,
): Person | undefined {
  // 警员默认不在自动选目标的池子里；只有玩家明确点他（袭警）才允许
  const inRoom = peopleInRoom(state, room).filter(
    (p) => p.role !== 'police' || (targetId !== undefined && p.id === targetId),
  );
  // 玩家点了某个人：只打他，不再按「目标 > 平民」自动挑
  if (targetId) {
    const picked = inRoom.find((p) => p.id === targetId);
    if (!picked) return undefined;
    if (picked.hp <= 0 && (!allowDowned || !canExecuteNow(picked))) return undefined;
    if (picked.hp > maxHp) return undefined;
    return picked;
  }
  const rank = (list: Person[]) =>
    list.find((p) => p.role === 'target' && p.marked) ??
    list.find((p) => p.role === 'target') ??
    list.find((p) => p.role === 'civilian');

  // 优先挑还站着的人；屋里只剩倒地的人时，攻击卡就是补刀——不然「再打一次」永远打不出去
  const standing = rank(inRoom.filter((p) => p.hp > 0 && p.hp <= maxHp));
  if (standing) return standing;
  if (!allowDowned) return undefined;
  return rank(inRoom.filter((p) => canExecuteNow(p)));
}

export function isLocked(state: GameState, room: RoomId): boolean {
  return (state.roomLocks[room] ?? 0) > 0 && isRoomLit(state, room);
}

export function lockedRoomsOf(state: GameState): RoomId[] {
  return (Object.keys(state.roomLocks) as RoomId[]).filter((r) => (state.roomLocks[r] ?? 0) > 0);
}

function isObstacle(room: RoomId): boolean {
  return OBSTACLE_ROOMS.includes(room);
}

function canStand(state: GameState, room: RoomId): boolean {
  if (isObstacle(room) && !state.clearedObstacles.includes(room)) return false;
  return true;
}

function alarmSuppressed(state: GameState): boolean {
  return state.noAlarmTurn || state.turn < state.alarmSilencedUntilTurn;
}

function playerIsHidden(state: GameState): boolean {
  return alarmSuppressed(state) || state.stealthActions > 0;
}

/** 尾随者模式会把迈尔斯的实际恐惧范围压到 0。 */
function effectiveFearRadius(state: GameState): number {
  if (state.stealthActions > 0) return 0;
  return state.killer === '迈克尔·迈尔斯' && state.myersStalking ? 0 : state.fearRadius;
}

/** 正在被「追击」的人：这一瞬间他已经贴到你身上，不再触发转身就跑 */
let chasedId: string | null = null;

/** 本回合是否处于「伏击」状态：推门进去也不会惊动任何人 */
function ambushActive(state: GameState): boolean {
  return state.ambushTurn === state.turn;
}

/**
 * 「暴露度」是唯一的失败压力条：暴露度与暴露度/逮捕已合并成一条。
 * wanted 只是它的 0~10 镜像，供旧卡牌 ops 继续读写，不再单独判负。
 */
function syncWanted(state: GameState): void {
  state.wanted = clamp(Math.ceil(state.alarm / WANTED_TO_ALARM), 0, 10);
}

function addWanted(state: GameState, amount: number): void {
  if (amount > 0) state.heatTurn = state.turn;
  addAlarm(state, amount * WANTED_TO_ALARM);
}

/** 暴露度：满 100 玩家被捕 / 被驱散。由玩家的动作推高，每回合自动回落。 */
function activateEmergency(state: GameState): void {
  if (state.emergencyActive || state.result) return;
  state.emergencyActive = true;
  const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
  if (state.escapeRooms.length !== 2) state.escapeRooms = farthestRoomPair();
  for (const person of npcs(state)) {
    if (person.hp <= 0) continue;
    person.alert = Math.max(person.alert, 85);
    person.intent = 'escape';
    person.goal = 'exit';
    person.escapeProgress = 0;
    person.activity = '警报全面爆发，正在逃离猎场';
  }
  if (!supernatural) {
    const police = state.people.find((p) => p.role === 'police');
    if (police) {
      for (let i = 0; i < 3; i += 1) {
        state.people.push({
          ...police,
          id: `emergency-police-${i + 1}`,
          name: ['增援警员 A', '增援警员 B', '增援警员 C'][i],
          room: POLICE_START,
          hp: 4,
          alert: 100,
          fear: 0,
          escapeProgress: 0,
          movesThisTurn: 0,
        });
      }
    }
    log(state, '【警报满值】警笛声撕开夜色！多支警队冲入猎场，所有人开始逃亡，警察将主动追捕你！');
  } else {
    state.people = state.people.filter((p) => p.role !== 'police');
    log(state, '【灵异警报满值】猎场中的人终于意识到自己面对的不是人类。所有幸存者开始不顾一切地逃亡！');
  }
}

export function addAlarm(state: GameState, amount: number): void {
  if (state.result || amount === 0) return;
  const before = state.alarm;
  state.alarm = clamp(state.alarm + amount, 0, ALARM_MAX);
  syncWanted(state);
  if (before < 60 && state.alarm >= 60 && state.escapeRooms.length === 0) {
    state.escapeRooms = farthestRoomPair();
    log(state, `警报升高！猎场出现逃生点：${state.escapeRooms.map(roomName).join('、')}。高度警戒的人开始寻找出口。`);
  }
  if (state.alarm >= ALARM_MAX && !state.emergencyActive) activateEmergency(state);
}

/** 布局牌对报警暴露度的削弱 */
function witnessWanted(state: GameState, base: number): number {
  let gain = base;
  if (state.phoneCut) gain -= 1;
  if (state.poltergeist) gain -= 1;
  return Math.max(0, gain);
}

export { roomName };

/* ==================================================================== */
/*  视野：三层战争迷雾                                                   */
/* ==================================================================== */

/**
 * 取得玩家当前朝向正前方的一间相邻房间。
 * 房间位置每局随机生成，因此按房间中心点与朝向向量计算，而不是写死上下左右。
 */
function forwardRoom(state: GameState): RoomId | null {
  const current = ROOM_MAP[state.playerRoom];
  const cx = current.rect.left + current.rect.width / 2;
  const cy = current.rect.top + current.rect.height / 2;
  let best: RoomId | null = null;
  let bestDot = 0.35;

  for (const neighborId of current.neighbors) {
    if (isLocked(state, current.id) || isLocked(state, neighborId)) continue;
    const neighbor = ROOM_MAP[neighborId];
    const dx = neighbor.rect.left + neighbor.rect.width / 2 - cx;
    const dy = neighbor.rect.top + neighbor.rect.height / 2 - cy;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const dot = (dx / length) * state.playerFacing.x + (dy / length) * state.playerFacing.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = neighborId;
    }
  }
  return best;
}

/**
 * 当前能不能看见这个房间里的「人」。
 * 玩家所在房间与正前方一格可直接观察；侦查 / 感知仍可临时点亮其他房间。
 * 其他相邻房间只显示轮廓，不会白送人物位置。
 */
export function isRoomVisible(state: GameState, room: RoomId): boolean {
  if (room === state.playerRoom || room === forwardRoom(state)) return true;
  if (room === state.watchedRoom && ROOM_MAP[state.playerRoom].neighbors.includes(room) && !isLocked(state, room) && !isLocked(state, state.playerRoom)) return true;
  return (state.scouted[room] ?? 0) > 0;
}

/** 是否已经探索过（看过屋内配置） */
export function isRoomExplored(state: GameState, room: RoomId): boolean {
  return state.explored.includes(room) || isRoomVisible(state, room);
}

/** 这个人现在是否在玩家视野里 */
export function isPersonVisible(state: GameState, person: Person): boolean {
  if (person.hidden) return person.trackedTurns > 0;
  if (person.trackedTurns > 0) return true;
  return isRoomVisible(state, person.room);
}

/** 玩家"知道"的人：至少见过一次 */
export function knownPeople(state: GameState): Person[] {
  return npcs(state).filter((p) => p.lastSeenTurn > 0 || isPersonVisible(state, p));
}

function markExplored(state: GameState, room: RoomId): void {
  if (!state.explored.includes(room)) state.explored.push(room);
}

function scoutRoom(state: GameState, room: RoomId, turns = 2): void {
  markExplored(state, room);
  state.scouted[room] = Math.max(state.scouted[room] ?? 0, turns);
}

/** 回合结束时刷新记忆与视野计时 */
function refreshVision(state: GameState): void {
  const visible = ROOMS.map((r) => r.id).filter((r) => isRoomVisible(state, r));
  visible.forEach((r) => markExplored(state, r));
  npcs(state).forEach((p) => {
    if (!p.hidden && visible.includes(p.room)) {
      p.lastSeenRoom = p.room;
      p.lastSeenTurn = state.turn;
    }
    if (p.trackedTurns > 0) {
      p.trackedTurns -= 1;
      if (p.trackedTurns === 0) p.lastSeenTurn = state.turn;
    }
  });
  state.scouted = Object.fromEntries(
    Object.entries(state.scouted)
      .map(([k, v]) => [k, (v ?? 0) - 1])
      .filter(([, v]) => (v as number) > 0),
  ) as Partial<Record<RoomId, number>>;
}

/* ==================================================================== */
/*  痕迹与感知                                                          */
/* ==================================================================== */

/**
 * 老练的幸存者有时会踮着脚走：脚印仍然可见，但不会惊动乌鸦。
 * 用「行动计数 + 人物 id」做稳定判定，同一次行动里各处埋点结果一致；
 * 下一次行动就会变——所以他不是永远安静，玩家总还有机会找到他。
 */
function isQuietMove(state: GameState, person: Person): boolean {
  if (!person.sneaky) return false;
  const seed =
    (state.trailClock * 31 + person.id.length * 17 + state.turn * 7 + person.room.length * 13) % 100;
  return seed < 45;
}

const NOISE_LABELS = [
  '一群乌鸦扑棱着飞起',
  '木地板吱呀响了一声',
  '柜门被轻轻碰上',
  '有人压着嗓子咳嗽',
];

/** 有人经过：不靠技能也能得到的方向提示 */
function addDisturbance(state: GameState, room: RoomId): void {
  // 同一间屋隔两次行动才再报一次，免得玩家每动一下都刷一条乌鸦叫
  if (state.disturbances.some((d) => d.room === room && state.trailClock - d.clock <= 2)) return;
  const label = randomOf(NOISE_LABELS);
  state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label });
  if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
  log(state, `${roomName(room)}那边${label}——刚有人经过。`);
}

/** 还能听见的动静：短线索，走两步就断 */
export function visibleDisturbances(state: GameState): GameState['disturbances'] {
  return state.disturbances.filter((d) => state.trailClock - d.clock <= DISTURBANCE_WINDOW);
}

function pushTrail(state: GameState, room: RoomId, to: RoomId, blood: boolean): void {
  if (room === to) return;
  if (state.trails.some((t) => t.turn === state.turn && t.room === room && t.to === to)) return;
  state.trails.push({ room, to, turn: state.turn, clock: state.trailClock, blood });
  if (state.trails.length > 80) state.trails.splice(0, state.trails.length - 80);
}

/** 一段动作结束后，比对前后房间，把真正跑掉的路线与动静记下来 */
function recordTrails(state: GameState, before: Map<string, RoomId>): void {
  npcs(state).forEach((p) => {
    const from = before.get(p.id);
    if (!from || from === p.room) return;
    // 所有实际移动都会留下可追踪的脚印；潜行只压低声音，不再让路线凭空消失。
    pushTrail(state, from, p.room, p.hp <= SURVIVOR_INJURED_HP || p.bleed > 0);
    if (!isQuietMove(state, p)) addDisturbance(state, p.room);
  });
}

function snapshotRooms(state: GameState): Map<string, RoomId> {
  return new Map(npcs(state).map((p) => [p.id, p.room]));
}

function trailActionWindow(state: GameState): number {
  return TRAIL_ACTION_WINDOW + (state.mapId === 'ormond' ? 3 : 0);
}

function pruneTrails(state: GameState): void {
  state.trails = state.trails.filter((t) => state.trailClock - t.clock <= trailActionWindow(state));
}

function pruneDisturbances(state: GameState): void {
  state.disturbances = state.disturbances.filter(
    (d) => state.trailClock - d.clock <= DISTURBANCE_WINDOW,
  );
}

/**
 * 地面上还能看见的痕迹。
 *
 * 不按"是否探索过"过滤：血迹是跨出门槛的证据，正是靠它才敢往没进去过的房间走。
 * 房间里叫什么仍然不知道，但地板上那道划痕指向哪里，你看得见。
 */
export function visibleTrails(state: GameState): Trail[] {
  return state.trails.filter((t) => state.trailClock - t.clock <= trailActionWindow(state));
}

/** 感知：这一回合地图上浮着全场红色人影（只有影子，不告诉你那是谁） */
export function isSensing(state: GameState): boolean {
  return state.senseTurn === state.turn;
}

/**
 * 玩家做完一个动作之后：房子不会站着等你。
 * 跑掉的人继续跑、求救的人继续摸电话、救援的人继续包扎——只不过一回合有上限。
 */
function npcReact(state: GameState): void {
  if (state.result) return;
  const before = snapshotRooms(state);
  const fearRadius = effectiveFearRadius(state);
  if (fearRadius === 0) {
    recordTrails(state, before);
    rememberVisible(state);
    return;
  }
  for (const person of npcs(state)) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;
    // 倒地、藏着、被按住的人在原地等；屋里的人留给进门反应与回合结算
    if (person.hp <= 0 || person.hidden) continue;
    if (person.lastWitnessedEventClock === state.trailClock) continue;
    if (person.blockedTurns > 0 || state.pinnedPeople.includes(person.id)) continue;
    const effects = person.statusEffects ?? {};
    const cannotSense = (effects.undetectable ?? 0) > 0 || (effects.oblivious ?? 0) > 0 || (effects.blind ?? 0) > 0 || !isRoomLit(state, person.room);
    if (cannotSense) continue;

    // 恐惧范围：相邻房间先起疑；范围 2 的杀手会在隔壁直接引发逃跑，两格外也会察觉。
    const distanceToPlayer = roomDistance(person.room, state.playerRoom);
    if (fearRadius >= 2 && distanceToPlayer === 1 && person.alert < 45) {
      person.awareness = Math.max(person.awareness, 2);
      person.alert = Math.max(person.alert, 45);
      person.intent = 'flee';
      person.activity = '察觉到杀手逼近，立刻逃跑';
      if (person.movesThisTurn < REACT_MOVE_CAP && fleeAway(state, person, true)) person.movesThisTurn += 1;
      continue;
    } else if (fearRadius >= 1 && distanceToPlayer === 1 && person.awareness === 0 && person.alert < 40) {
      person.awareness = 1;
      person.alert = Math.max(person.alert, 12);
      person.intent = 'wary';
      person.activity = '听见附近有动静，停下来观察';
    } else if (fearRadius >= 2 && distanceToPlayer === 2 && person.awareness === 0 && person.alert < 40) {
      person.awareness = 1;
      person.alert = Math.max(person.alert, 12);
      person.intent = 'wary';
      person.activity = '远处传来令人不安的动静';
    }

    // 同房间的目击者也要有动作：刚被砍的那个人本回合已经反应过，不重复。
    // 只依据持久认知阶段判断是否进入恐慌；不能用进门刚增加的 alert 反过来触发即时逃跑。
    const sameRoom = person.room === state.playerRoom;
    if (sameRoom && person.id === state.lastAttackedId) continue;
    if (sameRoom) {
      if (state.ambushTurn === state.turn) continue;
      if (person.awareness < 2) continue;
      if (person.movesThisTurn >= REACT_MOVE_CAP) continue;
      if (witnessInRoom(state, person)) person.movesThisTurn += 1;
      continue;
    }
    if (person.movesThisTurn >= REACT_MOVE_CAP) continue;
    // 后院翻篱笆是回合结束的结算，不在这中间偷偷逃出去
    if (wantsToLeave(state, person)) continue;

    const fleeing = person.intent === 'flee' || person.intent === 'escape';
    const busy =
      person.intent === 'call' ||
      person.intent === 'heal' ||
      person.intent === 'rescue' ||
      ((person.archetype === 'rescuer' || person.archetype === 'hider' || person.archetype === 'caller') &&
        person.alert >= 25);
    if (!fleeing && !busy) continue;

    person.movesThisTurn += 1;
    if (fleeing) fleeAway(state, person, true);
    else actByArchetype(state, person);
  }
  recordTrails(state, before);
  rememberVisible(state);
}

/** 不做计时结算，只把「现在看得见谁」记成最后确认位置 */
function rememberVisible(state: GameState): void {
  npcs(state).forEach((p) => {
    if (!p.hidden && isRoomVisible(state, p.room)) {
      p.lastSeenRoom = p.room;
      p.lastSeenTurn = state.turn;
    }
  });
}

/** 检查鬼魔神龛：放置时房间内已有幸存者也会立即触发；空房间则等待第一名进入者。 */
function checkScourgeShrine(state: GameState): void {
  if (!state.scourgeShrineRoom) return;
  const present = state.people.filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && person.room === state.scourgeShrineRoom);
  const newcomer = present.find((person) => !state.scourgeShrineOccupants.includes(person.id));
  if (newcomer) {
    newcomer.fear = clamp(newcomer.fear + 35, 0, 100);
    newcomer.alert = clamp(newcomer.alert + 12, 0, 100);
    newcomer.awareness = Math.max(newcomer.awareness, 2);
    newcomer.revealedActions = Math.max(newcomer.revealedActions ?? 0, 4);
    newcomer.intent = 'wary';
    log(state, `鬼魔神龛触发：${newcomer.name}受到惊吓，恐惧 +35、警觉 +12，气场显现 3 次后续行动！`);
    state.scourgeShrineRoom = null;
    state.scourgeShrineOccupants = [];
  } else {
    state.scourgeShrineOccupants = present.map((person) => person.id);
  }
}

/** 玩家每一个动作结束后的统一收尾：世界动一下，视野记一下，胜负判一下 */
function afterPlayerAction(state: GameState): void {
  if (state.result) return;
  checkScourgeShrine(state);
  const beforeReaction = snapshotRooms(state);
  npcReact(state);
  checkScourgeShrine(state);
  resolveTrapEntries(state, beforeReaction);
  if (state.result) return;
  if (state.nurseFatiguePending) {
    state.nurseFatiguePending = false;
    state.nurseFollowUp = false;
    state.stunTurns = Math.max(state.stunTurns, 1);
    log(state, '闪现后的疲惫袭来：下回合行动点减少 1。');
  }
  state.revealAuraActions = Math.max(0, state.revealAuraActions - 1);
  state.trailRevealActions = Math.max(0, state.trailRevealActions - 1);
  state.stealthActions = Math.max(0, state.stealthActions - 1);
  if (state.trailRevealActions === 0) state.highlightedTrail = null;
  state.people.forEach((person) => {
    person.revealedActions = Math.max(0, (person.revealedActions ?? 0) - 1);
    if (person.statusEffects) {
      for (const key of Object.keys(person.statusEffects) as Array<keyof NonNullable<Person['statusEffects']>>) {
        person.statusEffects[key] = Math.max(0, (person.statusEffects[key] ?? 0) - 1);
      }
    }
  });
  // 恶魔附身以行动而非回合计时；每次行动消耗 20 点尾随值。
  if (state.killer === '迈克尔·迈尔斯' && state.possessed) {
    state.stalkMeter = Math.max(0, state.stalkMeter - 20);
    if (state.stalkMeter === 0) {
      state.possessed = false;
      log(state, '尾随值耗尽，恶魔附身结束。');
    } else {
      log(state, `恶魔附身消耗 20 点尾随值（剩余 ${state.stalkMeter}/100）。`);
    }
  }
  // 玩家的一次行动结束：痕迹的寿命按行动数走，不是按回合。
  // 这让「跟着脚印走」变成一段短线索，走错再回头就真的断了。
  state.trailClock += 1;
  pruneTrails(state);
  pruneDisturbances(state);
}

/* ==================================================================== */
/*  寻路                                                                */
/* ==================================================================== */


export function nextStepToward(
  state: GameState,
  from: RoomId,
  to: RoomId,
  avoid: RoomId[] = [],
  respectLocks = true,
): RoomId | null {
  if (from === to || avoid.includes(to)) return null;
  // 房间封锁的是整扇门：房内 NPC 不能穿门离开，房外 NPC 也不能进入。
  if (respectLocks && isLocked(state, from)) return null;
  const blocked = new Set<RoomId>(avoid);
  const queue: RoomId[][] = [[from]];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of ROOM_MAP[current].neighbors) {
      if (seen.has(next)) continue;
      if (blocked.has(next) && next !== to) continue;
      if (respectLocks && isLocked(state, next)) continue;
      if (!canStand(state, next) && next !== to) continue;
      seen.add(next);
      const newPath = [...path, next];
      if (next === to) return newPath[1];
      queue.push(newPath);
    }
  }
  return null;
}

function farthestRoom(state: GameState, from: RoomId): RoomId {
  const pool = ROOMS.map((r) => r.id).filter(
    (r) => r !== from && r !== state.playerRoom && canStand(state, r) && !isLocked(state, r),
  );
  if (!pool.length) return from;
  const scored = pool
    .map((r) => ({ r, d: roomDistance(r, state.playerRoom) }))
    .sort((a, b) => b.d - a.d);
  const best = scored[0]?.d ?? 0;
  return randomOf(scored.filter((s) => s.d >= best - 1).map((s) => s.r));
}

function resolveDest(state: GameState, dest: Dest): RoomId {
  switch (dest) {
    case 'here':
      return state.playerRoom;
    case 'adjacent':
      return randomOf(ROOM_MAP[state.playerRoom].neighbors);
    case 'far':
      return farthestRoom(state, state.playerRoom);
    case 'exit':
      return EXIT_ROOM;
    case 'garden':
      return 'garden';
    default:
      return dest;
  }
}


/* ==================================================================== */
/*  生死：健康 → 受伤 → 倒地 → 死亡                                     */
/* ==================================================================== */

type NpcWitnessedEvent = 'attack' | 'murder' | 'abduction';

/**
 * NPC 对重大事件的统一感知入口。
 * 同屋、未被遮挡的幸存者属于直接目击者；他们立即获得明确认知并按人格采取行动。
 * 超自然杀手造成的事件会引发无法理解的恐慌，不会机械地全部转成报警。
 */
function npcWitnessEvent(
  state: GameState,
  room: RoomId,
  event: NpcWitnessedEvent,
  subjectId: string,
): number {
  const witnesses = npcs(state).filter(
    (person) =>
      person.id !== subjectId &&
      person.hp > 0 &&
      !person.hidden &&
      person.room === room,
  );
  if (!witnesses.length) return 0;

  const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
  const eventLabel =
    event === 'murder' ? '目睹同伴死亡' :
    event === 'abduction' ? '目睹倒地者被强行带走' :
    '目睹同伴遭到袭击';

  // 先由现场目击者发出声音，再让他们各自采取行动；邻近房间只能获得转述信息。
  shout(state, witnesses[0], event === 'murder' ? 28 : 22);

  for (const witness of witnesses) {
    const alertFloor = event === 'murder' ? 88 : event === 'abduction' ? 78 : 70;
    const fearGain = event === 'murder' ? 42 : event === 'abduction' ? 30 : 24;
    witness.alert = clamp(Math.max(witness.alert + alertFloor, alertFloor), 0, 100);
    witness.fear = clamp(witness.fear + fearGain, 0, 100);
    witness.awareness = Math.max(witness.awareness, event === 'murder' ? 3 : 2);
    witness.lastWitnessedEventClock = state.trailClock;
    witness.dialogue = supernatural
      ? randomOf(['那不是人……快躲起来！', '别看它！快跑！', '这到底是什么东西？！'])
      : event === 'murder'
        ? randomOf(['他杀了人！快跑！', '我亲眼看见了！救命！', '快报警！有人被杀了！'])
        : event === 'abduction'
          ? randomOf(['他把人拖走了！快来帮忙！', '那个人还活着！不能让他带走！', '有人被强行带走了！'])
          : randomOf(['他袭击了那个人！', '救命！有人受伤了！', '快离开这里！']);

    const previousRoom = witness.room;
    if (supernatural) {
      // 面对超自然威胁，普通人优先躲藏或逃命，不会像目击普通凶杀那样统一报警。
      if (witness.archetype === 'hider') {
        witness.goal = 'hide';
        actByArchetype(state, witness);
      } else {
        witness.goal = 'panic';
        witness.intent = 'flee';
        witness.activity = '目睹无法理解的恐怖，拼命逃离';
        if (witness.movesThisTurn < REACT_MOVE_CAP && fleeAway(state, witness, true)) {
          witness.movesThisTurn += 1;
        }
      }
    } else {
      switch (witness.archetype) {
        case 'alert': witness.goal = 'exit'; break;
        case 'caller': witness.goal = 'phone'; break;
        case 'rescuer': witness.goal = 'help'; break;
        case 'hider': witness.goal = 'hide'; break;
        case 'defiant': witness.goal = 'weapon'; break;
        case 'brave': witness.goal = 'gather'; break;
        case 'kiter': witness.goal = 'panic'; break;
      }
      actByArchetype(state, witness);
    }

    if (witness.room !== previousRoom) {
      witness.movesThisTurn = Math.min(REACT_MOVE_CAP, witness.movesThisTurn + 1);
    }
    if (witness.intent === 'idle') witness.intent = 'wary';
    if (witness.activity === '在翻找抽屉' || witness.activity === '靠在窗边抽烟') {
      witness.activity = eventLabel;
    }
  }

  log(state, `【NPC目击】${witnesses.map((person) => person.name).join('、')}${eventLabel}，立即作出反应。`);
  return witnesses.length;
}

function killPerson(state: GameState, person: Person): void {
  if (state.carryPersonId === person.id) state.carryPersonId = null;
  if (!state.people.some((p) => p.id === person.id)) return;
  const directWitnesses = person.role === 'police'
    ? 0
    : npcWitnessEvent(state, person.room, 'murder', person.id);
  state.people = state.people.filter((p) => p.id !== person.id);
  state.pinnedPeople = state.pinnedPeople.filter((id) => id !== person.id);
  if (state.bitterMurmurReady && person.role !== 'police') {
    state.bitterMurmurReady = false;
    const remaining = state.people.filter((p) => p.role !== 'police' && p.hp > 0 && !p.hidden);
    remaining.forEach((other) => { other.revealedActions = Math.max(other.revealedActions ?? 0, 4); });
    log(state, remaining.length
      ? `苦涩低语：${person.name}倒下的回声传遍猎场，另外 ${remaining.length} 名人类的气场显现。`
      : '苦涩低语：最后的回声沉入空屋。');
  }
  state.kills += 1;
  if (person.role !== 'police') state.survivorKills += 1;
  state.killsThisTurn += 1;
  if (person.marked) state.markedKilled += 1;
  state.lastCrimeRoom = state.playerRoom;

  // 只有被看见的击杀才会推高暴露度。悄悄做掉的、屋子里没人的，
  // 外面只知道「又少了一个人」——那是暴露度该管的事，不是暴露度。
  const seenBy = npcs(state).filter(
    (p) => p.room === person.room && p.hp > 0 && !p.hidden && (p.alert >= 25 || p.intent !== 'idle'),
  );
  if (directWitnesses > 0 || seenBy.length) {
    addWanted(state, person.role === 'target' ? 2 : 1);
  } else {
    state.huntStats.quietKills += 1;
    log(state, '屋里没有人看见这一幕。');
  }
  log(
    state,
    `你杀死了${person.marked ? '标记目标' : person.role === 'police' ? '警察' : '平民'} ${person.name}。`,
  );

  // 尸体迟早会被发现：整栋房子的警觉跟着抬起来，恐慌会传染。
  let stirred = 0;
  npcs(state).forEach((other) => {
    // 尸体不会让整栋房子瞬间获知消息；只有同屋或相邻房间的人先察觉。
    const discoveryRadius = state.mapId === 'lampkin' ? 2 : 1;
    if (roomDistance(other.room, person.room) <= discoveryRadius) {
      const nearby = other.room === person.room;
      other.fear = clamp(other.fear + (nearby ? 38 : 18), 0, 100);
      other.alert = clamp(other.alert + (nearby ? 20 : 10), 0, 100);
      stirred += 1;
    }
  });
  addAlarm(state, 6);
  if (stirred > 0) log(state, '血腥味顺着地板缝散开，房子里的人开始不安地走动。');
}

/** 受到伤害：只能推进一档，倒地的人再挨一下才会死 */
function damagePerson(state: GameState, person: Person, amount: number, suppressFlee = false): void {
  if (!state.people.some((p) => p.id === person.id)) return;
  let dmg = Math.max(0, amount + state.bonusDamage);
  state.bonusDamage = 0;
  if (dmg <= 0) return;
  if ((person.statusEffects?.danger ?? 0) > 0 && person.hp > 0) {
    person.statusEffects!.danger = 0;
    person.hp = 0;
    person.downedTurns = 0;
    person.intent = 'stunned';
    person.activity = '受到攻击，危险状态触发并立即倒地';
    person.alert = 100;
    log(state, `${person.name} 处于危险状态，受到攻击后立即倒地！`);
    addAlarm(state, 4);
    npcWitnessEvent(state, person.room, 'attack', person.id);
    return;
  }
  // 见血就清醒：杀戮值一脚踩空
  state.frenzy = 0;

  const before = person.hp;
  person.fear = clamp(person.fear + Math.max(28, dmg * 24), 0, 100);
  if (person.fear >= 100) dmg = Math.max(dmg, before);
  person.hidden = false;
  person.blockedTurns = 0;

  if (before <= 0) {
    // 对倒地目标造成伤害即为补刀；普通攻击按钮本身不会选择倒地者。
    state.executions += 1;
    killPerson(state, person);
    return;
  }

  person.hp = Math.max(0, before - dmg);

  if (person.hp <= 0) {
    person.hp = 0;
    person.downedTurns = 0;
    person.intent = 'stunned';
    person.activity = '倒在地上，动不了';
    person.alert = 100;
    log(state, `${person.name} 被打倒在地上。现在可以直接处决；如果暂时放过，同伴仍可能赶来救援。`);
    addAlarm(state, 4);
    npcWitnessEvent(state, person.room, 'attack', person.id);
    return;
  }

  // 受到伤害后会惊慌逃跑；累计达到 2 点时，状态才正式变为受伤。
  person.alert = 100;
  person.intent = 'flee';
  person.activity = person.hp <= SURVIVOR_INJURED_HP ? '捂着伤口逃窜' : '受到攻击，惊慌逃窜';
  person.goal = 'exit';
  if (before > SURVIVOR_INJURED_HP && person.hp <= SURVIVOR_INJURED_HP) log(state, `${person.name} 受伤了（${person.hp}/${SURVIVOR_MAX_HP}），丢下手里的东西就跑。`);
  else log(state, `${person.name} 受到 ${dmg} 点伤害（剩余 ${person.hp}/${SURVIVOR_MAX_HP}）。`);
  // 同屋目击者必须形成真实行为反应；邻近房间只通过喊声获得转述信息。
  npcWitnessEvent(state, person.room, 'attack', person.id);
  addAlarm(state, 3);
  if (suppressFlee) {
    person.blockedTurns = 1;
    person.intent = 'stunned';
    person.activity = '被护士闪现后的抓取打断，短暂无法行动';
    log(state, `${person.name} 被护士抓住，挣扎被强行打断。`);
    return;
  }
  // 一刀下去他会连着跑两间屋，地板上留下一道血痕：
  // 「砍一刀、他挪一格、我跟上去」那种没有张力的追逐到此为止。
  for (let i = 0; i < PANIC_HOPS_ON_HIT; i++) {
    if (!fleeAway(state, person)) break;
    person.movesThisTurn += 1;
  }
}

export function carryPerson(state: GameState, personId: string): boolean {
  if (state.phase !== 'playing' || state.carryPersonId || state.energy < 1) return false;
  const person = state.people.find((p) => p.id === personId);
  if (!person || person.role === 'police' || person.hp > 0 || person.room !== state.playerRoom) return false;
  state.energy -= 1;
  state.carryPersonId = person.id;
  state.carryDistance = 0;
  person.activity = '被杀手抱起搬运';
  log(state, `你抱起了倒地的${person.name}。搬运途中不会自行挣脱。`);
  npcWitnessEvent(state, person.room, 'abduction', person.id);
  afterPlayerAction(state);
  return true;
}


export function dropCarriedPerson(state: GameState): boolean {
  if (state.phase !== 'playing' || !state.carryPersonId || state.energy < 1) return false;
  const person = state.people.find((candidate) => candidate.id === state.carryPersonId);
  if (!person || person.hp > 0) return false;
  state.energy -= 1;
  state.carryPersonId = null;
  state.carryDistance = 0;
  person.activity = '被杀手放下';
  log(state, `你放下了${person.name}。`);
  afterPlayerAction(state);
  return true;
}
export function executeCarriedPerson(state: GameState, methodId: ExecutionMethodId): boolean {
  if (!state.carryPersonId || state.phase !== 'playing' || state.attackBlockedTurn === state.turn) return false;
  const person = state.people.find((p) => p.id === state.carryPersonId);
  if (!person || person.room !== state.playerRoom || !canExecuteNow(person)) {
    log(state, '怀里的人尚不能处决，或已经不在现场。');
    return false;
  }
  const method = getExecutionMethod(methodId);
  if (!method || method.room !== state.playerRoom) {
    log(state, '这里没有可用的特殊处决场地。');
    return false;
  }
  if (state.energy < 1) { log(state, '行动点不足，无法完成特殊处决。'); return false; }
  state.energy -= 1;
  const name = person.name;
  state.carryPersonId = null;
  state.carryDistance = 0;
  state.executions += 1;
  log(state, `特殊处决【${method.name}】：${method.flavor(name)}（额外奖励 +35 分）。`);
  killPerson(state, person);
  state.specialExecutionBonus += 35;
  if (!state.executionMethodsUsed.includes(method.id)) state.executionMethodsUsed.push(method.id);
  state.attackReady = true;
  addAlarm(state, 8);
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

function canExecuteNow(person: Person): boolean {
  return person.hp <= 0;
}

function executePerson(state: GameState, person: Person): void {
  if (person.hp > 0) {
    log(state, `${person.name} 还站着，处决需要先把他打倒。`);
    return;
  }
  addAlarm(state, 8);
  state.executions += 1;
  log(state, `你处决了 ${person.name}。`);
  killPerson(state, person);
}

function rescuePerson(state: GameState, person: Person): void {
  if (person.hp > 0) return;
  person.hp = SURVIVOR_INJURED_HP;
  person.downedTurns = 0;
  person.intent = 'flee';
  person.activity = '被人从地上拖了起来';
  addAlarm(state, 2);
  log(state, `${person.name} 被同伴救起，重新站着（受伤）。`);
}

function healPerson(state: GameState, person: Person, amount = 1): void {
  if (person.hp <= 0) return;
  const before = person.hp;
  const maxHp = (person.statusEffects?.incurable ?? 0) > 0 ? SURVIVOR_INJURED_HP : SURVIVOR_MAX_HP;
  person.hp = Math.min(maxHp, person.hp + amount);
  if (person.hp > before && amount >= 2 && person.statusEffects?.deepWound) person.statusEffects.deepWound = 0;
  if (person.hp > before) log(state, `${person.name} 的伤口被处理过（${person.hp}/${SURVIVOR_MAX_HP}）。`);
}

/* ==================================================================== */
/*  目标选择                                                            */
/* ==================================================================== */

function selectPeople(state: GameState, who: Who): Person[] {
  const here = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0,
  );
  switch (who) {
    case 'victim': {
      // 攻击类牌只选择站立目标；倒地目标交给独立处决动作。
      const v = findVictim(state, state.playerRoom, Infinity, false);
      return v ? [v] : [];
    }
    case 'lowestHpHere': {
      const pool = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
      if (!pool.length) return [];
      const min = Math.min(...pool.map((p) => p.hp));
      return [pool.find((p) => p.hp === min)!];
    }
    case 'highestAlert': {
      const all = standing(state);
      if (!all.length) return [];
      const max = Math.max(...all.map((p) => p.alert));
      return [all.find((p) => p.alert === max)!];
    }
    case 'targetsHere':
      return here.filter((p) => p.role === 'target');
    case 'civilsHere':
      return here.filter((p) => p.role === 'civilian');
    case 'allHere':
      return here;
    case 'markedAny':
      return standing(state).filter((p) => p.marked);
    case 'allAny':
      return standing(state);
    case 'fleeing':
      return standing(state).filter((p) => p.intent === 'flee' || p.intent === 'escape');
    case 'downedHere':
      return peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police' && p.hp <= 0);
    case 'downedAny':
      return npcs(state).filter((p) => p.hp <= 0);
    case 'injuredAny':
      return npcs(state).filter((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP);
    case 'unawareNearby': {
      const near = ROOM_MAP[state.playerRoom].neighbors;
      return standing(state).filter((p) => !p.hidden && p.alert < 35 && near.includes(p.room));
    }
    case 'bloodSacrifice':
      return npcs(state).filter((p) => p.bloodSacrifice);
    case 'randomAny': {
      const all = standing(state);
      return all.length ? [randomOf(all)] : [];
    }
  }
}

function checkCond(state: GameState, cond: Cond): boolean {
  switch (cond.c) {
    case 'killsThisTurn':
      return state.killsThisTurn >= cond.gte;
    case 'peopleHere':
      return peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police' && p.hp > 0)
        .length >= cond.gte;
    case 'energy':
      return state.energy >= cond.gte;
    case 'wanted':
      if (cond.gte !== undefined && state.wanted < cond.gte) return false;
      if (cond.lte !== undefined && state.wanted > cond.lte) return false;
      return true;
    case 'alarm':
      if (cond.gte !== undefined && state.alarm < cond.gte) return false;
      if (cond.lte !== undefined && state.alarm > cond.lte) return false;
      return true;
    case 'stalk':
      return state.stalkMeter >= cond.gte;
    case 'possession':
      return state.possessed;
    case 'visibleSurvivor':
      return npcs(state).some((person) => person.role !== 'police' && person.hp > 0 && isPersonVisible(state, person));
    case 'flag':
      if (cond.key === 'phoneCut') return state.phoneCut;
      if (cond.key === 'wiretap') return state.wiretap;
      if (cond.key === 'poltergeist') return state.poltergeist;
      if (cond.key === 'policeBlocked') return state.policeBlocked;
      if (cond.key === 'noAlarm') return state.noAlarmTurn;
      if (cond.key === 'exitBlocked') return state.exitBlockedTurns > 0;
      return false;
    case 'room':
      return state.playerRoom === cond.is;
    case 'markedAlive':
      return standing(state).some((p) => p.marked);
    case 'escaped':
      return state.escaped >= cond.gte;
    case 'hasThreat':
      return peopleInRoom(state, state.playerRoom).some((p) => SURVIVOR_MAP[p.id]?.threat === cond.v);
    case 'hasArchetype':
      return peopleInRoom(state, state.playerRoom).some((p) => p.archetype === cond.a && p.hp > 0);
    case 'victimHere': {
      const v = findVictim(state, state.playerRoom, cond.maxHp ?? Infinity);
      return !!v;
    }
    case 'downedHere':
      return peopleInRoom(state, state.playerRoom).some((p) => p.role !== 'police' && p.hp <= 0);
    case 'injuredHere':
      return peopleInRoom(state, state.playerRoom).some(
        (p) => p.role !== 'police' && p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP,
      );
    case 'targetAway':
      return npcs(state).some((p) => p.role === 'target' && p.room !== state.playerRoom && p.hp > 0);
  }
}

/* ==================================================================== */
/*  效果解释器                                                          */
/* ==================================================================== */

export function runOps(state: GameState, ops: Op[]): void {
  const phoneWasCut = state.phoneCut;
  executeOps(state, ops, {
    selectPeople, log, damagePerson, canExecuteNow, executePerson, killPerson,
    addWanted, addAlarm, resolveDest, movePersonTo, markExplored,
    onPlayerEnter: (current, chased) => {
      chasedId = chased ?? null;
      try { npcOnPlayerEnter(current); } finally { chasedId = null; }
    },
    scoutRoom, npcs, peopleInRoom, standing, nextStepToward,
    healPerson, rescuePerson, checkCond,
    sabotageContext: (current) => sabotageSiteItem(current, { free: true, suppressAfterAction: true }),
  });
  if (!phoneWasCut && state.phoneCut) state.huntStats.environmentActions += 1;
}

function movePersonTo(state: GameState, person: Person, room: RoomId, clearAlert = false): void {
  if (person.room === room || person.hp <= 0) return;
  const from = roomName(person.room);
  person.room = room;
  if (clearAlert) person.alert = 0;
  log(state, `${person.name} 从${from}移动到${roomName(room)}。`);
  triggerBearTrapForPerson(state, person);
}

/* ==================================================================== */
/*  NPC 行为                                                            */
/* ==================================================================== */

/**
 * 这个人是否已经决定离开这栋房子
 *
 * 后院是唯一的出口。判定不能只看 intent——fleeAway() 把意图写成 'flee'，
 * 结果是「被追到后院」的人反而绝对安全。只要人站在后院并且确实慌了
 * （逃跑中 / 目的就是出口 / 警觉够高），就算他要走。
 */
function wantsToLeave(state: GameState, person: Person): boolean {
  if (!state.escapeRooms.length || !state.escapeRooms.includes(person.room)) return false;
  return (
    person.intent === 'escape' ||
    person.intent === 'flee' ||
    person.alert >= ESCAPE_ALERT_MIN
  );
}

/**
 * 往离玩家最远的方向跑一步
 *
 * quiet：玩家每动一下都会触发一次这样的逃跑，日志不能跟着刷屏；
 * 这时候只留地面上的痕迹，让玩家自己看地板。
 */
function fleeAway(state: GameState, person: Person, quiet = false): boolean {
  if (state.pinnedPeople.includes(person.id) || person.blockedTurns > 0 || person.hp <= 0 || person.fear >= 100) return false;
  if (person.room !== state.playerRoom && person.hp <= SURVIVOR_INJURED_HP && person.movesThisTurn % 2 === 1) {
    person.activity = '重伤拖慢了脚步，踉跄着停了一下';
    return false;
  }
  // 房门封锁会把房间内的人也困住，不能从锁住的房间直接跑出去。
  if (isLocked(state, person.room)) return false;
  // 后院是出口：只有本来就打算离开、或者已经吓破胆的人才会往外跑。
  // 否则「被追」等于「自动逃生」，玩家把人逼到院子里反而在帮对手。
  const mayExit =
    person.goal === 'exit' || person.goal === 'panic' || person.alert >= 75 || person.hp <= SURVIVOR_INJURED_HP || state.emergencyActive;
  const options = ROOM_MAP[person.room].neighbors.filter(
    (r) =>
      r !== state.playerRoom &&
      !isLocked(state, r) &&
      canStand(state, r) &&
      !state.barricades.includes(r) &&
      (mayExit || !state.escapeRooms.includes(r)),
  );
  if (!options.length) return false;
  const from = roomName(person.room);
  const fromId = person.room;
  const best = options
    .map((r) => ({ r, d: roomDistance(r, state.playerRoom) }))
    .sort((a, b) => b.d - a.d);
  const top = best[0]?.d ?? 0;
  person.room = randomOf(best.filter((b) => b.d >= top - 1).map((b) => b.r));
  person.alert = Math.max(0, person.alert - 12);
  person.intent = 'flee';
  person.activity = '夺路而逃';
  // 逃跑路线始终留下脚印；潜行者只是不制造额外声响。
  pushTrail(state, fromId, person.room, person.hp <= SURVIVOR_INJURED_HP);
  if (!isQuietMove(state, person)) addDisturbance(state, person.room);
  if (!quiet) {
    log(state, `${person.name} 从${from}逃向${roomName(person.room)}。`);
    shout(state, person, 14);
  }
  triggerBearTrapForPerson(state, person);
  return true;
}

/** 喊叫：同房间的人立刻警觉，隔壁房间的人隔着墙听见 */
function shout(state: GameState, person: Person, base = 18): void {
  let learned = 0;
  peopleInRoom(state, person.room)
    .filter((p) => p.id !== person.id && p.role !== 'police' && p.hp > 0)
    .forEach((p) => {
      if (p.alert < 70) {
        p.alert = clamp(p.alert + base, 0, 100);
        p.awareness = Math.max(p.awareness, 1);
        p.lastHeardFrom = person.name;
        p.lastHeardRoom = person.room;
        p.lastHeardTurn = state.turn;
        if (p.intent === 'idle') p.intent = 'wary';
        learned += 1;
        log(state, `${p.name} 听见喊声，警觉升到 ${p.alert}/100。`);
      }
    });
  ROOM_MAP[person.room].neighbors.forEach((r) => {
    peopleInRoom(state, r)
      .filter((p) => p.role !== 'police' && p.hp > 0 && p.alert < 55)
      .forEach((p) => {
        p.alert = clamp(p.alert + Math.round(base * 0.55), 0, 100);
        p.awareness = Math.max(p.awareness, 1);
        p.lastHeardFrom = person.name;
        p.lastHeardRoom = person.room;
        p.lastHeardTurn = state.turn;
        if (p.intent === 'idle') p.intent = 'wary';
        learned += 1;
      });
  });
  // 空喊不会让房子更紧张：只有真的有人被喊醒了，暴露度才涨
  if (learned > 0) addAlarm(state, Math.min(3, learned));
}

/** 玩家踏进房间的瞬间 */
function npcOnPlayerEnter(state: GameState): void {
  const hidden = playerIsHidden(state);
  const ambush = ambushActive(state);
  const before = snapshotRooms(state);
  const here = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0,
  );

  // 恐惧范围为 0 时，幸存者无法侦测玩家；迈尔斯可在同屋静默尾随。
  if (effectiveFearRadius(state) === 0) {
    here.forEach((person) => { person.activity = '没有察觉到你的存在'; });
    return;
  }

  here.forEach((person) => {
    const threat = SURVIVOR_MAP[person.id]?.threat;

    // 刚被追上来的人：他已经在你面前了，这一下跑不掉
    if (person.id === chasedId) {
      person.alert = 100;
      person.intent = 'flee';
      person.activity = '被你堵在屋里';
      log(state, `${person.name} 猛一回头，你已经在门口了。`);
      return;
    }

    // 伏击：屋里的人根本没发现你进来——不加警觉、不喊人，
    // 回合结束时也不会夺门而逃。这是「偷袭」这张牌买来的一个回合。
    if (ambush && threat !== 'spiritual') {
      person.activity = '背对着门，没有察觉';
      return;
    }
    if (ambush) {
      // 灵异感知者是你唯一骗不过的人：她能直接感觉到你在屋里
      log(state, `${person.name} 忽然抬头，看向你藏身的方向——她感觉到了。`);
      person.alert = 100;
    }

    // 推门会制造动静，但不代表每个人都会立刻认出杀手。
    // 只有警觉达到「警戒」(75+) 才会夺路而逃；低于阈值先观察、怀疑或继续原本的事。
    const wasAlert = person.alert;
    const darkRoom = !isRoomLit(state, state.playerRoom);
    // 进门前已经恐慌的人会在这次照面中确认危险；低于恐慌者不因进门噪声直接升级认知。 
    if (wasAlert >= 40) person.awareness = Math.max(person.awareness, 2);

    let gain = 30;
    if (threat === 'spiritual') gain = 65;
    else if (threat === 'alarm') gain = 55;
    else if (threat === 'lead') gain = 42;
    else if (threat === 'team') gain = 38;
    if (threat !== 'spiritual') {
      if (hidden) gain = Math.round(gain * 0.4);
      // 黑暗会显著削弱幸存者对入侵者的辨认能力。
      if (darkRoom) gain = Math.round(gain * 0.1);
    }
    person.alert = clamp(person.alert + gain, 0, 100);
    // 迈尔斯的尾随：盯着看得越久，越不容易被屋里的人察觉
    if (state.killer === '迈克尔·迈尔斯' && state.stalkMeter >= 60) {
      person.alert = clamp(person.alert - 20, 0, 100);
    }

    // 看见你就等于确认「杀手在这间屋里」——不会站着等你出牌。
    // 想在他们转身之前动手，就得靠伏击；想在他们跑掉之后补刀，就得靠追击。
    if (person.archetype === 'defiant' && person.armed && person.room === state.playerRoom) {
      counterAttack(state, person);
      return;
    }

    // 已经跑满这一回合的人，腿已经不听使唤了：门一开他也只能贴着墙喘气。
    // 这是玩家唯一能稳稳砍中「警觉的人」的机会，也是痕迹系统的兑现点。
    const exhausted = person.movesThisTurn >= REACT_MOVE_CAP;
    // 进门瞬间的警觉增长不能把未发觉 / 怀疑阶段直接推成逃亡。
    // 只有进门前已经达到恐慌（40+）的人，才会因这次照面立即逃跑。
    if (!exhausted && wasAlert >= 40 && fleeAway(state, person)) {
      person.movesThisTurn += 1;
      person.alert = 100;
      log(
        state,
        wasAlert >= 85
          ? `${person.name} 根本没等你站稳，已经冲出了门口。`
          : `${person.name} 确认了你的威胁，终于转身逃跑。`,
      );
      return;
    }

    // 尚未恐慌的人不会自动逃跑：明亮环境里先起疑，黑暗里可能根本没看清你。
    person.intent = person.alert >= 12 ? 'wary' : 'idle';
    person.activity = exhausted
      ? '跑不动了，靠着墙喘气'
      : darkRoom && person.alert < 12
        ? '黑暗中没有察觉到你的存在'
        : person.alert >= 12
          ? '察觉到异常，但还没有确认危险'
          : '没有察觉到你的存在';
    if (person.alert >= 12) log(state, `${person.name} 察觉到异常，但还没有确认危险（警觉 ${person.alert}/100）。`);
  });

  // 追击热度：你越死盯着同一个人，其他人越敢放手干活
  const chased = here.find((p) => p.hp > 0 && p.role !== 'police');
  if (chased) {
    if (state.chaseTargetId === chased.id) state.chaseTurns += 1;
    else {
      state.chaseTargetId = chased.id;
      state.chaseTurns = 1;
    }
  } else {
    state.chaseTargetId = null;
    state.chaseTurns = 0;
  }

  // 障碍伏击 / 手电筒致盲：推门这一下会挨一下，幸存者借机行动
  if (!ambush && !state.possessed) {
    const flasher = here.find((p) => p.item === 'flashlight' && p.itemUses > 0 && p.hp > 0);
    const obstacleHere = isObstacle(state.playerRoom) && !state.clearedObstacles.includes(state.playerRoom);
    const trapper = here.find(
      (p) => p.hp > 0 && (p.archetype === 'defiant' || p.archetype === 'brave' || p.archetype === 'kiter'),
    );
    if (flasher) {
      consumeItem(state, flasher);
      interruptPlayer(state, `${flasher.name} 早在门后等着，手电筒一下子照白了你的视野。`, flasher.id);
    } else if (obstacleHere && trapper && random() < 0.55) {
      interruptPlayer(
        state,
        `${trapper.name} 猛地推倒${roomName(state.playerRoom)}门口的杂物，正好砸在你身上。`,
        trapper.id,
      );
    }
  }
  // 门口那一步也会在地板上留下痕迹：你至少知道他是从哪儿溜走的
  recordTrails(state, before);
}

/** 反抗型 / 英勇型的正面反击：玩家下回合少走一步 */
function counterAttack(state: GameState, person: Person): void {
  // 手里有防身武器的人反手更狠：多拖一点行动点
  const heavy = person.item === 'weapon' && person.itemUses > 0;
  state.stunTurns += heavy ? 2 : 1;
  if (heavy) consumeItem(state, person);
  // 被反手推开：追势断了，杀戮清零
  state.frenzy = 0;
  state.frenzyStreak = 0;
  person.alert = 100;
  person.intent = 'wary';
  person.activity = '握着刀挡在门口';
  addAlarm(state, 4);
  log(state, `${person.name} 抄起武器朝你扑过来——你被逼退了一步（下回合少 ${heavy ? 2 : 1} 点行动点）。`);
}

/** 消耗一次道具；次数用完就清空，医疗包的治疗进度也一起归零 */
function consumeItem(state: GameState, person: Person): void {
  if (!person.item) return;
  person.itemUses = Math.max(0, person.itemUses - 1);
  if (person.itemUses <= 0) {
    person.item = null;
    person.healTurns = 0;
  }
}

/**
 * 玩家被打断（障碍伏击 / 手电筒致盲）：少 1 点行动点、刀收不回来、
 * 追势清零，并且幸存者们立刻借这个空档各做一件事。
 */
function interruptPlayer(state: GameState, reason: string, actorId: string): void {
  // 恶魔附身是迈尔斯的专属底牌：这段时间里障碍伏击与手电筒都拿他没办法
  if (state.possessed) {
    log(state, `${reason} 恶魔附身下的你连眼都没眨，这一下没起作用。`);
    return;
  }
  // 被抱起的倒地者不会因玩家受阻而自行挣脱；仍随玩家携带。
  state.stunTurns += 1;
  state.blindTurns = 1;
  state.attackReady = false;
  state.frenzy = 0;
  state.frenzyStreak = 0;
  state.chaseTargetId = null;
  state.chaseTurns = 0;
  log(state, reason);
  log(state, '你眼前一花，下一回合少 1 点行动点——他们趁这一下动了。');
  survivorsActOnce(state, actorId);
}

/** 打断时幸存者的一次额外行动：能跑的跑，跑不了的替团队把活往前推 */
function survivorsActOnce(state: GameState, actorId: string): void {
  const before = snapshotRooms(state);
  for (const p of npcs(state)) {
    if (p.hp <= 0 || p.hidden || p.blockedTurns > 0 || p.movesThisTurn >= REACT_MOVE_CAP) continue;
    const from = p.room;
    if (p.room === state.playerRoom) { if (p.awareness >= 2 || p.alert >= 40) fleeAway(state, p); }
    else if (p.awareness >= 2 || p.alert >= 40 || ['flee', 'escape', 'call', 'heal', 'rescue'].includes(p.intent)) actByArchetype(state, p);
    else if (random() < 0.35) {
      const options = ROOM_MAP[p.room].neighbors.filter((room) => room !== state.playerRoom && !isLocked(state, room));
      if (options.length) { const next = randomOf(options); p.room = next; p.activity = `趁你等待时移动到${roomName(next)}`; }
    }
    if (p.room !== from) p.movesThisTurn += 1;
  }
  resolveTrapEntries(state, before);
  void actorId;
  recordTrails(state, before);
}

/** 同房间的目击者：另一个人不会站着发呆，会喊人、跑、甚至拿手电筒照你 */
function witnessInRoom(state: GameState, person: Person): boolean {
  if (person.item === 'flashlight' && person.itemUses > 0 && person.alert >= 40) {
    consumeItem(state, person);
    interruptPlayer(state, `${person.name} 拧亮手电筒，一道白光正打在你脸上。`, person.id);
    return true;
  }
  person.alert = clamp(Math.max(person.alert + 45, 75), 0, 100);
  addDisturbance(state, person.room);
  person.awareness = Math.max(person.awareness, 2);
  person.lastWitnessedEventClock = state.trailClock;
  shout(state, person, 18);
  const previousRoom = person.room;
  actByArchetype(state, person);
  if (person.room !== previousRoom) {
    person.movesThisTurn = Math.min(REACT_MOVE_CAP, person.movesThisTurn + 1);
  }
  log(state, `${person.name} 亲眼确认了危险，按自己的本能作出反应。`);
  return true;
}

function barricadeRoom(state: GameState, person: Person): void {
  person.intent = 'barricade';
  person.activity = '拖着家具堵住门';
  if (!state.barricades.includes(person.room)) {
    state.barricades.push(person.room);
    log(state, `${person.name} 把柜子推到了门前——这间屋子下次要多花一步才能进。`);
  } else {
    log(state, `${person.name} 缩在堵死的门后发抖，已经没有退路。`);
  }
  addAlarm(state, 2);
}

/** 同屋有倒地同伴就拉起他：任何人都会救，只是意愿不同；玩家在场时没人敢动手 */
function tryRescue(state: GameState, person: Person): boolean {
  if (person.room === state.playerRoom) return false;
  if (person.blockedTurns > 0) return false;
  if (random() > RESCUE_EAGERNESS[person.archetype]) return false;
  const allies = peopleInRoom(state, person.room).filter(
    (p) => p.id !== person.id && p.role !== 'police',
  );
  const downed = allies.find((p) => p.hp <= 0);
  if (downed) {
    rescuePerson(state, downed);
    person.intent = 'rescue';
    person.activity = `正在把 ${downed.name} 从地上拖起来`;
    return true;
  }
  const injured = allies.find((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP);
  if (injured) {
    healPerson(state, injured, 1);
    person.intent = 'heal';
    person.activity = `正在给 ${injured.name} 包扎`;
    return true;
  }
  return false;
}

/**
 * 电话线路承担跨区域求救协调。
 * 线路正常时，幸存者能远程得知倒地同伴的位置；剪断后只能依靠无线电有限协调，
 * 无线电也被破坏时，就只能响应同屋或相邻房间的呼救。
 */
export function canCoordinateRescue(state: GameState, fromRoom: RoomId, downedRoom: RoomId): boolean {
  if (!state.phoneCut) return true;
  const range = state.sabotage.includes('radio') ? 1 : 3;
  return roomDistance(fromRoom, downedRoom) <= range;
}

/** 有人倒地时，幸存者会主动赶过去：救援优先于日常目标，但没人敢闯玩家守着的房间 */
function tryAidRun(state: GameState, person: Person): boolean {
  if (person.hidden || person.blockedTurns > 0) return false;
  if (random() > RESCUE_EAGERNESS[person.archetype] * AID_RUN_RATE) return false;
  const downed = npcs(state)
    .filter((p) => p.hp <= 0 && p.room !== state.playerRoom && canCoordinateRescue(state, person.room, p.room))
    .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
  if (!downed || downed.room === person.room) return false;
  const step = nextStepToward(state, person.room, downed.room, [state.playerRoom]);
  if (!step) return false;
  person.room = step;
  person.intent = 'rescue';
  person.activity = `朝${downed.name}倒下的地方赶去`;
  return true;
}

/** 求救型：打电话（1 回合）或用无线电（2 回合）报警 */
function tryCall(state: GameState, person: Person): boolean {
  if (person.blockedTurns > 0) return false;
  const canPhone = !state.phoneCut && PHONE_ROOMS.includes(person.room);
  const canRadio = !state.sabotage.includes('radio') && RADIO_ROOMS.includes(person.room);

  if (canPhone) {
    person.intent = 'call';
    person.activity = '按住电话线的手指在抖';
    return true;
  }
  if (canRadio) {
    person.callTurns += 1;
    if (person.callTurns >= 2) {
      finishCall(state, person, '无线电');
      return true;
    }
    person.intent = 'call';
    person.activity = '在无线电前调频，还差一回合';
    log(state, `${person.name} 正在调无线电，再有一回合就能把消息发出去。`);
    return true;
  }
  return false;
}

function finishCall(state: GameState, person: Person, device: string): void {
  state.npcAlarmed = true;
  addWanted(state, 3);
  addAlarm(state, 15);
  state.lastCrimeRoom = person.room;
  person.intent = 'flee';
  person.alert = 100;
  person.callTurns = 0;
  log(state, `${person.name} 用${device}联系上了外面：「他在${roomName(person.room)}！」暴露度大涨，警察正赶过去。`);
}

/** 按行为类型行动一步 */
function actByArchetype(state: GameState, person: Person): void {
  // 房间锁作用于整扇门，任何原型都不能从锁住的房间直接穿门离开。
  if (isLocked(state, person.room)) {
    person.activity = '房门被封锁，无法离开';
    return;
  }
  if (person.alert >= 85 && !state.phoneCut && PHONE_ROOMS.includes(person.room) && person.hp > 0) {
    tryCall(state, person);
    log(state, `${person.name}因高度警戒，正在尝试报警！`);
    return;
  }
  if (state.escapeRooms.length && person.alert >= 75 && person.hp > 0) {
    const exit = nearestOf(person.room, state.escapeRooms);
    if (exit === person.room) { person.intent = 'escape'; person.activity = '已抵达逃生点'; return; }
    const step = nextStepToward(state, person.room, exit, [state.playerRoom]);
    if (step) { person.room = step; person.intent = 'escape'; person.goal = 'exit'; person.activity = `正前往逃生点：${roomName(exit)}`; return; }
  }
  switch (person.archetype) {
    case 'kiter': {
      // 拉扯型：不硬拼，绕远路、抹脚印、必要时丢烟雾，专门把追逐拖长
      if (person.item === 'smoke' && person.itemUses > 0 && person.alert >= 25) {
        consumeItem(state, person);
        person.alert = Math.max(0, person.alert - 35);
        state.trails = state.trails.filter((t) => t.room !== person.room);
        person.activity = '丢下烟雾，脚印断在这里';
        log(state, `${person.name} 丢出烟雾弹，从你的视线里绕开了。`);
        return;
      }
      const away = ROOM_MAP[person.room].neighbors.filter((r) => r !== state.playerRoom);
      const step = away.length ? randomOf(away) : nextStepToward(state, person.room, ESCAPE_ROOMS[0], [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '绕着远路拉开距离';
      } else {
        fleeAway(state, person);
      }
      return;
    }
    case 'caller': {
      if (!state.phoneCut && PHONE_ROOMS.includes(person.room)) {
        tryCall(state, person);
        return;
      }
      const target = !state.phoneCut
        ? nearestOf(person.room, PHONE_ROOMS)
        : !state.sabotage.includes('radio')
          ? RADIO_ROOMS[0]
          : ESCAPE_ROOMS[0];
      const step = nextStepToward(state, person.room, target, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '朝能求救的地方跑';
        log(state, `${person.name} 跑向${roomName(step)}——那里能联系外面。`);
      } else {
        fleeAway(state, person);
      }
      return;
    }
    case 'defiant': {
      if (!person.armed) {
        const target = nearestOf(person.room, WEAPON_ROOMS);
        if (WEAPON_ROOMS.includes(person.room)) {
          person.armed = true;
          person.intent = 'wary';
          person.activity = '抓起了一把刀';
          log(state, `${person.name} 在厨房找到了一把刀。他现在敢正面挡你。`);
          addAlarm(state, 3);
          return;
        }
        const step = nextStepToward(state, person.room, target, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = '朝厨房摸过去';
          return;
        }
      }
      barricadeRoom(state, person);
      return;
    }
    case 'rescuer': {
      if (tryRescue(state, person)) return;
      // 倒地者优先于受伤者：以前只找站着的人，救援型永远不会走向被砍倒的同伴
      const downed = npcs(state)
        .filter((p) => p.hp <= 0 && p.room !== state.playerRoom)
        .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
      const wounded = standing(state)
        .filter((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP && p.room !== person.room)
        .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
      const target = downed ?? wounded;
      if (target) {
        const step = nextStepToward(state, person.room, target.room, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = downed ? `赶去救倒地的 ${target.name}` : '赶去救受伤的人';
          return;
        }
      }
      fleeAway(state, person);
      return;
    }
    case 'hider': {
      if (person.hidden) {
        person.intent = 'hide';
        person.activity = '缩在柜子里，不敢出声';
        return;
      }
      if (cabinetRoomsFor(state).includes(person.room)) {
        person.hidden = true;
        person.intent = 'hide';
        person.activity = '钻进了柜子';
        log(state, `${person.name} 钻进了柜子，屋子里少了一个人。`);
        return;
      }
      const cabinet = nearestOf(
        person.room,
        cabinetRoomsFor(state).filter((r) => !isLocked(state, r)),
      );
      const step = nextStepToward(state, person.room, cabinet, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '找能藏人的地方';
        return;
      }
      fleeAway(state, person);
      return;
    }
    case 'brave': {
      if (!person.armed) {
        if (WEAPON_ROOMS.includes(person.room)) {
          person.armed = true;
          person.activity = '拿起了武器';
          log(state, `${person.name} 找到了武器，开始招呼其他人。`);
          addAlarm(state, 3);
          return;
        }
        const step = nextStepToward(state, person.room, nearestOf(person.room, WEAPON_ROOMS), [
          state.playerRoom,
        ]);
        if (step) {
          person.room = step;
          person.intent = 'wary';
          person.activity = '去拿武器';
          return;
        }
      }
      // 聚人：把同房间的人警觉抬起来，让所有人一起行动
      peopleInRoom(state, person.room)
        .filter((p) => p.id !== person.id && p.role !== 'police' && p.hp > 0)
        .forEach((p) => {
          p.alert = clamp(p.alert + 15, 0, 100);
        });
      person.intent = 'wary';
      person.activity = '在组织其他人';
      if (random() < 0.5) fleeAway(state, person);
      return;
    }
    case 'alert': {
      const goalRoom = person.goal === 'phone' && !state.phoneCut ? PHONE_ROOMS[0] : ESCAPE_ROOMS[0];
      if (person.goal === 'exit' || person.goal === 'panic') {
        const step = nextStepToward(state, person.room, ESCAPE_ROOMS[0], [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'escape';
          person.activity = '朝后院跑';
          log(state, `${person.name} 往${roomName(step)}跑，想从后院出去。`);
          return;
        }
      }
      if (goalRoom !== person.room) {
        const step = nextStepToward(state, person.room, goalRoom, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = '边跑边喊';
          shout(state, person, 12);
          return;
        }
      }
      fleeAway(state, person);
      return;
    }
  }
}

/** 尾随不是自动挂机：每次点击能力都要花 1 AP，并承担被目标察觉的风险。 */

export function triggerBearTrapForPerson(state: GameState, person: Person): void {
  if (person.role === 'police' || person.hp <= 0) return;
  const trap = state.bearTraps.find((item) => item.armed && item.room === person.room);
  if (!trap) return;
  // 已发现的陷阱留给 NPC 自己的回合拆除，避免同一次移动结算时被重复入口立即拆掉。
  if (trap.discovered) return;
  if (person.alert >= 40 && random() < 0.4) {
    trap.discovered = true;
    person.awareness = Math.max(person.awareness, 2);
    person.intent = 'wary';
    person.activity = '发现地上的捕兽夹，正小心观察';
    log(state, `${person.name} 在${roomName(person.room)}发现了捕兽夹，暂时没有踩上去。`);
    return;
  }
  trap.armed = false;
  trap.triggeredBy = person.id;
  state.huntStats.trapTriggers += 1;
  state.trapTriggerCount += 1;
  person.trapTriggered = true;
  person.revealedActions = Math.max(person.revealedActions ?? 0, 2);
  person.hp = Math.max(0, person.hp - 1);
  person.alert = 100;
  person.awareness = 3;
  person.blockedTurns = 1;
  person.intent = 'stunned';
  if (person.hp <= 0) {
    person.hp = 0;
    person.downedTurns = 0;
    person.activity = '被捕兽夹击倒，倒在地上';
    log(state, `${person.name} 踩中捕兽夹，受到 1 点伤害并被击倒，发出尖叫！`);
  } else {
    person.activity = '脚踝被捕兽夹咬住，暂时无法移动';
    log(state, `${person.name} 踩中捕兽夹，受到 1 点伤害并被困住 1 回合，发出尖叫！`);
  }
  addAlarm(state, 2);
  npcs(state).filter((other) => other.id !== person.id && other.room === person.room)
    .forEach((other) => { other.alert = clamp(other.alert + 15, 0, 100); });
}

function resolveTrapEntries(state: GameState, before: Map<string, RoomId>): void {
  for (const person of npcs(state)) {
    const previousRoom = before.get(person.id);
    if (previousRoom === undefined || previousRoom === person.room) continue;
    triggerBearTrapForPerson(state, person);
  }
}

/** 回合结束时 NPC 的一轮行动 */
function npcTurn(state: GameState): void {
  // 红色人影只保留到下一次 NPC 回合开始，给玩家足够时间确认陷阱命中。
  state.people.forEach((person) => { person.trapTriggered = false; });
  const before = snapshotRooms(state);
  for (const person of [...npcs(state)]) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;
    const totemIndex = state.totems.indexOf(person.room);
    if (totemIndex >= 0 && person.hp > 0 && person.awareness >= 1 && random() < 0.18) {
      state.totems.splice(totemIndex, 1);
      log(state, `${person.name} 在${roomName(person.room)}发现并破坏了图腾。`);
    }

    // 已被发现的捕兽夹可以被幸存者拆除，避免陷阱成为永久封路工具。
    const spottedTrap = state.bearTraps.find((trap) => trap.armed && trap.discovered && trap.room === person.room);
    if (spottedTrap && person.hp > 0 && person.awareness >= 1) {
      spottedTrap.armed = false;
      log(state, `${person.name} 发现并拆除了${roomName(person.room)}的捕兽夹。`);
    }

    person.statusEffects ??= {};
    const effectsNow = person.statusEffects;
    const cannotSenseKiller = (effectsNow.undetectable ?? 0) > 0 || (effectsNow.oblivious ?? 0) > 0 || (effectsNow.blind ?? 0) > 0 || !isRoomLit(state, person.room);
    if ((person.statusEffects.cursed ?? 0) > 0) {
      if (state.totems.length === 0) {
        person.statusEffects.cursed = 0;
        log(state, `${person.name} 身上的诅咒随着最后一座图腾被摧毁而消散。`);
      } else {
        person.fear = clamp(person.fear + 8, 0, 100);
        person.alert = clamp(person.alert + 5, 0, 100);
      }
    }
    if ((person.statusEffects.deepWound ?? 0) > 0) person.bleed = Math.max(person.bleed, 1);
    // 即时警觉值可以下降，但已经确认的危险不会被忘记。
    person.awareness = Math.max(person.awareness, person.alert >= 75 ? 3 : person.alert >= 40 ? 2 : person.alert >= 12 ? 1 : 0);

    // 被抱起的人不会参与救援或移动，但仍然会继续流血倒计时。
    if (person.id === state.carryPersonId) {
      person.downedTurns += 1;
      if (person.downedTurns >= BLEEDOUT_TURNS) {
        log(state, `${person.name} 在你搬运途中停止了呼吸。`);
        addAlarm(state, 10);
        killPerson(state, person);
      } else {
        person.activity = '被杀手抱着，无法自行挣脱（倒计时仍在继续）';
      }
      continue;
    }

    // 倒地的人不会自己起来，只能等救援或者流血而死
    if (person.hp <= 0) {
      person.downedTurns += 1;
      if (person.downedTurns >= BLEEDOUT_TURNS) {
        log(state, `${person.name} 倒在地上太久，停止了呼吸。`);
        addAlarm(state, 10);
        killPerson(state, person);
      } else {
        person.activity = `倒在地上，还有 ${BLEEDOUT_TURNS - person.downedTurns} 回合`;
        person.intent = 'stunned';
      }
      continue;
    }

    // 日常生活阶段不会因为房间亮着灯就逐渐怀疑异常。
    if (isRoomLit(state, person.room) && person.awareness > 0) {
      person.alert = clamp(person.alert + 4, 0, 100);
      if (person.awareness >= 2 && (person.goal === 'objective' || person.goal === 'generator' || person.goal === 'key' || person.intent === 'work')) {
        addTeamProgress(state, scaleSurvivorProgress(state, person, 2));
        log(state, `${roomName(person.room)}仍有照明，${person.name}借着灯光加快了行动（团队进度 +2）。`);
      }
    }

    // 流血
    if (person.bleed > 0) {
      log(state, `${person.name} 在流血，失去 1 点生命。`);
      // 流血不吃「下次攻击 +X」的加成，那是玩家的爆发，不该被伤口消耗掉
      const bonus = state.bonusDamage;
      state.bonusDamage = 0;
      damagePerson(state, person, 1);
      state.bonusDamage = bonus;
      if (person.hp <= 0 || !state.people.some((p) => p.id === person.id)) continue;
      person.bleed -= 1;
    }

    if (person.blockedTurns > 0) {
      person.blockedTurns -= 1;
      person.intent = person.blockedTurns > 0 ? 'stunned' : 'wary';
      person.activity = person.blockedTurns > 0 ? '被按在原地，动不了' : '扶着墙站起来';
      continue;
    }
    if (state.pinnedPeople.includes(person.id)) {
      person.activity = '被锁链钉住，无法动弹';
      person.intent = 'stunned';
      continue;
    }
    if (person.hidden && !state.emergencyActive) {
      // 藏起来的人只在玩家进房间且警觉拉满时才会冲出去
      if (person.room === state.playerRoom && person.alert >= 85) {
        person.hidden = false;
        if (person.movesThisTurn < REACT_MOVE_CAP && fleeAway(state, person)) {
          person.movesThisTurn += 1;
        }
      } else {
        person.intent = 'hide';
        person.activity = '缩在柜子里，不敢出声';
        person.alert = Math.max(0, person.alert - 4);
      }
      continue;
    }
    if (person.hidden && state.emergencyActive) person.hidden = false;

    // 发现同屋或相邻房间的倒地/重伤者属于明确异常，会立刻触发救援意识。
    const nearbyVictim = npcs(state).some(
      (other) => other.id !== person.id && (other.hp <= 0 || (other.hp > 0 && other.hp <= SURVIVOR_INJURED_HP)) && roomDistance(other.room, person.room) <= 1,
    );
    if (nearbyVictim && person.awareness < 2) {
      person.alert = Math.max(person.alert, 45);
      person.awareness = 2;
    }

    // 没有任何异常线索时，幸存者继续自己的日常，不修逃生设施、不报警、不集体行动。
    if (person.awareness === 0) {
      person.intent = 'idle';
      if (random() < 0.18) {
        const options = ROOM_MAP[person.room].neighbors.filter((room) => room !== state.playerRoom && !isLocked(state, room));
        const next = options.length ? randomOf(options) : null;
        if (next) {
          person.room = next;
          person.activity = randomOf(ACTIVITIES);
        } else {
          person.activity = randomOf(ACTIVITIES);
        }
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
      continue;
    }

    // 只有察觉到异常但尚未确认危险的人会停下来倾听、查看，不会立刻逃生。
    if (person.awareness === 1 && person.alert < 40 && person.room !== state.playerRoom) {
      person.intent = 'wary';
      person.activity = randomOf(['停下手里的事，侧耳听着', '四处看了看，像是在找声音来源', '有些疑惑地检查周围']);
      continue;
    }

    // 第四阶段开启后，所有幸存者都以两个动态逃生点为目标，不再执行原本的个人工作。
    if (state.emergencyActive && state.escapeRooms.length === 2) {
      person.goal = 'exit'; person.intent = 'escape'; person.alert = 100;
      if (state.escapeRooms.includes(person.room)) {
        person.activity = person.escapeProgress > 0 ? '正在翻越逃生点' : '已抵达逃生点';
        continue;
      }
      const exitTarget = nearestOf(person.room, state.escapeRooms);
      const exitStep = person.room === state.playerRoom ? null : nextStepToward(state, person.room, exitTarget, [state.playerRoom]);
      if (exitStep) {
        const from = person.room; person.room = exitStep;
        person.activity = `正赶往${roomName(exitTarget)}`;
        pushTrail(state, from, exitStep, person.hp <= SURVIVOR_INJURED_HP);
      } else if (person.room === state.playerRoom) fleeAway(state, person);
      continue;
    }

    // 玩家就在这一间：先跑，跑不掉再对抗
    if (person.room === state.playerRoom && !cannotSenseKiller) {
      // 同屋幸存者在回合结算时必须获得一次最终逃跑机会。
      // 本回合行动期间的反应移动次数不能让玩家把受伤目标留在原地反复攻击。
      if (
        person.archetype === 'defiant' &&
        person.armed &&
        person.movesThisTurn < REACT_MOVE_CAP &&
        random() < 0.6
      ) {
        counterAttack(state, person);
      }
      // 反抗者可以先反击，但回合结束前仍会尝试撤离，不能站在原地等玩家下回合再砍。
      if (fleeAway(state, person)) {
        person.movesThisTurn = Math.min(REACT_MOVE_CAP, person.movesThisTurn + 1);
        continue;
      }
      if (person.archetype === 'defiant' && person.movesThisTurn < REACT_MOVE_CAP) {
        barricadeRoom(state, person);
      } else {
        person.intent = 'wary';
        person.activity = person.movesThisTurn >= REACT_MOVE_CAP ? '跑不动了，靠着墙喘气' : '贴在墙边，盯着你';
      }
      continue;
    }

    // 决定要走的人站在后院里：不再听性格指挥，专心翻篱笆
    if (wantsToLeave(state, person)) {
      person.intent = 'escape';
      person.activity = person.escapeProgress >= 1 ? '正翻上篱笆' : '正在翻后院篱笆';
      continue;
    }

    // 玩家离开后：救援优先于一切
    if (tryRescue(state, person)) continue;

    // 手里有道具的人会挑时机用掉它（救人、报警、开后门、抹掉脚印…）
    if (useSurvivorItem(state, person)) continue;

    // 还有人倒在地上：没被吓破胆的人会放下手里的活，朝那边赶过去
    if (person.intent !== 'escape' && person.intent !== 'call' && tryAidRun(state, person)) continue;

    // 跑了一整回合的人会喘不上气：找个角落停下来，甚至钻进柜子。
    // 这就是「痕迹」能兑现的地方——你不是追上他，是跟着地板上的划痕找到他。
    const ranFar = person.movesThisTurn >= 2 && roomDistance(state.playerRoom, person.room) >= 2;
    if (ranFar && person.intent !== 'call' && person.intent !== 'escape' && random() < 0.7) {
      person.alert = Math.max(0, person.alert - 30);
      person.intent = 'wary';
      person.activity = '跑不动了，蹲在原地喘气';
      if (cabinetRoomsFor(state).includes(person.room) && random() < 0.55) {
        person.hidden = true;
        person.activity = '钻进柜子，屏住呼吸';
        log(state, `${person.name} 躲进了${roomName(person.room)}的柜子——地板上的痕迹到这里就断了。`);
      }
      continue;
    }

    // 这一回合已经跑满了：再急也只能靠着墙缓一口
    if (person.movesThisTurn >= REACT_MOVE_CAP) {
      person.activity = '靠在墙上喘气，跑不动了';
      continue;
    }

    // 已经决定要跑/要打电话的人不会因为稍微冷静就放弃
    const committed = person.intent === 'escape' || person.intent === 'call';
    person.alert = Math.max(0, person.alert - (committed ? 6 : 18 - Math.floor(state.alarm / 12)));

    if (committed && person.alert >= 14) {
      if (person.intent === 'call' && tryCall(state, person)) continue;
      actByArchetype(state, person);
      continue;
    }
    if (person.alert >= 42) {
      actByArchetype(state, person);
      continue;
    }
    if (person.alert >= 22) {
      person.intent = 'wary';
      if (random() < 0.5) actByArchetype(state, person);
      else person.activity = '紧张地四处张望';
      continue;
    }

    // 房门被封锁时，NPC 不能离开当前房间；保留原意图，等待封锁解除。
    if (isLocked(state, person.room)) {
      person.activity = '房门被封锁，无法离开';
      continue;
    }

    // 低警觉：不再漫无目的地乱晃，各自朝这一局的个人目标走一步。
    // 到了目标房间就「做事」——推进团队进度，同时弄出动静给玩家一条线索。
    person.intent = 'idle';
    // 路过没被砸烂的道具箱就翻一件：他们多一条路，你就多一个要盯的地方
    if (tryTakeSupply(state, person)) continue;

    const routine = ROUTINE_PROFILE[person.archetype];
    const routineRoom = routine.rooms[(person.routineIndex ?? 0) % routine.rooms.length];
    const goalTargets: RoomId[] =
      person.goal === 'routine'
        ? [routineRoom]
        : person.goal === 'objective'
          ? state.objectiveRooms
        : person.goal === 'key'
          ? [EXIT_ROOM]
          : person.goal === 'supply'
            ? usableItemBoxes(state).map((i) => i.room)
            : person.goal === 'generator'
              ? state.siteItems.filter((i) => i.kind === 'generator' && !i.broken && !i.charged).map((i) => i.room)
              : person.goal === 'phone'
                ? PHONE_ROOMS
                : person.goal === 'weapon' || person.goal === 'gather'
                  ? WEAPON_ROOMS
                  : person.goal === 'hide'
                    ? cabinetRoomsFor(state)
                    : person.goal === 'help'
                      ? [nearestOf(person.room, cabinetRoomsFor(state))]
                      : person.goal === 'exit' || person.goal === 'panic'
                        ? ESCAPE_ROOMS
                        : [person.room];
    const target = nearestOf(person.room, goalTargets.length ? goalTargets : [person.room]);
    if (target === person.room) {
      // 发电机是「完成目的」的另一条路：站在这儿修，修满直接给团队进度一大块。
      // 带工具箱的人修得翻倍——道具箱因此值得抢，也值得砸。
      const gen = state.siteItems.find(
        (i) => i.kind === 'generator' && i.room === person.room && !i.broken && i.jammedTurns === 0 && !i.charged,
      );
      if (person.goal === 'routine') {
        person.activity = routine.activity;
        person.intent = 'idle';
        person.routineIndex = ((person.routineIndex ?? 0) + 1) % routine.rooms.length;
      } else if (gen) {
        const hasToolbox = person.item === 'toolbox' && person.itemUses > 0;
        // 危急时刻发电机也修得更快：同伴的死亡和倒地都在催他们
        const gain = scaleSurvivorProgress(state, person, Math.round(GENERATOR_GAIN * (1 + workPressure(state)))) * (hasToolbox ? 2 : 1);
        gen.progress = Math.min(100, gen.progress + gain);
        if (hasToolbox) consumeItem(state, person);
        person.intent = 'work';
        person.activity = `在修发电机（${gen.progress}%）`;
        addDisturbance(state, person.room);
        log(state, `${person.name} 在${roomName(person.room)}修发电机（${gen.progress}%）。`);
        if (gen.progress >= 100) {
          gen.charged = true;
          addTeamProgress(state, scaleSurvivorProgress(state, person, GENERATOR_CHARGED_BONUS));
          log(state, '发电机重新亮了起来，房间照明与设备供电恢复。');
        }
      } else if ((person.goal === 'objective' || person.goal === 'key') && state.teamProgress < TEAM_GOAL_MAX) {
        // 工具箱：按你的设计，推进团队目标也更快（不只是修发电机）
        const hasToolbox = person.item === 'toolbox' && person.itemUses > 0;
        const gain = teamWorkGain(state, person) * (hasToolbox ? 2 : 1);
        if (hasToolbox) consumeItem(state, person);
        addTeamProgress(state, gain);
        person.intent = 'work';
        person.activity = `在${roomName(person.room)}${state.teamGoalLabel}`;
        addDisturbance(state, person.room);
        log(state, `${person.name} 在${roomName(person.room)}${state.teamGoalLabel}（团队进度 ${state.teamProgress}/${TEAM_GOAL_MAX}）。`);
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
    } else {
      const step = nextStepToward(state, person.room, target, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.activity = `朝${roomName(target)}摸过去`;
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
    }
  }
  // 结算 NPC 本轮移动进入的陷阱；即时反应与直接移动也由统一入口处理。
  resolveTrapEntries(state, before);
  updateNpcDialogue(state);
  recordTrails(state, before);
}

/** 根据 NPC 真正掌握的信息与当前行为生成头顶短对白。 */
export function updateNpcDialogue(state: GameState): void {
  const daily = ['今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。', '你听说最近的新消息了吗？', '忙完就去休息吧。', '灯怎么又闪了一下？', '我刚才好像听见楼上有人。', '等会儿一起去厨房吧。', '这地方闻起来像潮湿的地下室。'];
  const suspicious = ['嗯？刚才是什么动静？', '你听见了吗？', '是不是有什么东西掉了？', '奇怪……我去看看。', '刚刚那扇门是不是自己动了？', '我不喜欢这里突然安静下来。', '先别走远，我总觉得有人。'];
  const alarmed = ['这里好像不太对劲。', '我们最好待在一起。', '刚才那声音是从哪边来的？', '快去看看其他人怎么样了。', '电话怎么打不通？', '别碰开关，我听见里面有声音。', '我们应该换条路走。'];
  const fleeing = ['救命！他在追我！', '快跑！别回头！', '该死！离我远点！', '有人吗？救救我！', '他就在后面！', '别往那边去！', '我看见他了——快关门！', '分头跑！不，别分开！'];
  const injured = ['好痛……谁来帮帮我。', '我流血了……', '别把我一个人留在这里。', '腿……我的腿动不了了。', '我不想死在这里。'];
  for (const person of npcs(state)) {
    const stage = awarenessStage(person.alert);
    // awareness 记录已确认的危险知识；对白只读取当前 alert 分档，不得反向清空记忆。
    if (person.hp <= 0) {
      person.dialogue = randomOf(['……', '救……命……', '我动不了了……']);
    } else if ((person.intent === 'flee' || person.intent === 'escape') && stage >= 2) {
      person.dialogue = person.hp <= SURVIVOR_INJURED_HP ? randomOf(injured) : randomOf(fleeing);
    } else if (person.intent === 'call' && stage >= 1) {
      person.dialogue = randomOf(['喂？听得到吗？这里出事了！', '快接电话！求求你们快接！', '我需要帮助！', '有人在屋里！请马上派人来！', '线路断了？该死，换无线电！']);
    } else if (person.intent === 'hide' || person.hidden) {
      person.dialogue = randomOf(stage >= 2 ? ['别让他发现我……', '别出声，他就在附近……', '我得找机会逃出去……'] : ['别出声……', '我刚才好像听见了什么。', '拜托，快点离开……']);
    } else if (stage === 3) {
      const archetypeLines: Partial<Record<Person['archetype'], string[]>> = {
        alert: ['别停下来！他就在后面！', '出口在哪？我得马上离开！'],
        defiant: ['把门顶住！我来挡住他！', '别让他靠近，我手里有东西！'],
        caller: ['快接啊！求你们快接！', '我已经报警了，警察很快就到！'],
        rescuer: ['先把伤员带走！我不会丢下他们！', '撑住，我马上回来救你！'],
        hider: ['不……不要看这里……', '只要不出声，他就找不到我。'],
        brave: ['都到我身后！别让他把我们分开！', '我们一起上，也许能拦住他！'],
        kiter: ['绕开他！别走直线！', '我知道另一条路，跟上我！'],
      };
      const lines = archetypeLines[person.archetype] ?? [];
      person.dialogue = randomOf([...lines, '他就在附近！', '别分开，快找个安全的地方！', '我们得想办法离开这里！']);
    } else if (stage === 2) {
      person.dialogue = randomOf(alarmed);
    } else if (stage === 1) {
      person.dialogue = randomOf(suspicious);
    } else {
      person.dialogue = randomOf(daily);
    }
  }
}

/** 打电话的人真的把消息送出去了吗 */
function callPhase(state: GameState): void {
  if (state.phoneCut) return;
  if (alarmSuppressed(state)) return;
  npcs(state)
    .filter((p) => p.intent === 'call' && p.hp > 0 && PHONE_ROOMS.includes(p.room))
    .forEach((person) => finishCall(state, person, '电话'));
}

/**
 * 已经在逃生点的人真的跑掉了吗
 *
 * 注意这里不能只看 intent === 'escape'：fleeAway() 会把 intent 写成 'flee'，
 * 一个被追到后院的人如果只算「逃跑中」，后院反而成了绝对安全区——玩家把人
 * 逼到院子里却什么都不会发生。所以只要人站在逃生点、并且确实在慌（逃跑中
 * 或者警觉够高），就当他开始翻篱笆。
 */
function escapePhase(state: GameState): void {
  if (state.escapeRooms.length !== 2) return;
  for (const person of [...npcs(state)]) {
    if (person.hp <= 0) continue;
    if (!state.escapeRooms.includes(person.room)) {
      person.escapeProgress = 0;
      continue;
    }
    if (!wantsToLeave(state, person)) continue;
    // 逃生点本身的房门被封锁时，NPC 不能穿过房门离开。
    if (isLocked(state, person.room)) {
      person.activity = '逃生点房门被封锁，无法离开';
      person.escapeProgress = 0;
      continue;
    }
    // 站到后院就等于决定要走了，后面 actByArchetype 别再把他劝回去
    person.intent = 'escape';
    if (state.exitBlockedTurns > 0) {
      person.activity = '逃生点被封锁，暂时无法离开';
      log(state, `${person.name} 抵达逃生点，但出口被封锁了。`);
      continue;
    }
    if (person.escapeProgress < 1) {
      person.escapeProgress = 1;
      person.activity = '正在翻越逃生点';
      log(state, `！${person.name} 已抵达逃生点，下回合就会逃出去。`);
      continue;
    }
    state.people = state.people.filter((p) => p.id !== person.id);
    state.escaped += 1;
    addAlarm(state, 10);
    log(state, `${person.name} 成功逃离。`);
    if (person.marked) {
      log(state, `任务目标 ${person.name} 已经逃离，契约立即失败。`);
      state.resultReason = `任务目标 ${person.name} 成功逃离猎场。`;
      finish(state, 'failed');
      return;
    }

    // 有人跑掉，剩下的人胆子会变大
    npcs(state).forEach((p) => {
      p.alert = clamp(p.alert + 12, 0, 100);
    });

    // 每逃一个人都在结算里扣 15 分；直到最后一个幸存者也翻出篱笆，契约才作废。
    // 不再用「逃够 N 个就立刻输」的硬阈值——那会让幸存者的个人目标失去博弈空间。
    const remainingHumans = state.people.filter((p) => p.role !== 'police').length;
    if (remainingHumans === 0 && state.escaped > 0) {
      state.resultReason = `最后一名幸存者也成功逃离，房子里再没有活人（逃走 ${state.escaped} 人）。`;
      finish(state, state.missionPrimaryCompleted ? 'win' : 'failed');
    }
  }
}

/* ==================================================================== */
/*  警察                                                                */
/* ==================================================================== */

function policeNextStep(state: GameState, police: Person): RoomId {
  const fresh = state.heatTurn >= state.turn - 1;
  const destination = state.emergencyActive ? state.playerRoom : state.decoyRoom ?? (fresh ? state.lastCrimeRoom ?? state.playerRoom : null);
  if (!destination) {
    const options = ROOM_MAP[police.room].neighbors.filter((r) => !isLocked(state, r));
    return options.length ? randomOf(options) : police.room;
  }
  if (police.room === destination) return police.room;
  return nextStepToward(state, police.room, destination, [], true) ?? police.room;
}

function policePhase(state: GameState): void {
  if (KILLER_MAP[state.killer]?.school === 'supernatural') return;
  const officers = state.people.filter((p) => p.role === 'police');
  if (!officers.length) return;
  let reachedPlayer = false;
  for (const police of officers) {
    const next = policeNextStep(state, police);
    if (state.wiretap) log(state, `窃听：警察正在前往${roomName(next)}。`);
    if (state.policeBlocked) {
      state.policeBlocked = false;
      log(state, '后院大门被锁，警察本回合无法移动。');
    } else if (next !== police.room) {
      police.room = next;
      log(state, `${police.name}移动到${roomName(next)}。`);
    }
    if (police.room === state.playerRoom) reachedPlayer = true;
  }
  if (!reachedPlayer) { state.policeLock = 0; return; }
  state.policeLock += 1;
  if (state.emergencyActive) {
    state.stunTurns = Math.max(state.stunTurns, 1);
    log(state, state.policeLock >= 3
      ? '警察从多个方向包围了你，枪托与电击器接连落下——你已无力继续抵抗！'
      : '警察冲入你的房间并向你发动攻击！你必须甩开包围，不能再停留。');
    if (state.policeLock >= 3) {
      state.resultReason = '警察增援完成包围，你被制服。';
      finish(state, 'caught');
    }
    return;
  }
  const pressure = state.policeLock >= 2 ? 18 : 10;
  addAlarm(state, pressure);
  log(state, state.policeLock >= 2
    ? `警察咬住你不放，警报值升至 ${state.alarm}/${ALARM_MAX}。`
    : `警察短暂拦住了你，警报值升至 ${state.alarm}/${ALARM_MAX}。`);
}

function witnessPhase(state: GameState): void {
  if (alarmSuppressed(state)) {
    log(state, '目击者保持沉默。');
    return;
  }
  const witnesses = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0 && !p.hidden,
  );
  if (!witnesses.length) return;

  // 完全没察觉的人（还没注意到你、也没在盯着门口）不会记住你的脸。
  // 想安静地做事，就得先让屋里的人背对你。
  const aware = witnesses.filter((p) => p.alert >= 25 || p.intent !== 'idle');
  if (!aware.length) {
    log(state, '屋里的人背对着你，什么也没看见。');
    return;
  }

  const alarmWitness = aware.find((p) => SURVIVOR_MAP[p.id]?.threat === 'alarm');
  const spiritualSees = aware.some((p) => SURVIVOR_MAP[p.id]?.threat === 'spiritual');
  if (spiritualSees) log(state, '灵异感知者看穿了你的伪装，任何隐匿都失效。');

  const witness = alarmWitness ?? aware[0];
  const base = alarmWitness ? 3 : 2;
  // 递增递减：已经被报过一次警，再说一遍没那么值钱了
  const dulled = Math.max(1, base - Math.floor(state.wanted / 3));
  const gain = witnessWanted(state, dulled);
  addWanted(state, gain);
  addAlarm(state, 4);
  state.lastCrimeRoom = state.playerRoom;
  log(state, `${witness.name} 目击了你，暴露度 +${gain}${alarmWitness ? '（报警者）' : ''}。`);
  if (alarmWitness) log(state, `${witness.name} 直接报出了这间房，警察正在赶来。`);
}

/* ==================================================================== */
/*  创建对局                                                            */
/* ==================================================================== */

/* ---------- 场地物品：幸存者的补给与抉择 ---------- */

/** 还能领东西的道具箱 */
function usableItemBoxes(state: GameState): SiteItem[] {
  return state.siteItems.filter((i) => i.kind === 'itemBox' && !i.broken && i.charges > 0);
}

/**
 * 幸存者不是随手乱抓：他会看场上缺什么再决定拿哪件。
 * 有人倒地 → 医疗包；发电机还能修 → 工具箱；想报警 → 信号弹；
 * 想跑 → 钥匙；要挡你 → 武器；被盯上 → 烟雾弹。留两成随机，人也会慌。
 */
function pickSupply(state: GameState, person: Person): SurvivorItem {
  const downed = npcs(state).some((p) => p.hp <= 0);
  const injured = npcs(state).some((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP);
  const genActive = state.siteItems.some((i) => i.kind === 'generator' && !i.broken && !i.charged);
  const score: Record<SurvivorItem, number> = {
    medkit: (downed ? 5 : 0) + (injured ? 2 : 0) + (person.archetype === 'rescuer' ? 4 : 0),
    toolbox: genActive ? 4 + (person.goal === 'generator' || person.goal === 'objective' ? 3 : 0) : 0,
    flare: (state.alarm < 45 ? 3 : 1) + (person.archetype === 'caller' ? 4 : 0),
    key: state.teamProgress < 60 ? 3 + (person.goal === 'key' ? 2 : 0) : 1,
    weapon: (person.archetype === 'defiant' || person.archetype === 'brave' ? 5 : 0) + (state.alarm >= 45 ? 2 : 0),
    smoke: (person.alert >= 25 ? 4 : 1) + (person.sneaky ? 2 : 0),
    flashlight: (person.archetype === 'defiant' || person.archetype === 'kiter' ? 3 : 1) + (person.alert >= 40 ? 2 : 0),
  };
  const all = Object.keys(score) as SurvivorItem[];
  const best = all.slice().sort((a, b) => score[b] - score[a])[0];
  return random() < 0.78 ? best : randomOf(all);
}

/** 走到道具箱前翻一件东西：这是幸存者「多一个选择」的来源 */
function tryTakeSupply(state: GameState, person: Person): boolean {
  if (person.item) return false;
  const box = state.siteItems.find(
    (i) => i.kind === 'itemBox' && i.room === person.room && !i.broken && i.charges > 0,
  );
  if (!box) return false;
  box.charges -= 1;
  const item = pickSupply(state, person);
  person.item = item;
  person.itemUses = itemUsesFor(item);
  if (item === 'weapon') person.armed = true;
  person.intent = 'work';
  person.activity = `翻出了${SURVIVOR_ITEM_LABEL[item]}`;
  addDisturbance(state, person.room);
  log(state, `${person.name} 在${roomName(person.room)}的道具箱里翻出了${SURVIVOR_ITEM_LABEL[item]}（这个箱子还剩 ${box.charges} 件）。`);
  return true;
}

/**
 * 道具只在「用得上的那一刻」生效，用完即弃。
 * 医疗包 / 信号弹 / 钥匙 / 烟雾弹各开一条路；工具箱与武器是装备，留到对应场合。
 * 它们是幸存者手里的选择，不是引擎里写死的全局判定。
 */
function useSurvivorItem(state: GameState, person: Person): boolean {
  const item = person.item;
  if (!item || person.itemUses <= 0) return false;
  switch (item) {
    case 'medkit': {
      const hurt =
        npcs(state).find((p) => p.hp <= 0 && roomDistance(person.room, p.room) <= 2) ??
        npcs(state).find((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP && roomDistance(person.room, p.room) <= 2);
      if (!hurt) return false;
      // 慢速治疗：要连着两回合，玩家有一整个窗口去打断或先把人处决掉
      person.healTurns += 1;
      person.intent = 'heal';
      if (person.healTurns < MEDKIT_TURNS) {
        person.activity = `正在给${hurt.name}包扎（还要 ${MEDKIT_TURNS - person.healTurns} 回合）`;
        log(state, `${person.name} 蹲下来给${hurt.name}包扎，还得要一会儿。`);
        addDisturbance(state, person.room);
        return true;
      }
      person.healTurns = 0;
      if (hurt.hp <= 0) rescuePerson(state, hurt);
      else healPerson(state, hurt, 1);
      consumeItem(state, person);
      person.activity = `把${hurt.name}救了回来`;
      log(state, `${person.name} 用医疗包救回了${hurt.name}——你留下的伤被人补回来了。`);
      addDisturbance(state, person.room);
      return true;
    }
    case 'flashlight': {
      // 只有和玩家同屋才照得到；不在就先揣着
      if (person.room !== state.playerRoom) return false;
      consumeItem(state, person);
      interruptPlayer(state, `${person.name} 拧亮手电筒，一道白光正打在你脸上。`, person.id);
      return true;
    }
    case 'flare': {
      if (state.alarm >= ALARM_MAX - 12) return false;
      consumeItem(state, person);
      person.intent = 'call';
      person.activity = '打出了一发信号弹';
      log(state, `${person.name} 打出信号弹，整栋房子的警戒往上窜了一截。`);
      addDisturbance(state, person.room);
      addAlarm(state, 14);
      return true;
    }
    case 'key': {
      if (state.teamProgress >= TEAM_GOAL_MAX) return false;
      consumeItem(state, person);
      addTeamProgress(state, scaleSurvivorProgress(state, person, 12));
      person.intent = 'work';
      person.activity = '用钥匙捅开了后门的锁';
      log(state, `${person.name} 用钥匙捅开了后门锁（团队进度 ${state.teamProgress}/${TEAM_GOAL_MAX}）。`);
      addDisturbance(state, person.room);
      return true;
    }
    case 'smoke': {
      if (person.alert < 18) return false;
      consumeItem(state, person);
      person.alert = Math.max(0, person.alert - 35);
      if (cabinetRoomsFor(state).includes(person.room) && random() < 0.6) person.hidden = true;
      state.trails = state.trails.filter((t) => t.room !== person.room);
      person.activity = '丢出烟雾弹，从视线里消失了';
      log(state, `${person.name} 丢了烟雾弹，脚印和视线一起断在这里。`);
      return true;
    }
    case 'toolbox':
    case 'weapon':
      // 工具箱在修发电机时生效，武器在反击时生效，都是「等到场合」的装备
      return false;
  }
  return false;
}

/* ==================================================================== */
/*  玩家行动                                                            */
/* ==================================================================== */

export function effectiveCost(defId: string, state: GameState): number {
  const card = CARD_MAP[defId];
  if (!card) return 99;
  return Math.max(0, card.cost - state.discount);
}

/**
 * 移动到某房间要花几点行动点。
 * 堵门 +1；障碍房（储藏室/地下室）没撞开前也 +1——但**不再是进不去**，
 * 否则一个随机长在死角的障碍房会把整条支路变成永远走不到的死路。
 */
export function moveCost(state: GameState, room: RoomId): number {
  // 恶魔附身能直接撞开障碍物，不额外花行动点
  const obstacle = isObstacle(room) && !state.clearedObstacles.includes(room) && !state.possessed ? 1 : 0;
  const stalkingSlowdown = state.killer === '迈克尔·迈尔斯' && state.myersStalking ? 1 : 0;
  return (state.barricades.includes(room) ? 2 : 1) + obstacle + stalkingSlowdown;
}

export function canMoveTo(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (room === state.playerRoom) return false;
  // freeMove 是卡牌 / 能力买来的特权：无视相邻限制，而且这一步不耗行动点
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (state.energy < cost) return false;
  if (state.freeMove) return !isLocked(state, room) && !isLocked(state, state.playerRoom);
  if (isLocked(state, room) || isLocked(state, state.playerRoom)) return false;
  return ROOM_MAP[state.playerRoom].neighbors.includes(room);
}

/**
 * 这一步有没有严格踩着「从上一间屋指向这一间屋」的脚印。
 * 只有持续跟着脚印走才攒杀戮；随便走、或者只是走到某个碰巧有脚印的房间，都不算。
 */
function updateFrenzy(state: GameState, from: RoomId, to: RoomId): void {
  const onTrail = visibleTrails(state).some((t) => t.room === from && t.to === to);
  if (onTrail) {
    const before = state.frenzy;
    state.frenzyStreak += 1;
    state.frenzy = clamp(state.frenzy + FRENZY_GAIN, 0, FRENZY_MAX);
    // 刚跨过阈值：立刻补 2 点行动点，之后每回合也多 2 点。
    // 绝不替玩家走第二步——走哪、走几格都由他自己点，不再像瞬移。
    if (before < FRENZY_THRESHOLD && state.frenzy >= FRENZY_THRESHOLD) {
      state.energy += FRENZY_AP_BONUS;
      log(state, `杀戮沸腾：多出 ${FRENZY_AP_BONUS} 点行动点，之后每回合也 +${FRENZY_AP_BONUS}。路你自己选。`);
    }
  } else {
    state.frenzyStreak = 0;
    state.frenzy = Math.max(0, state.frenzy - FRENZY_LOSS);
  }
}

/** 通用 D6 检定：默认 4–6 成功，1–3 失败。供高风险行动与后续卡牌复用。 */
export function rollD6Check(state: GameState, label: string, successOn = 4): boolean {
  const die = Math.min(6, Math.max(1, Math.floor(random() * 6) + 1));
  const success = die >= Math.min(6, Math.max(2, successOn));
  log(state, `【D6 检定】${label}：掷出 ${die} 点，${success ? '成功' : '失败'}（需要 ${Math.min(6, Math.max(2, successOn))} 点以上）。`);
  return success;
}

export function waitAction(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.energy < 1) { log(state, '行动点不足，无法等待。'); return false; }
  state.energy -= 1;
  state.attackReady = true;
  log(state, '你停下脚步，屏住呼吸观察周围。幸存者趁这个空档行动。');
  survivorsActOnce(state, 'wait');
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

export function movePlayer(state: GameState, room: RoomId): boolean {
  if (state.carryPersonId && state.carryDistance >= 3) {
    const carried = state.people.find((p) => p.id === state.carryPersonId);
    if (!rollD6Check(state, '远距离搬运', 4)) {
      if (carried) {
        carried.hp = SURVIVOR_INJURED_HP;
        carried.downedTurns = 0;
        carried.hidden = false;
        carried.blockedTurns = 0;
        carried.fear = Math.min(carried.fear, 70);
        carried.alert = 100;
        carried.intent = 'flee';
        carried.activity = '挣脱搬运，带伤逃跑';
        log(state, `${carried.name} 在搬运途中猛然挣脱，恢复为受伤状态并逃走！`);
        state.carryPersonId = null;
        state.carryDistance = 0;
        fleeAway(state, carried);
      }
      state.energy = Math.max(0, state.energy - 1);
      afterPlayerAction(state);
      return false;
    }
  }
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (!canMoveTo(state, room)) {
    log(state, state.energy < cost ? '行动点不够，走不过去。' : '无法移动到那里：不是相邻房间，或路被堵住了。');
    return false;
  }

  const from = state.playerRoom;
  state.watchedRoom = from;
  if (state.killer === '迈克尔·迈尔斯' && state.myersStalking) {
    state.myersMovedThisTurn = true;
    state.stalkTargetId = null;
    state.stalkPressure = 0;
  }
  const fromRect = ROOM_MAP[from].rect;
  const toRect = ROOM_MAP[room].rect;
  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  state.playerFacing = { x: dx / length, y: dy / length };
  state.energy -= cost;
  state.playerRoom = room;
  markExplored(state, room);
  if (state.carryPersonId) {
    const carried = state.people.find((p) => p.id === state.carryPersonId);
    if (carried) {
      carried.room = room;
      state.carryDistance += 1;
    }
  }
  log(
    state,
    state.freeMove
      ? `你借着潜行掠到${roomName(room)}（不耗行动点）。`
      : `你移动到${roomName(room)}（消耗 ${cost} 点行动点${cost > 1 ? '，撞开了门' : ''}）。`,
  );
  if (state.barricades.includes(room)) {
    state.barricades = state.barricades.filter((r) => r !== room);
  }
  // 先让屋里的人对「推门」做反应（障碍伏击要在杂物被踢开之前判定）
  npcOnPlayerEnter(state);
  if (state.carryPersonId) {
    const carried = state.people.find((person) => person.id === state.carryPersonId);
    if (carried) npcWitnessEvent(state, room, 'abduction', carried.id);
  }
  if (isObstacle(room) && !state.clearedObstacles.includes(room)) {
    state.clearedObstacles.push(room);
    log(state, `你踢开${roomName(room)}门口堆着的杂物，硬挤了进去。`);
  }
  // 走出了第一步，刀就收回来了：边走边砍是这个游戏的基本节奏
  state.attackReady = true;
  updateFrenzy(state, from, room);
  afterPlayerAction(state);

  checkImmediateWin(state);
  return true;
}

/** 基础条件检查（不消耗能量、不弃牌） */
function precheckFailed(state: GameState, defId: string): string | null {
  const def = CARD_MAP[defId];
  if (!def?.precheck) return null;
  return checkCond(state, def.precheck.cond) ? null : def.precheck.hint;
}

export function selectAuraRoom(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing' || !state.auraTargeting || !ROOM_MAP[room]) return false;
  state.auraTargeting = false;
  const targets = state.people.filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && person.room === room);
  targets.forEach((person) => { person.revealedActions = Math.max(person.revealedActions ?? 0, 3); });
  log(state, targets.length
    ? `恶灵低语：${roomName(room)}中的 ${targets.length} 名人类气场显现。`
    : `恶灵低语：${roomName(room)}空无一人，没有捕捉到气场。`);
  return true;
}

export function playCard(state: GameState, cardUid: string): boolean {
  if (state.phase !== 'playing') return false;
  const index = state.hand.findIndex((c) => c.uid === cardUid);
  if (index < 0) return false;
  const card = state.hand[index];
  const def = CARD_MAP[card.defId];
  if (!def) {
    state.hand.splice(index, 1);
    return false;
  }
  const cost = effectiveCost(card.defId, state);
  if (cost > state.energy) {
    log(state, `行动点不足：${def.name} 需要 ${cost} 点。`);
    return false;
  }
  const blocked = precheckFailed(state, card.defId);
  if (blocked) {
    log(state, blocked);
    return false;
  }
  if (state.attackBlockedTurn === state.turn && (card.defId === 'myers_eclipse_light' || def.ops.some((op) => ['attack', 'damage', 'down', 'execute', 'kill'].includes(op.op)))) {
    log(state, '戏耍食物生效中：本回合不能打出造成伤害或处决的卡牌。');
    return false;
  }
  if (def.killerOnly && def.killerOnly !== state.killer) {
    log(state, `「${def.name}」是 ${def.killerOnly} 的专属卡牌。`);
    return false;
  }
  if (card.defId === 'myers_eclipse_light') {
    const lastTarget = state.people.find((person) => person.id === state.lastAttackedId);
    if (state.killer !== '迈克尔·迈尔斯' || !lastTarget || lastTarget.hp > 0 || lastTarget.role === 'police') {
      log(state, '湮灭之光：必须先击倒一名人类才能打出。');
      return false;
    }
  }
  if (card.defId === 'myers_last_best') {
    const remaining = state.people.filter((person) => person.role !== 'police');
    if (state.killer !== '迈克尔·迈尔斯' || remaining.length !== 1) {
      log(state, '把最好的留在最后：地图上必须只剩最后一名人类才能打出。');
      return false;
    }
  }
  if (card.defId === 'hex_ruin' && !sabotageTarget(state)) {
    log(state, '粉碎希望：当前房间附近没有可破坏的环境目标。');
    return false;
  }

  // 所有卡牌都可通过 DSL 的 attack 步骤发动真正攻击，并配置命中后效果。
  const attackOp = def.ops.find((op) => op.op === 'attack');
  if (attackOp && attackOp.op === 'attack') {
    const victim = selectPeople(state, attackOp.who)[0];
    if (!victim) { log(state, '当前目标范围内没有可以攻击的站立幸存者。'); return false; }
    const reason = attackBlockReason(state, victim.id, cost);
    if (reason) { log(state, reason); return false; }
    state.hand.splice(index, 1); state.discardPile.push(card);
    log(state, `你打出「${def.name}」，对 ${victim.name} 发动攻击。`);
    return attack(state, victim.id, { costOverride: cost, bleedTurns: attackOp.bleedTurns, hitStatus: attackOp.statusTurns > 0 ? attackOp.status : undefined, hitStatusTurns: attackOp.statusTurns });
  }

  state.energy -= cost;
  state.hand.splice(index, 1);
  state.discardPile.push(card);
  log(state, `你打出「${def.name}」（消耗 ${cost} 点行动点）。`);

  if (card.defId === 'myers_eclipse_light') {
    const target = state.people.find((person) => person.id === state.lastAttackedId);
    if (target && target.hp <= 0) {
      const sacrifice = target.bloodSacrifice;
      state.executions += 1;
      executePerson(state, target);
      if (sacrifice) {
        const survivors = state.people.filter((person) => person.role !== 'police' && person.hp > 0);
        survivors.forEach((person) => { person.fear = clamp(person.fear + 35, 0, 100); });
        log(state, `血祭品被湮灭之光处决：所有 ${survivors.length} 名幸存人类恐惧值 +35。`);
      }
    }
  } else if (card.defId === 'myers_last_best') {
    const last = state.people.find((person) => person.role !== 'police');
    if (last) {
      last.revealedActions = Math.max(last.revealedActions ?? 0, 6);
      state.freeMove = true;
      log(state, `把最好的留在最后：最后一名人类 ${last.name} 的气场显现 5 次后续行动；你获得一次免费移动。`);
    }
  }


  runOps(state, def.ops);
  // 不屈不挠把「擦刀」作为卡牌效果免费结算：不检查也不扣行动点，
  // 并且与普通擦刀一样移除「把最好的留在最后」的印记。
  if (card.defId === 'unbreakable') {
    state.attackReady = true;
    if (state.killer === '迈克尔·迈尔斯' && state.myersLastBestActive && state.myersLastBestMarks > 0) {
      const removed = Math.min(2, state.myersLastBestMarks);
      state.myersLastBestMarks -= removed;
      log(state, `把最好的留在最后：免费擦刀移除 ${removed} 枚专属印记（剩余 ${state.myersLastBestMarks}）。`);
    }
    log(state, '不屈不挠：抽牌并免费擦刀（不消耗行动点）。');
  } else if (!def.noAction) {
    // 普通卡牌仍按原规则收回刀锋；零行动卡不刷新攻击状态。
    state.attackReady = true;
  }
  if (!def.noAction) {
    afterPlayerAction(state);
    checkImmediateWin(state);
  }
  return true;
}

/* ==================================================================== */
/*  挥刀：唯一的伤害来源                                                 */
/* ==================================================================== */

/**
 * 现在这一刀能不能砍出去
 *
 * 三条门槛，缺一条都不行：
 *   1. 能量够（1 点）——挥刀不是免费的
 *   2. 上一刀已经收回来——「无法连续挥刀」，砍完必须再做一件事
 *   3. 屋里确实站着一个能下手的人——倒地的人只能处决，砍不动
 */
export function attackBlockReason(state: GameState, targetId?: string, costOverride = ATTACK_COST): string {
  if (state.phase !== 'playing') return '现在不能攻击';
  if (state.attackBlockedTurn === state.turn) return '戏耍食物生效中：本回合不能攻击。';
  // 攻击只针对站立目标；倒地者有独立的处决按钮，避免两个动作混在一起。
  if (targetId) {
    const picked = state.people.find((p) => p.id === targetId);
    if (!picked) return '这个人已经不在现场了';
    if (picked.role === 'police' && state.policeAssaulted) return '警员已经倒下，别再看了';
    if (picked.room !== state.playerRoom) return '他不在这间屋里';
    if (picked.hidden) return '他躲起来了，先搜索这间屋子';
    if (picked.hp <= 0) return '目标已经倒地，请使用「处决」按钮';
  }
  if (!state.attackReady) return '刀还没收回来：先挪一步或出一张牌';
  if (state.energy < costOverride) return `需要 ${costOverride} 点行动点`;
  if (findVictim(state, state.playerRoom, Infinity, false, targetId)) return '';
  const downedHere = peopleInRoom(state, state.playerRoom).some((p) => p.role !== 'police' && p.hp <= 0);
  if (downedHere) return '当前房间只有倒地目标，请使用「处决」按钮';
  const onlyPolice = peopleInRoom(state, state.playerRoom).some((p) => p.role === 'police');
  return onlyPolice ? '屋里只有警察——他不能攻击，别在他眼皮底下动手' : '这间屋子里没有站立目标';
}

export function canAttack(state: GameState, targetId?: string): boolean {
  return attackBlockReason(state, targetId) === '';
}

/** 独立处决动作：倒地后立即可用，消耗 1 AP；玩家不处决时，同伴仍可在之后救援。 */
export function executeBlockReason(state: GameState, targetId?: string): string {
  if (state.phase !== 'playing') return '现在不能处决';
  if (state.attackBlockedTurn === state.turn) return '戏耍食物生效中：本回合不能处决。';
  const target = targetId
    ? state.people.find((person) => person.id === targetId)
    : peopleInRoom(state, state.playerRoom).find((person) => person.role !== 'police' && person.hp <= 0);
  if (!target) return '当前房间没有倒地的幸存者';
  if (target.role === 'police') return '警员不能使用普通处决';
  if (target.room !== state.playerRoom) return '目标不在当前房间';
  if (target.hp > 0) return '目标还站着，先将其击倒';
  if (state.energy < 1) return '需要 1 点行动点';
  return '';
}

export function executeDownedPerson(state: GameState, targetId?: string): boolean {
  const reason = executeBlockReason(state, targetId);
  if (reason) {
    log(state, reason);
    return false;
  }
  const target = targetId
    ? state.people.find((person) => person.id === targetId)!
    : peopleInRoom(state, state.playerRoom).find((person) => person.role !== 'police' && person.hp <= 0)!;
  state.energy -= 1;
  if (state.carryPersonId === target.id) state.carryPersonId = null;
  executePerson(state, target);
  if (state.result) return true;
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}



/**
 * 普通攻击：只针对站立目标，健康 → 受伤，受伤 → 倒地；倒地后使用独立处决动作。
 * 恶魔附身期间伤害翻倍，还站着的人一刀就倒。
 * 砍完就把 attackReady 关掉，必须再做一件事（走路 / 出牌 / 用能力）才能砍第二刀，
 * 所以「一刀接一刀」不是按得快就行，中间得有一次追逐或一次控制。
 * 传入 targetId 时只砍那个人——点房间里的谁，就砍谁。
 */
export function attack(state: GameState, targetId?: string, options: { costOverride?: number; bleedOnHit?: boolean; bleedTurns?: number; hitStatus?: 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed'; hitStatusTurns?: number } = {}): boolean {
  if (state.phase !== 'playing') return false;
  const attackCost = options.costOverride ?? ATTACK_COST;
  const reason = attackBlockReason(state, targetId, attackCost);
  if (reason) {
    log(state, reason);
    return false;
  }
  const target = findVictim(state, state.playerRoom, Infinity, false, targetId)!;
  const heavy = state.possessed;
  const alone = npcs(state).every((person) =>
    person.id === target.id || person.room !== state.playerRoom || person.hp <= 0,
  );
  const ambushStrike = ambushActive(state) && target.role !== 'police' && target.alert < 100 && alone;
  const noedActive = state.hexNoedActive && state.totems.length > 0;
  // 带手电筒的人可能从隔壁冲进来照你：这一刀落空，两个人都趁机跑掉
  const flasher = npcs(state).find(
    (p) =>
      p.item === 'flashlight' &&
      p.itemUses > 0 &&
      p.hp > 0 &&
      p.alert >= 40 &&
      (p.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(p.room)),
  );
  if (flasher && random() < 0.55) {
    consumeItem(state, flasher);
    if (flasher.room !== state.playerRoom) flasher.room = state.playerRoom;
    interruptPlayer(
      state,
      `${flasher.name} 从旁边冲进来，手电筒正照着你的眼睛——这一刀落空了。`,
      flasher.id,
    );
    if (target.hp > 0) {
      fleeAway(state, target);
      target.alert = 100;
      log(state, `${target.name} 毫发无伤地跟着跑出了屋子。`);
    }
    afterPlayerAction(state);
    checkImmediateWin(state);
    return false;
  }
  state.energy -= attackCost;
  state.attackReady = false;
  state.lastAttackedId = target.id;
  if (target.role === 'police') {
    state.policeAssaulted = true;
    state.heatTurn = state.turn;
    state.policeLock = 1;
    addWanted(state, 6);
    addAlarm(state, 12);
    log(state, '你居然对警员动了刀——暴露度暴涨 +72，警察会立刻咬住你。');
  }
  log(
    state,
    target.hp <= 0
      ? `你俯身补上一刀，${target.name} 没能再起来（消耗 ${attackCost} 点行动点）。`
      : heavy
        ? `恶魔附身 · 你挥刀砍向 ${target.name}，这一刀直接见骨（消耗 ${attackCost} 点行动点）。`
        : `你挥刀砍向 ${target.name}（消耗 ${attackCost} 点行动点）。`,
  );
  // 鬼面监视完成：这一刀直接把还站着的人放倒，不必补第二下
  const nightfallKill = target.watched;
  if (nightfallKill) {
    target.watched = false;
    target.watchValue = 0;
    log(state, `夜幕锁定 ${target.name}：这一刀直接把他放倒。`);
  }
  const hpBeforeHit = target.hp;
  // 卡牌联动：定位、控制、伏击都能转化成真正的猎杀优势，而不是只提供一段说明文字。
  const trackingCombo = target.role !== 'police' && target.trackedTurns > 0;
  const controlCombo = target.role !== 'police' && target.blockedTurns > 0;
  const baseDamage = noedActive || (heavy && state.killer === '迈克尔·迈尔斯')
    ? SURVIVOR_MAX_HP
    : heavy || nightfallKill || ambushStrike ? 2 : 1;
  const comboDamage = controlCombo && baseDamage < SURVIVOR_MAX_HP ? 1 : 0;
  if (noedActive && target.role !== 'police') {
    damagePerson(state, target, SURVIVOR_MAX_HP);
    log(state, `难逃一死：厄咒图腾仍然存续，${target.name}被攻击后直接倒地（图腾剩余 ${state.totems.length} 座）。`);
  } else {
    damagePerson(state, target, baseDamage + comboDamage);
  }
  const bleedTurns = options.bleedTurns ?? (options.bleedOnHit ? 2 : 0);
  if (bleedTurns > 0 && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp < hpBeforeHit) {
    target.bleed = Math.max(target.bleed, bleedTurns); log(state, `${target.name}开始流血 ${bleedTurns} 次结算，移动时会留下血迹。`);
  }
  if (options.hitStatus && (options.hitStatusTurns ?? 0) > 0 && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp < hpBeforeHit) {
    target.statusEffects ??= {}; target.statusEffects[options.hitStatus] = Math.max(target.statusEffects[options.hitStatus] ?? 0, (options.hitStatusTurns ?? 0) + 1);
    log(state, `${target.name}命中后获得状态：${options.hitStatus}（${options.hitStatusTurns} 次结算）。`);
  }
  if (state.bleedNextHit && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp > 0) {
    target.bleed = Math.max(target.bleed, 2);
    state.bleedNextHit = false;
    log(state, `辣手屠夫：${target.name}的伤口开始持续流血，移动时会留下血迹。`);
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit && state.hexHuntressActive && !state.hexHuntressUsed) {
    state.hexHuntressUsed = true;
    state.cardBonusScore += 50;
    log(state, '厄咒：猎杀戾气触发：这次攻击命中，额外获得 50 点猎杀评分。');
  }
  if (heavy && state.killer === '迈克尔·迈尔斯' && target.hp < hpBeforeHit) {
    state.huntStats.myersBurstHits += 1;
  }
  if (ambushStrike) {
    state.ambushTurn = 0;
    log(state, `致命窗口：${target.name} 独自一人且尚未察觉，你的伏击造成重创（2 点伤害）。`);
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit) {
    if (controlCombo) log(state, `控制连携：你趁${target.name}被限制行动时出手，额外造成 1 点伤害。`);
    if (trackingCombo) {
      state.specialExecutionBonus += 10;
      log(state, `定位连携：你沿着追踪标记精准截住${target.name}，猎杀评分 +10。`);
    }
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit) {
    if (state.killer === '迈克尔·迈尔斯' && state.myersLastBestActive && !target.bloodSacrifice) {
      state.myersLastBestMarks = Math.min(8, state.myersLastBestMarks + 1);
      log(state, `把最好的留在最后印记 +1（${state.myersLastBestMarks}/8）。`);
    }
    if (state.killer === '迈克尔·迈尔斯' && state.myersFoodMarks > 0) {
      state.myersFoodMarks -= 1;
      log(state, `戏耍食物印记 -1（${state.myersFoodMarks}/8）。`);
    }
  }
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/** 擦刀为什么按不下去 */
export function wipeBlockReason(state: GameState): string {
  if (state.phase !== 'playing') return '现在不能动手';
  if (state.attackReady) return '刀锋还干净，不用擦';
  if (state.energy < WIPE_COST) return `需要 ${WIPE_COST} 点行动点`;
  return '';
}

/**
 * 擦刀：原地花 1 点行动点，把 attackReady 收回来，接着就能再砍/处决。
 * 代价是这一次动作同样算一次「玩家行动」——幸存者会趁你低头擦刀跑掉、干活、
 * 甚至去救地上那个人。这就是「守尸」和「追出去」之间的取舍。
 */
export function wipeBlade(state: GameState): boolean {
  const reason = wipeBlockReason(state);
  if (reason) {
    log(state, `擦刀：${reason}。`);
    return false;
  }
  state.energy -= WIPE_COST;
  state.attackReady = true;
  if (state.killer === '迈克尔·迈尔斯' && state.myersLastBestActive && state.myersLastBestMarks > 0) {
    const removed = Math.min(2, state.myersLastBestMarks);
    state.myersLastBestMarks -= removed;
    log(state, `把最好的留在最后：擦刀移除 ${removed} 枚专属印记（剩余 ${state.myersLastBestMarks}）。`);
  }
  log(state, `你低头把刀上的血慢慢擦干净（消耗 ${WIPE_COST} 点行动点）。这一下动静，够他们做点什么了。`);
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/**
 * 开始选择查看目标。点击「查看」本身不消耗 AP，也不会自动替玩家选房间。
 * 玩家随后必须在地图上点选一个与当前位置直接相邻的房间。
 */
export function lookAround(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.lookingAround) return cancelLookSelection(state);
  if (state.energy < LOOK_COST) {
    log(state, `行动点不足：查看需要 ${LOOK_COST} 点。`);
    return false;
  }
  if (!ROOM_MAP[state.playerRoom].neighbors.length) {
    log(state, '周围没有可以查看的相邻房间。');
    return false;
  }
  state.lookingAround = true;
  log(state, '请选择地图上一个相邻房间进行查看；确认目标后才会消耗 1 点行动点。');
  return true;
}

/** 取消查看选房，不消耗行动点。 */
export function cancelLookSelection(state: GameState): boolean {
  if (!state.lookingAround) return false;
  state.lookingAround = false;
  log(state, '已取消查看。');
  return true;
}

/** 只查看玩家明确点选的一个相邻房间，消耗 1 AP。 */
/** 玩家每回合最多记录一次同一目标的习惯；连续两次观察才会确认完整路线。 */
export function recordRoutineObservation(state: GameState, room: RoomId): number {
  const observed = npcs(state).filter((person) =>
    person.room === room && person.hp > 0 && !person.hidden && person.goal === 'routine',
  );
  let discovered = 0;
  for (const person of observed) {
    if (person.routineLastObservedTurn === state.turn) continue;
    person.routineLastObservedTurn = state.turn;
    person.routineSightings = (person.routineSightings ?? 0) + 1;
    if (person.routineSightings >= 2 && !person.routineObserved) {
      person.routineObserved = true;
      discovered += 1;
      log(state, `你已经看出${person.name}的日常规律：${ROUTINE_PROFILE[person.archetype].label}。`);
    } else if (!person.routineObserved) {
      log(state, `你记下了${person.name}在${roomName(room)}的行动习惯；再观察一次就能确认他的常去路线。`);
    }
  }
  if (discovered > 0) state.huntStats.routineInsights += discovered;
  return discovered;
}

export function lookAtRoom(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing' || !state.lookingAround) return false;
  if (!ROOM_MAP[state.playerRoom].neighbors.includes(room)) {
    log(state, '只能查看与当前位置直接相邻的房间。');
    return false;
  }
  if (state.energy < LOOK_COST) {
    state.lookingAround = false;
    log(state, `行动点不足：查看需要 ${LOOK_COST} 点。`);
    return false;
  }
  state.energy -= LOOK_COST;
  state.lookingAround = false;
  scoutRoom(state, room, 1);
  recordRoutineObservation(state, room);
  log(state, `你屏住呼吸查看了「${roomName(room)}」（消耗 ${LOOK_COST} 点行动点）。`);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/**
 * 搜索当前房间：把钻进柜子 / 床底的人翻出来。
 * 和走路、挥刀、出牌一样消耗 1 点行动点，也算一次玩家行动（世界跟着动）。
 */
export function searchRoom(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.energy < SEARCH_COST) {
    log(state, `行动点不足：搜索需要 ${SEARCH_COST} 点。`);
    return false;
  }
  state.energy -= SEARCH_COST;
  const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
  const found = here.filter((p) => p.hidden);
  const hasCabinet = cabinetRoomsFor(state).includes(state.playerRoom) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(state.playerRoom));
  log(state, `你翻查${roomName(state.playerRoom)}（消耗 ${SEARCH_COST} 点行动点）。`);
  // 先无条件把藏着的人揪出来：卡牌可能把人挪到没有柜子的房间，不能让他白藏
  found.forEach((p) => {
    p.hidden = false;
    p.alert = clamp(p.alert + 35, 0, 100);
    p.intent = 'flee';
    log(state, `${p.name} 被你从藏身处拖了出来。`);
  });
  if (!found.length) {
    log(state, hasCabinet ? '柜子里空空的，只有旧衣服和灰。' : '这间屋子没有能藏人的柜子。');
  }
  scoutRoom(state, state.playerRoom, 1);
  // 搜索也算「做了一件事」，刀可以收回来了
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/* ==================================================================== */
/*  杀手能力                                                            */
/* ==================================================================== */

/* ------------------------------------------------------------------ */
/*  破坏场地物品：杀手用不了它们，但能不让幸存者用                        */
/* ------------------------------------------------------------------ */

/** 为什么现在砸不了：用于按钮禁用与日志 */
export interface HuntOpportunity {
  id: string;
  targetId: string;
  targetName: string;
  room: RoomId;
  title: string;
  detail: string;
}

/** 只展示玩家当前确实看得见的机会，避免情报面板泄露未探索房间。 */
export function getHuntOpportunities(state: GameState): HuntOpportunity[] {
  const opportunities: HuntOpportunity[] = [];
  const visible = npcs(state).filter((person) =>
    person.hp > 0 && !person.hidden && isPersonVisible(state, person),
  );
  for (const person of visible) {
    if (person.alert >= 75) continue;
    const companions = peopleInRoom(state, person.room).filter((other) =>
      other.id !== person.id && other.role !== 'police' && other.hp > 0 && !other.hidden,
    );
    if (!companions.length) {
      opportunities.push({
        id: 'isolated-' + person.id,
        targetId: person.id,
        targetName: person.name,
        room: person.room,
        title: '目标落单',
        detail: '房间内没有其他幸存者，目标尚未进入高度警戒。',
      });
    }
    if (!isRoomLit(state, person.room)) {
      opportunities.push({
        id: 'dark-' + person.id,
        targetId: person.id,
        targetName: person.name,
        room: person.room,
        title: '暗处接近',
        detail: '目标所在区域没有照明，普通幸存者更难及时察觉接近。',
      });
    }
    const routine = ROUTINE_PROFILE[person.archetype];
    if (person.goal === 'routine' && person.routineObserved && person.activity === routine.activity) {
      opportunities.push({
        id: 'routine-' + person.id,
        targetId: person.id,
        targetName: person.name,
        room: person.room,
        title: '习惯性停留',
        detail: routine.label + '：目标正按已确认的日常习惯停留在这里。',
      });
    }
    if (person.intent === 'work') {
      opportunities.push({
        id: 'distracted-' + person.id,
        targetId: person.id,
        targetName: person.name,
        room: person.room,
        title: '专注于设施',
        detail: '目标正在处理现场设施，暂时把注意力放在工作上。',
      });
    }
  }
  return opportunities.slice(0, 8);
}

export function isRoomLit(state: GameState, room: RoomId): boolean {
  return state.powerCircuits.some((c) => {
    const source = c.generatorId ? state.siteItems.find((item) => item.id === c.generatorId) : undefined;
    const generatorOnline = !source || (!source.broken && source.jammedTurns <= 0);
    return !c.broken && c.enabled !== false && generatorOnline &&
      (c.flickerTurns ?? 0) <= 0 && c.affectedRooms.includes(room);
  });
}

/**
 * 每三回合发生一次环境事件。事件改变当前局势，而不是只弹一条装饰性文本：
 * 雷雨暂时压低暴露度、照明故障制造黑暗、电话铃声引出求救者、玻璃碎裂制造线索。
 */
function triggerEnvironmentalEvent(state: GameState): void {
  if (state.turn % 3 !== 0) return;
  if (state.mapId === 'ormond') {
    const event = randomOf(['whiteout', 'avalanche'] as const);
    if (event === 'whiteout') {
      state.alarm = Math.max(0, state.alarm - 6);
      syncWanted(state);
      const room = 'garden' as RoomId;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '暴风雪呼啸' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      log(state, '【环境事件】奥蒙德 · 白色风墙】暴风雪撞上木屋，窗外一片白茫。风声吞掉了远处的动静，暴露度 -6。');
    } else {
      const room = randomOf(['balcony', 'garden'] as RoomId[]);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 14, 0, 100);
        person.awareness = Math.max(person.awareness, 1);
        if (person.alert >= 40 && person.intent === 'idle') person.intent = 'wary';
        person.activity = '被屋顶积雪坠落的巨响惊动';
      });
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '积雪坠落' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      log(state, `【环境事件】奥蒙德 · 屋顶雪崩】${roomName(room)}外传来沉闷的坠落声，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '没有人靠近窗边'}。`);
    }
    return;
  }
  if (state.mapId === 'badham') {
    const event = randomOf(['toy', 'intercom'] as const);
    if (event === 'toy') {
      const room = 'nursery' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '走调的玩具音乐' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 10, 0, 100);
        person.awareness = Math.max(person.awareness, 1);
        if (person.intent === 'idle') person.intent = 'wary';
        person.activity = '被幼儿教室断续响起的玩具音乐吸引';
      });
      log(state, `【环境事件】巴德姆 · 玩具音乐盒】幼儿教室传出走调的旋律，${affected.length ? affected.map((person) => person.name).join('、') + '开始寻找声音来源' : '空荡荡的走廊里只有音乐在回响'}。`);
    } else {
      const room = 'hall' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '失真的广播' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const caller = randomOf(npcs(state).filter((person) => person.hp > 0 && !person.hidden));
      if (caller) {
        caller.alert = clamp(caller.alert + 16, 0, 100);
        caller.awareness = Math.max(caller.awareness, 1);
        caller.intent = 'wary';
        caller.activity = '听见广播里的求救杂音，正在确认来源';
      }
      log(state, `【环境事件】巴德姆 · 失真广播】大厅喇叭突然响起一段听不清的求救录音${caller ? '，' + caller.name + '停下脚步侧耳倾听' : ''}。`);
    }
    return;
  }
  if (state.mapId === 'lampkin') {
    const event = randomOf(['streetlight', 'caralarm'] as const);
    if (event === 'streetlight') {
      const circuit = randomOf(state.powerCircuits.filter((item) => !item.broken && (item.flickerTurns ?? 0) <= 0));
      if (circuit) {
        circuit.flickerTurns = 2;
        log(state, `【环境事件】兰普金巷 · 街灯熄灭】${circuit.name}的电流突然中断，窗外的街灯接连熄灭，阴影沿着房间边缘蔓延。`);
      } else {
        log(state, '【环境事件】兰普金巷 · 街灯熄灭】街灯闪了几下又恢复，窗外仿佛有个人影一闪而过。');
      }
    } else {
      const room = 'garage' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '汽车警报' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 12, 0, 100);
        person.awareness = Math.max(person.awareness, 1);
        if (person.intent === 'idle') person.intent = 'wary';
        person.activity = '被车库外突然响起的汽车警报惊动';
      });
      log(state, `【环境事件】兰普金巷 · 汽车警报】车库里的警报器突然尖叫，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '街道上没有人回应'}。`);
    }
    return;
  }
  if (state.mapId === 'midwich') {
    const room = randomOf(['corridor', 'library', 'nursery'] as RoomId[]);
    const affected = npcs(state).filter((person) =>
      person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1,
    );
    affected.forEach((person) => {
      person.alert = clamp(person.alert + 12, 0, 100);
      person.awareness = Math.max(person.awareness, 1);
      if (person.alert >= 45) person.intent = 'wary';
      person.activity = '被课间铃声惊动，正在寻找声音来源';
    });
    state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '课间铃声' });
    if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
    log(state, `【米德维奇 · 课间铃声】${roomName(room)}附近响起刺耳铃声，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '走廊里空无一人'}。`);
    return;
  }
  const eventPool = state.mapId === 'asylum'
    ? ['flicker', 'flicker', 'phone', 'glass'] as const
    : ['storm', 'flicker', 'phone', 'glass'] as const;
  const event = randomOf(eventPool);

  if (event === 'storm') {
    state.alarm = Math.max(0, state.alarm - 4);
    syncWanted(state);
    log(state, '【环境事件】雷雨突然压境，雨声盖住了屋内的动静。暴露度 -4。');
    return;
  }

  if (event === 'flicker') {
    const circuits = state.powerCircuits.filter((circuit) =>
      !circuit.broken && (circuit.flickerTurns ?? 0) === 0,
    );
    if (circuits.length) {
      const circuit = randomOf(circuits);
      circuit.flickerTurns = 1;
      log(state, `【环境事件】${circuit.name}的灯光突然闪烁，整片区域陷入短暂黑暗。`);
      return;
    }
  }

  if (event === 'phone' && !state.phoneCut) {
    const callers = npcs(state).filter((person) =>
      person.hp > 0 && !person.hidden && person.archetype === 'alert' && person.goal !== 'phone',
    );
    if (callers.length) {
      const person = randomOf(callers);
      person.goal = 'phone';
      person.alert = clamp(Math.max(45, person.alert + 18), 0, 100);
      person.awareness = Math.max(person.awareness, 2);
      person.intent = 'call';
      person.activity = '被突然响起的电话吸引，正赶去求救';
      log(state, `【环境事件】电话突然响起。${person.name}听见铃声，正朝电话赶去——再不阻止，他可能会报警。`);
      return;
    }
  }

  // 玻璃碎裂是其他事件无法触发时的可靠兜底，也会成为短时地图线索。
  const knownRooms = ROOMS.filter((room) => state.explored.includes(room.id) && room.id !== state.playerRoom);
  const room = randomOf(knownRooms.length ? knownRooms : ROOM_MAP[state.playerRoom].neighbors.map((id) => ROOM_MAP[id]));
  if (!room) {
    log(state, '【环境事件】屋外传来一阵异响，整栋房子短暂安静下来。');
    return;
  }
  state.disturbances.push({
    room: room.id,
    turn: state.turn,
    clock: state.trailClock,
    label: '玻璃碎裂声',
  });
  if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
  const startled = npcs(state).filter((person) => person.hp > 0 && !person.hidden && person.room === room.id);
  startled.forEach((person) => {
    person.alert = clamp(person.alert + 12, 0, 100);
    person.awareness = Math.max(person.awareness, 1);
    person.intent = 'wary';
    person.activity = '被玻璃碎裂声惊动，正查看四周';
  });
  log(state, `【环境事件】${room.name}突然传来玻璃碎裂声${startled.length ? `，${startled.map((person) => person.name).join('、')}被惊动了` : '，声音在空房间里回荡'}。`);
}

export const BREAKER_SWITCH_COST = 1;

/** 电闸只能在所在房间操作；合闸需要对应发电机正常供电。 */
export function breakerBlockReason(state: GameState, circuitId?: string): string | null {
  if (state.phase !== 'playing') return '这一局已经结束了。';
  const circuit = state.powerCircuits.find((item) =>
    circuitId ? item.id === circuitId : item.breakerRoom === state.playerRoom,
  );
  if (!circuit) return '这间屋子没有电闸。';
  if (circuit.breakerRoom !== state.playerRoom) return '必须走到电闸所在房间才能操作。';
  if (circuit.broken) return '电闸控制箱已经损坏，无法操作。';
  if (state.energy < BREAKER_SWITCH_COST) return '行动点不足：操作电闸需要 1 点。';
  if (circuit.enabled === false) {
    const source = circuit.generatorId ? state.siteItems.find((item) => item.id === circuit.generatorId) : undefined;
    if (source && (source.broken || source.jammedTurns > 0)) return '供电发电机尚未恢复，暂时无法合闸。';
  }
  return null;
}

export function togglePowerCircuit(state: GameState, circuitId?: string): boolean {
  const reason = breakerBlockReason(state, circuitId);
  if (reason) {
    log(state, reason);
    return false;
  }
  const circuit = state.powerCircuits.find((item) =>
    circuitId ? item.id === circuitId : item.breakerRoom === state.playerRoom,
  );
  if (!circuit) return false;
  state.energy -= BREAKER_SWITCH_COST;
  state.huntStats.environmentActions += 1;
  circuit.enabled = circuit.enabled === false;
  addDisturbance(state, state.playerRoom);
  addAlarm(state, 1);
  log(state, circuit.enabled
    ? `你合上了${circuit.name}电闸，供电恢复。`
    : `你拉下了${circuit.name}电闸，${circuit.affectedRooms.map(roomName).join('、')}陷入黑暗，受影响房间的电子门锁失效。`);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/** 统一破坏入口：相邻门锁、电话线、无线电、电闸、发电机与道具箱。 */
function sabotageTarget(state: GameState): { kind: 'door'; room: RoomId } | { kind: 'phone' | 'radio' } | { kind: 'facility' } | null {
  const breaker = state.powerCircuits.some((c) => c.breakerRoom === state.playerRoom && !c.broken);
  const item = state.siteItems.some((i) => i.room === state.playerRoom && !i.broken && (i.kind !== 'itemBox' || i.charges > 0));
  if (breaker || item) return { kind: 'facility' };
  if (PHONE_ROOMS.includes(state.playerRoom) && !state.phoneCut) return { kind: 'phone' };
  if (RADIO_ROOMS.includes(state.playerRoom) && !state.sabotage.includes('radio')) return { kind: 'radio' };
  const lockedNeighbor = ROOM_MAP[state.playerRoom].neighbors.find((room) => isLocked(state, room));
  if (lockedNeighbor) return { kind: 'door', room: lockedNeighbor };
  return isLocked(state, state.playerRoom) ? { kind: 'door', room: state.playerRoom } : null;
}

export function sabotageBlockReason(state: GameState): string | null {
  if (state.phase !== 'playing') return '这一局已经结束了。';
  if (state.energy < SABOTAGE_COST) return `行动点不足：破坏需要 ${SABOTAGE_COST} 点。`;
  return sabotageTarget(state) ? null : '附近没有可破坏的门锁、通讯设施或现场设施。';
}

export function sabotageSiteItem(state: GameState, options: { free?: boolean; suppressAfterAction?: boolean } = {}): boolean {
  const reason = options.free
    ? (state.phase !== 'playing' ? '这一局已经结束了。' : sabotageTarget(state) ? null : '附近没有可破坏的门锁、通讯设施或现场设施。')
    : sabotageBlockReason(state);
  if (reason) {
    log(state, reason);
    return false;
  }
  const target = sabotageTarget(state);
  if (!target) return false;
  if (!options.free) state.energy -= SABOTAGE_COST;
  state.huntStats.environmentActions += 1;
  if (target.kind === 'door') {
    state.roomLocks[target.room] = 0;
    log(state, `你用蛮力撞开通往${roomName(target.room)}的门锁！屋内的人被巨响惊动。`);
    npcs(state).filter((p) => p.room === target.room && p.hp > 0).forEach((p) => {
      p.alert = clamp(p.alert + 24, 0, 100);
      p.fear = clamp(p.fear + 12, 0, 100);
    });
    addAlarm(state, 5);
  } else if (target.kind === 'phone') {
    state.phoneCut = true;
    log(state, '你扯断了电话线，电话求救暂时中断。');
    addAlarm(state, 2);
  } else if (target.kind === 'radio') {
    state.sabotage.push('radio');
    log(state, '你砸毁了备用无线电，幸存者无法再通过它协调求救。');
    addAlarm(state, 2);
  } else {
    const circuit = state.powerCircuits.find((c) => c.breakerRoom === state.playerRoom && !c.broken);
    const item = state.siteItems.find((i) => i.room === state.playerRoom && !i.broken && (i.kind === 'itemBox' ? i.charges > 0 : true));
    if (!circuit && !item) return false;
  if (state.hexRuinActive && !state.hexRuinUsed) {
    state.hexRuinUsed = true;
    reduceTeamProgress(state, 10);
    log(state, '粉碎希望触发：首次破坏使团队进度额外倒退 10。');
  }

  if (target.kind === 'facility' && circuit) {
    circuit.broken = true;
    circuit.enabled = false;
    log(state, `你砸毁了${circuit.name}控制箱！${circuit.affectedRooms.map(roomName).join('、')}立即断电，灯光熄灭。`);
  } else if (target.kind === 'facility' && item!.kind === 'itemBox') {
    item!.broken = true;
    item!.charges = 0;
    log(state, `你砸烂了${roomName(item!.room)}的道具箱——从今往后，没人能从这里翻到道具了。`);
  } else if (target.kind === 'facility') {
    const before = item!.progress;
    item!.progress = Math.max(0, item!.progress - SABOTAGE_GEN_LOSS);
    if (item!.charged) {
      item!.charged = false;
      reduceTeamProgress(state, SABOTAGE_TEAM_LOSS);
      log(state, `已经通电的线路被你扯断，他们的团队进度倒退了 ${SABOTAGE_TEAM_LOSS}。`);
    }
    item!.jammedTurns = GENERATOR_JAM_TURNS;
    // 停机而不是永久报废：他们还能修回来，破坏是「拖时间」而非一劳永逸
    item!.broken = false;
    const affected = state.powerCircuits.filter((circuit) => circuit.generatorId === item!.id).map((circuit) => circuit.name);
    log(state, `你砸了${roomName(item!.room)}的发电机，修复进度 ${before}% → ${item!.progress}%，停机 ${GENERATOR_JAM_TURNS} 回合。${affected.length ? '受其供电的 ' + affected.join('、') + ' 也随之熄灭。' : ''}`);
  }
  }

  addDisturbance(state, state.playerRoom);
  if (target.kind === 'facility') addAlarm(state, 3);
  // 砸东西也算「做了一件事」，刀可以收回来
  state.attackReady = true;
  if (!options.suppressAfterAction) {
    afterPlayerAction(state);
    checkImmediateWin(state);
  }
  return true;
}

export function powerCooldown(state: GameState, powerId: string): number {
  return state.cooldowns[powerId] ?? 0;
}

function visibleMyersStalkTargets(state: GameState) {
  // 只排除无法观察的目标；正在逃跑但仍在视野里的幸存者也可以被观察。
  return npcs(state).filter((person) => person.hp > 0 && !person.hidden && person.role !== 'police' && isRoomVisible(state, person.room));
}

function trapPlacementBlockReason(state: GameState): string | null {
  if (state.killer !== '设陷者') return '只有设陷者可以布设捕兽夹。';
  if (state.trapInventory <= 0) return '没有可用的捕兽夹；寻找地图上的补给点。';
  if (state.energy < 1) return '行动点不足：布设捕兽夹需要 1 点。';
  if ([ENTRY_ROOM, EXIT_ROOM, 'garden'].includes(state.playerRoom)) return '这里是出入口或室外通道，不适合布设捕兽夹。';
  if (ROOM_MAP[state.playerRoom].neighbors.length < 2) return '这里是死路或单一通道，不能布设捕兽夹。';
  if (state.objectiveRooms.includes(state.playerRoom)) return '幸存者团队目标点不能布设捕兽夹。';
  if (state.bearTraps.some((trap) => trap.room === state.playerRoom && trap.armed)) return '这个房间已经有一只有效捕兽夹。';
  if (state.bearTraps.some((trap) => trap.armed && roomDistance(trap.room, state.playerRoom) <= 1)) return '附近已有捕兽夹；陷阱之间至少间隔一间房。';
  return null;
}

function huntressTargetable(state: GameState, person: Person): boolean {
  if (person.role === 'police' || person.hp <= 0 || person.hidden || !isPersonVisible(state, person)) return false;
  if (person.room === state.playerRoom) return true;
  return forwardRoom(state) === person.room;
}

export function blinkPlayer(state: GameState, room: RoomId): boolean {
  if (state.killer !== '护士' || !state.nurseBlinkTargeting) return false;
  const distance = roomDistance(state.playerRoom, room);
  if (room === state.playerRoom || distance < 1 || distance > 3 || state.energy < 1) {
    log(state, '闪现目标必须在 1–3 间房距离内，且需要 1 点行动点。');
    return false;
  }
  const from = ROOM_MAP[state.playerRoom].rect;
  const to = ROOM_MAP[room].rect;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  state.playerFacing = { x: dx / length, y: dy / length };
  state.watchedRoom = state.playerRoom;
  state.energy -= 1;
  state.playerRoom = room;
  markExplored(state, room);
  state.nurseBlinkTargeting = false;
  state.nurseFollowUp = true;
  state.nurseFatiguePending = true;
  state.cooldowns.nurse_blink = 1;
  state.huntStats.nurseBlinks += 1;
  state.attackReady = true;
  log(state, `护士穿过墙壁与房门，闪现到${roomName(room)}。你可以立即攻击或抓取同屋目标；下一次行动后将进入疲惫。`);
  return true;
}

export function nurseGrabPerson(state: GameState, targetId: string): boolean {
  if (state.killer !== '护士' || !state.nurseFollowUp || state.energy < 1 || state.attackBlockedTurn === state.turn) return false;
  const target = state.people.find((person) => person.id === targetId);
  if (!target || target.role === 'police' || target.hp <= 0 || target.room !== state.playerRoom) {
    log(state, '闪现抓取只能选择当前房间内站立的幸存者。');
    return false;
  }
  state.energy -= 1;
  state.huntStats.nurseGrabs += 1;
  damagePerson(state, target, 1, true);
  state.nurseFollowUp = false;
  state.nurseFatiguePending = false;
  state.stunTurns = Math.max(state.stunTurns, 1);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

export function throwHuntressHatchet(state: GameState, targetId: string): boolean {
  if (state.killer !== '女猎手' || !state.huntressAiming || state.hatchets <= 0 || state.energy < 1 || state.attackBlockedTurn === state.turn) return false;
  const target = state.people.find((person) => person.id === targetId);
  if (!target || !huntressTargetable(state, target)) {
    log(state, '飞斧只能投向直线视野内可见的站立幸存者。');
    return false;
  }
  state.energy -= 1;
  state.hatchets -= 1;
  state.huntStats.hatchetHits += 1;
  state.huntressAiming = false;
  log(state, `女猎手掷出狩猎飞斧，命中${target.name}（剩余飞斧 ${state.hatchets}/3）。`);
  damagePerson(state, target, 1);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

export function refillHuntressHatchets(state: GameState): boolean {
  if (state.killer !== '女猎手' || !cabinetRoomsFor(state).includes(state.playerRoom) || state.hatchets >= 3 || state.energy < 1) {
    log(state, '只有在柜子房间内、行动点充足且飞斧未满时才能补充。');
    return false;
  }
  state.energy -= 1;
  const restored = 3 - state.hatchets;
  state.hatchets = 3;
  log(state, `你从柜子里取出 ${restored} 把飞斧，补充至 3/3。`);
  afterPlayerAction(state);
  return true;
}

export function collectTrapCache(state: GameState): boolean {
  if (state.killer !== '设陷者' || !state.trapCaches.includes(state.playerRoom) || state.trapInventory >= 4 || state.energy < 1) {
    log(state, '这里没有可收集的捕兽夹补给，或携带数量已达上限。');
    return false;
  }
  state.energy -= 1;
  state.trapCaches = state.trapCaches.filter((room) => room !== state.playerRoom);
  state.trapInventory += 1;
  log(state, `你从补给点收集到 1 个捕兽夹（携带 ${state.trapInventory}/4）。`);
  afterPlayerAction(state);
  return true;
}

export function recoverBearTrap(state: GameState): boolean {
  const trap = state.bearTraps.find((item) => item.room === state.playerRoom && !item.armed);
  if (state.killer !== '设陷者' || !trap || state.energy < 1 || state.trapInventory >= 4) {
    log(state, '当前没有可回收的捕兽夹，或携带数量已达上限。');
    return false;
  }
  state.energy -= 1;
  state.bearTraps = state.bearTraps.filter((item) => item.id !== trap.id);
  state.trapInventory += 1;
  log(state, `你回收了${roomName(state.playerRoom)}的捕兽夹（携带 ${state.trapInventory}/4）。`);
  afterPlayerAction(state);
  return true;
}

export function canUsePower(state: GameState, powerId: string): boolean {
  if (state.phase !== 'playing') return false;
  const killer = KILLER_MAP[state.killer];
  const power = killer?.powers.find((p) => p.id === powerId);
  if (!power) return false;
  if (powerCooldown(state, powerId) > 0) return false;
  if (powerId === 'trap_set') return trapPlacementBlockReason(state) === null;
  if (powerId === 'nurse_blink') {
    if (state.killer !== '护士') return false;
    if (state.nurseBlinkTargeting) return true;
    if (state.nurseFollowUp || state.energy < 1) return false;
    return ROOMS.some((room) => room.id !== state.playerRoom && roomDistance(state.playerRoom, room.id) <= 3);
  }
  if (powerId === 'huntress_axe') {
    if (state.killer !== '女猎手' || state.energy < 1) return false;
    if (state.huntressAiming) return true;
    return state.hatchets > 0 && visibleMyersStalkTargets(state).some((person) => huntressTargetable(state, person));
  }
  if (powerId === 'myers_gaze') {
    if (state.killer !== '迈克尔·迈尔斯' || state.possessed || state.energy < 1) return false;
    if (state.stalkMeter >= 100) return true;
    return visibleMyersStalkTargets(state).some((person) => myersStalkGain(person.alert) > 0);
  }
  if (power.requires && !power.requires.every((c) => checkCond(state, c))) return false;
  return true;
}

/** 能力为什么不能用，给按钮的 tooltip 用 */
export function powerBlockReason(state: GameState, powerId: string): string {
  const killer = KILLER_MAP[state.killer];
  const power = killer?.powers.find((p) => p.id === powerId);
  if (!power) return '';
  const cd = powerCooldown(state, powerId);
  if (cd > 0) return `冷却中，还要 ${cd} 回合`;
  if (powerId === 'trap_set') return trapPlacementBlockReason(state) ?? '';
  if (powerId === 'nurse_blink') {
    if (state.nurseBlinkTargeting) return '再次点击可取消闪现选点';
    if (state.nurseFollowUp) return '闪现后的抓取窗口尚未结束';
    if (state.energy < 1) return '至少需要 1 点行动点';
    return '';
  }
  if (powerId === 'huntress_axe') {
    if (state.huntressAiming) return '再次点击可取消瞄准';
    if (state.hatchets <= 0) return '飞斧耗尽：请前往柜子补充';
    if (state.energy < 1) return '至少需要 1 点行动点';
    if (!visibleMyersStalkTargets(state).some((person) => huntressTargetable(state, person))) return '视野内没有直线可命中的站立幸存者';
    return '';
  }
  if (powerId === 'myers_gaze') {
    if (state.possessed) return '恶魔附身期间不能再次尾随';
    if (state.energy < 1) return '至少需要 1 点行动点';
    if (state.stalkMeter >= 100) return '';
    if (!visibleMyersStalkTargets(state).some((person) => myersStalkGain(person.alert) > 0)) return '视野内没有可继续积累尾随值的幸存者';
  }
  if (power.requires && !power.requires.every((c) => checkCond(state, c))) {
    const need = power.requires.find((c) => !checkCond(state, c));
    if (need?.c === 'stalk') return `需要尾随值达到 ${need.gte}`;
    if (need?.c === 'downedHere') return '房间里没有倒地的人';
    if (need?.c === 'peopleHere') return '房间里没有人';
    return '条件还不满足';
  }
  return '';
}

export function usePower(state: GameState, powerId: string): boolean {
  if (powerId === 'trap_set') {
    const reason = trapPlacementBlockReason(state);
    if (reason) { log(state, reason); return false; }
    state.energy -= 1;
    state.trapInventory -= 1;
    state.bearTraps.push({
      id: `bear-trap-${state.turn}-${state.trailClock}-${state.bearTraps.length}`,
      room: state.playerRoom,
      armed: true,
      discovered: false,
    });
    log(state, `你在${roomName(state.playerRoom)}布设了一只捕兽夹。这里不是单一必经通道，且附近没有其他陷阱。`);
    state.attackReady = true;
    afterPlayerAction(state);
    checkImmediateWin(state);
    return true;
  }
  if (powerId === 'nurse_blink') {
    if (state.nurseBlinkTargeting) {
      state.nurseBlinkTargeting = false;
      log(state, '已取消闪现选点。');
      return true;
    }
    if (!canUsePower(state, powerId)) { log(state, powerBlockReason(state, powerId) || '当前无法闪现。'); return false; }
    state.nurseBlinkTargeting = true;
    log(state, '选择地图上 1–3 间房距离内的目标位置；闪现后可立即攻击或抓取同屋幸存者。');
    return true;
  }
  if (powerId === 'huntress_axe') {
    if (state.huntressAiming) {
      state.huntressAiming = false;
      log(state, '已取消飞斧瞄准。');
      return true;
    }
    if (!canUsePower(state, powerId)) { log(state, powerBlockReason(state, powerId) || '当前无法投掷飞斧。'); return false; }
    state.huntressAiming = true;
    log(state, '狩猎飞斧已举起：点击地图中直线视野内的站立幸存者进行投掷。');
    return true;
  }
  if (powerId === 'myers_gaze') {
    if (!canUsePower(state, powerId)) { log(state, powerBlockReason(state, powerId) || '当前无法尾随。'); return false; }
    if (state.stalkMeter >= 100) {
      state.energy -= 1;
      state.possessed = true;
      log(state, '恶魔附身：尾随值已满，迈克尔释放积攒的恶意。接下来每次行动消耗 20 点尾随值，强化挥刀可直接击倒站立目标；结束后不会陷入虚弱。');
      state.attackReady = true;
      afterPlayerAction(state);
      checkImmediateWin(state);
      return true;
    }
    const visible = visibleMyersStalkTargets(state).filter((person) => myersStalkGain(person.alert) > 0);
    if (!visible.length) { log(state, '视野内没有可继续积累尾随值的幸存者。'); return false; }
    state.energy -= 1;
    let totalGain = 0;
    const names: string[] = [];
    for (const person of visible) {
      if (!state.myersStalkedIds.includes(person.id)) state.myersStalkedIds.push(person.id);
      const isolated = !npcs(state).some((other) =>
        other.id !== person.id && other.hp > 0 && other.role !== 'police' && !other.hidden && other.room === person.room,
      );
      const gain = myersStalkGain(person.alert) + (isolated ? 5 : 0);
      totalGain += gain;
      names.push(`${person.name} +${gain}${isolated ? '（落单）' : ''}`);
    }
    state.stalkMeter = Math.min(100, state.stalkMeter + totalGain);
    log(state, `你观察视野内 ${visible.length} 名幸存者：${names.join('、')}；尾随值 +${totalGain}（${state.stalkMeter}/100）。`);
    state.attackReady = true;
    afterPlayerAction(state);
    checkImmediateWin(state);
    return true;
  }
  if (!canUsePower(state, powerId)) {
    log(state, powerBlockReason(state, powerId) || '这个能力现在用不了。');
    return false;
  }
  const killer = KILLER_MAP[state.killer];
  const power = killer.powers.find((p) => p.id === powerId)!;
  state.cooldowns[powerId] = power.cooldown;
  log(state, `${killer.owner}·${power.name}：${power.desc}`);
  runOps(state, power.ops);
  if (state.killer === '鬼面' && powerId === 'ghost_stalk') {
    state.nightfallActive = true;
    log(state, '夜幕拉开：接下来每回合盯住相邻房间的一个人，监视值满 100 他就会持续显形。');
  }
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

/* ==================================================================== */
/*  胜负                                                                */
/* ==================================================================== */

export function missionTaskProgress(state: GameState, task: MissionTask): number {
  switch (task.kind) {
    case 'kill_count': return state.survivorKills;
    case 'kill_count_before_turn': return state.completedMissionTasks.includes(task.id) || (task.deadlineTurn !== undefined && state.turn <= task.deadlineTurn && state.survivorKills >= task.target) ? task.target : 0;
    case 'marked_kill': return state.markedKilled;
    case 'execute': return state.executions;
    case 'special_execute': return state.executionMethodsUsed.length;
    case 'no_alarm': return state.npcAlarmed ? 0 : 1;
    case 'break_circuit': return state.powerCircuits.filter((c) => c.broken).length;
    case 'alarm_below': return state.alarm <= (task.limit ?? 35) ? 1 : 0;
    case 'killer_stat':
      if (task.metric === 'myers_stalk') return state.myersStalkedIds.length;
      if (task.metric === 'trap_triggers') return state.huntStats.trapTriggers;
      if (task.metric === 'nurse_grabs') return state.huntStats.nurseGrabs;
      if (task.metric === 'hatchet_hits') return state.huntStats.hatchetHits;
      return 0;
  }
}

function checkImmediateWin(state: GameState): void {
  if (state.result || state.mission.mode === 'free') return;
  const required = (state.mission.tasks ?? []).filter((task) => !task.optional);
  if (required.length > 0 && required.every((task) => missionTaskProgress(state, task) >= task.target) && !state.missionPrimaryCompleted) {
    state.missionPrimaryCompleted = true;
    log(state, '主目标已完成！你可以立即结算，也可以继续猎杀，完成额外挑战赚取更多奖励。');
  }
}

export function calculateHuntStyleRating(state: GameState, result: ResultKind): {
  score: number;
  rank: 'S' | 'A' | 'B' | 'C';
  bonus: number;
  breakdown: ScoreLine[];
} {
  const stats = state.huntStats;
  const planning = Math.min(30, stats.routineInsights * 8 + stats.environmentActions * 5 + stats.trapTriggers * 8 + stats.nurseBlinks * 2);
  const precision = Math.min(25, stats.hatchetHits * 6 + stats.nurseGrabs * 8 + stats.myersBurstHits * 8 + (state.specialExecutionBonus > 0 ? 8 : 0));
  const stealth = Math.min(20, (state.npcAlarmed ? 0 : 10) + Math.max(0, 10 - Math.floor(state.alarm / 10)));
  const efficiency = result === 'win' ? Math.min(15, Math.max(0, state.mission.turns - state.turn) * 2) : 0;
  const styleTypes = [
    stats.routineInsights > 0,
    stats.environmentActions > 0,
    stats.trapTriggers > 0,
    stats.hatchetHits > 0,
    stats.nurseBlinks > 0,
    stats.nurseGrabs > 0,
    stats.myersBurstHits > 0,
    stats.quietKills > 0,
  ].filter(Boolean).length;
  const versatility = Math.min(10, styleTypes * 2);
  const quiet = Math.min(10, stats.quietKills * 3);
  const breakdown: ScoreLine[] = [
    { label: '猎杀基础', value: 10 },
    { label: '计划布置 · 习惯、环境与陷阱', value: planning },
    { label: '精准猎杀 · 专属能力与地形处决', value: precision },
    { label: '隐蔽控制 · 警报与暴露度', value: stealth },
    { label: '行动效率 · 剩余回合', value: efficiency },
    { label: '策略多样性', value: versatility },
    { label: '无目击猎杀', value: quiet },
  ];
  const score = Math.min(100, breakdown.reduce((sum, line) => sum + line.value, 0));
  const rank: 'S' | 'A' | 'B' | 'C' = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  const bonus = result !== 'win' ? 0 : rank === 'S' ? 40 : rank === 'A' ? 25 : rank === 'B' ? 12 : 0;
  return { score, rank, bonus, breakdown };
}

function finish(state: GameState, result: ResultKind): void {
  if (state.result) return;
  state.result = result;
  state.phase = 'gameover';
  const style = calculateHuntStyleRating(state, result);
  state.huntStyleScore = style.score;
  state.huntStyleRank = style.rank;
  state.huntStyleBonus = style.bonus;
  state.huntStyleBreakdown = style.breakdown;

  const lines: ScoreLine[] = [{ label: `契约基础分 · ${state.mission.title}`, value: state.mission.reward }];
  const bonusTasks = (state.mission.tasks ?? []).filter((task) => task.optional && missionTaskProgress(state, task) >= task.target);
  const bonusTaskScore = bonusTasks.reduce((sum, task) => sum + (task.reward ?? 25), 0);
  if (bonusTasks.length) lines.push({ label: `额外挑战 · ${bonusTasks.length} 项`, value: bonusTaskScore });
  if (state.specialExecutionBonus > 0) lines.push({ label: '地形处决奖励', value: state.specialExecutionBonus });
  if (state.cardBonusScore > 0) lines.push({ label: '卡牌猎杀奖励', value: state.cardBonusScore });
  lines.push({ label: `凶残 · 击杀 ${state.kills} 人`, value: state.kills * 14 });
  if (state.escaped > 0) lines.push({ label: `逃走 ${state.escaped} 人的失分（每人 -15）`, value: -state.escaped * 15 });
  if (state.alarm >= 60) lines.push({ label: `暴露度 ${state.alarm} 的代价`, value: -Math.round(state.alarm / 5) });

  if (result === 'win') {
    const bonus = state.mission.mode === 'free' ? 0 : (state.mission.turns - state.turn) * 5;
    if (bonus > 0) lines.push({ label: `猎杀效率 · 剩余 ${state.mission.turns - state.turn} 回合`, value: bonus });
    state.rewardCards = state.mission.mode === 'free' ? [] : [UNLOCK_REWARDS[state.mission.kind]].filter(Boolean);
  } else if (result === 'caught') {
    lines.push({ label: '被警察当场抓捕', value: -80 });
  } else if (result === 'timeout') {
    lines.push({ label: '任务超时', value: -50 });
  } else {
    lines.push({ label: state.resultReason || '任务失败', value: -40 });
  }

  state.scoreBreakdown = lines;
  state.score = Math.max(0, Math.round(lines.reduce((sum, line) => sum + line.value, 0)));
}

export function currentScore(state: GameState): number {
  if (state.result) return state.score;
  return Math.max(
    0,
    Math.round(
      state.mission.reward +
        state.kills * 14 + state.specialExecutionBonus -
        state.escaped * 15 -
        Math.round(state.alarm / 5),
    ),
  );
}

/** 从牌库抽牌；每次耗尽并洗回弃牌堆都会推进幸存者团队进度。 */
function drawForPlayer(state: GameState, count: number): number {
  const reshuffles = drawCards(state, count);
  if (reshuffles > 0) {
    const gain = reshuffles * DECK_SHUFFLE_TEAM_GAIN;
    addTeamProgress(state, gain);
    log(state, `牌库耗尽，弃牌堆重新洗牌（幸存者团队进度 +${gain}）。`);
  }
  return reshuffles;
}

/** 主动抽 1 张牌，消耗 1 点行动点；手牌超限时必须先弃牌。 */
export function drawCardAction(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.hand.length > HAND_LIMIT) {
    log(state, `手牌超过上限 ${HAND_LIMIT} 张，请先选择弃牌。`);
    return false;
  }
  if (state.energy < DRAW_CARD_COST) {
    log(state, '行动点不足，无法主动抽牌。');
    return false;
  }
  if (state.drawPile.length === 0 && state.discardPile.length === 0) {
    log(state, '牌库与弃牌堆都已耗尽，无法抽牌。');
    return false;
  }
  state.energy -= DRAW_CARD_COST;
  drawForPlayer(state, 1);
  log(state, `你花费 ${DRAW_CARD_COST} 点行动点主动抽了 1 张牌。`);
  afterPlayerAction(state);
  return true;
}

/** 玩家选择一张手牌弃掉；弃牌不消耗行动点，也不触发幸存者行动。 */
export function discardCard(state: GameState, cardUid: string): boolean {
  if (state.phase !== 'playing' || state.hand.length <= HAND_LIMIT) return false;
  const index = state.hand.findIndex((card) => card.uid === cardUid);
  if (index < 0) return false;
  const [card] = state.hand.splice(index, 1);
  state.discardPile.push(card);
  log(state, `你选择弃掉「${CARD_MAP[card.defId]?.name ?? card.defId}」。`);
  return true;
}

export function endTurn(state: GameState): void {
  if (state.phase !== 'playing') return;

  const m = state.mission;
  if (state.nurseFatiguePending) {
    state.nurseFatiguePending = false;
    state.nurseFollowUp = false;
    state.stunTurns = Math.max(state.stunTurns, 1);
    log(state, '你没有利用闪现后的攻击窗口，护士仍因濒死之息进入疲惫：下回合行动点减少 1。');
  }
  checkImmediateWin(state);
  if (state.result) return;

  // 鬼面「夜幕」：监视相邻房间的人；有人闯进鬼面房间就中断，且他能多跑一步
  if (state.killer === '鬼面' && state.nightfallActive) {
    const intruder = npcs(state).find((p) => p.hp > 0 && p.room === state.playerRoom);
    if (intruder) {
      state.nightfallActive = false;
      npcs(state).forEach((p) => {
        p.watchValue = 0;
      });
      if (intruder.movesThisTurn < REACT_MOVE_CAP) {
        fleeAway(state, intruder);
        intruder.movesThisTurn += 1;
      }
      log(state, `${intruder.name} 一头撞进你所在的房间，夜幕被打断了——他趁乱又多跑了一步。`);
    } else {
      const targets = npcs(state).filter(
        (p) => p.hp > 0 && !p.watched && ROOM_MAP[state.playerRoom].neighbors.includes(p.room),
      );
      const watchedTarget = targets.sort((a, b) => b.watchValue - a.watchValue)[0];
      if (watchedTarget) {
        watchedTarget.watchValue = Math.min(100, watchedTarget.watchValue + WATCH_GAIN);
        log(state, `夜幕：你盯着${roomName(watchedTarget.room)}里的${watchedTarget.name}（监视 ${watchedTarget.watchValue}/100）。`);
        if (watchedTarget.watchValue >= 100) {
          watchedTarget.watched = true;
          watchedTarget.trackedTurns = Math.max(watchedTarget.trackedTurns, 99);
          log(state, `${watchedTarget.name} 的监视值满了：他持续显形，下一刀可以直接把他放倒。`);
        }
      }
    }
  }

  if (TOTEM_ROOMS.includes(state.playerRoom)) {
    state.bonusEnergyNextTurn = 1;
    log(state, '图腾余响：下一回合额外获得 1 点行动点。');
  }

  npcTurn(state);
  if (state.result) return;
  for (const person of npcs(state)) {
    if (person.fear > 0 && person.hp > 0 && person.alert < 70 && person.room !== state.playerRoom) {
      person.fear = Math.max(0, person.fear - 8);
    }
  }
  callPhase(state);
  if (state.result) return;

  escapePhase(state);
  if (state.result) return;

  policePhase(state);
  if (state.result) return;

  witnessPhase(state);
  checkImmediateWin(state);
  if (state.result) return;

  // 警报值可随猎场平静而下降；最终危机开始后不会撤销。
  if (!state.emergencyActive) state.alarm = Math.max(0, state.alarm - 6);
  syncWanted(state);
  if (!state.emergencyActive && state.heatTurn !== state.turn) {
    // 这一回合没有新的动静（没人报警、没人看见你、也没动手），注意力就散一点。
    // 这是「潜行 / 潜伏」玩法能成立的前提。
    state.alarm = Math.max(0, state.alarm - 4);
    syncWanted(state);
    log(state, `这一夜没人再提起你，暴露度降到 ${state.alarm}。`);
  }

  /* ---------- 回合收尾 ---------- */
  refreshVision(state);
  pruneTrails(state);
  pruneDisturbances(state);
  state.decoyRoom = null;
  state.freeMove = false;
  state.discount = 0;
  state.bonusDamage = 0;
  // 迈尔斯的附身按行动消耗尾随值；其他来源仍兼容旧回合计时。
  if (state.possessed && state.killer !== '迈克尔·迈尔斯') {
    state.possessTurns = Math.max(0, state.possessTurns - 1);
    if (state.possessTurns === 0) {
      state.possessed = false;
      log(state, '恶魔附身消退，刀锋恢复了原本的重量。');
    }
  }
  state.myersMovedThisTurn = false;
  state.noAlarmTurn = false;
  state.killsThisTurn = 0;
  state.revealedThisTurn = false;
  state.roomLocks = Object.fromEntries(
    Object.entries(state.roomLocks)
      .map(([k, v]) => [k, (v ?? 0) - 1])
      .filter(([, v]) => (v as number) > 0),
  ) as Partial<Record<RoomId, number>>;
  state.exitBlockedTurns = Math.max(0, state.exitBlockedTurns - 1);
  // 被砸停机的发电机慢慢缓过来，幸存者可以接着修
  state.siteItems.forEach((i) => {
    if (i.jammedTurns > 0) i.jammedTurns -= 1;
  });
  // 临时闪断只持续一个完整回合，不会把电闸永久标记为已破坏。
  state.powerCircuits.forEach((circuit) => {
    if ((circuit.flickerTurns ?? 0) > 0) circuit.flickerTurns = Math.max(0, (circuit.flickerTurns ?? 0) - 1);
  });
  state.cooldowns = Object.fromEntries(
    Object.entries(state.cooldowns)
      .map(([k, v]) => [k, v - 1])
      .filter(([, v]) => (v as number) > 0),
  );
  state.pinnedPeople = [];

  if (state.turn >= m.turns) {
    if (state.missionPrimaryCompleted) { state.resultReason = '主目标已经完成，猎场时间耗尽，本局按已完成契约结算。'; finish(state, 'win'); }
    else { state.resultReason = KILLER_MAP[state.killer]?.school === 'supernatural' ? '天光刺破猎场，恶灵失去依附之所，猎杀被迫终止。' : '天亮了，警队封锁整条街，猎杀被迫终止。'; finish(state, 'timeout'); }
    return;
  }

  // 手牌保留；每个新回合只补 1 张，不再整手弃掉重抽。
  state.turn += 1;
  triggerEnvironmentalEvent(state);
  // 杀戮满值 = 移动力提升：每回合多 2 点行动点，但绝不替玩家走第二步
  const frenzyBonus = state.frenzy >= FRENZY_THRESHOLD ? FRENZY_AP_BONUS : 0;
  state.energy = Math.max(
    1,
    state.maxEnergy + state.bonusEnergyNextTurn + frenzyBonus - state.stunTurns,
  );
  state.bonusEnergyNextTurn = 0;
  state.stunTurns = 0;
  state.blindTurns = 0;
  // 新回合：刀已经收回来，所有人的腿也歇过来了
  state.attackReady = true;
  state.people.forEach((p) => {
    p.movesThisTurn = 0;
  });
  drawForPlayer(state, 1);
  if (state.hand.length > HAND_LIMIT) {
    log(state, `当前手牌 ${state.hand.length} 张，超过上限 ${HAND_LIMIT}，请先选择弃牌。`);
  }
  log(state, `新回合开始，行动点恢复${frenzyBonus ? `（杀戮 +${frenzyBonus}）` : ''}。`);
}

export function finishContract(state: GameState): boolean {
  if (state.phase !== 'playing' || state.mission.mode === 'free') return false;
  checkImmediateWin(state);
  if (!state.missionPrimaryCompleted || state.result) { log(state, '主目标尚未完成，暂时不能结算契约。'); return false; }
  state.resultReason = '你决定结束猎杀，并带着已经完成的主目标与额外挑战离开猎场。';
  finish(state, 'win');
  return true;
}

export function finishFreeHunt(state: GameState): boolean {
  if (state.phase !== 'playing' || state.mission.mode !== 'free') return false;
  if (state.survivorKills <= 0) {
    log(state, '至少完成一次猎杀后，才能主动结束自由猎杀。');
    return false;
  }
  state.resultReason = '你主动结束了这场猎杀。';
  finish(state, 'win');
  return true;
}

export function giveUp(state: GameState): void {
  state.resultReason = state.mission.mode === 'free' ? '你放弃了这场自由猎杀。' : '你主动放弃了契约。';
  finish(state, 'failed');
}

export function getStars(score: number): number {
  if (score >= 260) return 3;
  if (score >= 150) return 2;
  return 1;
}

export { generateMission };
