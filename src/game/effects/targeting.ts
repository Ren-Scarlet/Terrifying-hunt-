/**
 * 卡牌效果的目标选择与条件判定。
 *
 * 这一层只读状态：选谁、条件是否成立。真正改世界交给 runtime。
 */
import { SURVIVOR_INJURED_HP } from '../constants';
import { KILLER_MAP } from '../killers';
import { roomDistance } from '../navigation';
import { randomOf } from '../random';
import { ROOM_MAP } from '../rooms';
import { SURVIVOR_MAP } from '../survivors';
import type { Cond, Who } from '../effect';
import type { GameState, Person } from '../types';
import { NpcHost } from '../npc/ai/host';
import { phoneWorks } from '../world/phones';
import { npcPeople as npcs, peopleInRoom, standingPeople as standing } from '../world/roomState';
export function selectPeople(host: NpcHost, state: GameState, who: Who): Person[] {
  const here = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0,
  );
  switch (who) {
    case 'victim': {
      // 攻击类牌只选择站立目标；倒地目标交给独立处决动作。
      const v = host.findVictim(state, state.playerRoom, Infinity, false);
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
      return standing(state).filter((p) => p.alert >= 75 || p.escapeProgress > 0);
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

export function checkCond(host: NpcHost, state: GameState, cond: Cond): boolean {
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
      return npcs(state).some((person) => person.role !== 'police' && person.hp > 0 && host.isPersonVisible(state, person));
    case 'survivorNearby':
      return standing(state).some((person) => person.role !== 'police' && !person.hidden && roomDistance(person.room, state.playerRoom) <= 1);
    case 'carryingPerson': {
      const carried = state.carryPersonId ? state.people.find((person) => person.id === state.carryPersonId) : undefined;
      return !!carried && carried.hp <= 0;
    }
    case 'currentDestructible': {
      const room = state.playerRoom;
      return state.powerCircuits.some((circuit) => circuit.breakerRoom === room && !circuit.broken)
        || phoneWorks(state, room);
    }
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
    case 'victimHere': {
      const v = host.findVictim(state, state.playerRoom, cond.maxHp ?? Infinity);
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
