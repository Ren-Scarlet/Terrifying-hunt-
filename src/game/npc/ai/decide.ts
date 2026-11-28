/**
 * 幸存者的主决策：他这一回合按自己的本能做什么。
 *
 * 这是旧 AI 的核心，暂时原样搬出来，行为一个字没改。
 * 它只通过 NpcHost 调引擎的写服务，不 import engine.ts。
 */
import { ESCAPE_ROOMS, REACT_MOVE_CAP, SURVIVOR_INJURED_HP } from '../../constants';
import { roomName } from '../../missions';
import { nearestOf, roomDistance } from '../../navigation';
import { random, randomOf } from '../../random';
import { RADIO_ROOMS, ROOM_MAP, WEAPON_ROOMS } from '../../rooms';
import type { GameState, Person } from '../../types';
import { nextStepToward } from '../../world/pathfinding';
import { phoneWorks, workingPhones } from '../../world/phones';
import { cabinetRoomsFor, isLocked, npcPeople as npcs, peopleInRoom, standingPeople as standing } from '../../world/roomState';
import type { NpcHost } from './host';
import { canPlaceBarricade, fearBand } from './predicates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function actByArchetype(host: NpcHost, state: GameState, person: Person): void {
  // 拉扯型、反抗型与英勇型会在近距离追逐中放倒家具，给自己争取逃跑时间。
  const counterArchetype = person.archetype === 'defiant' || person.archetype === 'brave' || person.archetype === 'kiter';
  const inPursuit = (person.alert >= 40 || state.chaseTargetId === person.id) && roomDistance(person.room, state.playerRoom) <= 2;
  // 恐惧驱动：崩溃的人不再执行任何有目的的行为；被恐惧压过理智的人只想着逃。
  const band = fearBand(person);
  if (band === 'broken' && person.hp > 0) {
    person.intent = 'flee';
    if (random() < 0.45) {
      person.activity = '瘫软在地，止不住地发抖';
      host.log(state, `${person.name} 已经吓破了胆，瘫在原地一动不动。`);
      return;
    }
    if (host.fleeAway(state, person, false, true)) {
      person.activity = '尖叫着乱跑，完全失去了方向';
      host.log(state, `${person.name} 尖叫着撞开房门，根本不知道该往哪里跑。`);
      return;
    }
    person.activity = '缩在墙角发抖';
    return;
  }
  if (band === 'afraid' && person.alert < 85 && person.hp > 0) {
    if (inPursuit && canPlaceBarricade(state, person) && random() < 0.6) {
      host.barricadeRoom(state, person);
      host.fleeAway(state, person, false, true);
      person.activity = '慌不择路地放下木板，只想离你远一点';
      host.log(state, `${person.name} 慌不择路地放下木板挡住门，头也不回地逃了。`);
      return;
    }
    if (host.fleeAway(state, person, false, true)) {
      person.activity = '只想离你远一点';
      return;
    }
  }
  // 阻滞（轻量）：冷静的人先躲，不先慌。他们不会硬扛伤害，
  // 只是让你多花 1 AP 搜索这间屋子——增加的是"找人"的成本，不是"砍人"的成本。
  if (band === 'calm' && !person.hidden && person.alert >= 50 && person.hp > 0
    && cabinetRoomsFor(state).includes(person.room)
    && roomDistance(person.room, state.playerRoom) <= 1
    && random() < 0.5) {
    person.hidden = true;
    person.intent = 'hide';
    person.activity = '听见脚步，先躲进柜子里';
    host.log(state, `${person.name} 听见门外的脚步声，悄悄钻进了柜子。`);
    return;
  }
  const seeksTotemThisTurn = (person.id.charCodeAt(0) + state.turn + (person.routineIndex ?? 0)) % 6 === 0;
  if (!inPursuit && state.totems.length && (person.awareness >= 1 || person.alert >= 25) && seeksTotemThisTurn) {
    const targetTotem = nearestOf(person.room, state.totems);
    if (targetTotem !== person.room) {
      const step = nextStepToward(state, person.room, targetTotem, [state.playerRoom]);
      if (step && !state.barricades.includes(step)) {
        person.room = step;
        person.intent = 'work';
        person.activity = '寻找并拆除厄咒图腾';
        host.log(state, `${person.name} 正在寻找图腾，试图解除猎场中的诅咒。`);
        return;
      }
    }
  }
  if (counterArchetype && inPursuit && canPlaceBarricade(state, person) && random() < 0.72) {
    const blockedRoom = person.room;
    const alertBeforeEscape = person.alert;
    host.barricadeRoom(state, person);
    if (host.fleeAway(state, person)) {
      person.movesThisTurn = Math.min(REACT_MOVE_CAP, person.movesThisTurn + 1);
      person.alert = Math.max(person.alert, alertBeforeEscape);
    }
    person.activity = `放下木板阻挡追击后逃离${roomName(blockedRoom)}`;
    host.log(state, `${person.name} 趁你追近时猛地放下木板封住入口，转身逃向远处！`);
    return;
  }
  // 房间锁作用于整扇门，任何原型都不能从锁住的房间直接穿门离开。
  if (isLocked(state, person.room)) {
    person.activity = '房门被封锁，无法离开';
    return;
  }
  if (person.alert >= 85 && phoneWorks(state, person.room) && person.hp > 0) {
    host.tryCall(state, person);
    host.log(state, `${person.name}因高度警戒，正在尝试报警！`);
    return;
  }
  if (state.escapeRooms.length && person.alert >= 75 && person.hp > 0) {
    const exit = nearestOf(person.room, state.escapeRooms);
    if (exit === person.room) { person.intent = 'escape'; person.activity = '已抵达逃生点'; return; }
    const step = nextStepToward(state, person.room, exit, [state.playerRoom]);
    if (step) { person.room = step; person.intent = 'escape'; person.goal = 'exit'; person.activity = `正前往逃生点：${roomName(exit)}`; return; }
  }
  switch (person.archetype) {
    case 'kiter': {
      // 拉扯型：不硬拼，绕远路、抹脚印、必要时丢烟雾，专门把追逐拖长
      if (person.item === 'smoke' && person.itemUses > 0 && person.alert >= 25) {
        host.consumeItem(state, person);
        person.alert = Math.max(0, person.alert - 35);
        state.trails = state.trails.filter((t) => t.room !== person.room);
        person.activity = '丢下烟雾，脚印断在这里';
        host.log(state, `${person.name} 丢出烟雾弹，从你的视线里绕开了。`);
        return;
      }
      const away = ROOM_MAP[person.room].neighbors.filter((r) => r !== state.playerRoom);
      const step = away.length ? randomOf(away) : nextStepToward(state, person.room, ESCAPE_ROOMS[0], [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '绕着远路拉开距离';
      } else {
        host.fleeAway(state, person);
      }
      return;
    }
    case 'caller': {
      if (phoneWorks(state, person.room)) {
        host.tryCall(state, person);
        return;
      }
      const target = !state.phoneCut
        ? nearestOf(person.room, workingPhones(state))
        : !state.sabotage.includes('radio')
          ? RADIO_ROOMS[0]
          : ESCAPE_ROOMS[0];
      const step = nextStepToward(state, person.room, target, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '朝能求救的地方跑';
        host.log(state, `${person.name} 跑向${roomName(step)}——那里能联系外面。`);
      } else {
        host.fleeAway(state, person);
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
          host.log(state, `${person.name} 在厨房找到了一把刀。他现在敢正面挡你。`);
          host.addAlarm(state, 3);
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
      if (canPlaceBarricade(state, person)) {
        host.barricadeRoom(state, person);
        return;
      }
      host.fleeAway(state, person);
      return;
    }
    case 'rescuer': {
      if (host.tryRescue(state, person)) return;
      // 倒地者优先于受伤者：以前只找站着的人，救援型永远不会走向被砍倒的同伴
      const downed = npcs(state)
        .filter((p) => p.hp <= 0 && p.room !== state.playerRoom)
        .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
      const wounded = standing(state)
        .filter((p) => p.hp > 0 && p.hp <= SURVIVOR_INJURED_HP && p.room !== person.room)
        .sort((a, b) => roomDistance(person.room, a.room) - roomDistance(person.room, b.room))[0];
      const target = downed ?? wounded;
      if (target) {
        const step = nextStepToward(state, person.room, target.room, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = downed ? `赶去救倒地的 ${target.name}` : '赶去救受伤的人';
          return;
        }
      }
      host.fleeAway(state, person);
      return;
    }
    case 'hider': {
      if (person.hidden) {
        person.intent = 'hide';
        person.activity = '缩在柜子里，不敢出声';
        return;
      }
      if (cabinetRoomsFor(state).includes(person.room)) {
        person.hidden = true;
        person.intent = 'hide';
        person.activity = '钻进了柜子';
        host.log(state, `${person.name} 钻进了柜子，屋子里少了一个人。`);
        return;
      }
      const cabinet = nearestOf(
        person.room,
        cabinetRoomsFor(state).filter((r) => !isLocked(state, r)),
      );
      const step = nextStepToward(state, person.room, cabinet, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.intent = 'flee';
        person.activity = '找能藏人的地方';
        return;
      }
      host.fleeAway(state, person);
      return;
    }
    case 'brave': {
      if (!person.armed) {
        if (WEAPON_ROOMS.includes(person.room)) {
          person.armed = true;
          person.activity = '拿起了武器';
          host.log(state, `${person.name} 找到了武器，开始招呼其他人。`);
          host.addAlarm(state, 3);
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
      if (random() < 0.5) host.fleeAway(state, person);
      return;
    }
    case 'alert': {
      const goalRoom = person.goal === 'phone' && workingPhones(state).length ? workingPhones(state)[0] : ESCAPE_ROOMS[0];
      if (person.goal === 'exit' || person.goal === 'panic') {
        const step = nextStepToward(state, person.room, ESCAPE_ROOMS[0], [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'escape';
          person.activity = '朝后院跑';
          host.log(state, `${person.name} 往${roomName(step)}跑，想从后院出去。`);
          return;
        }
      }
      if (goalRoom !== person.room) {
        const step = nextStepToward(state, person.room, goalRoom, [state.playerRoom]);
        if (step) {
          person.room = step;
          person.intent = 'flee';
          person.activity = '边跑边喊';
          host.shout(state, person, 12);
          return;
        }
      }
      host.fleeAway(state, person);
      return;
    }
  }
}
