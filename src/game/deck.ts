import { shuffle } from './random';
import type { GameState } from './types';

function log(state: GameState, message: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${message}`);
  if (state.log.length > 60) state.log.length = 60;
}

export function drawCards(state: GameState, count: number): number {
  let reshuffles = 0;
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      reshuffles += 1;
      log(state, '弃牌堆重新洗入牌库。');
    }
    const card = state.drawPile.pop();
    if (card) state.hand.push(card);
  }
  return reshuffles;
}

