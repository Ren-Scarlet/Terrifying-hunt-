/**
 * 警察：不是第五个幸存者，而是会移动的区域禁区。
 *
 * 它按线索（犯罪现场、报警、噪声）移动；同屋就逼退玩家、累积包围进度。
 * 灵异类杀手没有警察。行为与旧版完全一致，只是搬出了 engine.ts。
 */
import { ESCAPE_ROOMS } from '../constants';
import { KILLER_MAP } from '../killers';
import { roomName } from '../missions';
import { roomDistance } from '../navigation';
import { randomOf } from '../random';
import { RADIO_ROOMS, ROOM_MAP } from '../rooms';
import type { GameState, Person, RoomId } from '../types';
import { nextStepToward } from '../world/pathfinding';
import { workingPhones } from '../world/phones';
import { isLocked, npcPeople as npcs } from '../world/roomState';
import type { NpcHost } from './ai/host';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function policeNextStep(host: NpcHost, state: GameState, police: Person): RoomId {
  const freshCrime = state.heatTurn >= state.turn - 1 || state.policeAssaulted;
  const caller = state.people.find((person) =>
    person.role !== 'police' && person.hp > 0 && !person.hidden && /电话|无线电/.test(person.activity),
  );
  let destination: RoomId | null =
    state.emergencyActive
      ? state.playerRoom
      : state.decoyRoom
        ?? (freshCrime ? state.lastCrimeRoom ?? state.noiseRoom ?? state.playerRoom : null)
        ?? caller?.room
        ?? state.noiseRoom;

  // 没有报警或犯罪线索时，警员不再随机游荡，而是巡查电话、无线电、电闸与逃生点。
  const patrolPoints = [...new Set<RoomId>([
    ...workingPhones(state),
    ...RADIO_ROOMS,
    ...state.powerCircuits.map((circuit) => circuit.breakerRoom),
    ...ESCAPE_ROOMS,
  ])];
  if (!destination && patrolPoints.length) {
    let index = (police.routineIndex ?? 0) % patrolPoints.length;
    if (police.room === patrolPoints[index]) {
      index = (index + 1) % patrolPoints.length;
      police.routineIndex = index;
    }
    destination = patrolPoints[index];
  }
  if (!destination) {
    const options = ROOM_MAP[police.room].neighbors.filter((room) => !isLocked(state, room));
    return options.length ? randomOf(options) : police.room;
  }
  if (police.room === destination) return police.room;
  return nextStepToward(state, police.room, destination, [], true) ?? police.room;
}

export function policePhase(host: NpcHost, state: GameState): void {
  if (KILLER_MAP[state.killer]?.school === 'supernatural') return;
  const officers = state.people.filter((person) => person.role === 'police');
  if (!officers.length) return;

  for (const police of officers) {
    const next = policeNextStep(host, state, police);
    if (state.wiretap) host.log(state, `窃听：警察正在前往${roomName(next)}。`);
    if (state.policeBlocked) {
      state.policeBlocked = false;
      host.log(state, '后院大门被锁，警察本回合无法移动。');
    } else if (next !== police.room) {
      police.room = next;
      police.activity = `正在调查${roomName(next)}`;
      host.log(state, `${police.name}沿着线索移动到${roomName(next)}。`);
    }
  }

  const officerInRoom = officers.find((police) => police.room === state.playerRoom);
  const officerNearby = officers.find((police) => roomDistance(police.room, state.playerRoom) <= 1);
  if (!officerNearby) {
    state.policeLock = 0;
    return;
  }

  if (!officerInRoom) {
    // 警员在相邻房间搜查：附近幸存者会因警笛和呼喊重新警觉。
    const searched = npcs(state).filter((person) =>
      person.hp > 0 && !person.hidden && roomDistance(person.room, officerNearby.room) <= 1,
    );
    searched.forEach((person) => {
      person.alert = clamp(person.alert + 10, 0, 100);
      person.activity = '听见警员在附近搜查';
    });
    host.addAlarm(state, 4);
    host.log(state, `${officerNearby.name}正在相邻区域搜查，警笛声惊动了附近的幸存者（警报 +4）。`);
    state.policeLock = 0;
    return;
  }

  state.policeLock += 1;
  state.stunTurns = Math.max(state.stunTurns, 1);
  host.addAlarm(state, state.policeLock >= 2 ? 16 : 10);
  npcs(state).filter((person) =>
    person.hp > 0 && !person.hidden && roomDistance(person.room, state.playerRoom) <= 1,
  ).forEach((person) => {
    person.alert = clamp(person.alert + 14, 0, 100);
  });

  host.log(state, state.emergencyActive && state.policeLock >= 3
    ? '警察完成包围，枪托与电击器接连落下——你已无力继续抵抗！'
    : '警察撞入你的房间并用电击器逼退你！你下回合少 1 点行动点，附近幸存者也被惊动。');

  if (state.emergencyActive && state.policeLock >= 3) {
    state.resultReason = '警察增援完成包围，你被制服。';
    host.finish(state, 'caught');
  }
}
