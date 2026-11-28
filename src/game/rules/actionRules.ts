/**
 * 玩家动作的「能不能做」判定与相关成本。
 *
 * 全部是纯查询：只读状态，返回一句原因（null / '' 表示可以做）。
 * 不扣行动点、不写状态、不记日志——真正执行的函数留在 engine.ts，
 * 这样界面可以直接拿这些话做悬停提示，而不会误触发动作。
 */
import { SABOTAGE_COST } from '../constants';
import { RADIO_ROOMS, ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { phoneWorks } from '../world/phones';
import { isLocked } from '../world/roomState';

/** 擦刀：原地花 1 点收回刀锋 */
export const WIPE_COST = 1;
/** 操作一次电闸的行动点成本 */
export const BREAKER_SWITCH_COST = 1;

/** 擦刀为什么按不下去 */
export function wipeBlockReason(state: GameState): string {
  if (state.phase !== 'playing') return '现在不能动手';
  if (state.attackReady) return '刀锋还干净，不用擦';
  if (state.energy < WIPE_COST) return `需要 ${WIPE_COST} 点行动点`;
  return '';
}

/** 电闸只能在所在房间操作；每组电路独立控制对应区域供电。 */
export function breakerBlockReason(state: GameState, circuitId?: string): string | null {
  if (state.phase !== 'playing') return '这一局已经结束了。';
  const circuit = state.powerCircuits.find((item) =>
    circuitId ? item.id === circuitId : item.breakerRoom === state.playerRoom,
  );
  if (!circuit) return '这间屋子没有电闸。';
  if (circuit.breakerRoom !== state.playerRoom) return '必须走到电闸所在房间才能操作。';
  if (circuit.broken) return '电闸控制箱已经损坏，无法操作。';
  if (state.energy < BREAKER_SWITCH_COST) return '行动点不足：操作电闸需要 1 点。';
  return null;
}

/** 当前这间屋子/相邻门锁上，最该被破坏的那个目标 */
export type SabotageTarget =
  | { kind: 'door'; room: RoomId }
  | { kind: 'phone'; room: RoomId }
  | { kind: 'radio' }
  | { kind: 'facility' };

/** 统一破坏入口：相邻门锁、电话线、无线电、电闸与道具箱。 */
export function sabotageTarget(state: GameState): SabotageTarget | null {
  const breaker = state.powerCircuits.some((c) => c.breakerRoom === state.playerRoom && !c.broken);
  const item = state.siteItems.some((i) => i.room === state.playerRoom && !i.broken && i.charges > 0);
  if (breaker || item) return { kind: 'facility' };
  const lockedNeighbor = ROOM_MAP[state.playerRoom].neighbors.find((room) => isLocked(state, room));
  if (lockedNeighbor) return { kind: 'door', room: lockedNeighbor };
  if (phoneWorks(state, state.playerRoom)) return { kind: 'phone', room: state.playerRoom };
  if (RADIO_ROOMS.includes(state.playerRoom) && !state.sabotage.includes('radio')) return { kind: 'radio' };
  if (lockedNeighbor) return { kind: 'door', room: lockedNeighbor };
  return isLocked(state, state.playerRoom) ? { kind: 'door', room: state.playerRoom } : null;
}

export function sabotageBlockReason(state: GameState): string | null {
  if (state.phase !== 'playing') return '这一局已经结束了。';
  if (state.energy < SABOTAGE_COST) return `行动点不足：破坏需要 ${SABOTAGE_COST} 点。`;
  return sabotageTarget(state) ? null : '附近没有可破坏的门锁、通讯设施或现场设施。';
}
