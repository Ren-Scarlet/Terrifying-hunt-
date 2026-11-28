/**
 * 迈尔斯的尾随收益：只读新的四档警戒，不再保留旧的“认知值/性格”分档。
 * 越接近发现危险，可偷到的尾随值越少。
 */
import { alertBand } from './ai/model';

export function myersStalkGain(alert: number): number {
  switch (alertBand(alert)) {
    case 'unaware': return 15;
    case 'suspicious': return 8;
    case 'alert': return 3;
    case 'panicked': return 0;
  }
}
