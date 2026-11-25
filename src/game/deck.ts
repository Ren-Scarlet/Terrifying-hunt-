export function drawCards(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      log(state, '弃牌堆重新洗入牌库。');
    }
    const card = state.drawPile.pop();
    if (card) state.hand.push(card);
  }
}

