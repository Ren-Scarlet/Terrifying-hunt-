import { CARD_MAP, UNLOCK_REWARDS } from './cards';
import type { Cond, Dest, Op, Who } from './effect';
import { KILLER_MAP } from './killers';
import { generateMission, roomName } from './missions';
import {
  CABINET_ROOMS,
  ENTRY_ROOM,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  POLICE_START,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
} from './rooms';
import { SPECIAL_SURVIVORS, SURVIVOR_MAP, SURVIVORS } from './survivors';
import type {
  CardInstance,
  GameState,
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
  if (state.log.length > 45) state.log.length = 45;
}

/** NPC 能逃出这栋房子的地方 */
export const ESCAPE_ROOMS: RoomId[] = ['garden'];
/** 房子里有电话的地方 */
export const PHONE_ROOMS: RoomId[] = ['study', 'hall'];

export const INTENT_LABEL: Record<NpcIntent, string> = {
  idle: '做自己的事',
  wary: '起疑',
  flee: '逃跑中',
  barricade: '正在堵门',
  call: '正在打电话',
  hide: '躲进柜子',
  escape: '翻篱笆',
  stunned: '动不了',
};

export const GOAL_LABEL: Record<NpcGoal, string> = {
  phone: '想打电话报警',
  exit: '想从后院逃走',
  hide: '想躲进柜子',
  gather: '想把人聚起来',
  weapon: '想找东西反抗',
  panic: '只想活下去',
};

/* ==================================================================== */
/*  查询                                                                */
/* ==================================================================== */

function peopleInRoom(state: GameState, room: RoomId, role?: PersonRole): Person[] {
  return state.people.filter((p) => p.room === room && p.hp > 0 && (!role || p.role === role));
}

function npcs(state: GameState): Person[] {
  return state.people.filter((p) => p.role !== 'police' && p.hp > 0);
}

function findVictim(state: GameState, room: RoomId, maxHp = Infinity): Person | undefined {
  const here = peopleInRoom(state, room).filter((p) => p.role !== 'police' && p.hp <= maxHp);
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

/** 玩家当前是否处于不易被察觉的状态 */
function playerIsHidden(state: GameState): boolean {
  return alarmSuppressed(state);
}

function alarmSuppressed(state: GameState): boolean {
  return state.noAlarmTurn || state.turn < state.alarmSilencedUntilTurn;
}

function addWanted(state: GameState, amount: number): void {
  state.wanted = clamp(state.wanted + amount, 0, 10);
}

/** 布局牌对报警通缉值的削弱 */
function witnessWanted(state: GameState, base: number): number {
  let gain = base;
  if (state.phoneCut) gain -= 1;
  if (state.poltergeist) gain -= 1;
  return Math.max(0, gain);
}

/* ==================================================================== */
/*  寻路                                                                */
/* ==================================================================== */

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
  const avoid = [state.playerRoom];
  const pool = ROOMS.map((r) => r.id).filter((r) => r !== from && !avoid.includes(r) && canStand(state, r));
  if (!pool.length) return from;
  // 用「离玩家最远」近似：先算到玩家的步数，取最远的几个随机一个
  const dist = (room: RoomId): number => {
    const queue: RoomId[][] = [[room]];
    const seen = new Set<RoomId>([room]);
    while (queue.length) {
      const path = queue.shift()!;
      const cur = path[path.length - 1];
      if (cur === from) return path.length - 1;
      for (const next of ROOM_MAP[cur].neighbors) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push([...path, next]);
      }
    }
    return 99;
  };
  const scored = pool.map((r) => ({ r, d: dist(r) })).sort((a, b) => b.d - a.d);
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
/*  变更                                                                */
/* ==================================================================== */

function killPerson(state: GameState, person: Person): void {
  state.people = state.people.filter((p) => p.id !== person.id);
  state.pinnedPeople = state.pinnedPeople.filter((id) => id !== person.id);
  state.kills += 1;
  state.killsThisTurn += 1;
  if (person.marked) state.markedKilled += 1;
  state.lastCrimeRoom = state.playerRoom;

  addWanted(state, person.role === 'target' ? 2 : 1);
  log(state, `你击杀了${person.marked ? '标记目标' : person.role === 'police' ? '警察' : '平民'} ${person.name}。`);

  // 尸体迟早会被发现：整栋房子的警觉跟着抬起来，恐慌会传染。
  let stirred = 0;
  npcs(state).forEach((other) => {
    if (other.alert < 32) {
      other.alert = clamp(other.alert + 12, 0, 100);
      stirred += 1;
    }
  });
  if (stirred > 0) log(state, '血腥味顺着地板缝散开，房子里的人开始不安地走动。');
}

function movePersonTo(state: GameState, person: Person, room: RoomId, clearAlert = false): void {
  if (person.room === room) return;
  const from = roomName(person.room);
  person.room = room;
  if (clearAlert) person.alert = 0;
  log(state, `${person.name} 从${from}移动到${roomName(room)}。`);
}

function applyDamage(state: GameState, person: Person, amount: number): void {
  const dmg = Math.max(0, amount + state.bonusDamage);
  state.bonusDamage = 0;
  person.hp -= dmg;
  if (person.hp <= 0) {
    killPerson(state, person);
    return;
  }
  log(state, `你对 ${person.name} 造成 ${dmg} 点伤害，剩余生命 ${person.hp}。`);
  person.alert = 100;
  person.intent = 'flee';
  person.activity = '带伤逃窜';
  peopleInRoom(state, state.playerRoom)
    .filter((p) => p.id !== person.id && p.role !== 'police')
    .forEach((p) => { p.alert = clamp(p.alert + 25, 0, 100); });
}

/** 目标选择：把 DSL 里的 who 解析成具体的人 */
function selectPeople(state: GameState, who: Who): Person[] {
  const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
  switch (who) {
    case 'victim': {
      const v = findVictim(state, state.playerRoom);
      return v ? [v] : [];
    }
    case 'lowestHpHere': {
      if (!here.length) return [];
      const min = Math.min(...here.map((p) => p.hp));
      return [here.find((p) => p.hp === min)!];
    }
    case 'highestAlert': {
      const all = npcs(state);
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
      return npcs(state).filter((p) => p.marked);
    case 'allAny':
      return npcs(state);
    case 'fleeing':
      return npcs(state).filter((p) => p.intent === 'flee' || p.intent === 'escape');
    case 'randomAny': {
      const all = npcs(state);
      return all.length ? [randomOf(all)] : [];
    }
  }
}

function checkCond(state: GameState, cond: Cond): boolean {
  switch (cond.c) {
    case 'killsThisTurn':
      return state.killsThisTurn >= cond.gte;
    case 'peopleHere':
      return peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police').length >= cond.gte;
    case 'energy':
      return state.energy >= cond.gte;
    case 'wanted':
      if (cond.gte !== undefined && state.wanted < cond.gte) return false;
      if (cond.lte !== undefined && state.wanted > cond.lte) return false;
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
      return npcs(state).some((p) => p.marked);
    case 'escaped':
      return state.escaped >= cond.gte;
    case 'hasThreat':
      return peopleInRoom(state, state.playerRoom).some((p) => SURVIVOR_MAP[p.id]?.threat === cond.v);
    case 'victimHere': {
      const v = findVictim(state, state.playerRoom, cond.maxHp ?? Infinity);
      return !!v;
    }
    case 'targetAway':
      return npcs(state).some((p) => p.role === 'target' && p.room !== state.playerRoom);
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
        list.forEach((p) => applyDamage(state, p, op.amount));
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
        selectPeople(state, op.who).forEach((p) => movePersonTo(state, p, dest, op.clearAlert));
        break;
      }
      case 'teleportPlayer': {
        const dest = resolveDest(state, op.to);
        if (dest !== state.playerRoom) {
          log(state, `你移动到${roomName(dest)}。`);
          state.playerRoom = dest;
        }
        break;
      }
      case 'lockRoom': {
        const dest = resolveDest(state, op.room);
        state.roomLocks[dest] = Math.max(state.roomLocks[dest] ?? 0, op.turns);
        log(state, `${roomName(dest)}被封锁 ${op.turns} 回合。`);
        break;
      }
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
          .map((p) => `${p.name}（${roomName(p.room)}·${INTENT_LABEL[p.intent]}）`)
          .join('、');
        log(state, list ? `你摸清了所有人的位置：${list}。` : '房子里安静得没有人。');
        break;
      }
      case 'heal':
        selectPeople(state, op.who).forEach((p) => {
          p.hp += op.amount;
        });
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

/* ==================================================================== */
/*  NPC 行为                                                            */
/* ==================================================================== */

function fleePerson(state: GameState, person: Person): boolean {
  if (state.pinnedPeople.includes(person.id) || person.blockedTurns > 0) return false;
  const options = ROOM_MAP[person.room].neighbors.filter(
    (r) =>
      r !== state.playerRoom &&
      !isLocked(state, r) &&
      canStand(state, r) &&
      !state.barricades.includes(r),
  );
  if (!options.length) return false;
  const from = roomName(person.room);
  person.room = randomOf(options);
  person.alert = Math.max(0, person.alert - 15);
  person.intent = 'flee';
  person.activity = '夺路而逃';
  log(state, `${person.name} 从${from}逃向${roomName(person.room)}。`);
  // 尖叫声会传开：新房间里的人立刻紧张起来
  peopleInRoom(state, person.room)
    .filter((p) => p.id !== person.id && p.role !== 'police')
    .forEach((p) => {
      if (p.alert < 45) {
        p.alert = clamp(p.alert + 20, 0, 100);
        if (p.intent === 'idle') p.intent = 'wary';
        log(state, `${p.name} 听见了尖叫，警觉升到 ${p.alert}/100。`);
      }
    });
  return true;
}

/** 玩家踏进房间的瞬间：警觉、堵门、打电话、逃跑 */
function npcOnPlayerEnter(state: GameState): void {
  const hidden = playerIsHidden(state);
  const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');

  here.forEach((person) => {
    if (person.hp <= 0) return;
    const threat = SURVIVOR_MAP[person.id]?.threat;
    let gain = 30;
    if (threat === 'spiritual') gain = 65;
    else if (threat === 'alarm') gain = 55;
    else if (threat === 'lead') gain = 42;
    else if (threat === 'team') gain = 38;
    if (hidden && threat !== 'spiritual') gain = Math.round(gain * 0.4);
    person.alert = clamp(person.alert + gain, 0, 100);

    // 已经在慌乱状态的人，直接找路跑
    if (person.alert >= 70) {
      if (fleePerson(state, person)) return;
      person.intent = 'barricade';
      person.activity = '拖着家具堵住门';
      if (!state.barricades.includes(person.room)) {
        state.barricades.push(person.room);
        log(state, `${person.name} 把柜子推到了门前——这间屋子下次要多花一步才能进。`);
      } else {
        log(state, `${person.name} 缩在角落里发抖，已经没有退路。`);
      }
      return;
    }

    if (person.alert >= 38) {
      // 半慌乱：按自己的目的行动
      if (person.goal === 'phone' && !state.phoneCut) {
        person.intent = 'call';
        person.activity = '朝电话的方向摸过去';
        log(state, `${person.name} 正在找电话——不打断他，他就会报警。`);
      } else if (person.goal === 'hide') {
        person.intent = 'flee';
        person.activity = '往有柜子的房间躲';
        const cabinet = CABINET_ROOMS.find((r) => r !== person.room);
        const step = cabinet ? nextStepToward(state, person.room, cabinet, [state.playerRoom]) : null;
        if (step) {
          person.room = step;
          log(state, `${person.name} 躲进了${roomName(step)}。`);
        }
      } else if (person.goal === 'exit') {
        person.intent = 'escape';
        person.activity = '往后院跑';
        log(state, `${person.name} 正朝后院跑，他想翻篱笆。`);
      } else {
        fleePerson(state, person);
      }
      return;
    }

    if (threat === 'team') {
      here.forEach((other) => {
        if (other.id !== person.id) other.alert = clamp(other.alert + 12, 0, 100);
      });
      person.intent = 'wary';
      person.activity = '低声招呼同伴';
      log(state, `${person.name} 低声招呼同伴，房间里每个人都绷紧了。`);
    } else if (gain < 18) {
      person.activity = '背对着门，没有察觉';
      log(state, `${person.name} 背对着门，还没发现你（警觉 ${person.alert}/100）。`);
    } else {
      person.intent = 'wary';
      person.activity = '警惕地盯着门';
      log(state, `${person.name} 察觉到动静，警觉 ${person.alert}/100。`);
    }
  });
}

/** 把一个 NPC 往他自己的目的地推一步 */
function pursueGoal(state: GameState, person: Person): void {
  if (person.blockedTurns > 0) return;

  // 已经站在后院、正在翻篱笆的人不会再回屋里打电话
  if (ESCAPE_ROOMS.includes(person.room) && person.intent === 'escape') {
    person.activity = '正在翻后院篱笆';
    return;
  }

  if (person.goal === 'phone' && !state.phoneCut) {
    if (PHONE_ROOMS.includes(person.room)) {
      person.intent = 'call';
      person.activity = '按住电话线的手指在抖';
      return;
    }
    const target = nearestOf(state, person.room, PHONE_ROOMS);
    const step = nextStepToward(state, person.room, target, [state.playerRoom]);
    if (step) {
      person.room = step;
      person.intent = 'flee';
      person.activity = '朝电话的方向跑';
      log(state, `${person.name} 跑向${roomName(step)}，那里有电话。`);
    }
    return;
  }

  if (person.goal === 'exit' || person.intent === 'escape') {
    if (ESCAPE_ROOMS.includes(person.room)) {
      person.intent = 'escape';
      person.activity = '正在翻后院篱笆';
      return;
    }
    const target = ESCAPE_ROOMS[0];
    const step = nextStepToward(state, person.room, target, [state.playerRoom]);
    if (step) {
      person.room = step;
      person.intent = 'escape';
      person.activity = '朝后院跑';
      log(state, `${person.name} 往${roomName(step)}跑，想从后院出去。`);
    }
    return;
  }

  if (person.goal === 'hide') {
    const cabinet = CABINET_ROOMS.find((r) => r !== person.room && !isLocked(state, r));
    if (cabinet) {
      const step = nextStepToward(state, person.room, cabinet, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '找能躲的柜子';
      }
    }
    return;
  }

  if (person.goal === 'weapon') {
    if (person.room === 'kitchen') {
      person.intent = 'wary';
      person.activity = '握住了刀架上的刀';
      return;
    }
    const step = nextStepToward(state, person.room, 'kitchen', [state.playerRoom]);
    if (step) {
      person.room = step;
      person.intent = 'flee';
      person.activity = '朝厨房摸过去';
    }
    return;
  }

  // gather / panic：远离玩家
  fleePerson(state, person);
}

function nearestOf(state: GameState, from: RoomId, candidates: RoomId[]): RoomId {
  let best = candidates[0];
  let bestLen = Infinity;
  for (const c of candidates) {
    let len = 0;
    const queue: RoomId[][] = [[from]];
    const seen = new Set<RoomId>([from]);
    while (queue.length) {
      const path = queue.shift()!;
      const cur = path[path.length - 1];
      if (cur === c) {
        len = path.length - 1;
        break;
      }
      for (const n of ROOM_MAP[cur].neighbors) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push([...path, n]);
      }
    }
    if (len < bestLen) {
      bestLen = len;
      best = c;
    }
  }
  return best;
}

/** 回合结束时 NPC 的一轮行动 */
function npcTurn(state: GameState): void {
  npcs(state).forEach((person) => {
    // 流血
    if (person.bleed > 0) {
      person.hp -= person.bleed;
      log(state, `${person.name} 在流血，失去 ${person.bleed} 点生命。`);
      if (person.hp <= 0) {
        killPerson(state, person);
        return;
      }
    }
    // 被限制
    if (person.blockedTurns > 0) {
      person.blockedTurns -= 1;
      person.intent = person.blockedTurns > 0 ? 'stunned' : 'wary';
      person.activity = person.blockedTurns > 0 ? '被按在原地，动不了' : '扶着墙站起来';
      return;
    }
    if (state.pinnedPeople.includes(person.id)) {
      person.activity = '被锁链钉住，无法动弹';
      person.intent = 'stunned';
      return;
    }

    // 已经决定要跑或要打电话的人，恐惧消退得慢得多，也不会轻易回头
    const committed = person.intent === 'escape' || person.intent === 'call';
    person.alert = Math.max(0, person.alert - (committed ? 5 : 18));

    if (committed) {
      if (person.alert <= 8) {
        person.intent = 'wary';
        person.activity = '停下了脚步，但还是不敢回头';
        log(state, `${person.name} 跑了一半又停下来，警觉只剩 ${person.alert}。`);
        return;
      }
      pursueGoal(state, person);
      return;
    }

    // 高警觉：按目的跑
    if (person.alert >= 40) {
      pursueGoal(state, person);
      return;
    }

    // 中警觉：开始朝目的地方向挪，但不敢跑
    if (person.alert >= 22) {
      person.intent = 'wary';
      if (Math.random() < 0.45) pursueGoal(state, person);
      else person.activity = '紧张地四处张望';
      return;
    }

    // 低警觉：做自己的事，偶尔换房间
    person.intent = 'idle';
    if (Math.random() < 0.3) {
      const options = ROOM_MAP[person.room].neighbors.filter(
        (r) => r !== state.playerRoom && !isLocked(state, r) && canStand(state, r),
      );
      if (options.length) person.room = randomOf(options);
    }
    person.activity = randomOf(ACTIVITIES);
  });
}

/** 已经在逃生点的人真的跑掉了吗 */
function escapePhase(state: GameState): void {
  npcs(state).forEach((person) => {
    if (!ESCAPE_ROOMS.includes(person.room)) {
      person.escapeProgress = 0;
      return;
    }
    // 只有真的想跑的人才会翻篱笆；住在这里闲逛的人不会。
    if (person.intent !== 'escape') {
      person.escapeProgress = 0;
      return;
    }
    if (state.exitBlockedTurns > 0) {
      person.activity = '篱笆被钉死了，翻不出去';
      log(state, `${person.name} 想翻篱笆，但后门被封死了。`);
      return;
    }
    if (person.escapeProgress < 1) {
      person.escapeProgress = 1;
      person.activity = '正在翻后院篱笆';
      log(state, `！${person.name} 已经在后院里翻篱笆了，下回合就会逃出去。`);
      return;
    }
    // 真的跑掉了
    state.people = state.people.filter((p) => p.id !== person.id);
    state.escaped += 1;
    log(state, `${person.name} 翻过篱笆消失了。`);
    if (person.marked) log(state, `名单上少了一个人：${person.name} 已经不在房子里了。`);

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
  });
}

/* ==================================================================== */
/*  警察                                                                */
/* ==================================================================== */

function policeNextStep(state: GameState): RoomId {
  const police = state.people.find((p) => p.role === 'police');
  if (!police) return POLICE_START;
  const destination = state.decoyRoom ?? state.lastCrimeRoom ?? state.playerRoom;
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

  if (police.room === state.playerRoom) {
    if (state.wanted >= state.arrestThreshold) {
      log(state, '警察在现场将你逮捕。');
      state.resultReason = `通缉值 ${state.wanted} 已经超过逮捕阈值 ${state.arrestThreshold}。`;
      finish(state, 'caught');
      return;
    }
    addWanted(state, 1);
    log(state, '警察与你擦肩而过，通缉值 +1。');
  }
}

function witnessPhase(state: GameState): void {
  if (alarmSuppressed(state)) {
    log(state, '目击者保持沉默。');
    return;
  }
  const witnesses = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
  if (!witnesses.length) return;

  const alarmWitness = witnesses.find((p) => SURVIVOR_MAP[p.id]?.threat === 'alarm');
  const spiritualSees = witnesses.some((p) => SURVIVOR_MAP[p.id]?.threat === 'spiritual');
  if (spiritualSees) log(state, '灵异感知者看穿了你的伪装，任何隐匿都失效。');

  const witness = alarmWitness ?? witnesses[0];
  const base = alarmWitness ? 3 : 2;
  const gain = witnessWanted(state, base);
  addWanted(state, gain);
  state.lastCrimeRoom = state.playerRoom;
  log(state, `${witness.name} 目击了你，通缉值 +${gain}${alarmWitness ? '（报警者）' : ''}。`);
  if (alarmWitness) log(state, `${witness.name} 直接报出了这间房，警察正在赶来。`);
}

/** NPC 成功打通电话：全场通缉暴涨，警察直扑那间房 */
function callPhase(state: GameState): void {
  if (state.phoneCut) return;
  if (alarmSuppressed(state)) return;
  npcs(state)
    .filter((p) => p.intent === 'call')
    .forEach((person) => {
      addWanted(state, 3);
      state.lastCrimeRoom = person.room;
      person.intent = 'flee';
      person.alert = 100;
      log(state, `${person.name} 打通了电话：「他在${roomName(person.room)}！」通缉值 +3，警察正赶过去。`);
    });
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
];

function pickGoal(s: (typeof SURVIVORS)[number], marked: boolean): NpcGoal {
  if (marked) return Math.random() < 0.55 ? 'exit' : 'phone';
  switch (s.threat) {
    case 'alarm':
      return 'phone';
    case 'lead':
      return 'exit';
    case 'team':
      return 'gather';
    case 'spiritual':
      return Math.random() < 0.5 ? 'weapon' : 'phone';
    default:
      return randomOf<NpcGoal>(['hide', 'panic', 'weapon', 'gather']);
  }
}

function makePerson(
  s: (typeof SURVIVORS)[number],
  role: PersonRole,
  room: RoomId,
  hp: number,
  marked: boolean,
): Person {
  return {
    id: s.id,
    name: s.name,
    role,
    room,
    hp,
    marked,
    alert: 0,
    activity: randomOf(ACTIVITIES),
    intent: 'idle',
    goal: pickGoal(s, marked),
    blockedTurns: 0,
    bleed: 0,
    escapeProgress: 0,
  };
}

function createPeople(mission: Mission): Person[] {
  const markedCount = mission.kind === 'assassinate' ? mission.targetCount ?? 2 : 1;

  // 每局至少安排两名知名角色，他们具备会改变局势的威胁能力。
  const featured = shuffle(SPECIAL_SURVIVORS).slice(0, 2);
  const rest = shuffle(SURVIVORS.filter((s) => !featured.some((f) => f.id === s.id)));
  const cast = [...featured, ...rest];

  // 障碍房间不能作为出生点：否则没有「所向无敌」的牌组会直接陷入无法通关的局面。
  // 逃生点同理：出生在后院的人会不战而逃。
  const spawnRooms = shuffle(
    ROOMS.map((r) => r.id).filter((id) => !isObstacle(id) && !ESCAPE_ROOMS.includes(id)),
  );
  const used: RoomId[] = [];
  const nextRoom = (): RoomId => {
    const pool = spawnRooms.filter((r) => !used.includes(r));
    const room = pool.length ? randomOf(pool) : randomOf(spawnRooms);
    if (!used.includes(room)) used.push(room);
    return room;
  };

  const people: Person[] = [];
  cast.slice(0, markedCount).forEach((s) => {
    people.push(makePerson(s, 'target', nextRoom(), 4, true));
  });
  cast.slice(markedCount, markedCount + 2).forEach((s) => {
    people.push(makePerson(s, 'target', nextRoom(), 4, false));
  });
  cast.slice(markedCount + 2, markedCount + 6).forEach((s) => {
    people.push(makePerson(s, 'civilian', nextRoom(), 3, false));
  });

  people.push({
    id: 'police-0',
    name: '巡逻警员',
    role: 'police',
    room: POLICE_START,
    hp: 99,
    marked: false,
    alert: 0,
    activity: '在辖区巡逻',
    intent: 'idle',
    goal: 'phone',
    blockedTurns: 0,
    bleed: 0,
    escapeProgress: 0,
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
    arrestThreshold: 4,
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    steps: 2,
    maxSteps: 2,
    wanted: 0,
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
  };
  drawCards(state, 5);
  log(state, `契约已接取：${mission.title}`);
  log(state, `你以「${killerId}」的身份行动。房子里的人都有自己的目的，别让他们跑出后院。`);
  log(state, '提示：点人物头像可以看他的目的；堵门的房间要多花一步才能进。');
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
  log(state, `你移动到${roomName(room)}${cost > 1 ? '（撞开堵门，多花 1 步）' : ''}。`);
  if (state.barricades.includes(room)) {
    state.barricades = state.barricades.filter((r) => r !== room);
  }
  npcOnPlayerEnter(state);

  // 迈尔斯的被动：进入有人的房间会积累尾随值
  if (state.killer === '迈克尔·迈尔斯') {
    const observed = peopleInRoom(state, room).filter((p) => p.role !== 'police');
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
    if (need && need.c === 'stalk') return `需要尾随值达到 ${need.gte}`;
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
  lines.push({ label: `凶残 · 击杀 ${state.kills} 人`, value: state.kills * 10 });
  if (state.wanted > 0) lines.push({ label: `通缉值 ${state.wanted} 的代价`, value: -state.wanted * 3 });
  if (state.escaped > 0) lines.push({ label: `逃走 ${state.escaped} 人的失分`, value: -state.escaped * 15 });

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
  return Math.max(0, Math.round(state.mission.reward + state.kills * 10 - state.wanted * 3 - state.escaped * 15));
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

  /* ---------- 回合收尾 ---------- */
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
  if (score >= 220) return 3;
  if (score >= 130) return 2;
  return 1;
}

export { generateMission };
