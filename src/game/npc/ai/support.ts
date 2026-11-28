/**
 * 幸存者的支援类行动：反击、用道具、放板、救援、包扎、报警。
 *
 * 与 actions.ts 的分工：actions 是「跑」和「喊」，这里是「动手做事」。
 * 同样只通过 NpcHost 调引擎写服务，不 import engine.ts。
 */
import { SURVIVOR_INJURED_HP } from '../../constants';
import { roomName } from '../../missions';
import { roomDistance } from '../../navigation';
import { random } from '../../random';
import { RADIO_ROOMS } from '../../rooms';
import type { GameState, Person } from '../../types';
import { nextStepToward } from '../../world/pathfinding';
import { peopleInRoom, npcPeople as npcs } from '../../world/roomState';
import { phoneWorks } from '../../world/phones';
import type { NpcHost } from './host';
import { canCoordinateRescue, canPlaceBarricade } from './predicates';
import { AID_RUN_RATE, RESCUE_EAGERNESS } from './tuning';
/** 反抗型 / 英勇型的正面反击：玩家下回合少走一步 */
export function counterAttack(host: NpcHost, state: GameState, person: Person): void {
  state.stunTurns += 1;
  // 被反手推开：追势断了，杀戮清零
  state.frenzy = 0;
  state.frenzyStreak = 0;
  person.alert = 100;
  person.activity = '握着刀挡在门口';
  host.addAlarm(state, 4);
  host.log(state, `${person.name} 抄起武器朝你扑过来——你被逼退了一步（下回合少 1 点行动点）。`);
}

export function barricadeRoom(host: NpcHost, state: GameState, person: Person): boolean {
  if (!canPlaceBarricade(state, person)) return false;
  state.palletDropCount = (state.palletDropCount ?? 0) + 1;
  person.activity = '放下木板堵住入口';
  state.barricades.push(person.room);
  host.log(state, person.name + ' 在原有障碍房间放下木板，封住了' + roomName(person.room) + '的入口！地图已标记木板位置。');
  host.addAlarm(state, 2);
  return true;
}

/** 同屋有倒地同伴就拉起他：任何人都会救，只是意愿不同；玩家在场时没人敢动手 */
export function tryRescue(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.room === state.playerRoom) return false;
  if (person.blockedTurns > 0) return false;
  if (random() > RESCUE_EAGERNESS[person.archetype]) return false;
  const allies = peopleInRoom(state, person.room).filter(
    (p) => p.id !== person.id && p.role !== 'police',
  );
  const downed = allies.find((p) => p.hp <= 0);
  if (downed) {
    host.rescuePerson(state, downed);
    person.activity = `正在把 ${downed.name} 从地上拖起来`;
    return true;
  }
  const injured = allies.find((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP);
  if (injured) {
    host.healPerson(state, injured, 1);
    person.activity = `正在给 ${injured.name} 包扎`;
    return true;
  }
  return false;
}

/** 有人倒地时，幸存者会主动赶过去：救援优先于日常目标，但没人敢闯玩家守着的房间 */
export function tryAidRun(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.hidden || person.blockedTurns > 0) return false;
  if (random() > RESCUE_EAGERNESS[person.archetype] * AID_RUN_RATE) return false;
  const downed = npcs(state)
    .filter((p) => p.hp <= 0 && p.room !== state.playerRoom && canCoordinateRescue(state, person.room, p.room))
    .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
  if (!downed || downed.room === person.room) return false;
  const step = nextStepToward(state, person.room, downed.room, [state.playerRoom]);
  if (!step) return false;
  person.room = step;
  person.activity = `朝${downed.name}倒下的地方赶去`;
  return true;
}

/** 求救型：打电话（1 回合）或用无线电（2 回合）报警 */
export function tryCall(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.blockedTurns > 0) return false;
  const canPhone = phoneWorks(state, person.room);
  const canRadio = !state.sabotage.includes('radio') && RADIO_ROOMS.includes(person.room);

  if (canPhone) {
    person.activity = '按住电话线的手指在抖';
    return true;
  }
  if (canRadio) {
    person.callTurns += 1;
    if (person.callTurns >= 2) {
      finishCall(host, state, person, '无线电');
      return true;
    }
    person.activity = '在无线电前调频，还差一回合';
    host.log(state, `${person.name} 正在调无线电，再有一回合就能把消息发出去。`);
    return true;
  }
  return false;
}

export function finishCall(host: NpcHost, state: GameState, person: Person, device: string): void {
  state.npcAlarmed = true;
  host.addWanted(state, 3);
  host.addAlarm(state, 15);
  state.lastCrimeRoom = person.room;
  person.alert = 100;
  person.callTurns = 0;
  host.log(state, `${person.name} 用${device}联系上了外面：「他在${roomName(person.room)}！」暴露度大涨，警察正赶过去。`);
}
