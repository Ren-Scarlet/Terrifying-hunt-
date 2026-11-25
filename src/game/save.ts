import { CARDS, CARD_MAP, STARTING_DECK } from './cards';
import { KILLER_MAP, STARTER_KILLERS } from './killers';
import type { SaveData } from './types';

const KEY = 'night-hunt-dossier-save-v1';
/** 存档结构版本：v3 起伤害全部来自「挥刀」按钮，旧牌组里的伤害牌已经不存在了 */
const SAVE_VERSION = 3;

const STARTER_CARDS: string[] = CARDS.filter((c) => c.unlocked).map((c) => c.id);

const DEFAULT_SAVE: SaveData = {
  deck: [...STARTING_DECK],
  unlockedCards: [...STARTER_CARDS],
  bestScore: 0,
  wins: 0,
  killer: '迈克尔·迈尔斯',
  credits: 60,
  darkCells: 3,
  unlockedKillers: [...STARTER_KILLERS],
  version: SAVE_VERSION,
};

/**
 * 校验牌组：只保留存在的卡牌 id，单卡最多 3 张、总数最多 15 张。
 * 长度不足 10 张时直接回退到初始牌组，避免开局抽不到牌或出现不存在的卡导致白屏。
 */
function sanitizeDeck(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...STARTING_DECK];
  const counts = new Map<string, number>();
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !CARD_MAP[id]) continue;
    const used = counts.get(id) ?? 0;
    if (used >= 3 || out.length >= 15) continue;
    counts.set(id, used + 1);
    out.push(id);
  }
  return out.length >= 10 ? out : [...STARTING_DECK];
}

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE, deck: [...DEFAULT_SAVE.deck] };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const unlockedCards = Array.isArray(parsed.unlockedCards)
      ? parsed.unlockedCards.filter((id): id is string => typeof id === 'string' && !!CARD_MAP[id])
      : [];
    const unlockedKillers = Array.isArray(parsed.unlockedKillers)
      ? parsed.unlockedKillers.filter((k): k is string => typeof k === 'string' && !!KILLER_MAP[k])
      : [];
    // 初始就解锁的内容永远保留，避免旧存档把初始卡组里的卡判成未解锁。
    STARTER_CARDS.forEach((id) => { if (!unlockedCards.includes(id)) unlockedCards.push(id); });
    STARTER_KILLERS.forEach((k) => { if (!unlockedKillers.includes(k)) unlockedKillers.push(k); });

    const killer = typeof parsed.killer === 'string' && unlockedKillers.includes(parsed.killer)
      ? parsed.killer
      : DEFAULT_SAVE.killer;

    // 旧版本的牌组里塞满了「攻击牌」。伤害改由挥刀按钮承担之后，
    // 这些牌已经换成了功能性效果，牌组也整体换了套路，所以老档直接换新起始牌组。
    const version = toInt(parsed.version, 1);
    const deck = version < SAVE_VERSION ? [...STARTING_DECK] : sanitizeDeck(parsed.deck);

    return {
      deck,
      unlockedCards,
      bestScore: toInt(parsed.bestScore, 0),
      wins: toInt(parsed.wins, 0),
      killer,
      credits: toInt(parsed.credits, DEFAULT_SAVE.credits),
      darkCells: toInt(parsed.darkCells, DEFAULT_SAVE.darkCells),
      unlockedKillers,
      version: SAVE_VERSION,
    };
  } catch {
    return { ...DEFAULT_SAVE, deck: [...DEFAULT_SAVE.deck] };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式或配额用尽时静默降级：本局仍可继续，只是不落盘。
  }
}
