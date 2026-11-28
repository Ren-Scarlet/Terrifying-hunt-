/**
 * 幸存者道具行为：翻道具箱、用修理箱 / 手电筒 / 医疗箱。
 *
 * 道具只在「用得上」的时候消耗：
 *   - 修理箱：所在房间有被砸坏的电闸或电话
 *   - 医疗箱：自己受伤，或同屋有受伤同伴
 *   - 手电筒：和玩家同屋，照晕并打断
 */
import { SURVIVOR_INJURED_HP, SURVIVOR_MAX_HP } from '../../constants';
import { SURVIVOR_ITEM_LABEL, SURVIVOR_ITEM_USES, SURVIVOR_ITEMS } from '../../items';
import { roomName } from '../../missions';
import { random, randomOf } from '../../random';
import type { GameState, Person, SurvivorItem } from '../../types';
import { npcPeople as npcs, peopleInRoom } from '../../world/roomState';
import type { NpcHost } from './host';

/** 按当前局势挑一件最有用的道具，留一点随机。 */
export function pickSupply(state: GameState, person: Person): SurvivorItem {
  const circuitsBroken = state.powerCircuits.some((circuit) => circuit.broken);
  const phonesBroken = (state.brokenPhones ?? []).length > 0;
  const hurt = npcs(state).some((other) => other.hp > 0 && other.hp <= SURVIVOR_INJURED_HP);
  const score: Record<SurvivorItem, number> = {
    repair: (circuitsBroken ? 5 : 0) + (phonesBroken ? 3 : 0),
    medkit: (person.hp <= SURVIVOR_INJURED_HP ? 5 : 0) + (hurt ? 3 : 0),
    flashlight: person.alert >= 40 ? 4 : 1,
  };
  const best = [...SURVIVOR_ITEMS].sort((a, b) => score[b] - score[a])[0];
  return random() < 0.8 ? best : randomOf(SURVIVOR_ITEMS);
}

export function consumeItem(host: NpcHost, state: GameState, person: Person): void {
  if (!person.item) return;
  person.itemUses = Math.max(0, person.itemUses - 1);
  if (person.itemUses <= 0) {
    person.item = null;
    person.itemUses = 0;
  }
}

/** 走到道具箱前翻一件道具。 */
export function tryTakeSupply(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.item) return false;
  const box = state.itemBoxes.find((item) => item.room === person.room && !item.broken && item.charges > 0);
  if (!box) return false;
  box.charges -= 1;
  const item = pickSupply(state, person);
  person.item = item;
  person.itemUses = SURVIVOR_ITEM_USES[item];
  person.activity = `在道具箱里翻出了${SURVIVOR_ITEM_LABEL[item]}`;
  host.addDisturbance(state, person.room);
  host.log(state, `${person.name} 在${roomName(person.room)}的道具箱里翻出了${SURVIVOR_ITEM_LABEL[item]}（箱子还剩 ${box.charges} 件）。`);
  return true;
}

/** 用一件道具；返回是否真的用掉了。 */
export function useSurvivorItem(host: NpcHost, state: GameState, person: Person): boolean {
  const item = person.item;
  if (!item || person.itemUses <= 0) return false;

  if (item === 'repair') {
    const circuit = state.powerCircuits.find((candidate) => candidate.breakerRoom === person.room && candidate.broken);
    if (circuit) {
      circuit.broken = false;
      circuit.enabled = true;
      consumeItem(host, state, person);
      person.activity = `用修理箱修好了${circuit.name}电闸`;
      host.addDisturbance(state, person.room);
      host.log(state, `${person.name} 用修理箱修好了${circuit.name}电闸，${circuit.affectedRooms.map(roomName).join('、')}恢复供电。`);
      return true;
    }
    const brokenPhone = (state.brokenPhones ?? []).includes(person.room);
    if (brokenPhone) {
      state.brokenPhones = (state.brokenPhones ?? []).filter((room) => room !== person.room);
      consumeItem(host, state, person);
      person.activity = '用修理箱修好了这间屋子的电话';
      host.log(state, `${person.name} 用修理箱修好了${roomName(person.room)}的电话。`);
      return true;
    }
    return false;
  }

  if (item === 'medkit') {
    if (person.hp > 0 && person.hp < SURVIVOR_MAX_HP) {
      person.hp = Math.min(SURVIVOR_MAX_HP, person.hp + 2);
      consumeItem(host, state, person);
      person.activity = '用医疗箱给自己包扎';
      host.log(state, `${person.name} 用医疗箱给自己包扎，生命恢复到 ${person.hp}/${SURVIVOR_MAX_HP}。`);
      return true;
    }
    const ally = peopleInRoom(state, person.room).find((other) =>
      other.id !== person.id && other.role !== 'police' && other.hp > 0 && other.hp < SURVIVOR_MAX_HP,
    );
    if (ally) {
      host.healPerson(state, ally, 2);
      consumeItem(host, state, person);
      person.activity = `用医疗箱给${ally.name}包扎`;
      host.log(state, `${person.name} 用医疗箱给${ally.name}包扎，治疗进度加快。`);
      return true;
    }
    return false;
  }

  if (item === 'flashlight') {
    if (person.room !== state.playerRoom) return false;
    consumeItem(host, state, person);
    person.activity = '拧亮手电筒照向杀手';
    host.interruptPlayer(state, `${person.name} 拧亮手电筒，一道白光正打在你脸上。`, person.id);
    return true;
  }

  return false;
}
