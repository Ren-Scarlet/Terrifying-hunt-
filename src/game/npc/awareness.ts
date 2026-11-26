/** 幸存者 0–100 认知值的唯一分档标准。 */
export type AwarenessStage = 0 | 1 | 2 | 3;

export const AWARENESS_BANDS = [
  { stage: 0 as const, label: '未发觉', min: 0, max: 24 },
  { stage: 1 as const, label: '怀疑', min: 25, max: 49 },
  { stage: 2 as const, label: '恐慌', min: 50, max: 74 },
  { stage: 3 as const, label: '警觉', min: 75, max: 100 },
] as const;

export function awarenessStage(alert: number): AwarenessStage {
  const value = Math.max(0, Math.min(100, Math.round(alert)));
  if (value >= 75) return 3;
  if (value >= 50) return 2;
  if (value >= 25) return 1;
  return 0;
}

export function awarenessLabel(alert: number): string {
  return AWARENESS_BANDS[awarenessStage(alert)].label;
}

/** 迈尔斯每次尾随行动获得的尾随值；越接近发现危险，收益越低。 */
export function myersStalkGain(alert: number): number {
  return [15, 8, 3, 0][awarenessStage(alert)];
}
