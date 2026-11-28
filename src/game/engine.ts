import { random, randomOf, shuffle } from './random';
import { getExecutionMethod, type ExecutionMethodId } from './executions';
import { nearestOf, roomDistance } from './navigation';
import { awarenessStage, myersStalkGain } from './npc/awareness';
import {
  blinkRangeOf,
  blinkWithinRange,
  hatchetDamageOf,
  hatchetMax,
  modifierValue,
  possessCost,
  trapDamageOf,
  trapHoldTurns,
} from './modifiers';
import { ESCAPE_ROOMS, BASE_AP, SABOTAGE_COST, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP, REACT_MOVE_CAP, BLEEDOUT_TURNS, ALARM_MAX, HAND_LIMIT, FRENZY_THRESHOLD, FRENZY_AP_BONUS, WATCH_GAIN, SEARCH_COST, LOOK_COST, ATTACK_COST, PANIC_HOPS_ON_HIT } from './constants';
import { drawCards } from './deck';
import { executeOps } from './effects/runtime';
import { createGame } from './setup';
export { drawCards } from './deck';
export { createGame } from './setup';
export { BASE_AP, SABOTAGE_COST, POSSESS_TURNS, SURVIVOR_MAX_HP, SURVIVOR_INJURED_HP, BLEEDOUT_TURNS, ALARM_MAX, HAND_LIMIT, FRENZY_THRESHOLD, FRENZY_AP_BONUS, SEARCH_COST, LOOK_COST, ATTACK_COST, PANIC_HOPS_ON_HIT } from './constants';
import { ACTIVITIES, createPeople } from './npc/factory';
import { HEALTH_LABEL } from './npc/catalog';
export { HEALTH_LABEL } from './npc/catalog';
export { ESCAPE_ROOMS } from './constants';
import { CARD_MAP } from './cards';
import type { Cond, Dest, Op, Who } from './effect';
import { KILLER_MAP } from './killers';
import { generateMission, roomName } from './missions';
import {
  BLOOD,
  awardBlood,
  bloodPointGroups,
  bloodPointTotal,
  finalizeBloodPoints,
  markBloodEvent,
  missionTaskProgress,
} from './bloodpoints';
export {
  BLOOD,
  BLOOD_CATEGORY_LABEL,
  awardBlood,
  bloodPointGroups,
  bloodPointTotal,
  missionTaskProgress,
} from './bloodpoints';
import {
  ENTRY_ROOM,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  POLICE_START,
  RADIO_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
  WEAPON_ROOMS,
} from './rooms';
import {
  cabinetRoomsFor,
  canStand,
  isLocked,
  isObstacle,
  isRoomLit,
  npcPeople as npcs,
  peopleInRoom,
  standingPeople as standing,
} from './world/roomState';
export { isLocked, isRoomLit, lockedRoomsOf } from './world/roomState';
import { canMoveTo, moveBlockReason, moveCost } from './world/movement';
import { phoneWorks, workingPhones } from './world/phones';
export { canMoveTo, moveBlockReason, moveCost } from './world/movement';
export { phoneWorks, workingPhones } from './world/phones';
import { nextStepToward } from './world/pathfinding';
export { nextStepToward } from './world/pathfinding';
import {
  BREAKER_SWITCH_COST,
  WIPE_COST,
  breakerBlockReason,
  sabotageBlockReason,
  sabotageTarget,
  wipeBlockReason,
} from './rules/actionRules';
export {
  BREAKER_SWITCH_COST,
  WIPE_COST,
  breakerBlockReason,
  sabotageBlockReason,
  wipeBlockReason,
} from './rules/actionRules';
import {
  ESCAPE_ALERT_MIN,
  alarmSuppressed,
  ambushActive,
  canCoordinateRescue,
  canPlaceBarricade,
  effectiveFearRadius,
  fearAtLeast,
  fearBand,
  isQuietMove,
  playerIsHidden,
  wantsToLeave,
  type FearBand,
} from './npc/ai/predicates';
export { canCoordinateRescue, canPlaceBarricade, fearBand, type FearBand } from './npc/ai/predicates';
import { fleeAway as aiFleeAway, shout as aiShout } from './npc/ai/actions';
import {
  barricadeRoom as aiBarricadeRoom,
  counterAttack as aiCounterAttack,
  finishCall as aiFinishCall,
  tryAidRun as aiTryAidRun,
  tryCall as aiTryCall,
  tryRescue as aiTryRescue,
} from './npc/ai/support';
import { npcTurn as aiNpcTurn } from './npc/ai/turn';
import { executeDecision, tickAllChase } from './npc/ai/runtime';
import {
  npcOnPlayerEnter as aiNpcOnPlayerEnter,
  npcReact as aiNpcReact,
  npcWitnessEvent as aiNpcWitnessEvent,
  sameRoomKillerReact as aiSameRoomKillerReact,
  type NpcWitnessedEvent,
} from './npc/ai/reactions';
import { updateNpcDialogue as aiUpdateNpcDialogue } from './npc/ai/dialogue';
import { policePhase as aiPolicePhase } from './npc/police';
import {
  callPhase as aiCallPhase,
  escapePhase as aiEscapePhase,
} from './turn/phases';
import { endTurn as aiEndTurn } from './turn/ending';
import {
  breakBarricade as aiBreakBarricade,
  breakDoor as aiBreakDoor,
  cancelLookSelection as aiCancelLookSelection,
  interactCabinet as aiInteractCabinet,
  interactTotem as aiInteractTotem,
  lookAround as aiLookAround,
  lookAtRoom as aiLookAtRoom,
  movePlayer as aiMovePlayer,
  searchRoom as aiSearchRoom,
  waitAction as aiWaitAction,
} from './actions/explore';
import {
  attack as aiAttack,
  attackBlockReason as aiAttackBlockReason,
  canAttack as aiCanAttack,
  executeBlockReason as aiExecuteBlockReason,
  executeDownedPerson as aiExecuteDownedPerson,
} from './actions/combat';
import { cancelAuraSelection as aiCancelAuraSelection, playCard as aiPlayCard, selectAuraRoom as aiSelectAuraRoom } from './actions/cards';
import {
  blinkPlayer as aiBlinkPlayer,
  canUsePower as aiCanUsePower,
  collectTrapCache as aiCollectTrapCache,
  powerBlockReason as aiPowerBlockReason,
  recoverBearTrap as aiRecoverBearTrap,
  refillHuntressHatchets as aiRefillHuntressHatchets,
  throwHuntressHatchet as aiThrowHuntressHatchet,
  usePower as aiUsePower,
} from './actions/powers';
import { triggerEnvironmentalEvent as aiTriggerEnvironmentalEvent } from './world/environment';
import {
  canExecuteNow,
  executionWitnessed,
  carryPerson as aiCarryPerson,
  damagePerson as aiDamagePerson,
  dropCarriedPerson as aiDropCarriedPerson,
  executeCarriedPerson as aiExecuteCarriedPerson,
  executePerson as aiExecutePerson,
  healPerson as aiHealPerson,
  killPerson as aiKillPerson,
  rescuePerson as aiRescuePerson,
} from './npc/lifecycle';
import { checkCond as aiCheckCond, selectPeople as aiSelectPeople } from './effects/targeting';

export function cancelAuraSelection(state: GameState): boolean { return aiCancelAuraSelection(aiHost, state); }
export function selectAuraRoom(state: GameState, room: RoomId): boolean { return aiSelectAuraRoom(aiHost, state, room); }
import type { NpcHost } from './npc/ai/host';

/**
 * 交给 AI 模块的引擎写服务。
 * 依赖方向固定为 engine -> ai，AI 不 import engine，所以不会形成循环。
 */
const aiHost: NpcHost = {
  log,
  addAlarm,
  pushTrail,
  addDisturbance,
  triggerBearTrapForPerson,
  fleeAway,
  shout,
  barricadeRoom,
  tryCall,
  tryRescue,
  addWanted,
  rescuePerson,
  healPerson,
  actOnInstinct,
  sameRoomKillerReact,
  damagePerson,
  killPerson,
  resolveTrapEntries,
  updateNpcDialogue,
  recordTrails,
  snapshotRooms,
  counterAttack,
  tryAidRun,
  interruptPlayer,
  rememberVisible,
  getChasedId: () => chasedId,
  finish,
  finishCall,
  runNpcTurn: npcTurn,
  callPhase,
  escapePhase,
  policePhase,
  syncWanted,
  refreshVision,
  pruneTrails,
  pruneDisturbances,
  dawnPhase,
  applyDawnPressure,
  triggerEnvironmentalEvent,
  drawForPlayer,
  checkImmediateWin,
  afterPlayerAction,
  npcOnPlayerEnter,
  rollD6Check,
  markExplored,
  scoutRoom,
  survivorsActOnce,
  updateFrenzy,
  refillHuntressHatchets,
  npcWitnessEvent,
  findVictim,
  canExecuteNow,
  executionWitnessed,
  executePerson,
  checkCond,
  selectPeople,
  effectiveCost,
  runOps,
  isRoomVisible,
  isPersonVisible,
  forwardRoom,
  powerCooldown,
  runDecision: (state, person, endOfTurn) => executeDecision(aiHost, state, person, endOfTurn),
};
import { SURVIVOR_MAP } from './survivors';
import type {
  CardInstance,
  GameState,
  Health,
  Mission,
  Person,
  PersonRole,
  ResultKind,
  RoomId,
  Trail,
  MissionTask,
} from './types';

/* ==================================================================== */
/*  常量                                                                */
/* ==================================================================== */

/** 兼容旧配置的导出；现在倒地后即可处决，救援窗口由玩家是否选择处决决定。 */
export const DOWNED_LOCK_TURNS = 0;
/** 1 点旧「暴露度」折算成多少暴露度：暴露度只是暴露度的 0~10 镜像 */
const WANTED_TO_ALARM = 10;
/** 主动抽牌消耗的行动点；每次抽 1 张。 */
export const DRAW_CARD_COST = 1;
/** 痕迹留几回合（含留下的那回合） */
export const TRAIL_TURNS = 3;
/**
 * 痕迹保留最近五次「玩家行动」（不是按回合），给玩家足够时间追踪路线。
 */
/** 脚印保留的行动次数：所有地图统一 3 次行动。 */
const TRAIL_ACTION_WINDOW = 3;
/** 天亮阶段：每 5 回合推进一次，共 4 个阶段。 */
export const DAWN_PHASE_TURNS = 5;
/** 每次跨阶段：警报 +4，全场幸存者警觉 +5。 */
export const DAWN_ALARM_GAIN = 4;
export const DAWN_ALERT_GAIN = 5;
/** 最后 5 回合的收网：每回合额外警报 +2。 */
export const DAWN_LATE_ALARM = 2;

/** 动静（乌鸦叫）也只留最近这么多次行动：短线索，不是常驻雷达 */
const DISTURBANCE_WINDOW = 3;
/** 杀戮值上限 / 激活阈值：满值后每回合多 2 行动点，由玩家自己决定怎么走 */
export const FRENZY_MAX = 100;
/** 每跟对一段脚印涨多少，跟丢一次掉多少 */
const FRENZY_GAIN = 25;
const FRENZY_LOSS = 20;

/* ---------- 本轮新增：擦刀 / 守尸 / 追击热度 / 眩晕致盲 / 鬼面夜幕 ---------- */
/** 每击杀一名幸存者，其他人的干活效率加成（恐惧催出来的拼命） */
const KILL_PRESSURE = 0.15;
const KILL_PRESSURE_MAX = 0.6;
/** 场上有人倒地还没死时，全体效率再抬一截 */
const DOWNED_URGENCY = 0.25;

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

/** 健康 / 受伤 / 倒地，由血量推导，不单独存一份避免不同步 */
export function conditionOf(person: Person): Health {
  if (person.hp > SURVIVOR_INJURED_HP) return 'healthy';
  if (person.hp > 0) return 'injured';
  return 'downed';
}

/* ==================================================================== */
/*  查询                                                                */
/* ==================================================================== */

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

/** 正在被「追击」的人：这一瞬间他已经贴到你身上，不再触发转身就跑 */
let chasedId: string | null = null;

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

/** 警报：正向变化会刷新本回合活动标记；60 开放逃生点，100 触发最终危机。 */
function activateEmergency(state: GameState): void {
  if (state.emergencyActive || state.result) return;
  state.emergencyActive = true;
  const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
  if (state.escapeRooms.length !== 2) state.escapeRooms = farthestRoomPair();
  for (const person of npcs(state)) {
    if (person.hp <= 0) continue;
    person.alert = Math.max(person.alert, 85);
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
  if (amount > 0) state.heatTurn = state.turn;
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

export { roomName };

/** 玩家砸坏当前房间的电话：1 AP，只影响这一部，不封死全图通讯。 */
export function breakPhone(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (!phoneWorks(state, state.playerRoom)) {
    log(state, '这里没有还能用的电话。');
    return false;
  }
  if (state.energy < 1) {
    log(state, '行动点不足：砸电话需要 1 点。');
    return false;
  }
  state.energy -= 1;
  state.brokenPhones ??= [];
  state.brokenPhones.push(state.playerRoom);
  awardBlood(state, 'control', `破坏电话 · ${roomName(state.playerRoom)}`, BLOOD.phone, { key: `phone:${state.playerRoom}`, limit: 1 });
  log(state, `你砸烂了${roomName(state.playerRoom)}的电话，这间屋子暂时没法报警了。`);
  addAlarm(state, 2);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
}


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
  // 玩家只能看见当前房间与朝向前方的相邻房间；刚离开的房间不再保留在视野中。
  // watchedRoom 仅供能力/追踪逻辑记录，不代表玩家仍能看见身后。
  if (room === state.playerRoom || room === forwardRoom(state)) return true;
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
    // 只有幸存者「走进/走到」乌鸦房间时才惊起它们；屠夫进门、原地反应都不算。
    if ((state.crows ?? []).includes(p.room)) crowAlertFor(state, p);
  });
}

function snapshotRooms(state: GameState): Map<string, RoomId> {
  return new Map(npcs(state).map((p) => [p.id, p.room]));
}

/** 脚印在多少次行动后淡出：统一 3 次行动。 */
export function trailActionWindow(_state: GameState): number {
  return TRAIL_ACTION_WINDOW;
}

/**
 * 天亮阶段（0–3）：每 5 回合推进一次。
 *
 * 这是给玩家的"外部时钟"：不从回合上限直接判负，而是逐步收紧——
 * 跨阶段时警报抬升、所有人更警觉；最后 5 回合每回合持续加压。
 * 玩家是超自然存在，威胁来自"天要亮了"，而不是幸存者的拳头。
 */
export function dawnPhase(state: GameState): number {
  return Math.min(3, Math.floor((Math.max(1, state.turn) - 1) / DAWN_PHASE_TURNS));
}

function applyDawnPressure(state: GameState, previousPhase: number): void {
  const phase = dawnPhase(state);
  if (phase > previousPhase) {
    addAlarm(state, DAWN_ALARM_GAIN);
    state.people.forEach((person) => {
      if (person.role === 'police' || person.hp <= 0) return;
      person.alert = clamp(person.alert + DAWN_ALERT_GAIN, 0, 100);
    });
    log(state, `天光又亮了一分（第 ${phase + 1} 阶段）：屋里的人开始躁动，警报 +${DAWN_ALARM_GAIN}。`);
  }
  const remaining = state.mission.turns - state.turn;
  if (remaining >= 0 && remaining < DAWN_PHASE_TURNS) {
    addAlarm(state, DAWN_LATE_ALARM);
  }
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

/**
 * 玩家做完一个动作之后：房子不会站着等你。
 * 跑掉的人继续跑、求救的人继续摸电话、救援的人继续包扎——只不过一回合有上限。
 */

/** 反应层已搬到 npc/ai/reactions.ts；这里保留引擎侧入口（签名不变）。 */
function sameRoomKillerReact(state: GameState, armed: boolean): void { aiSameRoomKillerReact(aiHost, state, armed); }
function npcReact(state: GameState): void { aiNpcReact(aiHost, state); }
function npcWitnessEvent(state: GameState, room: RoomId, event: NpcWitnessedEvent, subjectId: string): number { return aiNpcWitnessEvent(aiHost, state, room, event, subjectId); }
function npcOnPlayerEnter(state: GameState, barricadedEntry = false): void { aiNpcOnPlayerEnter(aiHost, state, barricadedEntry); }


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
    newcomer.revealedActions = Math.max(newcomer.revealedActions ?? 0, 4);
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
  sameRoomKillerReact(state, state.lastPlayerRoom === state.playerRoom);
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
  // 恶魔附身以行动而非回合计时；每次行动消耗的尾随值由统一修正层决定。
  if (state.killer === '迈克尔·迈尔斯' && state.possessed) {
    const cost = possessCost(state);
    state.stalkMeter = Math.max(0, state.stalkMeter - cost);
    if (state.stalkMeter === 0) {
      state.possessed = false;
      log(state, '尾随值耗尽，恶魔附身结束。');
    } else {
      log(state, `恶魔附身消耗 ${cost} 点尾随值（剩余 ${state.stalkMeter}/100）。`);
    }
  }
  // 玩家的一次行动结束：痕迹的寿命按行动数走，不是按回合。
  // 这让「跟着脚印走」变成一段短线索，走错再回头就真的断了。
  state.trailClock += 1;
  state.lastPlayerRoom = state.playerRoom;
  pruneTrails(state);
  pruneDisturbances(state);
  // 首次发现：只在真正看见这个人时奖励一次。
  state.people.forEach((person) => {
    if (person.role === 'police' || person.hp <= 0) return;
    if (!isPersonVisible(state, person)) return;
    awardBlood(state, 'hunt', `首次发现 · ${person.name}`, BLOOD.firstDiscover, { key: `discover:${person.id}`, limit: 1 });
  });
  state.powerUsedThisAction = false;
}

/* ==================================================================== */
/*  寻路                                                                */
/* ==================================================================== */


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

/** 幸存者亲眼目击的事件类型由 AI 层定义 */


/** 生死线已搬到 npc/lifecycle.ts；这里保留引擎侧入口（签名不变）。 */
function killPerson(state: GameState, person: Person): void { aiKillPerson(aiHost, state, person); }
function damagePerson(state: GameState, person: Person, amount: number, options: { affectFear?: boolean; forceFlee?: boolean } = {}): void { aiDamagePerson(aiHost, state, person, amount, options); }
export function carryPerson(state: GameState, personId: string): boolean { return aiCarryPerson(aiHost, state, personId); }
export function dropCarriedPerson(state: GameState): boolean { return aiDropCarriedPerson(aiHost, state); }
export function executeCarriedPerson(state: GameState, methodId: ExecutionMethodId): boolean { return aiExecuteCarriedPerson(aiHost, state, methodId); }
function executePerson(state: GameState, person: Person): void { aiExecutePerson(aiHost, state, person); }
function rescuePerson(state: GameState, person: Person): void { aiRescuePerson(aiHost, state, person); }
function healPerson(state: GameState, person: Person, amount = 1): void { aiHealPerson(aiHost, state, person, amount); }

/* ==================================================================== */
/*  目标选择                                                            */
/* ==================================================================== */


/* ==================================================================== */
/*  效果解释器                                                          */
/* ==================================================================== */

function checkCond(state: GameState, cond: Cond): boolean { return aiCheckCond(aiHost, state, cond); }
function selectPeople(state: GameState, who: Who): Person[] { return aiSelectPeople(aiHost, state, who); }

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
    destroyCurrentObject: (current) => {
      const room = current.playerRoom;
      const hasObject = current.powerCircuits.some((circuit) => circuit.breakerRoom === room && !circuit.broken)
        || phoneWorks(current, room)
        || (RADIO_ROOMS.includes(room) && !current.sabotage.includes('radio'));
      return hasObject && sabotageSiteItem(current, { free: true, suppressAfterAction: true });
    },
  });
  if (!phoneWasCut && state.phoneCut) {
    awardBlood(state, 'control', '切断电话线', BLOOD.phone, { key: 'phone:cut', limit: 1 });
  }
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
 * 后院是唯一的出口。判定不能只看单次移动的结果：只要人站在后院并且确实慌了
 * （警觉够高或已经开始翻篱笆），就算他要走。
 */
/** 逃跑与喊人已经搬到 npc/ai/actions.ts，这里只保留引擎侧的同名入口。 */
function fleeAway(state: GameState, person: Person, quiet = false, ignoreFear = false): boolean {
  return aiFleeAway(aiHost, state, person, quiet, ignoreFear);
}

/** 喊叫：同房间的人立刻警觉，隔壁房间的人隔着墙听见 */
function shout(state: GameState, person: Person, base = 18): void {
  aiShout(aiHost, state, person, base);
}


/** 支援类行动已搬到 npc/ai/support.ts；这里保留引擎侧入口（签名不变）。 */
function counterAttack(state: GameState, person: Person): void { aiCounterAttack(aiHost, state, person); }
function barricadeRoom(state: GameState, person: Person): boolean { return aiBarricadeRoom(aiHost, state, person); }
function tryRescue(state: GameState, person: Person): boolean { return aiTryRescue(aiHost, state, person); }
function tryAidRun(state: GameState, person: Person): boolean { return aiTryAidRun(aiHost, state, person); }
function tryCall(state: GameState, person: Person): boolean { return aiTryCall(aiHost, state, person); }
function finishCall(state: GameState, person: Person, device: string): void { aiFinishCall(aiHost, state, person, device); }


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

/** 打断时幸存者的一次额外行动：能跑的跑，无法移动时改为处理个人事务 */
function survivorsActOnce(state: GameState, actorId: string): void {
  const before = snapshotRooms(state);
  for (const p of npcs(state)) {
    if (p.hp <= 0 || p.hidden || p.blockedTurns > 0 || p.movesThisTurn >= REACT_MOVE_CAP) continue;
    const from = p.room;
    if (p.room === state.playerRoom) { if (p.alert >= 40) fleeAway(state, p); }
    else if (p.alert >= 40) actOnInstinct(state, p);
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







/** 决策入口：新 AI（npc/ai/runtime.ts）。 */
function actOnInstinct(state: GameState, person: Person): void {
  executeDecision(aiHost, state, person);
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
    person.activity = '发现地上的捕兽夹，正小心观察';
    log(state, `${person.name} 在${roomName(person.room)}发现了捕兽夹，暂时没有踩上去。`);
    return;
  }
  trap.armed = false;
  trap.triggeredBy = person.id;
  trap.triggeredTurn = state.turn;
  state.lastTrapTriggerId = person.id;
  state.trapTriggerCount += 1;
  awardBlood(state, 'cunning', `陷阱捕获 · ${person.name}`, BLOOD.trapCapture, { key: `trap:${trap.id}`, limit: 1 });
  awardBlood(state, 'control', `幸存者触发陷阱 · ${person.name}`, BLOOD.trapTrigger, { key: `trap-control:${trap.id}`, limit: 1 });
  markBloodEvent(state, 'trap:trigger');
  person.trapTriggered = true;
  person.revealedActions = Math.max(person.revealedActions ?? 0, 2);
  const trapDamage = trapDamageOf(state);
  const holdTurns = trapHoldTurns(state);
  person.hp = Math.max(0, person.hp - trapDamage);
  person.alert = 100;
  person.blockedTurns = holdTurns;
  if (person.hp <= 0) {
    person.hp = 0;
    person.downedTurns = 0;
    person.activity = '被捕兽夹击倒，倒在地上';
    log(state, `${person.name} 踩中捕兽夹，受到 ${trapDamage} 点伤害并被击倒，发出尖叫！`);
  } else {
    person.activity = '脚踝被捕兽夹咬住，暂时无法移动';
    log(state, `${person.name} 踩中捕兽夹，受到 ${trapDamage} 点伤害并被困住 ${holdTurns} 回合，发出尖叫！`);
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

/**
 * 乌鸦：幸存者在有乌鸦的房间里做事，就会惊起一群乌鸦。
 * 同一间屋两次行动内不重复报，蹲着走的人有机会不惊动它们。
 */
function crowAlertFor(state: GameState, person: Person): void {
  if (person.hp <= 0 || person.role === 'police') return;
  if (!(state.crows ?? []).includes(person.room)) return;
  if (isQuietMove(state, person)) return;
  state.crowAlerts ??= {};
  const last = state.crowAlerts[person.room] ?? -99;
  if (state.trailClock - last < 2) return;
  state.crowAlerts[person.room] = state.trailClock;
  state.crowAlertCount = (state.crowAlertCount ?? 0) + 1;
  state.crowTriggered ??= [];
  if (!state.crowTriggered.includes(person.room)) state.crowTriggered.push(person.room);
  state.disturbances.push({ room: person.room, turn: state.turn, clock: state.trailClock, label: '乌鸦被惊起' });
  if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
  log(state, `${roomName(person.room)}方向传来一阵乌鸦扑棱棱的振翅声——有人在那里动了。`);
}

/** 回合循环还在 npc/ai/turn.ts；决策入口是 actOnInstinct。 */
function npcTurn(state: GameState): void {
  aiNpcTurn(aiHost, state);
  tickAllChase(state);
}

/** 根据 NPC 真正掌握的信息与当前行为生成头顶短对白。 */
/** 对白已搬到 npc/ai/dialogue.ts；这里保留引擎侧入口。 */
export function updateNpcDialogue(state: GameState): void {
  aiUpdateNpcDialogue(state);
}

/** 回合三阶段已搬到 turn/phases.ts；这里保留引擎侧入口。 */
function callPhase(state: GameState): void { aiCallPhase(aiHost, state); }
function escapePhase(state: GameState): void { aiEscapePhase(aiHost, state); }


/* ==================================================================== */
/*  警察                                                                */
/* ==================================================================== */


/** 警察系统已搬到 npc/police.ts；这里保留引擎侧入口。 */
function policePhase(state: GameState): void {
  aiPolicePhase(aiHost, state);
}


/* ==================================================================== */
/*  创建对局                                                            */
/* ==================================================================== */

/* ---------- 场地设施 ---------- */

/* ==================================================================== */
/*  玩家行动                                                            */
/* ==================================================================== */

export function effectiveCost(defId: string, state: GameState): number {
  const card = CARD_MAP[defId];
  if (!card) return 99;
  return Math.max(0, card.cost - state.discount);
}

/** 把一句话写进对局日志：给界面做即时反馈用（例如点击了走不进去的房间）。 */
export function noteToPlayer(state: GameState, text: string): void {
  log(state, text);
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
    awardBlood(state, 'hunt', '成功追踪', BLOOD.track, { key: 'track', limit: 3 });
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

/** 探索动作已搬到 actions/explore.ts；这里保留引擎侧入口（签名不变）。 */
export function breakBarricade(state: GameState, room: RoomId): boolean { return aiBreakBarricade(aiHost, state, room); }
export function breakDoor(state: GameState, room: RoomId): boolean { return aiBreakDoor(aiHost, state, room); }
export function waitAction(state: GameState): boolean { return aiWaitAction(aiHost, state); }
export function movePlayer(state: GameState, room: RoomId): boolean { return aiMovePlayer(aiHost, state, room); }
export function lookAround(state: GameState): boolean { return aiLookAround(aiHost, state); }
export function cancelLookSelection(state: GameState): boolean { return aiCancelLookSelection(aiHost, state); }
export function lookAtRoom(state: GameState, room: RoomId): boolean { return aiLookAtRoom(aiHost, state, room); }
export function interactCabinet(state: GameState): boolean { return aiInteractCabinet(aiHost, state); }
export function interactTotem(state: GameState, reward: 'draw' | 'energy'): boolean { return aiInteractTotem(aiHost, state, reward); }
export function searchRoom(state: GameState): boolean { return aiSearchRoom(aiHost, state); }




/** 出牌逻辑已搬到 actions/cards.ts；这里保留引擎侧入口（签名不变）。 */
export function playCard(state: GameState, cardUid: string): boolean {
  return aiPlayCard(aiHost, state, cardUid);
}

/* ==================================================================== */
/*  挥刀：唯一的伤害来源                                                 */
/* ==================================================================== */

/** 战斗动作已搬到 actions/combat.ts；这里保留引擎侧入口（签名不变）。 */
export function attackBlockReason(state: GameState, targetId?: string, costOverride = ATTACK_COST): string { return aiAttackBlockReason(aiHost, state, targetId, costOverride); }
export function canAttack(state: GameState, targetId?: string): boolean { return aiCanAttack(aiHost, state, targetId); }
export function executeBlockReason(state: GameState, targetId?: string): string { return aiExecuteBlockReason(aiHost, state, targetId); }
export function executeDownedPerson(state: GameState, targetId?: string): boolean { return aiExecuteDownedPerson(aiHost, state, targetId); }
export function attack(state: GameState, targetId?: string, options: { costOverride?: number; bleedOnHit?: boolean; bleedTurns?: number; hitStatus?: 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed'; hitStatusTurns?: number } = {}): boolean { return aiAttack(aiHost, state, targetId, options); }

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



/** 只查看玩家明确点选的一个相邻房间，消耗 1 AP。 */





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
    if (/修复|电闸|设施|处理/.test(person.activity)) {
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

/** 环境事件已搬到 world/environment.ts；这里保留引擎侧入口。 */
function triggerEnvironmentalEvent(state: GameState): void {
  aiTriggerEnvironmentalEvent(aiHost, state);
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
  circuit.enabled = circuit.enabled === false;
  awardBlood(state, 'control', `操作电闸 · ${circuit.name}`, BLOOD.breaker, { key: `breaker:${circuit.id}`, limit: 1 });
  addAlarm(state, 1);
  log(state, circuit.enabled
    ? `你合上了${circuit.name}电闸，供电恢复。`
    : `你拉下了${circuit.name}电闸，${circuit.affectedRooms.map(roomName).join('、')}陷入黑暗，受影响房间的电子门锁失效。`);
  state.attackReady = true;
  afterPlayerAction(state);
  checkImmediateWin(state);
  return true;
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
  if (target.kind === 'door') {
    state.roomLocks[target.room] = 0;
    awardBlood(state, 'control', `撞开门锁 · ${roomName(target.room)}`, BLOOD.breakDoor, { key: `door:${target.room}`, limit: 1 });
    log(state, `你用蛮力撞开通往${roomName(target.room)}的门锁！屋内的人被巨响惊动。`);
    npcs(state).filter((p) => p.room === target.room && p.hp > 0).forEach((p) => {
      p.alert = clamp(p.alert + 24, 0, 100);
      p.fear = clamp(p.fear + 12, 0, 100);
    });
    addAlarm(state, 5);
  } else if (target.kind === 'phone') {
    state.brokenPhones ??= [];
    state.brokenPhones.push(target.room);
    awardBlood(state, 'control', `破坏电话 · ${roomName(target.room)}`, BLOOD.phone, { key: `phone:${target.room}`, limit: 1 });
    log(state, `你砸烂了${roomName(target.room)}的电话，这间屋子暂时没法报警了。`);
    addAlarm(state, 2);
  } else if (target.kind === 'radio') {
    state.sabotage.push('radio');
    log(state, '你砸毁了备用无线电，幸存者无法再通过它协调求救。');
    addAlarm(state, 2);
  } else {
    const circuit = state.powerCircuits.find((c) => c.breakerRoom === state.playerRoom && !c.broken);
    if (!circuit) return false;
    circuit.broken = true;
    circuit.enabled = false;
    awardBlood(state, 'control', `破坏电闸 · ${circuit.name}`, BLOOD.breaker, { key: `breaker:${circuit.id}`, limit: 1 });
    log(state, `你砸毁了${circuit.name}控制箱！${circuit.affectedRooms.map(roomName).join('、')}立即断电，灯光熄灭。`);
  }

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
/** 杀手能力已搬到 actions/powers.ts；这里保留引擎侧入口（签名不变）。 */
export function blinkPlayer(state: GameState, room: RoomId): boolean { return aiBlinkPlayer(aiHost, state, room); }
export function throwHuntressHatchet(state: GameState, targetId: string): boolean { return aiThrowHuntressHatchet(aiHost, state, targetId); }
export function refillHuntressHatchets(state: GameState): boolean { return aiRefillHuntressHatchets(aiHost, state); }
export function collectTrapCache(state: GameState): boolean { return aiCollectTrapCache(aiHost, state); }
export function recoverBearTrap(state: GameState): boolean { return aiRecoverBearTrap(aiHost, state); }
export function canUsePower(state: GameState, powerId: string): boolean { return aiCanUsePower(aiHost, state, powerId); }
export function powerBlockReason(state: GameState, powerId: string): string { return aiPowerBlockReason(aiHost, state, powerId); }
export function usePower(state: GameState, powerId: string): boolean {
  state.powerUsedThisAction = true;
  return aiUsePower(aiHost, state, powerId);
}

/* ==================================================================== */
/*  胜负                                                                */
/* ==================================================================== */

function checkImmediateWin(state: GameState): void {
  if (state.result || state.mission.mode === 'free') return;
  const required = (state.mission.tasks ?? []).filter((task) => !task.optional);
  if (required.length > 0 && required.every((task) => missionTaskProgress(state, task) >= task.target) && !state.missionPrimaryCompleted) {
    state.missionPrimaryCompleted = true;
    log(state, '主目标已完成！你可以立即结算，也可以继续猎杀，争取额外任务与行为血点。');
  }
}

function finish(state: GameState, result: ResultKind): void {
  if (state.result) return;
  state.result = result;
  state.phase = 'gameover';
  finalizeBloodPoints(state);
  const gearPct = modifierValue(state, 'bloodPointPct');
  if (gearPct > 0) {
    const subtotal = bloodPointTotal(state);
    awardBlood(state, 'hunt', `配件加成 · 血点 +${gearPct}%`, Math.round(subtotal * gearPct / 100), { key: 'gear:blood-points' });
  }
  state.rewardCards = [];
}

/** 从牌库抽牌；牌库耗尽时正常洗回弃牌堆。 */
function drawForPlayer(state: GameState, count: number): number {
  return drawCards(state, count);
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

/** 回合总循环已搬到 turn/ending.ts；这里保留引擎侧入口。 */
export function endTurn(state: GameState): void {
  aiEndTurn(aiHost, state);
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

export { generateMission };
