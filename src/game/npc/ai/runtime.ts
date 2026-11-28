/**
 * 新决策的"执行器"：把 behavior.decide 选出的动作真正做出来。
 *
 * 这是新旧 AI 的切换点——只替换"这一回合做什么"，回合结算、伤害、陷阱、
 * 对白仍然走原来的底层，所以切换风险最小。
 */
import { roomDistance } from '../../navigation';
import { roomName } from '../../missions';
import { random, randomOf } from '../../random';
import { ROOM_MAP } from '../../rooms';
import type { GameState, Person } from '../../types';
import { nextStepToward } from '../../world/pathfinding';
import { phoneWorks } from '../../world/phones';
import { cabinetRoomsFor, isRoomLit, peopleInRoom } from '../../world/roomState';
import { decide, type ActionKind, type DecisionContext } from './behavior';
import { type ChaseState, afterFlee, canFlee, createChaseState, tickChase } from './chase';
import { CHASE } from './chase';
import { decayAlert } from './model';
import type { NpcHost } from './host';
import { ACTIVITIES } from '../factory';
import { canPlaceBarricade } from './predicates';

/** 每个幸存者的追逐体力（按 id 记，避免往存档结构里加字段） */
const chaseStates = new WeakMap<GameState, Map<string, ChaseState>>();

function chaseOf(state: GameState, person: Person): ChaseState {
  let gameStates = chaseStates.get(state);
  if (!gameStates) { gameStates = new Map(); chaseStates.set(state, gameStates); }
  let chase = gameStates.get(person.id);
  if (!chase) {
    chase = createChaseState();
    gameStates.set(person.id, chase);
  }
  return chase;
}

function buildContext(state: GameState, person: Person): DecisionContext {
  const here = peopleInRoom(state, person.room);
  const chase = chaseOf(state, person);
  return {
    alert: person.alert,
    fear: person.fear,
    control: person.hp <= 0 ? 'downed' : person.blockedTurns > 0 ? 'stunned' : 'normal',
    sameRoomKiller: person.room === state.playerRoom,
    justAttacked: state.lastAttackedId === person.id && person.alert >= 100,
    startled: (person.startleTurns ?? 0) > 0,
    chased: state.chaseTargetId === person.id,
    phoneHere: phoneWorks(state, person.room),
    totemHere: state.totems.includes(person.room),
    tvHere: state.tvRooms.includes(person.room) && !state.tvClosed.includes(person.room),
    allyDownedHere: here.some((other) => other.id !== person.id && other.role !== 'police' && other.hp <= 0),
    allyInjuredHere: here.some((other) => other.id !== person.id && other.role !== 'police' && other.hp > 0 && other.hp <= 2),
    gateOpen: state.escapeRooms.length > 0,
    atExit: state.escapeRooms.includes(person.room),
    canHideHere: cabinetRoomsFor(state).includes(person.room),
    canBarricadeHere: canPlaceBarricade(state, person),
    canLockHere: !isRoomLit(state, person.room) ? false : (state.roomLocks[person.room] ?? 0) <= 0,
    chase,
  };
}

/** 日常移动：大部分时间只是原地做自己的事，偶尔走一间；别自己走进玩家怀里 */
function dailyMove(state: GameState, person: Person): boolean {
  if (random() < 0.18) {
    const options = ROOM_MAP[person.room].neighbors.filter((room) =>
      room !== state.playerRoom && !state.barricades.includes(room));
    if (options.length) {
      person.room = randomOf(options);
      person.activity = randomOf(ACTIVITIES);
      return true;
    }
  }
  person.activity = randomOf(ACTIVITIES);
  return true;
}

function removeTotem(host: NpcHost, state: GameState, person: Person): boolean {
  const index = state.totems.indexOf(person.room);
  if (index < 0) return false;
  state.totems.splice(index, 1);
  host.log(state, `${person.name} 在${person.room}发现并破坏了图腾。`);
  host.log(state, `【图腾被拆】幸存者拆毁了图腾，剩余 ${state.totems.length} 座。`);
  return true;
}

function walkTowardExit(state: GameState, person: Person): boolean {
  if (!state.escapeRooms.length) return false;
  if (state.escapeRooms.includes(person.room)) {
    person.escapeProgress = 1;
    person.activity = '正在翻越逃生点';
    return true;
  }
  const step = nextStepToward(state, person.room, state.escapeRooms[0], [state.playerRoom]);
  if (!step) return false;
  person.room = step;
  person.activity = '正赶往逃生点';
  return true;
}

/** 执行一个动作；返回是否真的做成了（做不成时调用方可回退到日常） */
function perform(host: NpcHost, state: GameState, person: Person, kind: ActionKind): boolean {
  switch (kind) {
    case 'flee': {
      const chase = chaseOf(state, person);
      if (!canFlee(chase)) return false;
      // 崩溃的人会不顾一切地跑：旧逻辑里恐惧 100 会拒绝逃跑，这里显式放行
      const moved = host.fleeAway(state, person, false, person.fear >= 85);
      if (moved) {
        chaseStates.get(state)!.set(person.id, afterFlee(chase));
        if (person.fear >= 85) person.activity = '尖叫着乱跑，完全失去了方向';
      }
      return moved;
    }
    case 'barricade':
      return host.barricadeRoom(state, person);
    case 'lock':
      if ((state.roomLocks[person.room] ?? 0) > 0) return false;
      state.roomLocks[person.room] = 2;
      person.activity = '反锁了房门';
      host.log(state, `${person.name} 反锁了${roomName(person.room)}的房门，门锁会在两回合后失效。`);
      return true;
    case 'hide':
      if (!cabinetRoomsFor(state).includes(person.room)) return false;
      person.hidden = true;
      person.activity = '钻进了柜子';
      return true;
    case 'call':
      return host.tryCall(state, person);
    case 'totem':
      return removeTotem(host, state, person);
    case 'tv': {
      if (state.killer !== '贞子' || person.hasTape) return false;
      const tv = state.tvRooms.find((room) => room === person.room && !state.tvClosed.includes(room));
      if (!tv) return false;
      state.tvClosed.push(tv);
      person.hasTape = true;
      person.activity = '关掉了电视，取走了录像带';
      host.log(state, `${person.name} 关掉了${roomName(person.room)}的电视，取走了里面的录像带。`);
      return true;
    }
    case 'rescue':
    case 'heal':
      return host.tryRescue(state, person);
    case 'escape':
      return walkTowardExit(state, person);
    case 'shout':
      host.shout(state, person, 14);
      person.activity = '一边跑一边喊人';
      return true;
    case 'observe':
      person.activity = '停下手里的事，侧耳听着';
      return true;
    case 'move':
      return dailyMove(state, person);
    case 'idle':
    default:
      person.activity = person.fear >= 85 ? '瘫软在地，止不住地发抖' : '做着自己的事';
      return true;
  }
}

/**
 * 新决策入口：给这个幸存者选一件事并执行。
 * 选出的动作做不成时，退回日常移动，避免"站着不动"。
 */
export function executeDecision(host: NpcHost, state: GameState, person: Person, endOfTurn = false): void {
  const ctx = buildContext(state, person);
  const decision = decide(ctx);
  if (!perform(host, state, person, decision.kind)) {
    // 崩溃的人跑不动时会缩在角落，而不是若无其事地开始日常
    if (person.fear >= 85 && decision.kind === 'flee') {
      person.activity = '缩在墙角，止不住地发抖';
      return;
    }
    // 被堵在同一间屋、体力又见底时，仍然强行夺门而出；不能站着挨刀。
    if (ctx.sameRoomKiller && decision.kind === 'flee' && host.fleeAway(state, person, false, true)) {
      person.activity = '夺门而出';
      return;
    }
    if (!perform(host, state, person, 'move')) {
      person.activity = '无处可去，只能待在原地';
    }
  }

  // 回合末：没被追、也不在玩家眼前时，警戒才会回落（慌乱衰减减半）
  if (person.startleTurns) person.startleTurns = Math.max(0, person.startleTurns - 1);
  if (endOfTurn && !ctx.chased && !ctx.sameRoomKiller) {
    const safe = distanceToPlayer(state, person) >= 2 && isRoomLit(state, person.room);
    decayAlert(person, safe);
  }
}

/** 回合结束时恢复追逐体力（由 npcTurn 在最后调用一次） */
export function tickAllChase(state: GameState): void {
  for (const person of state.people) {
    const chase = chaseStates.get(state)?.get(person.id);
    if (chase) chaseStates.get(state)!.set(person.id, tickChase(chase));
  }
  // 没人再被追时，体力恢复得更自然；这里只做清理，避免 id 无限增长

}

/** 供界面/调试查看某个幸存者还剩多少追逐体力（默认满值）。 */
export function chaseStaminaOf(state: GameState, personId: string): number {
  return chaseStates.get(state)?.get(personId)?.stamina ?? CHASE.maxStamina;
}

/** 距离玩家多远（供调试/UI 使用） */
export function distanceToPlayer(state: GameState, person: Person): number {
  return roomDistance(person.room, state.playerRoom);
}

/** 是否处于安全状态（新模型的安全判定） */
export function isPersonSafe(state: GameState, person: Person): boolean {
  return roomDistance(person.room, state.playerRoom) >= 2
    && state.chaseTargetId !== person.id
    && isRoomLit(state, person.room);
}
