/**
 * 房间图上的最短路：往目标房间走的第一步。
 *
 * 纯计算：不改状态、不消耗随机。锁定与木板在这里就被当成"不可通行"，
 * 所以调用方拿到的永远是能真的走出去的第一步。
 */
import { ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { canStand, isLocked } from './roomState';

export function nextStepToward(
  state: GameState,
  from: RoomId,
  to: RoomId,
  avoid: RoomId[] = [],
  respectLocks = true,
): RoomId | null {
  if (from === to || avoid.includes(to)) return null;
  // 房间封锁的是整扇门：房内 NPC 不能穿门离开，房外 NPC 也不能进入。
  if (respectLocks && isLocked(state, from)) return null;
  const blocked = new Set<RoomId>(avoid);
  const queue: RoomId[][] = [[from]];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of ROOM_MAP[current].neighbors) {
      if (seen.has(next)) continue;
      if (blocked.has(next) && next !== to) continue;
      if (respectLocks && isLocked(state, next)) continue;
      if (!canStand(state, next) && next !== to) continue;
      seen.add(next);
      const newPath = [...path, next];
      if (next === to) return newPath[1];
      queue.push(newPath);
    }
  }
  return null;
}
