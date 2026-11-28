/**
 * 幸存者的行为决策：给定"他现在的处境"，选出这一回合做的一件事。
 *
 * 纯函数：不读全局、不写状态、不掷随机（需要概率时由外部传入 roll）。
 * 规则来自第一章 1.2 / 1.3 / 1.4：
 *   - 警戒档决定"允许出现哪些动作"（单调：高一档只多不少）。
 *   - 恐惧档决定"做不做得成"（不新增动作类型）。
 *   - 顺序：逃生 > 被攻击/贴脸逃 > 救援 > 治疗 > 防御 > 报警 > 拆图腾 > 观察/移动。
 */
import { type AlertBand, type FearBand, alertBand, fearBand } from './model';
import { type ChaseState, canFlee } from './chase';

export type ActionKind =
  | 'idle'
  | 'observe'
  | 'move'
  | 'flee'
  | 'hide'
  | 'lock'
  | 'barricade'
  | 'call'
  | 'totem'
  | 'rescue'
  | 'heal'
  | 'escape'
  | 'shout';

export interface DecisionContext {
  alert: number;
  fear: number;
  /** 控制状态：不是 normal 就什么都不做 */
  control: 'normal' | 'stunned' | 'downed' | 'carried' | 'pinned';
  /** 玩家就在同一间屋 */
  sameRoomKiller: boolean;
  /** 这一瞬间刚被攻击 */
  justAttacked: boolean;
  /** 正在被追 */
  chased: boolean;
  phoneHere: boolean;
  totemHere: boolean;
  allyDownedHere: boolean;
  allyInjuredHere: boolean;
  gateOpen: boolean;
  atExit: boolean;
  canHideHere: boolean;
  canBarricadeHere: boolean;
  chase: ChaseState;
}

export interface Decision {
  kind: ActionKind;
  reason: string;
}

/**
 * 各警戒档允许的动作（单调：后一档包含前一档）。
 * 注意这里只有"允许"，具体做不做得成由恐惧档决定。
 */
export const CAPABILITIES: Record<AlertBand, ActionKind[]> = {
  unaware: ['idle', 'move', 'rescue', 'heal'],
  suspicious: ['idle', 'move', 'rescue', 'heal', 'observe', 'totem'],
  alert: ['idle', 'move', 'rescue', 'heal', 'observe', 'totem', 'flee', 'lock', 'call', 'barricade', 'hide', 'escape'],
  panicked: ['idle', 'move', 'rescue', 'heal', 'observe', 'totem', 'flee', 'lock', 'call', 'barricade', 'hide', 'escape', 'shout'],
};

/**
 * 恐惧对"执行质量"的影响：
 *   - 恐惧：锁门、放板失效（会去试，但做不成；这里直接判定为不可用）。
 *   - 崩溃：报警也失败，且逃走有概率原地不动。
 *   - 冷静/不安：不限制。
 */
export function actionAllowed(kind: ActionKind, fear: FearBand): boolean {
  if (fear === 'afraid') return kind !== 'lock' && kind !== 'barricade';
  if (fear === 'broken') {
    return kind !== 'lock' && kind !== 'barricade' && kind !== 'call' && kind !== 'hide';
  }
  return true;
}

/** 崩溃时逃跑失败的默认概率 */
export const BROKEN_FREEZE_CHANCE = 0.3;

function can(ctx: DecisionContext, band: AlertBand, fear: FearBand, kind: ActionKind): boolean {
  return CAPABILITIES[band].includes(kind) && actionAllowed(kind, fear);
}

/**
 * 选一个动作。
 * roll 只在"崩溃时逃跑"这一个地方使用，方便测试与回放。
 */
export function decide(ctx: DecisionContext, roll: () => number = () => 0.5): Decision {
  if (ctx.control !== 'normal') return { kind: 'idle', reason: 'control' };

  const band = alertBand(ctx.alert);
  const fear = fearBand(ctx.fear);
  const canDo = (kind: ActionKind) => can(ctx, band, fear, kind);

  // 已经站在逃生点、门也开着：先跑
  if (ctx.atExit && ctx.gateOpen && canDo('escape')) {
    return { kind: 'escape', reason: 'gate_open' };
  }

  // 刚被攻击：立刻跑（崩溃时可能腿软）
  if (ctx.justAttacked && canDo('flee')) {
    if (fear === 'broken' && roll() < BROKEN_FREEZE_CHANCE) {
      return { kind: 'idle', reason: 'broken_freeze' };
    }
    if (canFlee(ctx.chase)) return { kind: 'flee', reason: 'attacked' };
    return { kind: 'idle', reason: 'out_of_stamina' };
  }

  // 玩家贴脸：能跑就跑，跑不了才防御
  if (ctx.sameRoomKiller) {
    if (canDo('flee') && canFlee(ctx.chase)) {
      return { kind: 'flee', reason: 'killer_same_room' };
    }
    if (ctx.canHideHere && canDo('hide')) return { kind: 'hide', reason: 'killer_same_room' };
    if (ctx.canBarricadeHere && canDo('barricade')) return { kind: 'barricade', reason: 'killer_same_room' };
    return { kind: 'idle', reason: 'cornered' };
  }

  // 救援/治疗：任何警戒档都会做，救人优先于自己的事
  if (ctx.allyDownedHere && canDo('rescue')) return { kind: 'rescue', reason: 'ally_downed' };
  if (ctx.allyInjuredHere && canDo('heal')) return { kind: 'heal', reason: 'ally_injured' };

  // 崩溃：不一定还认得路，但会本能地想跑；也可能当场腿软
  if (fear === 'broken') {
    if (roll() < BROKEN_FREEZE_CHANCE) return { kind: 'idle', reason: 'broken_freeze' };
    if (canDo('flee') && canFlee(ctx.chase)) return { kind: 'flee', reason: 'broken' };
    return { kind: 'idle', reason: 'broken_freeze' };
  }

  // 被追：先放板/锁门/躲，再考虑硬跑
  if (ctx.chased) {
    if (ctx.canBarricadeHere && canDo('barricade')) return { kind: 'barricade', reason: 'chased' };
    if (ctx.canHideHere && canDo('hide')) return { kind: 'hide', reason: 'chased' };
    if (canDo('flee') && canFlee(ctx.chase)) return { kind: 'flee', reason: 'chased' };
    return { kind: 'idle', reason: 'chased_no_escape' };
  }

  // 报警：警觉以上、且人就在电话旁
  if (ctx.phoneHere && canDo('call')) return { kind: 'call', reason: 'phone' };

  // 拆图腾：怀疑以上
  if (ctx.totemHere && canDo('totem')) return { kind: 'totem', reason: 'totem' };

  // 门开了就往出口走（不是慌乱也会走，但优先级低于报警）
  if (ctx.gateOpen && canDo('escape')) return { kind: 'escape', reason: 'gate_open' };

  // 怀疑：停下来观察
  if (band === 'suspicious') return { kind: 'observe', reason: 'suspicious' };

  // 慌乱：边跑边喊（传播信息）
  if (band === 'panicked') return { kind: 'shout', reason: 'panicked' };

  return { kind: 'move', reason: 'routine' };
}
