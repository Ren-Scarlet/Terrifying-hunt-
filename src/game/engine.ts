import { random, randomOf, shuffle } from './random';
import { nearestOf, roomDistance } from './navigation';
import { ESCAPE_ROOMS, BASE_AP, SABOTAGE_COST, ITEM_BOX_CHARGES, GENERATOR_JAM_TURNS, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP } from './constants';
import { drawCards } from './deck';
import { executeOps } from './effects/runtime';
import { createGame } from './setup';
export { drawCards } from './deck';
export { createGame } from './setup';
export { BASE_AP, SABOTAGE_COST, ITEM_BOX_CHARGES, GENERATOR_JAM_TURNS, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP } from './constants';
import { ACTIVITIES, createPeople, itemUsesFor } from './npc/factory';
import { ARCH_DESC, ARCH_LABEL, GOAL_LABEL, HEALTH_LABEL, INTENT_LABEL, SITE_ITEM_LABEL, SURVIVOR_ITEM_LABEL } from './npc/catalog';
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
  SurvivorItem,
} from './types';

/* ==================================================================== */
/*  常量                                                                */
/* ==================================================================== */

/** 倒地后撑不过这么多回合就会自动流血而死 */
export const BLEEDOUT_TURNS = 4;
/** 倒地后要隔这么多回合才能补刀 / 处决：这段时间是同伴真正的救援窗口 */
export const DOWNED_LOCK_TURNS = 2;
/** 暴露度上限：到 100 直接判负（实体杀手被捕，灵异鬼怪被驱散） */
export const ALARM_MAX = 100;
/** 1 点旧「暴露度」折算成多少暴露度：暴露度只是暴露度的 0~10 镜像 */
const WANTED_TO_ALARM = 10;
/** 站在后院的人至少要有这么高的警觉，才会想到翻篱笆（否则只是路过） */
const ESCAPE_ALERT_MIN = 35;

/** 挥刀 / 搜索各自消耗 1 点行动点：唯一的伤害来源，不能免费 */
export const ATTACK_COST = 1;
export const SEARCH_COST = 1;
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
 * 痕迹只保留最近这么多次「玩家行动」留下的（不是按回合）。
 * 跟着脚印走，旧的会一步步被擦掉；走错方向再回头，那条线索已经没了。
 */
const TRAIL_ACTION_WINDOW = 2;
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
/** 站在倒地者房间干等（守尸）时，其他人每回合额外推进的团队进度 */
const GUARD_TEAM_GAIN = 9;
/** 每多追同一名幸存者一回合，其他人的工作效率 +25%，最多翻倍 */
const CHASE_WORK_BONUS = 0.25;
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

/** 同伴一个个倒下，剩下的人会红着眼拼命：击杀数与场上倒地者都会催他们干活更快 */
function workPressure(state: GameState): number {
  const downed = state.people.some((p) => p.role !== 'police' && p.hp <= 0);
  return Math.min(KILL_PRESSURE_MAX, state.kills * KILL_PRESSURE) + (downed ? DOWNED_URGENCY : 0);
}

/** 追一个人越久、杀的人越多，其他人干活越快；这是「守着一个人追 / 一路屠杀」的代价 */
function teamWorkGain(state: GameState): number {
  return Math.round(
    OBJECTIVE_GAIN * (1 + Math.min(1, state.chaseTurns * CHASE_WORK_BONUS) + workPressure(state)),
  );
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
  if (state.log.length > 60) state.log.length = 60;
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

function completeTeamStage(state: GameState): void {
  state.teamStage = Math.min(TEAM_STAGE_COUNT, state.teamStage + 1);
  log(state, `幸存者团队完成第 ${state.teamStage}/${TEAM_STAGE_COUNT} 阶段：${state.teamGoalLabel}。`);
  if (state.teamStage !== TEAM_STAGE_COUNT) return;
  state.teamProgress = TEAM_GOAL_MAX;
  state.escapeRooms = farthestRoomPair();
  const names = state.escapeRooms.map(roomName).join('、');
  for (const person of state.people) {
    if (person.role === 'police' || person.hp <= 0) continue;
    person.goal = 'exit'; person.intent = 'escape'; person.alert = 100;
    person.escapeProgress = 0; person.activity = '正在赶往逃生点';
  }
  log(state, `第四阶段完成！地图出现两个逃生点：${names}。所有幸存者开始撤离！`);
}

/** 团队进度跨过 25% 里程碑时完成阶段；已完成阶段不会倒退。 */
function addTeamProgress(state: GameState, amount: number): void {
  if (amount <= 0 || state.teamStage >= TEAM_STAGE_COUNT) return;
  state.teamProgress = Math.min(TEAM_GOAL_MAX, state.teamProgress + amount);
  while (state.teamStage < TEAM_STAGE_COUNT && state.teamProgress >= (state.teamStage + 1) * TEAM_STAGE_SIZE) completeTeamStage(state);
}

/** 破坏设施只能拖慢当前阶段，不能抹掉已经完成的阶段。 */
function reduceTeamProgress(state: GameState, amount: number): void {
  if (amount <= 0 || state.teamStage >= TEAM_STAGE_COUNT) return;
  state.teamProgress = Math.max(state.teamStage * TEAM_STAGE_SIZE, state.teamProgress - amount);
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
  return (state.roomLocks[room] ?? 0) > 0;
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
  return alarmSuppressed(state);
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
export function addAlarm(state: GameState, amount: number): void {
  state.alarm = clamp(state.alarm + amount, 0, ALARM_MAX);
  syncWanted(state);
  if (state.alarm >= ALARM_MAX && !state.result) {
    // 灵异鬼怪不该「被警察抓捕」：换成被恐惧反噬、逐回黑暗，代入感才成立。
    const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
    state.resultReason = supernatural
      ? '你的形体被彻底看穿：活人的恐惧凝成符咒，把你逐回黑暗——这一夜的猎场不再容你。'
      : '整栋房子的证词终于拼成一张完整的脸：警察破门而入，当场把你按倒。';
    finish(state, supernatural ? 'failed' : 'caught');
  }
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
 * 当前能不能看见这个房间里的「人」。
 *
 * 只有你站着的这一间、以及被侦查 / 感知临时点亮的房间才看得见人。
 * 相邻房间只给你轮廓和名字（explored），不再白送「隔壁有谁」——
 * 找人要靠走进去、脚印、乌鸦动静，或者侦查 / 感知卡牌。
 */
export function isRoomVisible(state: GameState, room: RoomId): boolean {
  if (room === state.playerRoom) return true;
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
 * 这个人现在是在乱跑吗？
 *
 * 只有慌乱中的移动才会在地板上刮出痕迹——悠闲散步的人不会留下脚印，
 * 否则满地图的红线会把「追」这件事变成看地图。
 */
function leavesTrail(person: Person): boolean {
  return (
    person.intent === 'flee' ||
    person.intent === 'escape' ||
    person.intent === 'call' ||
    person.alert >= 45 ||
    person.hp <= SURVIVOR_INJURED_HP
  );
}

/**
 * 老练的幸存者有时会踮着脚走：不留鞋印，也不惊动乌鸦。
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
    // 悄悄走：不留鞋印，也不惊动乌鸦
    if (isQuietMove(state, p)) return;
    if (leavesTrail(p)) pushTrail(state, from, p.room, p.hp <= SURVIVOR_INJURED_HP);
    addDisturbance(state, p.room);
  });
}

function snapshotRooms(state: GameState): Map<string, RoomId> {
  return new Map(npcs(state).map((p) => [p.id, p.room]));
}

function pruneTrails(state: GameState): void {
  state.trails = state.trails.filter((t) => state.trailClock - t.clock <= TRAIL_ACTION_WINDOW);
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
  return state.trails.filter((t) => state.trailClock - t.clock <= TRAIL_ACTION_WINDOW);
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
  for (const person of npcs(state)) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;
    // 倒地、藏着、被按住的人在原地等；屋里的人留给进门反应与回合结算
    if (person.hp <= 0 || person.hidden) continue;
    if (person.blockedTurns > 0 || state.pinnedPeople.includes(person.id)) continue;
    // 同房间的目击者也要有动作：刚被砍的那个人本回合已经反应过，不重复
    const sameRoom = person.room === state.playerRoom;
    if (sameRoom && person.id === state.lastAttackedId) continue;
    if (sameRoom) {
      // 伏击这一下他们根本没察觉，别让「目击者反应」把偷袭白送掉
      if (state.ambushTurn === state.turn) continue;
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

/** 玩家每一个动作结束后的统一收尾：世界动一下，视野记一下，胜负判一下 */
function afterPlayerAction(state: GameState): void {
  if (state.result) return;
  npcReact(state);
  // 玩家的一次行动结束：痕迹的寿命按行动数走，不是按回合。
  // 这让「跟着脚印走」变成一段短线索，走错再回头就真的断了。
  state.trailClock += 1;
  pruneTrails(state);
  pruneDisturbances(state);
}

/* ==================================================================== */
/*  寻路                                                                */
/* ==================================================================== */


function nextStepToward(
  state: GameState,
  from: RoomId,
  to: RoomId,
  avoid: RoomId[] = [],
  respectLocks = true,
): RoomId | null {
  if (from === to) return null;
  const blocked = new Set<RoomId>(avoid);
  const queue: RoomId[][] = [[from]];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of ROOM_MAP[current].neighbors) {
      if (seen.has(next)) continue;
      if (blocked.has(next) && next !== to) continue;
      if (respectLocks && isLocked(state, next) && next !== to) continue;
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

function killPerson(state: GameState, person: Person): void {
  if (state.carryPersonId === person.id) { state.carryPersonId = null; state.carryDistance = 0; }
  if (!state.people.some((p) => p.id === person.id)) return;
  state.people = state.people.filter((p) => p.id !== person.id);
  state.pinnedPeople = state.pinnedPeople.filter((id) => id !== person.id);
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
  if (seenBy.length) {
    addWanted(state, person.role === 'target' ? 2 : 1);
  } else {
    log(state, '屋里没有人看见这一幕。');
  }
  log(
    state,
    `你杀死了${person.marked ? '标记目标' : person.role === 'police' ? '警察' : '平民'} ${person.name}。`,
  );

  // 尸体迟早会被发现：整栋房子的警觉跟着抬起来，恐慌会传染。
  let stirred = 0;
  npcs(state).forEach((other) => {
    if (other.alert < 36) {
      other.alert = clamp(other.alert + 10, 0, 100);
      stirred += 1;
    }
  });
  addAlarm(state, 6);
  if (stirred > 0) log(state, '血腥味顺着地板缝散开，房子里的人开始不安地走动。');
}

/** 受到伤害：只能推进一档，倒地的人再挨一下才会死 */
function damagePerson(state: GameState, person: Person, amount: number): void {
  if (!state.people.some((p) => p.id === person.id)) return;
  const dmg = Math.max(0, amount + state.bonusDamage);
  state.bonusDamage = 0;
  if (dmg <= 0) return;
  // 见血就清醒：杀戮值一脚踩空
  state.frenzy = 0;

  const before = person.hp;
  person.hidden = false;
  person.blockedTurns = 0;

  if (before <= 0) {
    // 已经倒地：过了保护期才是补刀，否则这一刀落不下去
    if (!canExecuteNow(person)) {
      log(state, `${person.name} 刚倒下，刀还落不下去——再等 ${DOWNED_LOCK_TURNS - person.downedTurns} 回合。`);
      return;
    }
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
    log(state, `${person.name} 被打倒在地上。他还没死——要隔 ${DOWNED_LOCK_TURNS} 回合才能补刀，这期间同伴能把他救走。`);
    addAlarm(state, 4);
    peopleInRoom(state, person.room)
      .filter((p) => p.id !== person.id && p.role !== 'police')
      .forEach((p) => {
        p.alert = clamp(p.alert + 30, 0, 100);
        p.intent = p.intent === 'idle' ? 'wary' : p.intent;
      });
    return;
  }

  // 受到伤害后会惊慌逃跑；累计达到 2 点时，状态才正式变为受伤。
  person.alert = 100;
  person.intent = 'flee';
  person.activity = person.hp <= SURVIVOR_INJURED_HP ? '捂着伤口逃窜' : '受到攻击，惊慌逃窜';
  person.goal = 'exit';
  if (before > SURVIVOR_INJURED_HP && person.hp <= SURVIVOR_INJURED_HP) log(state, `${person.name} 受伤了（${person.hp}/${SURVIVOR_MAX_HP}），丢下手里的东西就跑。`);
  else log(state, `${person.name} 受到 ${dmg} 点伤害（剩余 ${person.hp}/${SURVIVOR_MAX_HP}）。`);
  peopleInRoom(state, state.playerRoom)
    .filter((p) => p.id !== person.id && p.role !== 'police')
    .forEach((p) => {
      p.alert = clamp(p.alert + 18, 0, 100);
    });
  addAlarm(state, 3);
  // 一刀下去他会连着跑两间屋，地板上留下一道血痕：
  // 「砍一刀、他挪一格、我跟上去」那种没有张力的追逐到此为止。
  for (let i = 0; i < PANIC_HOPS_ON_HIT; i++) {
    if (!fleeAway(state, person)) break;
    person.movesThisTurn += 1;
  }
}

/** 倒地者是否已经过了「不能被补刀」的保护期 */
function dropCarriedPerson(state: GameState, message: string): void {
  if (!state.carryPersonId) return;
  const person = state.people.find((p) => p.id === state.carryPersonId);
  state.carryPersonId = null;
  state.carryDistance = 0;
  if (!person) return;
  person.hp = SURVIVOR_INJURED_HP;
  person.downedTurns = 0;
  person.alert = 100;
  person.intent = 'flee';
  person.goal = 'exit';
  person.activity = '挣脱后拖着伤口逃跑';
  log(state, message);
}

export function carryPerson(state: GameState, personId: string): boolean {
  if (state.phase !== 'playing' || state.carryPersonId || state.energy < 1) return false;
  const person = state.people.find((p) => p.id === personId);
  if (!person || person.role === 'police' || person.hp > 0 || person.room !== state.playerRoom) return false;
  state.energy -= 1;
  state.carryPersonId = person.id;
  state.carryDistance = 0;
  person.activity = '被杀手抱起搬运';
  log(state, `你抱起了倒地的${person.name}。再移动 3 间房，他就可能挣脱。`);
  afterPlayerAction(state);
  return true;
}

export function executeCarriedPerson(state: GameState, method: 'fridge' | 'microwave'): boolean {
  if (!state.carryPersonId || state.phase !== 'playing') return false;
  const person = state.people.find((p) => p.id === state.carryPersonId);
  if (!person || person.room !== state.playerRoom || !canExecuteNow(person)) {
    log(state, '怀里的人尚不能处决，或已经不在现场。');
    return false;
  }
  if (state.energy < 1) { log(state, '行动点不足，无法完成特殊处决。'); return false; }
  if (state.playerRoom !== 'kitchen') { log(state, '这里没有可用的特殊处决地形。'); return false; }
  state.energy -= 1;
  const name = person.name;
  state.carryPersonId = null;
  state.carryDistance = 0;
  state.executions += 1;
  const flavor = method === 'fridge'
    ? `你把${name}塞进冰箱，沉重的门缓缓合上……一切归于寂静。`
    : `你将${name}按在微波炉旁，刺耳的嗡鸣吞没了最后的挣扎声。`;
  log(state, `特殊处决：${flavor}（额外奖励 +35 分）。`);
  killPerson(state, person);
  state.specialExecutionBonus += 35;
  state.attackReady = true;
  addAlarm(state, 8);
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

function canExecuteNow(person: Person): boolean {
  return person.hp <= 0 && person.downedTurns >= DOWNED_LOCK_TURNS;
}

function executePerson(state: GameState, person: Person): void {
  if (person.hp > 0) {
    log(state, `${person.name} 还站着，处决需要先把他打倒。`);
    return;
  }
  if (!canExecuteNow(person)) {
    log(state, `${person.name} 刚倒下，还撑得住——再等 ${DOWNED_LOCK_TURNS - person.downedTurns} 回合才能处决。`);
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
  person.hp = Math.min(SURVIVOR_MAX_HP, person.hp + amount);
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
      // allowDowned：屋里只剩倒地的人时，攻击牌自动变成补刀
      const v = findVictim(state, state.playerRoom, Infinity, true);
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
  executeOps(state, ops, {
    selectPeople, log, damagePerson, canExecuteNow, executePerson, killPerson,
    addWanted, addAlarm, resolveDest, movePersonTo, markExplored,
    onPlayerEnter: (current, chased) => {
      chasedId = chased ?? null;
      try { npcOnPlayerEnter(current); } finally { chasedId = null; }
    },
    scoutRoom, npcs, peopleInRoom, standing, nextStepToward,
    healPerson, rescuePerson, checkCond,
  });
}

function movePersonTo(state: GameState, person: Person, room: RoomId, clearAlert = false): void {
  if (person.room === room || person.hp <= 0) return;
  const from = roomName(person.room);
  person.room = room;
  if (clearAlert) person.alert = 0;
  log(state, `${person.name} 从${from}移动到${roomName(room)}。`);
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
  if (state.teamStage < TEAM_STAGE_COUNT || !state.escapeRooms.includes(person.room)) return false;
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
  if (state.pinnedPeople.includes(person.id) || person.blockedTurns > 0 || person.hp <= 0) return false;
  // 后院是出口：只有本来就打算离开、或者已经吓破胆的人才会往外跑。
  // 否则「被追」等于「自动逃生」，玩家把人逼到院子里反而在帮对手。
  const mayExit =
    person.goal === 'exit' || person.goal === 'panic' || person.alert >= 70 || person.hp <= SURVIVOR_INJURED_HP;
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
  // 老练的人踮着脚走：这一步连脚印都不留，也不惊动乌鸦
  if (!isQuietMove(state, person)) {
    pushTrail(state, fromId, person.room, person.hp <= SURVIVOR_INJURED_HP);
    addDisturbance(state, person.room);
  }
  if (quiet) return true;
  log(state, `${person.name} 从${from}逃向${roomName(person.room)}。`);
  shout(state, person, 14);
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

    // 用「进门之前」的警觉决定他有多慌，但推门这个动作本身就是一次照面：
    // 只要没打伏击，屋里的人就会察觉并转身跑——不存在「他背对着门没看见你」的白送窗口。
    // 「进门不惊动任何人」是静止隐身这张牌买来的，不该白送。
    const wasAlert = person.alert;

    let gain = 30;
    if (threat === 'spiritual') gain = 65;
    else if (threat === 'alarm') gain = 55;
    else if (threat === 'lead') gain = 42;
    else if (threat === 'team') gain = 38;
    if (person.hidden) gain = Math.round(gain * 0.3);
    if (hidden && threat !== 'spiritual') gain = Math.round(gain * 0.4);
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
    if (!exhausted && fleeAway(state, person)) {
      person.movesThisTurn += 1;
      person.alert = 100;
      log(
        state,
        wasAlert >= 85
          ? `${person.name} 根本没等你站稳，已经冲出了门口。`
          : wasAlert < 30
            ? `门一响，${person.name} 猛地回头，撒腿就跑。`
            : `${person.name} 看见你，转身就跑。`,
      );
      return;
    }

    // 退无可退：被堵在墙角的人只能贴着墙看着你
    person.intent = 'wary';
    person.alert = 100;
    person.activity = exhausted ? '跑不动了，靠着墙喘气' : '无路可退，贴着墙盯着你';
    log(
      state,
      exhausted
        ? `${person.name} 跑了整整一路，这会儿只能扶着墙喘气——你终于追上他了。`
        : `${person.name} 想跑，但门口被你占着——他退到了墙角。`,
    );
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
  dropCarriedPerson(state, '你被打断，怀里的人趁机挣脱并逃走了。');
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
    if (p.hp <= 0 || p.hidden) continue;
    if (p.room === state.playerRoom && p.movesThisTurn < REACT_MOVE_CAP) {
      fleeAway(state, p);
      p.movesThisTurn += 1;
    } else if (state.teamProgress < TEAM_GOAL_MAX) {
      addTeamProgress(state, 2);
    }
  }
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
  person.alert = clamp(person.alert + 45, 0, 100);
  npcs(state)
    .filter((p) => p.id !== person.id && p.hp > 0 && p.alert < 70)
    .forEach((p) => {
      p.alert = clamp(p.alert + 20, 0, 100);
    });
  addDisturbance(state, person.room);
  if (random() < 0.55 && person.movesThisTurn < REACT_MOVE_CAP) {
    fleeAway(state, person);
    person.movesThisTurn += 1;
    log(state, `${person.name} 看见同伴被砍，喊了一声夺路而逃。`);
  } else {
    addTeamProgress(state, 3);
    person.intent = 'work';
    person.activity = '趁乱把手里的事往前推了一步';
    log(state, `${person.name} 没跟着跑，反而趁乱多干了一点活（团队进度 +3）。`);
  }
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

/** 有人倒地时，幸存者会主动赶过去：救援优先于日常目标，但没人敢闯玩家守着的房间 */
function tryAidRun(state: GameState, person: Person): boolean {
  if (person.hidden || person.blockedTurns > 0) return false;
  if (random() > RESCUE_EAGERNESS[person.archetype] * AID_RUN_RATE) return false;
  const downed = npcs(state)
    .filter((p) => p.hp <= 0 && p.room !== state.playerRoom)
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
      const step = away.length ? randomOf(away) : nextStepToward(state, person.room, ESCAPE_ROOMS[0], []);
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
      if (CABINET_ROOMS.includes(person.room)) {
        person.hidden = true;
        person.intent = 'hide';
        person.activity = '钻进了柜子';
        log(state, `${person.name} 钻进了柜子，屋子里少了一个人。`);
        return;
      }
      const cabinet = nearestOf(
        person.room,
        CABINET_ROOMS.filter((r) => !isLocked(state, r)),
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

/** 回合结束时 NPC 的一轮行动 */
function npcTurn(state: GameState): void {
  const before = snapshotRooms(state);
  for (const person of [...npcs(state)]) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;

    // 被抱起的人不会参与救援或移动，但仍然会继续流血倒计时。
    if (person.id === state.carryPersonId) {
      person.downedTurns += 1;
      if (person.downedTurns >= BLEEDOUT_TURNS) {
        log(state, `${person.name} 在你搬运途中停止了呼吸。`);
        addAlarm(state, 10);
        killPerson(state, person);
      } else {
        person.activity = '被杀手抱着，无法挣脱（倒计时仍在继续）';
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

    // 供电区域：灯光让幸存者更警觉；正在执行团队工作的人效率更高。
    if (isRoomLit(state, person.room)) {
      person.alert = clamp(person.alert + 4, 0, 100);
      if (person.goal === 'objective' || person.goal === 'generator' || person.goal === 'key' || person.intent === 'work') {
        addTeamProgress(state, 2);
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
    if (person.hidden && state.teamStage < TEAM_STAGE_COUNT) {
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
    if (person.hidden && state.teamStage >= TEAM_STAGE_COUNT) person.hidden = false;

    // 第四阶段开启后，所有幸存者都以两个动态逃生点为目标，不再执行原本的个人工作。
    if (state.teamStage >= TEAM_STAGE_COUNT && state.escapeRooms.length === 2) {
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
    if (person.room === state.playerRoom) {
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
      if (CABINET_ROOMS.includes(person.room) && random() < 0.55) {
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

    // 低警觉：不再漫无目的地乱晃，各自朝这一局的个人目标走一步。
    // 到了目标房间就「做事」——推进团队进度，同时弄出动静给玩家一条线索。
    person.intent = 'idle';
    // 路过没被砸烂的道具箱就翻一件：他们多一条路，你就多一个要盯的地方
    if (tryTakeSupply(state, person)) continue;

    const goalTargets: RoomId[] =
      person.goal === 'objective'
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
                    ? CABINET_ROOMS
                    : person.goal === 'help'
                      ? [nearestOf(person.room, CABINET_ROOMS)]
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
      if (gen) {
        const hasToolbox = person.item === 'toolbox' && person.itemUses > 0;
        // 危急时刻发电机也修得更快：同伴的死亡和倒地都在催他们
        const gain = Math.round(GENERATOR_GAIN * (1 + workPressure(state))) * (hasToolbox ? 2 : 1);
        gen.progress = Math.min(100, gen.progress + gain);
        if (hasToolbox) consumeItem(state, person);
        person.intent = 'work';
        person.activity = `在修发电机（${gen.progress}%）`;
        addDisturbance(state, person.room);
        log(state, `${person.name} 在${roomName(person.room)}修发电机（${gen.progress}%）。`);
        if (gen.progress >= 100) {
          gen.charged = true;
          addTeamProgress(state, GENERATOR_CHARGED_BONUS);
          log(state, `发电机重新亮了起来，他们离逃出去又近了一大步（团队进度 ${state.teamProgress}/${TEAM_GOAL_MAX}）。`);
        }
      } else if ((person.goal === 'objective' || person.goal === 'key') && state.teamProgress < TEAM_GOAL_MAX) {
        // 工具箱：按你的设计，推进团队目标也更快（不只是修发电机）
        const hasToolbox = person.item === 'toolbox' && person.itemUses > 0;
        const gain = teamWorkGain(state) * (hasToolbox ? 2 : 1);
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
  recordTrails(state, before);
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
  if (state.teamStage < TEAM_STAGE_COUNT || state.escapeRooms.length !== 2) return;
  for (const person of [...npcs(state)]) {
    if (person.hp <= 0) continue;
    if (!state.escapeRooms.includes(person.room)) {
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
    if (person.marked) log(state, `名单上少了一个人：${person.name} 已经不在房子里了。`);

    // 有人跑掉，剩下的人胆子会变大
    npcs(state).forEach((p) => {
      p.alert = clamp(p.alert + 12, 0, 100);
    });

    // 每逃一个人都在结算里扣 15 分；直到最后一个幸存者也翻出篱笆，契约才作废。
    // 不再用「逃够 N 个就立刻输」的硬阈值——那会让幸存者的个人目标失去博弈空间。
    if (state.escaped >= state.survivorTotal && state.survivorTotal > 0) {
      state.resultReason = `最后一名幸存者也成功逃离，房子里再没有活人——契约作废（逃走 ${state.escaped} 人）。`;
      finish(state, 'failed');
    }
  }
}

/* ==================================================================== */
/*  警察                                                                */
/* ==================================================================== */

function policeNextStep(state: GameState): RoomId {
  const police = state.people.find((p) => p.role === 'police');
  if (!police) return POLICE_START;
  // 警察只追「新鲜的现场」：两回合内没有新的报警，他就开始挨屋搜查，
  // 而不是永远贴着玩家跑。这样玩家可以甩掉他，而不是被一路加暴露度到逮捕。
  const fresh = state.heatTurn >= state.turn - 1;
  const destination = state.decoyRoom ?? (fresh ? state.lastCrimeRoom ?? state.playerRoom : null);
  if (!destination) {
    const options = ROOM_MAP[police.room].neighbors.filter((r) => !isLocked(state, r));
    return options.length ? randomOf(options) : police.room;
  }
  if (police.room === destination) return police.room;
  const step = nextStepToward(state, police.room, destination, [], true);
  return step ?? police.room;
}

function policePhase(state: GameState): void {
  const police = state.people.find((p) => p.role === 'police');
  if (!police) return;

  const next = policeNextStep(state);
  if (state.wiretap) log(state, `窃听：警察正在前往${roomName(next)}。`);
  if (state.policeBlocked) {
    state.policeBlocked = false;
    log(state, '后院大门被锁，警察本回合无法移动。');
  } else if (next !== police.room) {
    police.room = next;
    log(state, `警察移动到${roomName(next)}。`);
  }

  if (police.room !== state.playerRoom) state.policeLock = 0;

  if (police.room === state.playerRoom) {
    // 警戒/逮捕合并：警察不再单独判负，而是持续把「暴露度」往上顶。
    // 盯得越久涨得越快，满 100 才由 addAlarm 统一收束（被捕 / 被驱散）。
    state.policeLock += 1;
    const pressure = state.policeLock >= 2 ? 18 : 10;
    addAlarm(state, pressure);
    log(
      state,
      state.policeLock >= 2
        ? `警察咬住你不放，你的存在彻底暴露了（暴露度 ${state.alarm}/${ALARM_MAX}）。`
        : `警察按住你的肩膀盯了两秒——再不甩开他，暴露度会一路涨满（${state.alarm}/${ALARM_MAX}）。`,
    );
  }
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
      addTeamProgress(state, 12);
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
      if (CABINET_ROOMS.includes(person.room) && random() < 0.6) person.hidden = true;
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
  return (state.barricades.includes(room) ? 2 : 1) + obstacle;
}

export function canMoveTo(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (room === state.playerRoom) return false;
  // freeMove 是卡牌 / 能力买来的特权：无视相邻限制，而且这一步不耗行动点
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (state.energy < cost) return false;
  if (state.freeMove) return true;
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

export function movePlayer(state: GameState, room: RoomId): boolean {
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (!canMoveTo(state, room)) {
    log(state, state.energy < cost ? '行动点不够，走不过去。' : '无法移动到那里：不是相邻房间，或路被堵住了。');
    return false;
  }

  const from = state.playerRoom;
  state.energy -= cost;
  state.playerRoom = room;
  markExplored(state, room);
  if (state.carryPersonId) {
    const carried = state.people.find((p) => p.id === state.carryPersonId);
    if (carried) carried.room = room;
    state.carryDistance += 1;
    if (state.carryDistance >= 3) dropCarriedPerson(state, '搬运距离太远，幸存者挣脱你的控制，恢复受伤状态逃跑了。');
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

  state.energy -= cost;
  state.hand.splice(index, 1);
  state.discardPile.push(card);
  log(state, `你打出「${def.name}」（消耗 ${cost} 点行动点）。`);

  runOps(state, def.ops);
  // 出了牌，刀就收回来了：下一刀可以砍
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
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
export function attackBlockReason(state: GameState, targetId?: string): string {
  if (state.phase !== 'playing') return '现在不能动手';
  // 点了具体的人：先检查这个人本身。同屋多人时，点谁打谁。
  if (targetId) {
    const picked = state.people.find((p) => p.id === targetId);
    if (!picked) return '这个人已经不在现场了';
    // 袭警允许，但代价写在 attack() 里：暴露度 +6、警戒 +12、警察立刻锁定你
    if (picked.role === 'police' && state.policeAssaulted) return '警员已经倒下，别再看了';
    if (picked.room !== state.playerRoom) return '他不在这间屋里';
    if (picked.hidden) return '他躲起来了，先搜索这间屋子';
  }
  if (!state.attackReady) return '刀还没收回来：先挪一步或出一张牌';
  if (state.energy < ATTACK_COST) return `需要 ${ATTACK_COST} 点行动点`;
  if (findVictim(state, state.playerRoom, Infinity, true, targetId)) return '';
  // 屋里只剩刚倒下的人：这 2 回合是救援窗口，刀还不能落下去
  const lockedDowned = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.hp <= 0 && !canExecuteNow(p),
  );
  if (lockedDowned.length) {
    const wait = Math.min(...lockedDowned.map((p) => DOWNED_LOCK_TURNS - p.downedTurns));
    return `他刚倒下，还要等 ${wait} 回合才能补刀（这期间同伴可能把他救走）`;
  }
  const onlyPolice = peopleInRoom(state, state.playerRoom).some((p) => p.role === 'police');
  return onlyPolice ? '屋里只有警察——他不能攻击，别在他眼皮底下动手' : '这间屋子里没有人';
}

export function canAttack(state: GameState, targetId?: string): boolean {
  return attackBlockReason(state, targetId) === '';
}

/**
 * 挥刀：健康 → 受伤，受伤 → 倒地，倒地 → 补刀致死。
 * 恶魔附身期间伤害翻倍，还站着的人一刀就倒。
 * 砍完就把 attackReady 关掉，必须再做一件事（走路 / 出牌 / 用能力）才能砍第二刀，
 * 所以「一刀接一刀」不是按得快就行，中间得有一次追逐或一次控制。
 * 传入 targetId 时只砍那个人——点房间里的谁，就砍谁。
 */
export function attack(state: GameState, targetId?: string): boolean {
  if (state.phase !== 'playing') return false;
  const reason = attackBlockReason(state, targetId);
  if (reason) {
    log(state, reason);
    return false;
  }
  const target = findVictim(state, state.playerRoom, Infinity, true, targetId)!;
  const heavy = state.possessed;
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
  state.energy -= ATTACK_COST;
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
      ? `你俯身补上一刀，${target.name} 没能再起来（消耗 ${ATTACK_COST} 点行动点）。`
      : heavy
        ? `恶魔附身 · 你挥刀砍向 ${target.name}，这一刀直接见骨（消耗 ${ATTACK_COST} 点行动点）。`
        : `你挥刀砍向 ${target.name}（消耗 ${ATTACK_COST} 点行动点）。`,
  );
  // 鬼面监视完成：这一刀直接把还站着的人放倒，不必补第二下
  const nightfallKill = target.watched;
  if (nightfallKill) {
    target.watched = false;
    target.watchValue = 0;
    log(state, `夜幕锁定 ${target.name}：这一刀直接把他放倒。`);
  }
  damagePerson(state, target, heavy || nightfallKill ? 2 : 1);
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
  log(state, `你低头把刀上的血慢慢擦干净（消耗 ${WIPE_COST} 点行动点）。这一下动静，够他们做点什么了。`);
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
  const hasCabinet = CABINET_ROOMS.includes(state.playerRoom);
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
export function isRoomLit(state: GameState, room: RoomId): boolean {
  return state.powerCircuits.some((c) => !c.broken && c.affectedRooms.includes(room));
}

export function sabotageBlockReason(state: GameState): string | null {
  if (state.phase !== 'playing') return '这一局已经结束了。';
  if (state.energy < SABOTAGE_COST) return `行动点不足：破坏需要 ${SABOTAGE_COST} 点。`;
  const breaker = state.powerCircuits.some((c) => c.breakerRoom === state.playerRoom && !c.broken);
  const here = state.siteItems.filter(
    (i) => i.room === state.playerRoom && !i.broken && (i.kind === 'itemBox' ? i.charges > 0 : true),
  );
  if (!here.length && !breaker) return '这间屋子没有还能破坏的设施。';
  return null;
}

/**
 * 砸掉当前房间的道具箱 / 发电机。
 * 道具箱一毁，幸存者再也拿不到补给；发电机被砸会掉修复进度、停机两回合，
 * 已经通电的还会把团队进度拖回去。破坏本身会弄出动静、引来乌鸦——
 * 所以「什么时候砸」也是个抉择，不是白嫖。
 */
export function sabotageSiteItem(state: GameState): boolean {
  const reason = sabotageBlockReason(state);
  if (reason) {
    log(state, reason);
    return false;
  }
  const circuit = state.powerCircuits.find((c) => c.breakerRoom === state.playerRoom && !c.broken);
  const item = state.siteItems.find(
    (i) => i.room === state.playerRoom && !i.broken && (i.kind === 'itemBox' ? i.charges > 0 : true),
  );
  if (!circuit && !item) return false;
  state.energy -= SABOTAGE_COST;

  if (circuit) {
    circuit.broken = true;
    log(state, `你砸毁了${circuit.name}控制箱！${circuit.affectedRooms.map(roomName).join('、')}立即断电，灯光熄灭。`);
  } else if (item!.kind === 'itemBox') {
    item.broken = true;
    item.charges = 0;
    log(state, `你砸烂了${roomName(item.room)}的道具箱——从今往后，没人能从这里翻到道具了。`);
  } else {
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
    log(state, `你砸了${roomName(item!.room)}的发电机，修复进度 ${before}% → ${item!.progress}%，停机 ${GENERATOR_JAM_TURNS} 回合。`);
  }

  addDisturbance(state, state.playerRoom);
  addAlarm(state, 3);
  // 砸东西也算「做了一件事」，刀可以收回来
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}

export function powerCooldown(state: GameState, powerId: string): number {
  return state.cooldowns[powerId] ?? 0;
}

export function canUsePower(state: GameState, powerId: string): boolean {
  if (state.phase !== 'playing') return false;
  const killer = KILLER_MAP[state.killer];
  const power = killer?.powers.find((p) => p.id === powerId);
  if (!power) return false;
  if (powerCooldown(state, powerId) > 0) return false;
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
    case 'marked_kill': return state.markedKilled;
    case 'execute': return state.executions;
    case 'no_alarm': return state.npcAlarmed ? 0 : 1;
    case 'break_circuit': return state.powerCircuits.filter((c) => c.broken).length;
  }
}

function checkImmediateWin(state: GameState): void {
  if (state.result) return;
  const tasks = state.mission.tasks ?? [];
  if (tasks.length > 0 && tasks.every((task) => missionTaskProgress(state, task) >= task.target)) finish(state, 'win');
}

function finish(state: GameState, result: ResultKind): void {
  if (state.result) return;
  state.result = result;
  state.phase = 'gameover';

  const lines: ScoreLine[] = [{ label: `契约基础分 · ${state.mission.title}`, value: state.mission.reward }];
  if (state.specialExecutionBonus > 0) lines.push({ label: '地形处决奖励', value: state.specialExecutionBonus });
  lines.push({ label: `凶残 · 击杀 ${state.kills} 人`, value: state.kills * 14 });
  if (state.escaped > 0) lines.push({ label: `逃走 ${state.escaped} 人的失分（每人 -15）`, value: -state.escaped * 15 });
  if (state.alarm >= 60) lines.push({ label: `暴露度 ${state.alarm} 的代价`, value: -Math.round(state.alarm / 5) });

  if (result === 'win') {
    const bonus = (state.mission.turns - state.turn) * 5;
    if (bonus > 0) lines.push({ label: `猎杀效率 · 剩余 ${state.mission.turns - state.turn} 回合`, value: bonus });
    state.rewardCards = [UNLOCK_REWARDS[state.mission.kind]].filter(Boolean);
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
  checkImmediateWin(state);
  if (state.result) return;

  // 守尸惩罚：站在倒地者房间干等，其他人会把团队任务往前赶一大截
  const downedHere = npcs(state).some((p) => p.hp <= 0 && p.room === state.playerRoom);
  if (downedHere) {
    state.guardingTurns += 1;
    const gain = GUARD_TEAM_GAIN + Math.min(6, state.guardingTurns * 2);
    addTeamProgress(state, gain);
    log(state, `你守在倒地的人旁边没动……其他人趁这段时间把${state.teamGoalLabel}往前赶了一大截（团队进度 +${gain}）。`);
  } else {
    state.guardingTurns = 0;
  }

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

  // 迈尔斯的尾随值随时间消退
  if (state.killer === '迈克尔·迈尔斯' && state.stalkMeter > 0) {
    const decay = Math.min(state.stalkMeter, 8);
    state.stalkMeter -= decay;
    log(state, `尾随值 -${decay}（当前 ${state.stalkMeter}/100）。`);
  }

  if (TOTEM_ROOMS.includes(state.playerRoom)) {
    state.bonusEnergyNextTurn = 1;
    log(state, '图腾余响：下一回合额外获得 1 点行动点。');
  }

  npcTurn(state);
  if (state.result) return;
  callPhase(state);
  if (state.result) return;

  escapePhase(state);
  if (state.result) return;

  policePhase(state);
  if (state.result) return;

  witnessPhase(state);
  checkImmediateWin(state);
  if (state.result) return;

  // 暴露度每回合自然回落：玩家安静下来，房子也会安静。
  // 这是它和「团队进度」最大的区别——后者由幸存者干活推高，只涨不退。
  state.alarm = Math.max(0, state.alarm - 6);
  syncWanted(state);
  if (state.heatTurn !== state.turn) {
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
  // 恶魔附身按回合倒计时，归零就恢复正常刀锋
  if (state.possessed) {
    state.possessTurns = Math.max(0, state.possessTurns - 1);
    if (state.possessTurns === 0) {
      state.possessed = false;
      log(state, '恶魔附身消退，刀锋恢复了原本的重量。');
    }
  }
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
  state.cooldowns = Object.fromEntries(
    Object.entries(state.cooldowns)
      .map(([k, v]) => [k, v - 1])
      .filter(([, v]) => (v as number) > 0),
  );
  state.pinnedPeople = [];

  if (state.turn >= m.turns) {
    state.resultReason = '天亮了，警察封锁了整条街。';
    finish(state, 'timeout');
    return;
  }

  // 手牌保留；每个新回合只补 1 张，不再整手弃掉重抽。
  state.turn += 1;
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

export function giveUp(state: GameState): void {
  state.resultReason = '你主动放弃了契约。';
  finish(state, 'failed');
}

export function getStars(score: number): number {
  if (score >= 260) return 3;
  if (score >= 150) return 2;
  return 1;
}

export { generateMission };
