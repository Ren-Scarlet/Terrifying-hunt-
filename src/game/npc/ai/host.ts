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
  /** 往离玩家最远的方向跑一步 */
  fleeAway(state: GameState, person: Person, quiet?: boolean, ignoreFear?: boolean): boolean;
  /** 喊叫：把警戒传给同屋与隔壁 */
  shout(state: GameState, person: Person, base?: number): void;
  /** 放下木板封门 */
  barricadeRoom(state: GameState, person: Person): boolean;
  /** 打电话 / 用无线电报警 */
  tryCall(state: GameState, person: Person): boolean;
  /** 拉起同屋倒地的同伴 */
  tryRescue(state: GameState, person: Person): boolean;
  /** 用掉手里的幸存者道具 */
  consumeItem(state: GameState, person: Person): void;
  /** 全局报警进度（会折算成暴露度） */
  addWanted(state: GameState, amount: number): void;
  /** 拉起倒地的同伴 */
  rescuePerson(state: GameState, person: Person): void;
  /** 治疗受伤的同伴 */
  healPerson(state: GameState, person: Person, amount?: number): void;
}
