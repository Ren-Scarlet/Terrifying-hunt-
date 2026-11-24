import { CARDS, STARTING_DECK } from './cards';
import type { SaveData } from './types';

const KEY = 'night-hunt-dossier-save-v1';

const DEFAULT_SAVE: SaveData = {
  deck: [...STARTING_DECK],
  unlockedCards: CARDS.filter((c) => c.unlocked).map((c) => c.id),
  bestScore: 0,
  wins: 0,
  killer: '迈克尔·迈尔斯',
  credits: 60,
  darkCells: 3,
  unlockedKillers: ['设陷者', '幽灵', '护士', '女猎手', '鬼面', '迈克尔·迈尔斯'],
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      deck: Array.isArray(parsed.deck) && parsed.deck.length >= 10 ? parsed.deck : [...DEFAULT_SAVE.deck],
      unlockedCards: Array.isArray(parsed.unlockedCards) ? parsed.unlockedCards : [...DEFAULT_SAVE.unlockedCards],
      bestScore: typeof parsed.bestScore === 'number' ? parsed.bestScore : 0,
      wins: typeof parsed.wins === 'number' ? parsed.wins : 0,
      killer: typeof parsed.killer === 'string' ? parsed.killer : DEFAULT_SAVE.killer,
      credits: typeof parsed.credits === 'number' ? parsed.credits : DEFAULT_SAVE.credits,
      darkCells: typeof parsed.darkCells === 'number' ? parsed.darkCells : DEFAULT_SAVE.darkCells,
      unlockedKillers: Array.isArray(parsed.unlockedKillers)
        ? parsed.unlockedKillers
        : [...DEFAULT_SAVE.unlockedKillers],
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(data: SaveData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function unlockCard(save: SaveData, cardId: string): SaveData {
  if (!cardId || save.unlockedCards.includes(cardId)) return save;
  const next = { ...save, unlockedCards: [...save.unlockedCards, cardId] };
  writeSave(next);
  return next;
}
