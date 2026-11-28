/**
 * 幸存者新模型：警戒 × 恐惧。
 *
 * 这里只放"数值与档位"的纯逻辑——不读地图、不写日志、不碰行动。
 * 所有可调数字集中在 AI_TUNING 与两张事件表里，改数值不需要改代码。
 *
 * 两条硬规则（第一章 1.1 / 1.5）：
 *   1. 警戒与恐惧互相独立：加警戒不会顺带加恐惧，反之亦然。
 *   2. 恐惧只调"做不做得成"，不新增行为类型；行为类型由警戒档决定。
 */
import type { Person } from '../../types';

/** 只关心这两个数值，方便测试与复用 */
export type Mind = Pick<Person, 'alert' | 'fear'>;

export type AlertBand = 'unaware' | 'suspicious' | 'alert' | 'panicked';
export type FearBand = 'calm' | 'uneasy' | 'afraid' | 'broken';

/** 给界面用的中文标签（新四档） */
export const ALERT_LABEL: Record<AlertBand, string> = {
  unaware: '未发觉',
  suspicious: '怀疑',
  alert: '警觉',
  panicked: '慌乱',
};

export const FEAR_LABEL: Record<FearBand, string> = {
  calm: '冷静',
  uneasy: '不安',
  afraid: '恐惧',
  broken: '崩溃',
};

/**
 * 全部可调数值。第一章里标"待定"的部分，先按评审建议给默认值：
 *   - 升档立即，降档需要跌破"阈值 − 8"并持续 1 回合（慌乱需要 2 回合）。
 *   - 警戒每回合最多衰减一次，不随玩家动作次数叠加。
 */
export const AI_TUNING = {
  alertThresholds: { suspicious: 12, alert: 40, panicked: 75 },
  /** 降档迟滞：数值低于"阈值 − 该值"才允许掉档 */
  alertHysteresis: { suspicious: 8, alert: 8, panicked: 13 },
  alertDecay: { base: 8, safe: 15, panickedFactor: 0.5 },
  fearThresholds: { uneasy: 30, afraid: 60, broken: 85 },
  fearDecay: { safe: 10, broken: 18 },
  /** 安全判定：离玩家至少这么远、且未被追、且有光 */
  safeDistance: 2,
} as const;

export function alertBand(value: number): AlertBand {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (v >= AI_TUNING.alertThresholds.panicked) return 'panicked';
  if (v >= AI_TUNING.alertThresholds.alert) return 'alert';
  if (v >= AI_TUNING.alertThresholds.suspicious) return 'suspicious';
  return 'unaware';
}

export function fearBand(value: number): FearBand {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (v >= AI_TUNING.fearThresholds.broken) return 'broken';
  if (v >= AI_TUNING.fearThresholds.afraid) return 'afraid';
  if (v >= AI_TUNING.fearThresholds.uneasy) return 'uneasy';
  return 'calm';
}

/** 当前数值是否已经低到可以掉档（配合"持续 N 回合"一起用） */
export function canDropAlertBand(band: AlertBand, value: number): boolean {
  const t = AI_TUNING.alertThresholds;
  const h = AI_TUNING.alertHysteresis;
  if (band === 'panicked') return value < t.panicked - h.panicked;
  if (band === 'alert') return value < t.alert - h.alert;
  if (band === 'suspicious') return value < t.suspicious - h.suspicious;
  return true;
}

/* ---------------- 警戒事件表 ---------------- */

export type AlertEventKind =
  | 'noise_adjacent'
  | 'power_off_self'
  | 'attacked'
  | 'witness_attack'
  | 'witness_kill'
  | 'see_corpse'
  | 'player_enters'
  | 'chased'
  | 'shout_same'
  | 'shout_adjacent';

export interface AlertEventSpec {
  /** 叠加增量 */
  add?: number;
  /** 直接抬到某个下限（不会压低当前值） */
  floor?: number;
  /** 直接设为某个值（只用于"被攻击"这种明确结果） */
  set?: number;
}

/**
 * 第一章 1.2 的事件表。
 * 数字是默认值；"卡牌/幸存者效果"走外部倍率，不写死在这里。
 * 注意：这里只改警戒。目击死亡同时也会加恐惧，但必须由调用方
 * 另外发一个恐惧事件，保持两套数值互不自动牵连。
 */
export const ALERT_EVENTS: Record<AlertEventKind, AlertEventSpec> = {
  noise_adjacent: { add: 6 },
  power_off_self: { add: 8 },
  attacked: { set: 100 },
  witness_attack: { add: 40 },
  witness_kill: { add: 55, floor: 75 },
  see_corpse: { add: 25, floor: 40 },
  player_enters: { add: 22, floor: 40 },
  chased: { add: 8 },
  shout_same: { add: 18 },
  shout_adjacent: { add: 10 },
};

/* ---------------- 恐惧事件表 ---------------- */

export type FearEventKind =
  | 'attacked'
  | 'witness_kill'
  | 'corpse_in_room'
  | 'darkness'
  | 'isolated'
  | 'chased'
  | 'companion_lit'
  | 'safe';

export const FEAR_EVENTS: Record<FearEventKind, number> = {
  attacked: 30,
  witness_kill: 40,
  corpse_in_room: 12,
  darkness: 6,
  isolated: 5,
  chased: 8,
  companion_lit: -8,
  safe: -10,
};

/* ---------------- 应用与衰减 ---------------- */

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** 施加一个警戒事件，返回施加后的档位 */
export function applyAlertEvent(mind: Mind, kind: AlertEventKind, multiplier = 1): AlertBand {
  const spec = ALERT_EVENTS[kind];
  if (spec.set !== undefined) mind.alert = Math.max(mind.alert, spec.set);
  if (spec.add !== undefined) mind.alert += Math.round(spec.add * multiplier);
  if (spec.floor !== undefined) mind.alert = Math.max(mind.alert, spec.floor);
  mind.alert = clamp100(mind.alert);
  return alertBand(mind.alert);
}

/** 施加一个恐惧事件，返回施加后的档位。不影响警戒。 */
export function applyFearEvent(mind: Mind, kind: FearEventKind, multiplier = 1): FearBand {
  mind.fear = clamp100(mind.fear + Math.round(FEAR_EVENTS[kind] * multiplier));
  return fearBand(mind.fear);
}

/**
 * 回合末警戒衰减。
 * safe=true 表示"离玩家足够远、没被追、有光"；慌乱档衰减减半。
 */
export function decayAlert(mind: Mind, safe: boolean): AlertBand {
  if (mind.alert <= 0) return 'unaware';
  const t = AI_TUNING.alertDecay;
  let rate: number = safe ? t.safe : t.base;
  if (alertBand(mind.alert) === 'panicked') rate = Math.floor(rate * t.panickedFactor);
  mind.alert = clamp100(mind.alert - rate);
  return alertBand(mind.alert);
}

/** 安全时恐惧才下降；崩溃档降得更快，避免永久崩溃。 */
export function decayFear(mind: Mind, safe: boolean): FearBand {
  if (!safe) return fearBand(mind.fear);
  const rate = fearBand(mind.fear) === 'broken'
    ? AI_TUNING.fearDecay.broken
    : AI_TUNING.fearDecay.safe;
  mind.fear = clamp100(mind.fear - rate);
  return fearBand(mind.fear);
}

/** 判断是否处于"安全"：距离、被追、光照三项都满足 */
export function isSafe(input: { distance: number; chased: boolean; lit: boolean }): boolean {
  return input.distance >= AI_TUNING.safeDistance && !input.chased && input.lit;
}
