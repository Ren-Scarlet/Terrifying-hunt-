/**
 * AI 需要引擎提供的"写"服务。
 *
 * 为什么要这一层：AI 模块不能反过来 import engine.ts（会形成循环依赖）。
 * 把「记日志、加警报、留脚印、留动静、踩夹子」这几件事通过接口传进来，
 * 依赖方向就变成 engine -> ai 单向，AI 才能真正独立出去。
 */
import type { GameState, Person, RoomId } from '../../types';
import type { Cond, Op, Who } from '../../effect';

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
  /** 逐个幸存者的回合行动 */
  runNpcTurn(state: GameState): void;
  /** 回合阶段：电话兑现 / 逃生 / 警察 / 目击 */
  callPhase(state: GameState): void;
  escapePhase(state: GameState): void;
  policePhase(state: GameState): void;
  /** 回合收尾：警报降温、视野、痕迹、天亮压力、环境事件 */
  syncWanted(state: GameState): void;
  refreshVision(state: GameState): void;
  pruneTrails(state: GameState): void;
  pruneDisturbances(state: GameState): void;
  dawnPhase(state: GameState): number;
  applyDawnPressure(state: GameState, previousPhase: number): void;
  triggerEnvironmentalEvent(state: GameState): void;
  /** 给玩家补牌，返回实际抽到的张数 */
  drawForPlayer(state: GameState, count: number): number;
  /** 主目标完成检查 */
  checkImmediateWin(state: GameState): void;
  /** 玩家做完一个动作后的统一收尾（幸存者反应、计步、目标检查） */
  afterPlayerAction(state: GameState): void;
  /** 玩家踏进房间的瞬间 */
  npcOnPlayerEnter(state: GameState, barricadedEntry?: boolean): void;
  /** D6 检定：返回是否成功 */
  rollD6Check(state: GameState, label: string, successOn?: number): boolean;
  /** 标记房间已探索 */
  markExplored(state: GameState, room: RoomId): void;
  /** 让相邻房间暂时可见 */
  scoutRoom(state: GameState, room: RoomId, turns?: number): void;
  /** 玩家被打断时，全体幸存者各行动一次 */
  survivorsActOnce(state: GameState, actorId: string): void;
  /** 脚印追踪带来的杀戮值变化 */
  updateFrenzy(state: GameState, from: RoomId, to: RoomId): void;
  /** 女猎手飞斧回补 */
  refillHuntressHatchets(state: GameState): boolean;
  /** 目击事件：同屋的人看到攻击/死亡/被抱走 */
  npcWitnessEvent(state: GameState, room: RoomId, event: 'attack' | 'murder' | 'abduction', subjectId: string): number;
  /** 房间里能下手的受害者（按目标优先级挑） */
  findVictim(state: GameState, room: RoomId, maxHp?: number, allowDowned?: boolean, targetId?: string): Person | undefined;
  /** 这个人现在能不能被处决 */
  canExecuteNow(person: Person): boolean;
  /** 处决是否有目击者 */
  executionWitnessed(state: GameState, victim: Person): boolean;
  /** 真正执行处决（扣人数、加分数、触发结算） */
  executePerson(state: GameState, person: Person): void;
  /** 卡牌前置条件判定 */
  checkCond(state: GameState, cond: Cond): boolean;
  /** 按 who 选择目标人群 */
  selectPeople(state: GameState, who: Who): Person[];
  /** 卡牌实际消耗（受折扣影响） */
  effectiveCost(defId: string, state: GameState): number;
  /** 执行一串卡牌效果 */
  runOps(state: GameState, ops: Op[]): void;
  /** 房间现在是否在玩家视野里 */
  isRoomVisible(state: GameState, room: RoomId): boolean;
  /** 这个幸存者现在是否可见 */
  isPersonVisible(state: GameState, person: Person): boolean;
  /** 玩家正前方一格的相邻房间 */
  forwardRoom(state: GameState): RoomId | null;
  /** 杀手能力剩余冷却 */
  powerCooldown(state: GameState, powerId: string): number;
  /** 用新决策给这个人选一个动作并执行；endOfTurn 时结算警戒衰减 */
  runDecision(state: GameState, person: Person, endOfTurn?: boolean): void;
}
