import { ACCESSORY_MAP } from './data/accessories';
import type { AccessoryModKey, AccessoryMods, GameState } from './types';

/**
 * ============================================================================
 *  统一修正层
 * ============================================================================
 *
 *  所有配件效果先在这里汇总成一张表，再交给引擎读取；
 *  引擎里每个键只有一处生效点，HUD、结算与后台调参都读同一份数。
 *
 *  规则：
 *    · 配件只加数，不直接改状态；
 *    · 负数是合法的（例如「少带 1 把飞斧」「冷却 +1」）；
 *    · 同一个键在多件配件上出现时相加。
 */

const MOD_KEYS: AccessoryModKey[] = [
  'ap', 'attackDamage', 'fearRadius', 'fearOnHit', 'startAlarm', 'lootPct', 'cooldown',
  'trapCount', 'trapDamage', 'trapHold', 'hatchetCount', 'hatchetDamage', 'blinkRange',
  'stalkGain', 'possessCost', 'startStealth',
];

/**
 * 各系统的基准值。配件只在这上面加减，改平衡时先看这里；
 * 与 engine 顶部的行动点、伤害规则一一对应，不要在两处各写一份。
 */
const BASE_HATCHETS = 3;
const BASE_BLINK_RANGE = 3;
const BASE_POSSESS_COST = 20;
const BASE_TRAP_HOLD = 1;
const BASE_TRAP_DAMAGE = 1;
const BASE_HATCHET_DAMAGE = 1;

export function emptyModifiers(): AccessoryMods {
  return Object.fromEntries(MOD_KEYS.map((key) => [key, 0])) as AccessoryMods;
}

/** 把带入的配件汇总成修正表；未知 id 会被忽略。 */
export function modifiersForAccessories(ids: string[]): AccessoryMods {
  const mods = emptyModifiers();
  for (const id of ids) {
    const def = ACCESSORY_MAP[id];
    if (!def) continue;
    for (const mod of def.mods) mods[mod.key] += mod.value;
  }
  return mods;
}

export function modifiersOf(state: GameState): AccessoryMods {
  return state.modifiers;
}

/** 某个键最终生效的整数结果，统一在这里夹到合法范围。 */
export function modifierValue(state: GameState, key: AccessoryModKey): number {
  return Math.trunc(state.modifiers[key] ?? 0);
}

/** 飞斧上限：基础 3，受「多功能腰带 / 士兵绑腿」影响，至少 1 把。 */
export function hatchetMax(state: GameState): number {
  return Math.max(1, BASE_HATCHETS + modifierValue(state, 'hatchetCount'));
}

/**
 * 闪现距离（间房）：基础 3，受「坎贝尔神父的濒死之息」影响。
 * 引擎判定与地图上的可选房间都读这一处。
 */
export function blinkRangeOf(state: GameState): number {
  return Math.max(1, BASE_BLINK_RANGE + modifierValue(state, 'blinkRange'));
}

/** 恶魔附身每次行动消耗的尾随值：基础 20，至少 5。 */
export function possessCost(state: GameState): number {
  return Math.max(5, BASE_POSSESS_COST + modifierValue(state, 'possessCost'));
}

/** 被捕兽夹困住的回合：基础 1。 */
export function trapHoldTurns(state: GameState): number {
  return Math.max(1, BASE_TRAP_HOLD + modifierValue(state, 'trapHold'));
}

/** 捕兽夹伤害：基础 1。 */
export function trapDamageOf(state: GameState): number {
  return Math.max(1, BASE_TRAP_DAMAGE + modifierValue(state, 'trapDamage'));
}

/** 飞斧伤害：基础 1。 */
export function hatchetDamageOf(state: GameState): number {
  return Math.max(1, BASE_HATCHET_DAMAGE + modifierValue(state, 'hatchetDamage'));
}

/** 给玩家看的短标签：HUD 与后台都复用，避免两边各写一套文案。 */
const MOD_LABEL: Record<AccessoryModKey, string> = {
  ap: '行动点',
  attackDamage: '挥刀伤害',
  fearRadius: '恐惧范围',
  fearOnHit: '命中恐惧',
  startAlarm: '开局警报',
  lootPct: '战利品',
  cooldown: '能力冷却',
  trapCount: '捕兽夹',
  trapDamage: '夹伤',
  trapHold: '困住回合',
  hatchetCount: '飞斧数量',
  hatchetDamage: '飞斧伤害',
  blinkRange: '闪现距离',
  stalkGain: '尾随获取',
  possessCost: '附身消耗',
  startStealth: '开局无法侦测',
};

const PERCENT_KEYS = new Set<AccessoryModKey>(['lootPct', 'stalkGain']);

/** 修正键的中文短名，后台与 HUD 的文案都从这里取。 */
export function modifierLabel(key: AccessoryModKey): string {
  return MOD_LABEL[key];
}

export function describeModifier(key: AccessoryModKey, value: number): string {
  const label = MOD_LABEL[key];
  if (!value) return '';
  const sign = value > 0 ? '+' : '';
  return `${label} ${sign}${value}${PERCENT_KEYS.has(key) ? '%' : ''}`;
}

/** 本局实际生效的全部修正，按固定顺序输出，供 HUD tooltip / 结算使用。 */
export function modifierSummary(state: GameState): string[] {
  return MOD_KEYS
    .filter((key) => (state.modifiers[key] ?? 0) !== 0)
    .map((key) => describeModifier(key, state.modifiers[key]));
}
