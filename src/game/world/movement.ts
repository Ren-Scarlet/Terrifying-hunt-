/**
 * 移动的只读规则：走一步要几点、为什么走不进去、能不能走。
 *
 * 这一层只算，不执行——真正扣行动点、写位置的是 `movePlayer`。
 * UI 的悬停提示和点击拦截直接读这里，所以「点了没反应」永远能变成一句原因。
 */
import { roomName } from '../missions';
import { ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { isLocked, isObstacle } from './roomState';

/** 移动到某房间要花几点行动点（迈尔斯尾随模式会更慢） */
export function moveCost(state: GameState, room: RoomId): number {
  const stalkingSlowdown = state.killer === '迈克尔·迈尔斯' && state.myersStalking ? 1 : 0;
  return 1 + stalkingSlowdown;
}

/**
 * 为什么走不进这个房间：返回 null 表示可以走。
 *
 * 纯查询：不扣行动点、不掷搬运检定、不撞木板。
 */
export function moveBlockReason(state: GameState, room: RoomId): string | null {
  if (state.phase !== 'playing') return '现在还不能行动。';
  if (room === state.playerRoom) return '你已经在这个房间了。';
  const adjacent = ROOM_MAP[state.playerRoom].neighbors.includes(room);
  if (!adjacent && !state.freeMove) return `${roomName(room)}不相邻：只能一间一间走过去。`;
  if (state.barricades.includes(room)) return `${roomName(room)}门口堆着木板，先点「破坏木板」。`;
  if (isLocked(state, room)) return `${roomName(room)}的门被锁住了。`;
  if (isLocked(state, state.playerRoom)) return '你所在的房间被锁住了，先想办法出去。';
  if (isObstacle(room) && !state.clearedObstacles.includes(room) && !state.possessed) {
    return `${roomName(room)}入口被木板封住，先破坏木板。`;
  }
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (state.energy < cost) return `行动点不够：进入${roomName(room)}需要 ${cost} 点。`;
  return null;
}

export function canMoveTo(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (room === state.playerRoom) return false;
  // freeMove 是卡牌 / 能力买来的特权：无视相邻限制，而且这一步不耗行动点
  const cost = state.freeMove ? 0 : moveCost(state, room);
  if (state.energy < cost) return false;
  if (state.barricades.includes(room)) return false;
  if (isObstacle(room) && !state.clearedObstacles.includes(room) && !state.possessed) return false;
  if (state.freeMove) return !isLocked(state, room) && !isLocked(state, state.playerRoom);
  if (isLocked(state, room) || isLocked(state, state.playerRoom)) return false;
  return ROOM_MAP[state.playerRoom].neighbors.includes(room);
}
