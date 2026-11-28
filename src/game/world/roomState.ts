/**
 * 房间与人的只读查询。
 *
 * 这一层只依赖世界数据（房间表 + 状态字段），不依赖 engine.ts 的结算流程。
 * 目的：新的 AI / 界面 / 测试可以直接 import 这里，而不必认识那个 4000 行的上帝模块。
 *
 * 约定：本文件里的函数必须是**纯查询**——
 *   不扣行动点、不写状态、不消耗随机、不产生日志。
 * 想改世界请走执行器（后续 `world/executors.ts`），不要往这里加写操作。
 */
import { CABINET_ROOMS, OBSTACLE_ROOMS } from '../rooms';
import type { GameState, Person, PersonRole, RoomId } from '../types';

/** 各场地的藏身空间；巴德姆幼儿园额外开放玩具仓库、值班室和幼儿教室。 */
export function cabinetRoomsFor(state: GameState): RoomId[] {
  return state.mapId === 'badham'
    ? [...CABINET_ROOMS, 'nursery', 'storage', 'guestroom']
    : CABINET_ROOMS;
}

/** 房间里的人（包括倒地的人，他们还在原地） */
export function peopleInRoom(state: GameState, room: RoomId, role?: PersonRole): Person[] {
  return state.people.filter((p) => p.room === room && (!role || p.role === role));
}

/** 全部 NPC，包括倒地的 */
export function npcPeople(state: GameState): Person[] {
  return state.people.filter((p) => p.role !== 'police');
}

/** 还站着、能做事的 NPC */
export function standingPeople(state: GameState): Person[] {
  return npcPeople(state).filter((p) => p.hp > 0);
}

/**
 * 门是否锁着。
 * 电子锁断电即失效，所以「锁」必须同时满足「还有锁的回合数」和「房间仍然有电」。
 */
export function isLocked(state: GameState, room: RoomId): boolean {
  return (state.roomLocks[room] ?? 0) > 0 && isRoomLit(state, room);
}

/** 还挂着锁的房间（不管有没有电，供 UI / 清理使用） */
export function lockedRoomsOf(state: GameState): RoomId[] {
  return (Object.keys(state.roomLocks) as RoomId[]).filter((r) => (state.roomLocks[r] ?? 0) > 0);
}

/** 入口被木板封死的房间 */
export function isObstacle(room: RoomId): boolean {
  return OBSTACLE_ROOMS.includes(room);
}

/** 这个房间能不能站人：封死的入口在玩家清掉木板之前不能进 */
export function canStand(state: GameState, room: RoomId): boolean {
  if (isObstacle(room) && !state.clearedObstacles.includes(room)) return false;
  return true;
}

/** 房间是否亮着：任一电路正常供电即可 */
export function isRoomLit(state: GameState, room: RoomId): boolean {
  return state.powerCircuits.some((circuit) =>
    !circuit.broken && circuit.enabled !== false &&
    (circuit.flickerTurns ?? 0) <= 0 && circuit.affectedRooms.includes(room),
  );
}
