import type { Archetype } from '../../types';

/**
 * 同屋有倒地同伴时，各原型把人拉起来的意愿（0~1）：人人都可能救，只是有人更奋不顾身。
 *
 * 注意：这是旧 AI 的参数，仍然按「性格」取值。新 AI 接入后会改成按
 * 恐惧档 + 距离 + 玩家威胁来算，这里先原样保留，保证行为不变。
 */
export const RESCUE_EAGERNESS: Record<Archetype, number> = {
  rescuer: 1,
  brave: 0.85,
  caller: 0.6,
  alert: 0.55,
  defiant: 0.45,
  kiter: 0.4,
  hider: 0.3,
};

/** 同伴倒地后主动「赶过去」的意愿，再打个折：有人会先保自己 */
export const AID_RUN_RATE = 0.8;
