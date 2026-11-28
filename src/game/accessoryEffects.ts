import { ACCESSORY_MAP } from './data/accessories';
import type { AccessoryEffect, AccessoryEffectAction, AccessoryEffectTrigger, GameState } from './types';

export const EFFECT_TRIGGER_GROUPS: Array<{ label: string; triggers: AccessoryEffectTrigger[] }> = [
  { label: '通用 / 能力', triggers: ['passive', 'usePower', 'firstPower', 'draw'] },
  { label: '尾随 / 恶魔附身', triggers: ['stalk', 'possessEnter', 'possessExit', 'possessHit', 'kill'] },
  { label: '护士 / 闪现', triggers: ['blink'] },
];

export const EFFECT_ACTION_GROUPS: Array<{ label: string; actions: AccessoryEffectAction[] }> = [
  { label: '资源', actions: ['ap', 'draw', 'blood'] },
  { label: '压力', actions: ['fear', 'stalk', 'restoreStalk', 'maxStalk'] },
  { label: '状态', actions: ['undetectable', 'deepWound', 'revealAura', 'noStalkDecay', 'instantExecute', 'freePower', 'returnBlink', 'blinkMisses', 'possessBloodDouble', 'retainStalkOnExit', 'possessDamage'] },
];

export const EFFECT_TRIGGERS: Record<AccessoryEffectTrigger, string> = {
  passive: '被动（整局）',
  usePower: '使用杀手能力时',
  firstPower: '每回合第一次使用能力',
  draw: '抽牌时',
  stalk: '尾随目标时',
  blink: '闪现后',
  possessEnter: '进入恶魔附身时',
  possessExit: '退出恶魔附身时',
  possessHit: '恶魔附身命中时',
  kill: '击杀幸存者时',
};

export const EFFECT_ACTIONS: Record<AccessoryEffectAction, string> = {
  ap: '行动点 +值',
  draw: '抽牌 +值',
  fear: '恐惧 +值',
  stalk: '尾随值 +值',
  blood: '血点 +值',
  undetectable: '进入无法侦测',
  deepWound: '附加重伤',
  revealAura: '显示全部气场',
  restoreStalk: '恢复尾随值 +值',
  maxStalk: '尾随值上限 +值',
  noStalkDecay: '尾随值不衰减',
  instantExecute: '可直接处决健康者',
  freePower: '能力不消耗 AP',
  returnBlink: '可回到闪现前位置',
  blinkMisses: '需要连续未命中次数',
  possessBloodDouble: '恶魔附身血点翻倍',
  retainStalkOnExit: '退出附身保留尾随值',
  possessDamage: '附身命中伤害改为值',
};

export function effectsOf(state: GameState, trigger: AccessoryEffectTrigger): AccessoryEffect[] {
  const result: AccessoryEffect[] = [];
  for (const id of state.accessories) {
    const def = ACCESSORY_MAP[id];
    if (!def?.effects) continue;
    for (const effect of def.effects) if (effect.trigger === trigger) result.push(effect);
  }
  return result;
}

export function effectTotal(state: GameState, trigger: AccessoryEffectTrigger, action: AccessoryEffectAction): number {
  return effectsOf(state, trigger)
    .filter((effect) => effect.action === action)
    .reduce((sum, effect) => sum + (effect.value || 0), 0);
}

export function hasEffect(state: GameState, trigger: AccessoryEffectTrigger, action: AccessoryEffectAction): boolean {
  return effectsOf(state, trigger).some((effect) => effect.action === action);
}

export function effectsForIds(ids: string[], trigger: AccessoryEffectTrigger): AccessoryEffect[] {
  const result: AccessoryEffect[] = [];
  for (const id of ids) {
    const def = ACCESSORY_MAP[id];
    if (!def?.effects) continue;
    for (const effect of def.effects) if (effect.trigger === trigger) result.push(effect);
  }
  return result;
}
