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
import { SPECIAL_SURVIVORS, SURVIVOR_MAP, SURVIVORS } from './survivors';
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
} from './types';

/* ==================================================================== */
/*  常量                                                                */
/* ==================================================================== */

/** NPC 能逃出这栋房子的地方 */
export const ESCAPE_ROOMS: RoomId[] = ['garden'];
/** 倒地后撑不过这么多回合就会死 */
const BLEEDOUT_TURNS = 3;
/** 团队警戒上限：到 100 直接判负 */
export const ALARM_MAX = 100;
/** 站在后院的人至少要有这么高的警觉，才会想到翻篱笆（否则只是路过） */
const ESCAPE_ALERT_MIN = 35;

export const INTENT_LABEL: Record<NpcIntent, string> = {
  idle: '做自己的事',
  wary: '起疑',
  flee: '逃跑中',
  barricade: '正在堵门',
  call: '正在打电话',
  hide: '躲起来了',
  escape: '翻篱笆',
  stunned: '动不了',
  heal: '正在治疗',
  rescue: '正在救援',
};

export const GOAL_LABEL: Record<NpcGoal, string> = {
  phone: '想打电话报警',
  exit: '想从后院逃走',
  hide: '想找个地方躲起来',
  gather: '想把人聚起来',
  weapon: '想找东西反抗',
  panic: '只想活下去',
  help: '想救同伴',
};

export const ARCH_LABEL: Record<Archetype, string> = {
  alert: '警觉型',
  defiant: '反抗型',
  caller: '求救型',
  rescuer: '救援型',
  hider: '躲藏型',
  brave: '英勇型',
};

export const ARCH_DESC: Record<Archetype, string> = {
  alert: '一发现你就跑，边跑边喊，把消息传给隔壁房间。',
  defiant: '会推家具堵门，会去厨房拿刀——你进门时可能被反击掉步数。',
  caller: '摸向书房或大厅的电话；电话断了会去地下室用无线电。',
  rescuer: '优先治疗受伤、拉起倒地的同伴，是处决最大的障碍。',
  hider: '钻进柜子或床底，不搜出来就找不到，也打不到。',
  brave: '先去厨房拿武器，再把人聚起来，会正面挡你的路。',
};

export const HEALTH_LABEL: Record<Health, string> = {
  healthy: '健康',
  injured: '受伤',
  downed: '倒地',
};

/* ==================================================================== */
/*  小工具                                                              */
/* ==================================================================== */

let uidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${uidCounter++}`;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function log(state: GameState, text: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${text}`);
  if (state.log.length > 60) state.log.length = 60;
}

/** 健康 / 受伤 / 倒地，由血量推导，不单独存一份避免不同步 */
export function conditionOf(person: Person): Health {
  if (person.hp >= 2) return 'healthy';
  if (person.hp === 1) return 'injured';
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

function findVictim(state: GameState, room: RoomId, maxHp = Infinity): Person | undefined {
  // 优先挑还站着的人：倒地的人需要玩家主动补刀，不能被自动选中
  const here = peopleInRoom(state, room).filter(
    (p) => p.role !== 'police' && p.hp > 0 && p.hp <= maxHp,
  );
  return (
    here.find((p) => p.role === 'target' && p.marked) ??
    here.find((p) => p.role === 'target') ??
    here.find((p) => p.role === 'civilian')
  );
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

/** 本回合是否处于「伏击」状态：推门进去也不会惊动任何人 */
function ambushActive(state: GameState): boolean {
  return state.ambushTurn === state.turn;
}

function addWanted(state: GameState, amount: number): void {
  if (amount > 0) state.heatTurn = state.turn;
  state.wanted = clamp(state.wanted + amount, 0, 10);
}

/** 团队警戒：整栋房子的紧张程度，满 100 任务失败 */
export function addAlarm(state: GameState, amount: number): void {
  state.alarm = clamp(state.alarm + amount, 0, ALARM_MAX);
  if (state.alarm >= ALARM_MAX && !state.result) {
    state.resultReason = '团队警戒拉满：所有幸存者都确认了你的存在，房子已经不再属于你。';
    finish(state, 'failed');
  }
}

/** 布局牌对报警通缉值的削弱 */
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

/** 当前能不能看见这个房间：你所在的房间、相邻房间、被侦查过的房间 */
export function isRoomVisible(state: GameState, room: RoomId): boolean {
  if (room === state.playerRoom) return true;
  if (ROOM_MAP[state.playerRoom].neighbors.includes(room)) return true;
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
/*  寻路                                                                */
/* ==================================================================== */

function roomDistance(from: RoomId, to: RoomId): number {
  if (from === to) return 0;
  const queue: Array<[RoomId, number]> = [[from, 0]];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const [cur, d] = queue.shift()!;
    for (const next of ROOM_MAP[cur].neighbors) {
      if (seen.has(next)) continue;
      if (next === to) return d + 1;
      seen.add(next);
      queue.push([next, d + 1]);
    }
  }
  return 99;
}

/** BFS 求从 from 到 to 的下一步；无法到达返回 null。 */
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

function nearestOf(from: RoomId, candidates: RoomId[]): RoomId {
  let best = candidates[0];
  let bestLen = Infinity;
  for (const c of candidates) {
    const len = roomDistance(from, c);
    if (len < bestLen) {
      bestLen = len;
      best = c;
    }
  }
  return best;
}

/* ==================================================================== */
/*  生死：健康 → 受伤 → 倒地 → 死亡                                     */
/* ==================================================================== */

function killPerson(state: GameState, person: Person): void {
  if (!state.people.some((p) => p.id === person.id)) return;
  state.people = state.people.filter((p) => p.id !== person.id);
  state.pinnedPeople = state.pinnedPeople.filter((id) => id !== person.id);
  state.kills += 1;
  state.killsThisTurn += 1;
  if (person.marked) state.markedKilled += 1;
  state.lastCrimeRoom = state.playerRoom;

  // 只有被看见的击杀才会推高通缉值。悄悄做掉的、屋子里没人的，
  // 外面只知道「又少了一个人」——那是团队警戒该管的事，不是通缉。
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

  const before = person.hp;
  person.hidden = false;
  person.blockedTurns = 0;

  if (before <= 0) {
    // 已经倒地：这一下就是补刀
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
    log(state, `${person.name} 被打倒在地上。他还没有死——再打一次，或者等他自己流干。`);
    addAlarm(state, 4);
    peopleInRoom(state, person.room)
      .filter((p) => p.id !== person.id && p.role !== 'police')
      .forEach((p) => {
        p.alert = clamp(p.alert + 30, 0, 100);
        p.intent = p.intent === 'idle' ? 'wary' : p.intent;
      });
    return;
  }

  // 受伤：立刻中断手上的一切，优先逃命
  person.alert = 100;
  person.intent = 'flee';
  person.activity = '捂着伤口逃窜';
  person.goal = 'exit';
  log(state, `${person.name} 受伤了（${person.hp}/2），丢下手里的东西就跑。`);
  peopleInRoom(state, state.playerRoom)
    .filter((p) => p.id !== person.id && p.role !== 'police')
    .forEach((p) => {
      p.alert = clamp(p.alert + 18, 0, 100);
    });
  addAlarm(state, 3);
  // 受伤后立刻拉开距离，这是玩家必须提前封路的原因
  fleeAway(state, person);
}

function executePerson(state: GameState, person: Person): void {
  if (person.hp > 0) {
    log(state, `${person.name} 还站着，处决需要先把他打倒。`);
    return;
  }
  addAlarm(state, 8);
  log(state, `你处决了 ${person.name}。`);
  killPerson(state, person);
}

function rescuePerson(state: GameState, person: Person): void {
  if (person.hp > 0) return;
  person.hp = 1;
  person.downedTurns = 0;
  person.intent = 'flee';
  person.activity = '被人从地上拖了起来';
  addAlarm(state, 2);
  log(state, `${person.name} 被同伴救起，重新站着（受伤）。`);
}

function healPerson(state: GameState, person: Person, amount = 1): void {
  if (person.hp <= 0) return;
  const before = person.hp;
  person.hp = Math.min(2, person.hp + amount);
  if (person.hp > before) log(state, `${person.name} 的伤口被处理过（${person.hp}/2）。`);
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
      const v = findVictim(state, state.playerRoom);
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
    case 'downedAny':
      return npcs(state).filter((p) => p.hp <= 0);
    case 'injuredAny':
      return npcs(state).filter((p) => p.hp === 1);
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
        (p) => p.role !== 'police' && p.hp > 0 && p.hp < 2,
      );
    case 'targetAway':
      return npcs(state).some((p) => p.role === 'target' && p.room !== state.playerRoom && p.hp > 0);
  }
}

/* ==================================================================== */
/*  效果解释器                                                          */
/* ==================================================================== */

export function runOps(state: GameState, ops: Op[]): void {
  for (const op of ops) {
    switch (op.op) {
      case 'damage': {
        const list = selectPeople(state, op.who).filter((p) => p.hp <= (op.maxHp ?? Infinity));
        if (!list.length) {
          log(state, '没有可以下手的人。');
          break;
        }
        list.forEach((p) => damagePerson(state, p, op.amount));
        break;
      }
      case 'down': {
        const list = selectPeople(state, op.who).filter((p) => p.hp === 1);
        if (!list.length) {
          log(state, '没有受伤的人可以被击倒。');
          break;
        }
        list.forEach((p) => damagePerson(state, p, 1));
        break;
      }
      case 'execute': {
        const list = selectPeople(state, op.who).filter((p) => p.hp <= 0);
        if (!list.length) {
          log(state, '没有倒地的人可以处决。');
          break;
        }
        list.forEach((p) => executePerson(state, p));
        break;
      }
      case 'kill': {
        const list = selectPeople(state, op.who);
        if (!list.length) {
          log(state, '没有可以下手的人。');
          break;
        }
        list.forEach((p) => killPerson(state, p));
        break;
      }
      case 'wanted':
        addWanted(state, op.amount);
        break;
      case 'wantedHalf': {
        const before = state.wanted;
        state.wanted = Math.floor(state.wanted / 2);
        if (before !== state.wanted) log(state, `通缉值从 ${before} 降至 ${state.wanted}。`);
        break;
      }
      case 'alert':
        selectPeople(state, op.who).forEach((p) => {
          p.alert = clamp(p.alert + op.amount, 0, 100);
          if (op.amount > 0 && p.intent === 'idle') p.intent = 'wary';
        });
        break;
      case 'block':
        selectPeople(state, op.who).forEach((p) => {
          p.blockedTurns = Math.max(p.blockedTurns, op.turns);
          p.intent = 'stunned';
        });
        break;
      case 'pin':
        selectPeople(state, op.who).forEach((p) => {
          if (!state.pinnedPeople.includes(p.id)) state.pinnedPeople.push(p.id);
        });
        break;
      case 'move': {
        const dest = resolveDest(state, op.to);
        selectPeople(state, op.who)
          .filter((p) => p.hp > 0)
          .forEach((p) => movePersonTo(state, p, dest, op.clearAlert));
        break;
      }
      case 'teleportPlayer': {
        const dest = resolveDest(state, op.to);
        if (dest !== state.playerRoom) {
          log(state, `你移动到${roomName(dest)}。`);
          state.playerRoom = dest;
          markExplored(state, dest);
          npcOnPlayerEnter(state);
        }
        break;
      }
      case 'lockRoom': {
        const dest = resolveDest(state, op.room);
        state.roomLocks[dest] = Math.max(state.roomLocks[dest] ?? 0, op.turns);
        log(state, `${roomName(dest)}被封锁 ${op.turns} 回合。`);
        break;
      }
      case 'scout': {
        const turns = op.turns ?? 2;
        const rooms = op.all ? ROOMS.map((r) => r.id) : [op.to ? resolveDest(state, op.to) : state.playerRoom];
        rooms.forEach((r) => scoutRoom(state, r, turns));
        log(state, op.all ? `你点亮了整栋房子的位置（${turns} 回合）。` : `${roomName(rooms[0])}的情况被你摸清了。`);
        break;
      }
      case 'search': {
        const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
        const found = here.filter((p) => p.hidden);
        found.forEach((p) => {
          p.hidden = false;
          p.alert = clamp(p.alert + 35, 0, 100);
          p.intent = 'flee';
          log(state, `${p.name} 被你从藏身处拖了出来。`);
        });
        if (!found.length) log(state, '这里没有藏着人。');
        scoutRoom(state, state.playerRoom, 2);
        break;
      }
      case 'track':
        selectPeople(state, op.who).forEach((p) => {
          p.trackedTurns = Math.max(p.trackedTurns, op.turns);
          p.hidden = false;
          log(state, `你记住了 ${p.name} 的气味，接下来 ${op.turns} 回合他跑不掉。`);
        });
        break;
      case 'lure': {
        const dest = resolveDest(state, op.to);
        const pool = standing(state)
          .filter((p) => p.room !== dest && !p.hidden && p.blockedTurns === 0)
          .sort((a, b) => roomDistance(a.room, dest) - roomDistance(b.room, dest))
          .slice(0, op.count);
        pool.forEach((p) => {
          const step = nextStepToward(state, p.room, dest, [state.playerRoom]);
          if (step) {
            movePersonTo(state, p, step);
            p.intent = 'wary';
            p.activity = '循着声音走过去';
          } else if (p.room !== dest) {
            p.room = dest;
            log(state, `${p.name} 被声音引到了${roomName(dest)}。`);
          }
        });
        if (!pool.length) log(state, '没人上钩。');
        break;
      }
      case 'alarm':
        addAlarm(state, op.amount);
        if (op.amount < 0) log(state, `团队警戒降至 ${state.alarm}/100。`);
        break;
      case 'sabotage':
        if (op.key === 'phone') {
          state.phoneCut = true;
          if (!state.sabotage.includes('phone')) state.sabotage.push('phone');
          log(state, '电话线被你剪断，求救的路只剩下一台旧无线电。');
        } else if (op.key === 'exit') {
          state.exitBlockedTurns = Math.max(state.exitBlockedTurns, 2);
          log(state, '后院的门被你从里面钉死了。');
        } else if (op.key === 'radio') {
          if (!state.sabotage.includes('radio')) state.sabotage.push('radio');
          state.phoneCut = true;
          log(state, '无线电的真空管被你踩碎，地下室里再没有声音能传出去。');
        } else if (op.key === 'lights') {
          if (!state.sabotage.includes('lights')) state.sabotage.push('lights');
          state.noAlarmTurn = true;
          addAlarm(state, -4);
          log(state, '总闸落下，整栋房子沉进黑里。');
        }
        break;
      case 'draw':
        drawCards(state, op.amount);
        break;
      case 'energy':
        state.energy = clamp(state.energy + op.amount, 0, 99);
        break;
      case 'steps':
        state.steps = clamp(state.steps + op.amount, 0, 99);
        if (op.amount > 0) log(state, `本回合步数 +${op.amount}。`);
        break;
      case 'stun':
        state.stunTurns += op.amount;
        log(state, `你被绊了一下，下回合少 ${state.stunTurns} 步。`);
        break;
      case 'evidence':
        state.evidence += op.amount;
        log(state, `证据 ${op.amount >= 0 ? '+' : ''}${op.amount}（当前 ${state.evidence}）。`);
        break;
      case 'discount':
        state.discount = Math.min(2, state.discount + op.amount);
        log(state, `本回合后续卡牌费用 -${op.amount}。`);
        break;
      case 'bonusDamage':
        state.bonusDamage += op.amount;
        log(state, `下次攻击伤害 +${op.amount}。`);
        break;
      case 'arrestThreshold':
        state.arrestThreshold += op.amount;
        log(state, `警察的逮捕阈值提高到 ${state.arrestThreshold}。`);
        break;
      case 'reveal': {
        const list = npcs(state)
          .filter((p) => !p.hidden)
          .map((p) => `${p.name}（${roomName(p.room)}·${INTENT_LABEL[p.intent]}）`)
          .join('、');
        log(state, list ? `你摸清了所有人的位置：${list}。` : '房子里安静得没有人。');
        scoutRoom(state, state.playerRoom, 2);
        break;
      }
      case 'heal':
        selectPeople(state, op.who).forEach((p) => healPerson(state, p, op.amount));
        break;
      case 'rescue':
        selectPeople(state, op.who).forEach((p) => rescuePerson(state, p));
        break;
      case 'bleed':
        selectPeople(state, op.who).forEach((p) => {
          p.bleed += op.amount;
        });
        break;
      case 'stalk':
        state.stalkMeter = clamp(state.stalkMeter + op.amount, 0, 100);
        log(state, `尾随值 ${state.stalkMeter}/100。`);
        break;
      case 'ambush': {
        state.ambushTurn = state.turn;
        log(state, '你收住了呼吸——这一回合推门进去，不会有任何人察觉。');
        break;
      }
      case 'pursue': {
        const maxD = op.distance ?? 2;
        const pool = selectPeople(state, op.who)
          .filter((p) => p.hp > 0 && p.room !== state.playerRoom)
          .filter((p) => roomDistance(p.room, state.playerRoom) <= maxD)
          .sort((a, b) => roomDistance(a.room, state.playerRoom) - roomDistance(b.room, state.playerRoom));
        const target = pool[0];
        if (!target) {
          log(state, '身边没有可以追的人。');
          break;
        }
        const from = roomName(state.playerRoom);
        state.playerRoom = target.room;
        markExplored(state, target.room);
        log(state, `你贴着他的脚步声从${from}追进了${roomName(target.room)}。`);
        target.alert = clamp(target.alert + 12, 0, 100);
        npcOnPlayerEnter(state);
        break;
      }
      case 'silenceAlarm':
        state.alarmSilencedUntilTurn = Math.max(state.alarmSilencedUntilTurn, state.turn + op.turns);
        log(state, `接下来 ${op.turns} 回合没有人能报警。`);
        break;
      case 'flag':
        switch (op.key) {
          case 'phoneCut':
            state.phoneCut = true;
            break;
          case 'wiretap':
            state.wiretap = true;
            break;
          case 'poltergeist':
            state.poltergeist = true;
            break;
          case 'policeBlocked':
            state.policeBlocked = true;
            break;
          case 'noAlarm':
            state.noAlarmTurn = true;
            break;
          case 'exitBlocked':
            state.exitBlockedTurns = Math.max(state.exitBlockedTurns, Number(op.value ?? 1));
            log(state, `逃生点被封住 ${state.exitBlockedTurns} 回合。`);
            break;
          case 'clearBarricade': {
            const cleared = state.barricades.filter(
              (r) => r === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(r),
            );
            state.barricades = state.barricades.filter((r) => !cleared.includes(r));
            state.clearedObstacles = Array.from(new Set([...state.clearedObstacles, ...cleared]));
            log(state, cleared.length
              ? `你撞开了${cleared.map(roomName).join('、')}的堵门。`
              : '这里没有需要撞开的东西。');
            break;
          }
          case 'freeMove':
            state.freeMove = true;
            break;
          case 'possessReady':
            break;
        }
        break;
      case 'log':
        log(state, op.text);
        break;
      case 'if':
        runOps(state, checkCond(state, op.cond) ? op.then : op.else ?? []);
        break;
    }
    if (state.result) return;
  }
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
function wantsToLeave(person: Person): boolean {
  if (!ESCAPE_ROOMS.includes(person.room)) return false;
  return (
    person.intent === 'escape' ||
    person.intent === 'flee' ||
    person.alert >= ESCAPE_ALERT_MIN
  );
}

/** 往离玩家最远的方向跑一步 */
function fleeAway(state: GameState, person: Person): boolean {
  if (state.pinnedPeople.includes(person.id) || person.blockedTurns > 0 || person.hp <= 0) return false;
  // 后院是出口：只有本来就打算离开、或者已经吓破胆的人才会往外跑。
  // 否则「被追」等于「自动逃生」，玩家把人逼到院子里反而在帮对手。
  const mayExit =
    person.goal === 'exit' || person.goal === 'panic' || person.alert >= 70 || person.hp < 2;
  const options = ROOM_MAP[person.room].neighbors.filter(
    (r) =>
      r !== state.playerRoom &&
      !isLocked(state, r) &&
      canStand(state, r) &&
      !state.barricades.includes(r) &&
      (mayExit || !ESCAPE_ROOMS.includes(r)),
  );
  if (!options.length) return false;
  const from = roomName(person.room);
  const best = options
    .map((r) => ({ r, d: roomDistance(r, state.playerRoom) }))
    .sort((a, b) => b.d - a.d);
  const top = best[0]?.d ?? 0;
  person.room = randomOf(best.filter((b) => b.d >= top - 1).map((b) => b.r));
  person.alert = Math.max(0, person.alert - 12);
  person.intent = 'flee';
  person.activity = '夺路而逃';
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
  // 空喊不会让房子更紧张：只有真的有人被喊醒了，团队警戒才涨
  if (learned > 0) addAlarm(state, Math.min(3, learned));
}

/** 玩家踏进房间的瞬间 */
function npcOnPlayerEnter(state: GameState): void {
  const hidden = playerIsHidden(state);
  const ambush = ambushActive(state);
  const here = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0,
  );

  here.forEach((person) => {
    const threat = SURVIVOR_MAP[person.id]?.threat;

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

    // 用「进门之前」的警觉判断他是不是早就确认了你在房子里：
    // 刚看见你和已经在追杀你是两回事，不该混成一个阈值。
    const wasAlert = person.alert;
    let gain = 30;
    if (threat === 'spiritual') gain = 65;
    else if (threat === 'alarm') gain = 55;
    else if (threat === 'lead') gain = 42;
    else if (threat === 'team') gain = 38;
    if (person.hidden) gain = Math.round(gain * 0.3);
    if (hidden && threat !== 'spiritual') gain = Math.round(gain * 0.4);
    person.alert = clamp(person.alert + gain, 0, 100);

    if (person.alert < 35) {
      person.intent = 'wary';
      person.activity = '背对着门，没有察觉';
      return;
    }

    // 已经完全确认「杀手就在这栋房子里」的人，看到门开就直接冲出去。
    // 想在他们身上拿先手，就得先用伏击类卡牌（静止隐身）。
    if (wasAlert >= 85) {
      if (person.archetype === 'defiant' && person.armed && person.room === state.playerRoom) {
        counterAttack(state, person);
        return;
      }
      if (fleeAway(state, person)) {
        log(state, `${person.name} 根本没等你站稳，已经冲出了门口。`);
        return;
      }
    }

    // 高警觉：丢下手上的事，准备夺门而逃。
    // 这里刻意不让 NPC 立刻瞬移走——玩家刚推开门，总该有一次出手的机会；
    // 真正的移动发生在回合结束的 npcTurn 里，于是「进门 → 出手 → 追」才成立。
    if (person.alert >= 62) {
      if (person.archetype === 'defiant' && person.armed && person.room === state.playerRoom) {
        counterAttack(state, person);
        return;
      }
      person.intent = 'flee';
      person.activity = '被你撞见，正往门口退';
      log(state, `${person.name} 看见了你，丢下手里的东西就往门口退。`);
      addAlarm(state, 2);
      return;
    }

    // 中警觉：按行为类型做准备
    if (person.archetype === 'defiant' && person.armed) {
      if (Math.random() < 0.45) {
        counterAttack(state, person);
        return;
      }
    }
    if (person.archetype === 'alert') {
      shout(state, person, 22);
    }
    person.intent = 'wary';
    person.activity = `${ARCH_LABEL[person.archetype]}：警惕地盯着门`;
  });
}

/** 反抗型 / 英勇型的正面反击：玩家下回合少走一步 */
function counterAttack(state: GameState, person: Person): void {
  state.stunTurns += 1;
  person.alert = 100;
  person.intent = 'wary';
  person.activity = '握着刀挡在门口';
  addAlarm(state, 4);
  log(state, `${person.name} 抄起武器朝你扑过来——你被逼退了一步（下回合少 1 步）。`);
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

/** 救援型 / 英勇型：治疗或拉起同伴，玩家在场时不敢动手 */
function tryRescue(state: GameState, person: Person): boolean {
  if (person.archetype !== 'rescuer' && person.archetype !== 'brave') return false;
  if (person.room === state.playerRoom) return false;
  if (person.blockedTurns > 0) return false;
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
  const injured = allies.find((p) => p.hp === 1);
  if (injured) {
    healPerson(state, injured, 1);
    person.intent = 'heal';
    person.activity = `正在给 ${injured.name} 包扎`;
    return true;
  }
  return false;
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
  addWanted(state, 3);
  addAlarm(state, 15);
  state.lastCrimeRoom = person.room;
  person.intent = 'flee';
  person.alert = 100;
  person.callTurns = 0;
  log(state, `${person.name} 用${device}联系上了外面：「他在${roomName(person.room)}！」通缉值 +3，警察正赶过去。`);
}

/** 按行为类型行动一步 */
function actByArchetype(state: GameState, person: Person): void {
  switch (person.archetype) {
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
      const wounded = standing(state)
        .filter((p) => p.hp === 1 && p.room !== person.room)
        .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
      if (wounded) {
        const step = nextStepToward(state, person.room, wounded.room, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = '赶去救受伤的人';
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
      if (Math.random() < 0.5) fleeAway(state, person);
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
  for (const person of [...npcs(state)]) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;

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
    if (person.hidden) {
      // 藏起来的人只在玩家进房间且警觉拉满时才会冲出去
      if (person.room === state.playerRoom && person.alert >= 85) {
        person.hidden = false;
        fleeAway(state, person);
      } else {
        person.intent = 'hide';
        person.activity = '缩在柜子里，不敢出声';
        person.alert = Math.max(0, person.alert - 4);
      }
      continue;
    }

    // 玩家就在这一间：先跑，跑不掉再对抗
    if (person.room === state.playerRoom) {
      if (person.archetype === 'defiant' && person.armed && Math.random() < 0.6) {
        counterAttack(state, person);
        continue;
      }
      if (fleeAway(state, person)) continue;
      if (person.archetype === 'defiant') barricadeRoom(state, person);
      else {
        person.intent = 'wary';
        person.activity = '贴在墙边，盯着你';
      }
      continue;
    }

    // 决定要走的人站在后院里：不再听性格指挥，专心翻篱笆
    if (wantsToLeave(person)) {
      person.intent = 'escape';
      person.activity = person.escapeProgress >= 1 ? '正翻上篱笆' : '正在翻后院篱笆';
      continue;
    }

    // 玩家离开后：救援优先于一切
    if (tryRescue(state, person)) continue;

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
      if (Math.random() < 0.5) actByArchetype(state, person);
      else person.activity = '紧张地四处张望';
      continue;
    }

    // 低警觉：做自己的事，偶尔换房间。闲逛永远走不到后院——
    // 逃出房子必须是「决定要走」，不能是散步散出去的。
    person.intent = 'idle';
    if (Math.random() < 0.3) {
      const options = ROOM_MAP[person.room].neighbors.filter(
        (r) =>
          r !== state.playerRoom &&
          !isLocked(state, r) &&
          canStand(state, r) &&
          !ESCAPE_ROOMS.includes(r),
      );
      if (options.length) person.room = randomOf(options);
    }
    person.activity = randomOf(ACTIVITIES);
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
  for (const person of [...npcs(state)]) {
    if (person.hp <= 0) continue;
    if (!wantsToLeave(person)) {
      person.escapeProgress = 0;
      continue;
    }
    // 站到后院就等于决定要走了，后面 actByArchetype 别再把他劝回去
    person.intent = 'escape';
    if (state.exitBlockedTurns > 0) {
      person.activity = '篱笆被钉死了，翻不出去';
      log(state, `${person.name} 想翻篱笆，但后门被封死了。`);
      continue;
    }
    if (person.escapeProgress < 1) {
      person.escapeProgress = 1;
      person.activity = '正在翻后院篱笆';
      log(state, `！${person.name} 已经在后院里翻篱笆了，下回合就会逃出去。`);
      continue;
    }
    state.people = state.people.filter((p) => p.id !== person.id);
    state.escaped += 1;
    addAlarm(state, 10);
    log(state, `${person.name} 翻过篱笆消失了。`);
    if (person.marked) log(state, `名单上少了一个人：${person.name} 已经不在房子里了。`);

    // 有人跑掉，剩下的人胆子会变大
    npcs(state).forEach((p) => {
      p.alert = clamp(p.alert + 12, 0, 100);
    });

    const remainingMarked = npcs(state).filter((p) => p.marked).length;
    const need = state.mission.kind === 'assassinate' ? state.mission.targetCount ?? 2 : 1;
    if (remainingMarked === 0 && state.markedKilled < need) {
      state.resultReason = '名单上的目标全部脱逃，契约作废。';
      finish(state, 'failed');
      return;
    }
    if (state.escaped >= (state.mission.maxEscaped ?? 2)) {
      state.resultReason = `已经逃走了 ${state.escaped} 个人，现场彻底失控。`;
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
  // 而不是永远贴着玩家跑。这样玩家可以甩掉他，而不是被一路加通缉到逮捕。
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
    if (state.wanted >= state.arrestThreshold) {
      state.policeLock += 1;
      if (state.policeLock >= 2) {
        log(state, '警察在现场将你逮捕。');
        state.resultReason = `通缉值 ${state.wanted} 已经超过逮捕阈值 ${state.arrestThreshold}。`;
        finish(state, 'caught');
        return;
      }
      // 给玩家一个反应窗口：这一回合还能跑
      log(
        state,
        `警察按住你的肩膀，对着通缉画像看了两秒——下回合还待在这间屋子，他就会铐上你。`,
      );
      addAlarm(state, 4);
      return;
    }
    // 擦肩而过：这一点热度不续命，否则他会一直黏着你，直到把你抓走
    state.wanted = clamp(state.wanted + 1, 0, 10);
    log(state, '警察与你擦肩而过，通缉值 +1。');
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
  log(state, `${witness.name} 目击了你，通缉值 +${gain}${alarmWitness ? '（报警者）' : ''}。`);
  if (alarmWitness) log(state, `${witness.name} 直接报出了这间房，警察正在赶来。`);
}

/* ==================================================================== */
/*  创建对局                                                            */
/* ==================================================================== */

const ACTIVITIES = [
  '在翻找抽屉',
  '靠在窗边抽烟',
  '整理桌上的文件',
  '盯着墙上的旧钟',
  '在门后犹豫',
  '把箱子搬到墙角',
  '低声哼着歌',
];

const ARCHETYPES: Archetype[] = ['alert', 'defiant', 'caller', 'rescuer', 'hider', 'brave'];

/** 按角色设定挑行为类型：有威胁设定的角色往对应的类型靠 */
function pickArchetype(survivor: (typeof SURVIVORS)[number]): Archetype {
  switch (survivor.threat) {
    case 'alarm':
      return 'caller';
    case 'lead':
      return 'alert';
    case 'team':
      return 'brave';
    case 'spiritual':
      return Math.random() < 0.5 ? 'hider' : 'defiant';
    default:
      return randomOf(ARCHETYPES);
  }
}

function goalForArchetype(archetype: Archetype): NpcGoal {
  switch (archetype) {
    case 'caller':
      return 'phone';
    case 'alert':
      return 'exit';
    case 'rescuer':
      return 'help';
    case 'brave':
      return 'weapon';
    case 'hider':
      return 'hide';
    case 'defiant':
      return Math.random() < 0.5 ? 'weapon' : 'panic';
  }
}

function makePerson(
  s: (typeof SURVIVORS)[number],
  role: PersonRole,
  room: RoomId,
  hp: number,
  marked: boolean,
): Person {
  const archetype = pickArchetype(s);
  return {
    id: s.id,
    name: s.name,
    role,
    room,
    hp,
    marked,
    archetype,
    alert: 0,
    activity: randomOf(ACTIVITIES),
    intent: 'idle',
    goal: goalForArchetype(archetype),
    blockedTurns: 0,
    bleed: 0,
    downedTurns: 0,
    escapeProgress: 0,
    callTurns: 0,
    hidden: false,
    armed: false,
    trackedTurns: 0,
    lastSeenRoom: room,
    lastSeenTurn: 0,
  };
}

function createPeople(mission: Mission): Person[] {
  const markedCount = mission.kind === 'assassinate' ? mission.targetCount ?? 2 : 1;

  // 每局至少安排两名知名角色，他们具备会改变局势的威胁能力。
  const featured = shuffle(SPECIAL_SURVIVORS).slice(0, 2);
  const rest = shuffle(SURVIVORS.filter((s) => !featured.some((f) => f.id === s.id)));
  const cast = [...featured, ...rest];

  // 出生点：离大厅至少 2 步，避开障碍房间与后院，别让人一开局就和玩家脸贴脸。
  const spawnPool = ROOMS.map((r) => r.id).filter(
    (id) =>
      !isObstacle(id) &&
      !ESCAPE_ROOMS.includes(id) &&
      id !== ENTRY_ROOM &&
      roomDistance(ENTRY_ROOM, id) >= 2,
  );
  const spawnRooms = shuffle(spawnPool.length ? spawnPool : ROOMS.map((r) => r.id));
  const used: RoomId[] = [];
  const nextRoom = (): RoomId => {
    const pool = spawnRooms.filter((r) => !used.includes(r));
    const room = pool.length ? randomOf(pool) : randomOf(spawnRooms);
    if (!used.includes(room)) used.push(room);
    return room;
  };

  const people: Person[] = [];
  cast.slice(0, markedCount).forEach((s) => {
    people.push(makePerson(s, 'target', nextRoom(), 2, true));
  });
  cast.slice(markedCount, markedCount + 2).forEach((s) => {
    people.push(makePerson(s, 'target', nextRoom(), 2, false));
  });
  cast.slice(markedCount + 2, markedCount + 6).forEach((s) => {
    people.push(makePerson(s, 'civilian', nextRoom(), 2, false));
  });

  people.push({
    id: 'police-0',
    name: '巡逻警员',
    role: 'police',
    room: POLICE_START,
    hp: 2,
    marked: false,
    archetype: 'alert',
    alert: 0,
    activity: '在辖区巡逻',
    intent: 'idle',
    goal: 'phone',
    blockedTurns: 0,
    bleed: 0,
    downedTurns: 0,
    escapeProgress: 0,
    callTurns: 0,
    hidden: false,
    armed: false,
    trackedTurns: 0,
    lastSeenRoom: POLICE_START,
    lastSeenTurn: 0,
  });

  return people;
}

export function drawCards(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      log(state, '弃牌堆重新洗入牌库。');
    }
    const card = state.drawPile.pop();
    if (card) state.hand.push(card);
  }
}

export function createGame(
  deckIds: string[],
  mission = generateMission(),
  killer = '迈克尔·迈尔斯',
): GameState {
  const pile = shuffle(deckIds.filter((id) => CARD_MAP[id])).map<CardInstance>((defId) => ({
    uid: uid('card'),
    defId,
  }));
  const killerId = KILLER_MAP[killer] ? killer : '迈克尔·迈尔斯';
  const state: GameState = {
    phase: 'playing',
    killer: killerId,
    killerRuntime: { killUsed: false, moveUsed: false, attackUsed: false, witnessUsed: false },
    // 逮捕阈值跟着任务规模走：要杀 4 个人的活儿不可能只容忍 4 点通缉值
    arrestThreshold: 5 + (mission.targetCount ?? 1),
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    steps: 3,
    maxSteps: 3,
    wanted: 0,
    heatTurn: 0,
    policeLock: 0,
    ambushTurn: 0,
    playerRoom: ENTRY_ROOM,
    people: createPeople(mission),
    hand: [],
    drawPile: pile,
    discardPile: [],
    mission,
    log: [],
    kills: 0,
    killsThisTurn: 0,
    evidence: 0,
    ritualStreak: 0,
    markedKilled: 0,
    decoyRoom: null,
    freeMove: false,
    discount: 0,
    bonusDamage: 0,
    noAlarmTurn: false,
    alarmSilencedUntilTurn: 0,
    lastCrimeRoom: null,
    result: null,
    score: 0,
    scoreBreakdown: [],
    rewardCards: [],
    phoneCut: false,
    wiretap: false,
    poltergeist: false,
    policeBlocked: false,
    pinnedPeople: [],
    stalkMeter: 0,
    stalkTargetId: null,
    possessed: false,
    bonusEnergyNextTurn: 0,
    clearedObstacles: [],
    escaped: 0,
    barricades: [],
    exitBlockedTurns: 0,
    stunTurns: 0,
    cooldowns: {},
    roomLocks: {},
    revealedThisTurn: false,
    resultReason: '',
    alarm: 12,
    explored: [ENTRY_ROOM, ...ROOM_MAP[ENTRY_ROOM].neighbors],
    scouted: {},
    noiseRoom: null,
    sabotage: [],
  };
  drawCards(state, 5);
  log(state, `契约已接取：${mission.title}`);
  log(state, `你以「${killerId}」的身份行动。房子里的人各有各的活法，别让他们跑出后院。`);
  log(state, '提示：先弄清楚谁想报警、谁想跑；把人打倒只是开始，处决之前他们会被救走。');
  return state;
}

/* ==================================================================== */
/*  玩家行动                                                            */
/* ==================================================================== */

export function effectiveCost(defId: string, state: GameState): number {
  const card = CARD_MAP[defId];
  if (!card) return 99;
  return Math.max(0, card.cost - state.discount);
}

/** 移动到某房间要花几步：堵门的房间要多花 1 步 */
export function moveCost(state: GameState, room: RoomId): number {
  return state.barricades.includes(room) ? 2 : 1;
}

export function canMoveTo(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (room === state.playerRoom) return false;
  if (isObstacle(room) && !state.clearedObstacles.includes(room)) return false;
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (state.steps < cost) return false;
  if (state.freeMove) return true;
  return ROOM_MAP[state.playerRoom].neighbors.includes(room);
}

export function movePlayer(state: GameState, room: RoomId): boolean {
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (!canMoveTo(state, room)) {
    log(state, state.steps < cost ? '步数不够，走过去太慢了。' : '无法移动到那里：不是相邻房间，或路被堵住了。');
    return false;
  }

  state.steps -= cost;
  state.playerRoom = room;
  markExplored(state, room);
  log(state, `你移动到${roomName(room)}${cost > 1 ? '（撞开堵门，多花 1 步）' : ''}。`);
  if (state.barricades.includes(room)) {
    state.barricades = state.barricades.filter((r) => r !== room);
  }
  npcOnPlayerEnter(state);

  // 迈尔斯的被动：进入有人的房间会积累尾随值
  if (state.killer === '迈克尔·迈尔斯') {
    const observed = peopleInRoom(state, room).filter((p) => p.role !== 'police' && p.hp > 0);
    if (observed.length > 0) {
      let gain = 12 + observed.length * 8;
      if (state.stalkTargetId && observed.some((p) => p.id === state.stalkTargetId)) gain += 10;
      state.stalkMeter = clamp(state.stalkMeter + gain, 0, 100);
      state.stalkTargetId = randomOf(observed).id;
      log(state, `尾随：+${gain}（当前 ${state.stalkMeter}/100）。`);
    }
  }

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
    log(state, `能量不足：${def.name} 需要 ${cost} 点。`);
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
  log(state, `你打出「${def.name}」（消耗 ${cost} 能量）。`);

  runOps(state, def.ops);
  checkImmediateWin(state);
  return true;
}

/* ==================================================================== */
/*  杀手能力                                                            */
/* ==================================================================== */

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
  checkImmediateWin(state);
  return true;
}

/* ==================================================================== */
/*  胜负                                                                */
/* ==================================================================== */

function checkImmediateWin(state: GameState): void {
  if (state.result) return;
  const m = state.mission;
  if (m.kind === 'assassinate' && state.markedKilled >= (m.targetCount ?? 2)) {
    finish(state, 'win');
  } else if (m.kind === 'evidence' && state.evidence >= (m.targetCount ?? 2) && state.playerRoom === EXIT_ROOM) {
    finish(state, 'win');
  } else if (m.kind === 'escape' && state.markedKilled >= 1 && state.playerRoom === EXIT_ROOM) {
    finish(state, 'win');
  }
}

function finish(state: GameState, result: ResultKind): void {
  if (state.result) return;
  state.result = result;
  state.phase = 'gameover';

  const lines: ScoreLine[] = [{ label: `契约基础分 · ${state.mission.title}`, value: state.mission.reward }];
  lines.push({ label: `凶残 · 击杀 ${state.kills} 人`, value: state.kills * 14 });
  if (state.wanted > 0) lines.push({ label: `通缉值 ${state.wanted} 的代价`, value: -state.wanted * 3 });
  if (state.escaped > 0) lines.push({ label: `逃走 ${state.escaped} 人的失分`, value: -state.escaped * 15 });
  if (state.alarm >= 60) lines.push({ label: `团队警戒 ${state.alarm} 的代价`, value: -Math.round(state.alarm / 5) });

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
        state.kills * 14 -
        state.wanted * 3 -
        state.escaped * 15 -
        Math.round(state.alarm / 5),
    ),
  );
}

export function endTurn(state: GameState): void {
  if (state.phase !== 'playing') return;

  const m = state.mission;
  if (m.kind === 'ritual' && m.targetRoom) {
    if (state.playerRoom === m.targetRoom && state.wanted < 4) {
      state.ritualStreak += 1;
      log(state, `仪式进度 ${state.ritualStreak}/${m.targetCount ?? 2}。`);
    } else {
      state.ritualStreak = 0;
      log(state, '仪式中断。');
    }
  }

  if (m.kind === 'bodyCount' && state.kills >= (m.targetCount ?? 3) && state.wanted <= (m.maxWanted ?? 3)) {
    finish(state, 'win');
    return;
  }
  if (m.kind === 'ritual' && state.ritualStreak >= (m.targetCount ?? 2)) {
    finish(state, 'win');
    return;
  }

  // 迈尔斯的尾随值随时间消退
  if (state.killer === '迈克尔·迈尔斯' && state.stalkMeter > 0) {
    const decay = Math.min(state.stalkMeter, 8);
    state.stalkMeter -= decay;
    log(state, `尾随值 -${decay}（当前 ${state.stalkMeter}/100）。`);
  }

  if (TOTEM_ROOMS.includes(state.playerRoom)) {
    state.bonusEnergyNextTurn = 1;
    log(state, '图腾余响：下一回合额外获得 1 点能量。');
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

  // 团队警戒每回合自然回落一点：玩家安静下来，房子也会安静
  state.alarm = Math.max(0, state.alarm - 6);

  // 通缉值降温：这一回合没有新的动静（没人报警、没人看见你、也没动手），
  // 街上的注意力就散一点。这是「潜行 / 潜伏」玩法能成立的前提。
  if (state.heatTurn !== state.turn && state.wanted > 0) {
    state.wanted = Math.max(0, state.wanted - 1);
    log(state, `这一夜没人再提起你，通缉值降到 ${state.wanted}。`);
  }

  /* ---------- 回合收尾 ---------- */
  refreshVision(state);
  state.decoyRoom = null;
  state.freeMove = false;
  state.discount = 0;
  state.bonusDamage = 0;
  state.noAlarmTurn = false;
  state.killsThisTurn = 0;
  state.revealedThisTurn = false;
  state.roomLocks = Object.fromEntries(
    Object.entries(state.roomLocks)
      .map(([k, v]) => [k, (v ?? 0) - 1])
      .filter(([, v]) => (v as number) > 0),
  ) as Partial<Record<RoomId, number>>;
  state.exitBlockedTurns = Math.max(0, state.exitBlockedTurns - 1);
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

  // 手牌每回合弃掉重抽，避免玩家把整副牌囤在手里。
  state.discardPile.push(...state.hand);
  state.hand = [];

  state.turn += 1;
  state.energy = state.maxEnergy + state.bonusEnergyNextTurn;
  state.bonusEnergyNextTurn = 0;
  state.steps = Math.max(0, state.maxSteps - state.stunTurns);
  state.stunTurns = 0;
  drawCards(state, 5);
  log(state, '新回合开始，能量与步数已恢复。');
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
