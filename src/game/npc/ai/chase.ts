/**
 * 追逐体力：解决"慌乱时绝对追不上"的极端。
 *
 * 规则：慌乱的人可以连续甩开几格，但体力会消耗；体力见底后必须停下来喘，
 * 这段时间玩家能追上。既保留"满警戒不好抓"的手感，又不会变成无敌。
 */
export const CHASE = {
  /** 满体力能连续逃几格 */
  maxStamina: 3,
  /** 体力见底后必须喘几回合才能再逃 */
  staggerTurns: 1,
  /** 每回合恢复多少体力 */
  recoverPerTick: 1,
} as const;

export interface ChaseState {
  stamina: number;
  stagger: number;
}

export function createChaseState(): ChaseState {
  return { stamina: CHASE.maxStamina, stagger: 0 };
}

/** 现在还能不能继续逃 */
export function canFlee(chase: ChaseState): boolean {
  return chase.stagger <= 0 && chase.stamina > 0;
}

/** 逃一格之后的状态：体力归零就进入喘息 */
export function afterFlee(chase: ChaseState): ChaseState {
  const stamina = Math.max(0, chase.stamina - 1);
  return {
    stamina,
    stagger: stamina === 0 ? CHASE.staggerTurns : 0,
  };
}

/** 回合末恢复：喘息结束、体力回升 */
export function tickChase(chase: ChaseState): ChaseState {
  const stagger = Math.max(0, chase.stagger - 1);
  if (stagger > 0) return { stamina: chase.stamina, stagger };
  return {
    stamina: Math.min(CHASE.maxStamina, chase.stamina + CHASE.recoverPerTick),
    stagger: 0,
  };
}
