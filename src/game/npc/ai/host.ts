/**
 * AI 需要引擎提供的"写"服务。
 *
 * 为什么要这一层：AI 模块不能反过来 import engine.ts（会形成循环依赖）。
 * 把「记日志、加警报、留脚印、留动静、踩夹子」这几件事通过接口传进来，
 * 依赖方向就变成 engine -> ai 单向，AI 才能真正独立出去。
 */
import type { GameState, Person, RoomId } from '../../types';

export interface NpcHost {
  /** 往对局日志写一行 */
  log(state: GameState, text: string): void;
  /** 全局警报值变化（会自动处理 60/100 的阈值） */
  addAlarm(state: GameState, amount: number): void;
  /** 在地板上留一段脚印 */
  pushTrail(state: GameState, from: RoomId, to: RoomId, blood: boolean): void;
  /** 在房间留下动静（乌鸦、地板响） */
  addDisturbance(state: GameState, room: RoomId): void;
  /** 移动进入房间时结算捕兽夹 */
  triggerBearTrapForPerson(state: GameState, person: Person): void;
}
