import { ROOM_MAP } from './rooms';
import type { RoomId } from './types';

/**
 * 房间图上的纯路径查询。
 *
 * 房间布局由每局的 buildLayout() 动态生成，因此这里每次都读取 ROOM_MAP，
 * 不缓存邻接关系，避免新一局沿用上一局的路径。
 */

/** 使用 BFS 计算两间房的最短步数；无法到达时返回 99。 */
export function roomDistance(from: RoomId, to: RoomId): number {
  if (from === to) return 0;
  const queue: Array<[RoomId, number]> = [[from, 0]];
  const seen = new Set<RoomId>([from]);
  while (queue.length) {
    const [cur, d] = queue.shift()!;
    for (const next of ROOM_MAP[cur].neighbors) {
      if (seen.has(next)) continue;
      if (next === to) return d + 1;
      seen.add(next);
      queue.push([next, d + 1]);
    }
  }
  return 99;
}

/**
 * 两间房在布局网格上的「空隔格数」：0 = 只隔一堵墙（相邻），1 = 中间空一格，依此类推。
 * 用房间边缘算而不是中心点——大厅、走廊这种大房间中心离得很远，但它们在图上明明贴着。
 * 没有格子信息时返回 99。
 */
export function cellDistance(from: RoomId, to: RoomId): number {
  const a = ROOM_MAP[from]?.cell;
  const b = ROOM_MAP[to]?.cell;
  if (!a || !b || (a.width === 0 && a.height === 0) || (b.width === 0 && b.height === 0)) return 99;
  const gapX = Math.max(0, a.left - (b.left + b.width), b.left - (a.left + a.width));
  const gapY = Math.max(0, a.top - (b.top + b.height), b.top - (a.top + a.height));
  return Math.max(gapX, gapY);
}

/** 从候选房间中选择离起点最近的一间。 */
export function nearestOf(from: RoomId, candidates: RoomId[]): RoomId {
  let best = candidates[0];
  let bestLen = Infinity;
  for (const c of candidates) {
    const len = roomDistance(from, c);
    if (len < bestLen) {
      bestLen = len;
      best = c;
    }
  }
  return best;
}
