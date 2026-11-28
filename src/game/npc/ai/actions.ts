/**
 * 幸存者的「逃跑」与「喊人」。
 *
 * 这两件事绑在一起：跑动会留下脚印与声响，喊叫会把警戒传给同屋和隔壁。
 * 只通过 `NpcHost` 调引擎的写服务，不 import engine.ts。
 */
import { SURVIVOR_INJURED_HP } from '../../constants';
import { roomName } from '../../missions';
import { roomDistance } from '../../navigation';
import { randomOf } from '../../random';
import { ROOM_MAP } from '../../rooms';
import type { GameState, Person } from '../../types';
import { canStand, isLocked, peopleInRoom } from '../../world/roomState';
import type { NpcHost } from './host';
import { isQuietMove } from './predicates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 往离玩家最远的方向跑一步。
 *
 * quiet：玩家每动一下都会触发一次这样的逃跑，日志不能跟着刷屏；
 * 这时候只留地面上的痕迹，让玩家自己看地板。
 */
export function fleeAway(
  host: NpcHost,
  state: GameState,
  person: Person,
  quiet = false,
  ignoreFear = false,
): boolean {
  if (state.pinnedPeople.includes(person.id) || person.blockedTurns > 0 || person.hp <= 0 || (person.fear >= 100 && !ignoreFear)) return false;
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
  person.activity = '夺路而逃';
  // 逃跑路线始终留下脚印；潜行者只是不制造额外声响。
  host.pushTrail(state, fromId, person.room, person.hp <= SURVIVOR_INJURED_HP);
  if (!isQuietMove(state, person)) host.addDisturbance(state, person.room);
  if (!quiet) {
    host.log(state, `${person.name} 从${from}逃向${roomName(person.room)}。`);
    shout(host, state, person, 14);
  }
  host.triggerBearTrapForPerson(state, person);
  return true;
}

/** 喊叫：同房间的人立刻警觉，隔壁房间的人隔着墙听见 */
export function shout(host: NpcHost, state: GameState, person: Person, base = 18): void {
  let learned = 0;
  peopleInRoom(state, person.room)
    .filter((p) => p.id !== person.id && p.role !== 'police' && p.hp > 0)
    .forEach((p) => {
      if (p.alert < 70) {
        p.alert = clamp(p.alert + base, 0, 100);
        p.lastHeardFrom = person.name;
        p.lastHeardRoom = person.room;
        p.lastHeardTurn = state.turn;
        learned += 1;
        host.log(state, `${p.name} 听见喊声，警觉升到 ${p.alert}/100。`);
      }
    });
  ROOM_MAP[person.room].neighbors.forEach((r) => {
    peopleInRoom(state, r)
      .filter((p) => p.role !== 'police' && p.hp > 0 && p.alert < 55)
      .forEach((p) => {
        p.alert = clamp(p.alert + Math.round(base * 0.55), 0, 100);
        p.lastHeardFrom = person.name;
        p.lastHeardRoom = person.room;
        p.lastHeardTurn = state.turn;
        learned += 1;
      });
  });
  // 空喊不会让房子更紧张：只有真的有人被喊醒了，暴露度才涨
  if (learned > 0) host.addAlarm(state, Math.min(3, learned));
}
