/**
 * 玩家的探索类执行动作：移动、等一回合、破门/破板、查看、搜索、互动。
 *
 * 这些函数只负责"执行"：校验交给 rules/actionRules 与 canMoveTo，
 * 结算交给 afterPlayerAction。这样界面、AI、回合结算看到的是同一套判定。
 */
import { LOOK_COST, SEARCH_COST, SURVIVOR_INJURED_HP } from '../constants';
import { BLOOD, awardBlood } from '../bloodpoints';
import { drawCards } from '../deck';
import { roomName } from '../missions';
import { random } from '../random';
import type { GameState, Person, RoomId } from '../types';
import type { NpcHost } from '../npc/ai/host';
import { ROOM_MAP } from '../rooms';
import { canMoveTo, moveCost } from '../world/movement';
import { cabinetRoomsFor, isLocked, isObstacle, npcPeople as npcs, peopleInRoom } from '../world/roomState';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function breakBarricade(host: NpcHost, state: GameState, room: RoomId): boolean {
  const dynamicBoard = state.barricades.includes(room);
  const fixedBoard = isObstacle(room) && !state.clearedObstacles.includes(room) && !state.possessed;
  if (state.phase !== 'playing' || (!dynamicBoard && !fixedBoard) || !ROOM_MAP[state.playerRoom].neighbors.includes(room)) return false;
  if (state.energy < 1) { host.log(state, '行动点不足：破坏木板需要 1 点。'); return false; }
  state.energy -= 1;
  if (dynamicBoard) state.barricades = state.barricades.filter((r) => r !== room);
  if (fixedBoard) state.clearedObstacles.push(room);
  host.log(state, `你花费 1 点行动点，将${roomName(room)}入口的木板砸碎。`);
  // 砸开木板的巨响会直接惊动门后的人：以前只有一句日志，屋内幸存者的警戒几乎不动，不合理。
  const inside = state.people.filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && person.room === room);
  inside.forEach((person) => {
    person.alert = Math.max(person.alert, 55);
    person.fear = clamp(person.fear + 12, 0, 100);
  });
  if (inside.length) {
    host.log(state, `木板碎裂的巨响让${inside.map((person) => person.name).join('、')}立刻警觉起来，${inside.length > 1 ? '他们' : '他'}开始死死盯住门口。`);
  }
  awardBlood(state, 'control', `破坏木板 · ${roomName(room)}`, BLOOD.barricade, { key: `barricade:${room}`, limit: 1 });
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

/**
 * 破门：只对相邻、且确实上锁的门生效。
 * 和「破坏现场设施」分开，做成房间点位上的独立互动标记。
 */
export function breakDoor(host: NpcHost, state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (!ROOM_MAP[state.playerRoom].neighbors.includes(room) || !isLocked(state, room)) {
    host.log(state, '这里没有可以撞开的门锁。');
    return false;
  }
  if (state.energy < 1) {
    host.log(state, '行动点不足：破门需要 1 点。');
    return false;
  }
  state.energy -= 1;
  state.roomLocks[room] = 0;
  host.log(state, `你用蛮力撞开通往${roomName(room)}的门锁，屋里的人被巨响惊动。`);
  npcs(state).filter((person) => person.room === room && person.hp > 0).forEach((person) => {
    person.alert = clamp(person.alert + 24, 0, 100);
    person.fear = clamp(person.fear + 12, 0, 100);
  });
  host.addAlarm(state, 5);
  awardBlood(state, 'control', `破坏木门 · ${roomName(room)}`, BLOOD.breakDoor, { key: `door:${room}`, limit: 1 });
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function waitAction(host: NpcHost, state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.energy < 1) { host.log(state, '行动点不足，无法等待。'); return false; }
  state.energy -= 1;
  state.attackReady = true;
  host.log(state, '你停下脚步，屏住呼吸观察周围。幸存者趁这个空档行动。');
  host.survivorsActOnce(state, 'wait');
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function movePlayer(host: NpcHost, state: GameState, room: RoomId): boolean {
  // 搬运倒地者时，附近的手电筒携带者会冲过来照眼，把猎物放回地面。
  if (state.carryPersonId) {
    const carrier = npcs(state).find((person) =>
      person.item === 'flashlight' &&
      person.itemUses > 0 &&
      person.hp > 0 &&
      person.alert >= 40 &&
      (person.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(person.room)),
    );
    if (carrier && random() < 0.5) {
      const carried = state.people.find((person) => person.id === state.carryPersonId);
      host.consumeItem(state, carrier);
      if (carrier.room !== state.playerRoom) carrier.room = state.playerRoom;
      state.carryPersonId = null;
      state.carryDistance = 0;
      if (carried) {
        carried.room = state.playerRoom;
        carried.activity = '被手电筒照得摔回地面';
      }
      host.interruptPlayer(state, `${carrier.name} 冲过来用手电筒照向你的眼睛，搬运被打断了！`, carrier.id);
      host.afterPlayerAction(state);
      return false;
    }
  }
  if (state.carryPersonId && state.carryDistance >= 3) {
    const carried = state.people.find((p) => p.id === state.carryPersonId);
    if (!host.rollD6Check(state, '远距离搬运', 4)) {
      if (carried) {
        carried.hp = SURVIVOR_INJURED_HP;
        carried.downedTurns = 0;
        carried.hidden = false;
        carried.blockedTurns = 0;
        carried.fear = Math.min(carried.fear, 70);
        carried.alert = 100;
        carried.activity = '挣脱搬运，带伤逃跑';
        host.log(state, `${carried.name} 在搬运途中猛然挣脱，恢复为受伤状态并逃走！`);
        state.carryPersonId = null;
        state.carryDistance = 0;
        host.fleeAway(state, carried);
      }
      state.energy = Math.max(0, state.energy - 1);
      host.afterPlayerAction(state);
      return false;
    }
  }
  if (state.barricades.includes(room) && ROOM_MAP[state.playerRoom].neighbors.includes(room) && !isLocked(state, room) && !isLocked(state, state.playerRoom)) {
    if (state.energy < 1) { host.log(state, '木板封住了入口；撞开它需要 1 点行动点。'); return false; }
    state.energy -= 1;
    state.barricades = state.barricades.filter((r) => r !== room);
    host.log(state, `你试图撞开${roomName(room)}入口的木板，木板突然向你砸来！`);
    host.interruptPlayer(state, '你撞上幸存者刚放下的木板，被重重砸晕！杀戮值清零。', state.chaseTargetId ?? 'dropped-pallet');
    state.attackReady = true;
    host.afterPlayerAction(state);
    host.checkImmediateWin(state);
    return true;
  }
  const staticBoard = isObstacle(room) && !state.clearedObstacles.includes(room) && !state.possessed;
  if (staticBoard && ROOM_MAP[state.playerRoom].neighbors.includes(room) && !isLocked(state, room) && !isLocked(state, state.playerRoom)) {
    host.log(state, `${roomName(room)}入口被木板封住了；点击地图上的「破坏木板」花费 1 点行动点。`);
    return false;
  }
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (!canMoveTo(state, room)) {
    host.log(state, state.energy < cost ? '行动点不够，走不过去。' : '无法移动到那里：不是相邻房间，或路被堵住了。');
    return false;
  }

  const from = state.playerRoom;
  state.watchedRoom = from;
  if (state.killer === '迈克尔·迈尔斯' && state.myersStalking) {
    state.myersMovedThisTurn = true;
    state.stalkTargetId = null;
    state.stalkPressure = 0;
  }
  const fromRect = ROOM_MAP[from].rect;
  const toRect = ROOM_MAP[room].rect;
  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  state.playerFacing = { x: dx / length, y: dy / length };
  state.energy -= cost;
  state.playerRoom = room;
  host.markExplored(state, room);
  if (state.carryPersonId) {
    const carried = state.people.find((p) => p.id === state.carryPersonId);
    if (carried) {
      carried.room = room;
      state.carryDistance += 1;
    }
  }
  host.log(
    state,
    state.freeMove
      ? `你借着潜行掠到${roomName(room)}（不耗行动点）。`
      : `你移动到${roomName(room)}（消耗 ${cost} 点行动点${cost > 1 ? '，撞开了门' : ''}）。`,
  );
  const barricadedEntry = state.barricades.includes(room);
  // 先让屋里的人对「推门」做反应；障碍伏击结算后再清掉路障。
  host.npcOnPlayerEnter(state, barricadedEntry);
  if (barricadedEntry) state.barricades = state.barricades.filter((r) => r !== room);
  if (state.carryPersonId) {
    const carried = state.people.find((person) => person.id === state.carryPersonId);
    if (carried) host.npcWitnessEvent(state, room, 'abduction', carried.id);
  }
  if (isObstacle(room) && !state.clearedObstacles.includes(room)) {
    state.clearedObstacles.push(room);
    host.log(state, `你借着恶魔附身的力量撞碎${roomName(room)}入口的木板，强行闯入。`);
  }
  // 走出了第一步，刀就收回来了：边走边砍是这个游戏的基本节奏
  state.attackReady = true;
  host.updateFrenzy(state, from, room);
  host.afterPlayerAction(state);

  host.checkImmediateWin(state);
  return true;
}

/**
 * 开始选择查看目标。点击「查看」本身不消耗 AP，也不会自动替玩家选房间。
 * 玩家随后必须在地图上点选一个与当前位置直接相邻的房间。
 */
export function lookAround(host: NpcHost, state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.lookingAround) return cancelLookSelection(host, state);
  if (state.energy < LOOK_COST) {
    host.log(state, `行动点不足：查看需要 ${LOOK_COST} 点。`);
    return false;
  }
  if (!ROOM_MAP[state.playerRoom].neighbors.length) {
    host.log(state, '周围没有可以查看的相邻房间。');
    return false;
  }
  state.lookingAround = true;
  host.log(state, '请选择地图上一个相邻房间进行查看；确认目标后才会消耗 1 点行动点。');
  return true;
}

/** 取消查看选房，不消耗行动点。 */
export function cancelLookSelection(host: NpcHost, state: GameState): boolean {
  if (!state.lookingAround) return false;
  state.lookingAround = false;
  host.log(state, '已取消查看。');
  return true;
}

/** 查看相邻房间：消耗 1 点行动点，获得短暂视野。 */
export function lookAtRoom(host: NpcHost, state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing' || !state.lookingAround) return false;
  if (!ROOM_MAP[state.playerRoom].neighbors.includes(room)) {
    host.log(state, '只能查看与当前位置直接相邻的房间。');
    return false;
  }
  if (state.energy < LOOK_COST) {
    state.lookingAround = false;
    host.log(state, `行动点不足：查看需要 ${LOOK_COST} 点。`);
    return false;
  }
  state.energy -= LOOK_COST;
  state.lookingAround = false;
  host.scoutRoom(state, room, 1);
  host.log(state, `你屏住呼吸查看了「${roomName(room)}」（消耗 ${LOOK_COST} 点行动点）。`);
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

/**
 * 搜索当前房间：把钻进柜子 / 床底的人翻出来。
 * 和走路、挥刀、出牌一样消耗 1 点行动点，也算一次玩家行动（世界跟着动）。
 */
export function interactCabinet(host: NpcHost, state: GameState): boolean {
  if (state.killer === '女猎手') return host.refillHuntressHatchets(state);
  return searchRoom(host, state);
}

export function interactTotem(host: NpcHost, state: GameState, reward: 'draw' | 'energy'): boolean {
  const room = state.playerRoom;
  if (state.phase !== 'playing' || !state.totems.includes(room) || state.totemInteractions.includes(room)) return false;
  state.totemInteractions.push(room);
  if (reward === 'draw') {
    drawCards(state, 1);
    host.log(state, `你从${roomName(room)}的图腾余烬中获得一张卡牌。`);
  } else {
    state.energy += 1;
    host.log(state, `你汲取图腾的力量，立即获得 1 点行动点。`);
  }
  awardBlood(state, 'control', `利用图腾 · ${roomName(room)}`, BLOOD.totem, { key: `totem:${room}`, limit: 1 });
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function searchRoom(host: NpcHost, state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.energy < SEARCH_COST) {
    host.log(state, `行动点不足：搜索需要 ${SEARCH_COST} 点。`);
    return false;
  }
  state.energy -= SEARCH_COST;
  const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
  const found = here.filter((p) => p.hidden);
  const hasCabinet = cabinetRoomsFor(state).includes(state.playerRoom) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(state.playerRoom));
  host.log(state, `你翻查${roomName(state.playerRoom)}（消耗 ${SEARCH_COST} 点行动点）。`);
  // 先无条件把藏着的人揪出来：卡牌可能把人挪到没有柜子的房间，不能让他白藏
  found.forEach((p) => {
    p.hidden = false;
    p.alert = clamp(p.alert + 35, 0, 100);
    awardBlood(state, 'cunning', `柜中搜出 · ${p.name}`, BLOOD.cabinetFind, { key: `search:${p.id}`, limit: 1 });
    awardBlood(state, 'hunt', `捕获躲藏者 · ${p.name}`, BLOOD.hiddenCapture, { key: `capture-hidden:${p.id}`, limit: 1 });
    host.log(state, `${p.name} 被你从藏身处拖了出来。`);
  });
  if (!found.length) {
    host.log(state, hasCabinet ? '柜子里空空的，只有旧衣服和灰。' : '这间屋子没有能藏人的柜子。');
  }
  host.scoutRoom(state, state.playerRoom, 1);
  // 搜索也算「做了一件事」，刀可以收回来了
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}
