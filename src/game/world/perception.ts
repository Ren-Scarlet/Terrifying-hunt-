/**
 * 玩家的"被察觉半径"：0 = 完全潜行，1 = 同屋才会发现，2 = 隔一格也能察觉。
 *
 * 这是从旧的 `fearRadius` 字段换过来的：不再把半径存在对局状态里，
 * 而是由「杀手基础值 + 配件修正 + 当前潜行状态」当场算出来。
 */
import { KILLER_MAP } from '../killers';
import { modifierValue } from '../modifiers';
import type { GameState } from '../types';

export function perceptionRadius(state: GameState): number {
  if (state.stealthActions > 0) return 0;
  if (state.killer === '迈克尔·迈尔斯' && state.myersStalking) return 0;
  const base = KILLER_MAP[state.killer]?.fearRadius ?? 1;
  return Math.max(0, Math.min(2, base + modifierValue(state, 'fearRadius')));
}
