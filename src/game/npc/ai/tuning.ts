/**
 * 同屋有倒地同伴时，把人拉起来的基准意愿（0~1）。
 * 新 AI 不再按性格取值，所有人都用同一套概率。
 */
export const RESCUE_RATE = 0.7;

/** 同伴倒地后主动「赶过去」的意愿，再打个折：有人会先保自己 */
export const AID_RUN_RATE = 0.8;
