/**
 * AI 需要引擎提供的"写"服务。
 *
 * 为什么要这一层：AI 模块不能反过来 import engine.ts（会形成循环依赖）。
 * 把「记日志、加警报、留脚印、留动静、踩夹子」这几件事通过接口传进来，
 * 依赖方向就变成 engine -> ai 单向，AI 才能真正独立出去。
 */
import type { GameState, Person, RoomId, SiteItem } from '../../types';

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
  /** 主决策：这一回合按本能做什么 */
  actByArchetype(state: GameState, person: Person): void;
  /** 同屋看到玩家时的即时反应（只改状态，不移动） */
  sameRoomKillerReact(state: GameState, armed: boolean): void;
  /** 造成伤害（会触发恐惧、逃跑与死亡结算） */
  damagePerson(state: GameState, person: Person, amount: number, options?: { affectFear?: boolean; forceFlee?: boolean }): void;
  /** 移除一名幸存者并结算死亡 */
  killPerson(state: GameState, person: Person): void;
  /** 用掉手里的幸存者道具，返回是否真的用了 */
  useSurvivorItem(state: GameState, person: Person): boolean;
  /** 在道具箱翻一件补给 */
  tryTakeSupply(state: GameState, person: Person): boolean;
  /** 结算这一轮移动踩到的捕兽夹 */
  resolveTrapEntries(state: GameState, before: Map<string, RoomId>): void;
  /** 刷新头顶对白 */
  updateNpcDialogue(state: GameState): void;
  /** 记录移动留下的脚印 */
  recordTrails(state: GameState, before: Map<string, RoomId>): void;
  /** 记录每个人移动前的房间 */
  snapshotRooms(state: GameState): Map<string, RoomId>;
  /** 正面反击：玩家下回合少走一步 */
  counterAttack(state: GameState, person: Person): void;
  /** 有人倒地时主动赶过去 */
  tryAidRun(state: GameState, person: Person): boolean;
  /** 还能领补给的道具箱 */
  usableItemBoxes(state: GameState): SiteItem[];
  /** 玩家被打断：扣行动点、清追势，并让幸存者趁机行动 */
  interruptPlayer(state: GameState, reason: string, actorId: string): void;
  /** 记录玩家最后看到某人的位置 */
  rememberVisible(state: GameState): void;
  /** 当前正被玩家贴上的人（贴脸时不再触发转身就跑） */
  getChasedId(): string | null;
  /** 结束这一局（胜负结算） */
  finish(state: GameState, result: 'win' | 'caught' | 'timeout' | 'failed'): void;
  /** 报警成功：暴露度大涨、警察赶来 */
  finishCall(state: GameState, person: Person, device: string): void;
  /** 目击者对暴露度的贡献（受布局牌削弱） */
  witnessWanted(state: GameState, base: number): number;
}
