/**
 * 电话的只读查询。
 *
 * 只回答「这台电话现在能不能用」，不负责砸电话、不写状态。
 * 电话位置每局随机（`setup.ts`），所以这里只读 `state.phones`，不写死房间。
 */
import type { GameState, RoomId } from '../types';

/** 这间房的电话是否可用：有电话 + 没被砸坏 + 线路没被整体切断 */
export function phoneWorks(state: GameState, room: RoomId): boolean {
  return (state.phones ?? []).includes(room)
    && !(state.brokenPhones ?? []).includes(room)
    && !state.phoneCut;
}

/** 所有还能用的电话房间 */
export function workingPhones(state: GameState): RoomId[] {
  return (state.phones ?? []).filter((room) => phoneWorks(state, room));
}
