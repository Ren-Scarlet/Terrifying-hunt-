/**
 * 幸存者手里的道具：翻补给、用道具。
 *
 * 与 support.ts 的分工：support 是"救援/报警"这类目的明确的行为，
 * 这里是"从道具箱翻出一件东西，再决定怎么用"。
 */
import { ALARM_MAX, SURVIVOR_INJURED_HP } from '../../constants';
import { roomDistance } from '../../navigation';
import { random, randomOf } from '../../random';
import { roomName } from '../../missions';
import type { GameState, Person, SurvivorItem } from '../../types';
import { cabinetRoomsFor, npcPeople as npcs } from '../../world/roomState';
import { SURVIVOR_ITEM_LABEL } from '../catalog';
import { itemUsesFor } from '../factory';
import type { NpcHost } from './host';
/**
 * 幸存者不是随手乱抓：他会看场上缺什么再决定拿哪件。
 * 有人倒地 → 医疗包；电闸损坏或断电 → 工具箱；想报警 → 信号弹；
 * 想跑 → 钥匙；要挡你 → 武器；被盯上 → 烟雾弹。留两成随机，人也会慌。
 */
export function pickSupply(host: NpcHost, state: GameState, person: Person): SurvivorItem {
  const downed = npcs(state).some((p) => p.hp <= 0);
  const injured = npcs(state).some((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP);
  const circuitsNeedRepair = state.powerCircuits.some((circuit) => circuit.broken || circuit.enabled === false);
  const score: Record<SurvivorItem, number> = {
    medkit: (downed ? 5 : 0) + (injured ? 2 : 0) + (person.archetype === 'rescuer' ? 4 : 0),
    toolbox: circuitsNeedRepair ? 4 : 0,
    flare: (state.alarm < 45 ? 3 : 1) + (person.archetype === 'caller' ? 4 : 0),
    weapon: (person.archetype === 'defiant' || person.archetype === 'brave' ? 5 : 0) + (state.alarm >= 45 ? 2 : 0),
    smoke: (person.alert >= 25 ? 4 : 1) + (person.sneaky ? 2 : 0),
    flashlight: (person.archetype === 'defiant' || person.archetype === 'kiter' ? 3 : 1) + (person.alert >= 40 ? 2 : 0),
  };
  const all = Object.keys(score) as SurvivorItem[];
  const best = all.slice().sort((a, b) => score[b] - score[a])[0];
  return random() < 0.78 ? best : randomOf(all);
}

/** 走到道具箱前翻一件东西：这是幸存者「多一个选择」的来源 */
export function tryTakeSupply(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.item) return false;
  const box = state.siteItems.find(
    (i) => i.kind === 'itemBox' && i.room === person.room && !i.broken && i.charges > 0,
  );
  if (!box) return false;
  box.charges -= 1;
  const item = pickSupply(host, state, person);
  person.item = item;
  person.itemUses = itemUsesFor(item);
  if (item === 'weapon') person.armed = true;
  person.intent = 'work';
  person.activity = `翻出了${SURVIVOR_ITEM_LABEL[item]}`;
  host.addDisturbance(state, person.room);
  host.log(state, `${person.name} 在${roomName(person.room)}的道具箱里翻出了${SURVIVOR_ITEM_LABEL[item]}（这个箱子还剩 ${box.charges} 件）。`);
  return true;
}

/**
 * 道具只在「用得上的那一刻」生效，用完即弃。
 * 医疗包 / 信号弹 / 钥匙 / 烟雾弹各开一条路；工具箱与武器是装备，留到对应场合。
 * 它们是幸存者手里的选择，不是引擎里写死的全局判定。
 */
export function useSurvivorItem(host: NpcHost, state: GameState, person: Person): boolean {
  const item = person.item;
  if (!item || person.itemUses <= 0) return false;
  switch (item) {
    case 'medkit': {
      const hurt =
        npcs(state).find((p) => p.hp <= 0 && roomDistance(person.room, p.room) <= 2) ??
        npcs(state).find((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP && roomDistance(person.room, p.room) <= 2);
      if (!hurt) return false;
      // 治疗必须跨过一个完整回合；同一回合内即使连续触发 NPC 行动，也不会提前完成。
      person.intent = 'heal';
      if (person.healLastTurn === undefined) {
        person.healLastTurn = state.turn;
        person.healTurns = 1;
        person.activity = `正在给${hurt.name}包扎（本回合治疗中）`;
        host.log(state, `${person.name} 蹲下来给${hurt.name}包扎；如果这一回合没有被你找到，伤口就会处理好。`);
        host.addDisturbance(state, person.room);
        return true;
      }
      if (state.turn <= person.healLastTurn) {
        person.activity = `正在给${hurt.name}包扎（还需要一个回合）`;
        return true;
      }
      person.healTurns = 0;
      person.healLastTurn = undefined;
      if (hurt.hp <= 0) host.rescuePerson(state, hurt);
      else host.healPerson(state, hurt, 1);
      host.consumeItem(state, person);
      person.activity = `把${hurt.name}救了回来`;
      host.log(state, `${person.name} 用医疗包救回了${hurt.name}——你留下的伤被人补回来了。`);
      host.addDisturbance(state, person.room);
      return true;
    }
    case 'flashlight': {
      // 只有和玩家同屋才照得到；不在就先揣着
      if (person.room !== state.playerRoom) return false;
      host.consumeItem(state, person);
      host.interruptPlayer(state, `${person.name} 拧亮手电筒，一道白光正打在你脸上。`, person.id);
      return true;
    }
    case 'flare': {
      if (state.alarm >= ALARM_MAX - 12) return false;
      host.consumeItem(state, person);
      person.intent = 'call';
      person.activity = '打出了一发信号弹';
      host.log(state, `${person.name} 打出信号弹，整栋房子的警戒往上窜了一截。`);
      host.addDisturbance(state, person.room);
      host.addAlarm(state, 14);
      return true;
    }
    case 'smoke': {
      if (person.alert < 18) return false;
      host.consumeItem(state, person);
      person.alert = Math.max(0, person.alert - 35);
      if (cabinetRoomsFor(state).includes(person.room) && random() < 0.6) person.hidden = true;
      state.trails = state.trails.filter((t) => t.room !== person.room);
      person.activity = '丢出烟雾弹，从视线里消失了';
      host.log(state, `${person.name} 丢了烟雾弹，脚印和视线一起断在这里。`);
      return true;
    }
    case 'toolbox': {
      const circuit = state.powerCircuits.find((item) =>
        item.breakerRoom === person.room && (item.broken || item.enabled === false),
      );
      if (!circuit) return false;
      circuit.broken = false;
      circuit.enabled = true;
      host.consumeItem(state, person);
      person.intent = 'work';
      person.activity = `用工具箱修复了${circuit.name}电闸`;
      host.addDisturbance(state, person.room);
      host.log(state, `${person.name} 用工具箱修复了${circuit.name}电闸，相关区域恢复供电。`);
      return true;
    }
    case 'weapon':
      // 武器会在反抗时消耗；工具箱用于修复被破坏的电闸。
      return false;
  }
  return false;
}
