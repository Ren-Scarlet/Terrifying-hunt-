import { CARDS, CARD_MAP, deckCardsForKiller } from './cards';
import { ACCESSORY_MAP, accessoriesForKiller } from './accessories';
import { KILLER_MAP, STARTER_KILLERS } from './killers';
import { random, shuffle } from './random';
import type { GameState } from './types';

/**
 * 血网升级（角色等级）
 *
 *  - 每位杀手独立升级；一局结束按得分/击杀给经验。
 *  - 每 100 经验升 1 级；每级给 1 次「血网」三选一（配件 +1 库存 / 解锁卡牌 / 血点）。
 *  - 每 100 级「转生」一次：等级回到 1，转生数 +1，继续无限升级。
 *  - 累计等级每 30 级，把该杀手的一张专属卡放进公共池（others 也能构筑）。
 */

export const XP_PER_LEVEL = 100;
export const LEVELS_PER_PRESTIGE = 100;
export const SHARE_EVERY = 30;

export interface KillerProgress {
  level: number;
  xp: number;
  prestige: number;
  /** 还没领的血网三选一次数 */
  pending: number;
}

export type ProgressMap = Partial<Record<string, KillerProgress>>;

export function emptyProgress(): KillerProgress {
  return { level: 1, xp: 0, prestige: 0, pending: 0 };
}

export function progressOf(map: ProgressMap | undefined, killer: string): KillerProgress {
  return map?.[killer] ?? emptyProgress();
}

/** 累计等级（跨转生）：用来算「每 30 级共享一张专属卡」。 */
/** 升下一级要花多少血点：50 起，每级 +15。 */
export const BLOODWEB_BASE_COST = 50;
export const BLOODWEB_COST_STEP = 15;

export function bloodwebCost(progress: KillerProgress): number {
  return BLOODWEB_BASE_COST + Math.max(0, progress.level - 1) * BLOODWEB_COST_STEP;
}

/** 花血点买一级（100 级自动转生）。 */
export function addLevel(progress: KillerProgress): KillerProgress {
  let level = progress.level + 1;
  let prestige = progress.prestige;
  if (level > LEVELS_PER_PRESTIGE) {
    level = 1;
    prestige += 1;
  }
  return { ...progress, level, prestige };
}

export function totalLevel(progress: KillerProgress): number {
  return progress.prestige * LEVELS_PER_PRESTIGE + progress.level;
}

/** 一局结束能拿多少经验。输了也有一点，避免卡住。 */
export function xpForGame(state: GameState): number {
  const win = state.result === 'win';
  return Math.max(10, Math.round(state.score / 5) + state.kills * 12 + (win ? 60 : 20));
}

/** 加经验并结算升级/转生；返回新的进度与升了几级。 */
export function gainXp(progress: KillerProgress, xp: number): { progress: KillerProgress; levels: number } {
  let { level, xp: pool, prestige, pending } = progress;
  pool += Math.max(0, Math.round(xp));
  let levels = 0;
  while (pool >= XP_PER_LEVEL) {
    pool -= XP_PER_LEVEL;
    level += 1;
    levels += 1;
    pending += 1;
    if (level > LEVELS_PER_PRESTIGE) {
      level = 1;
      prestige += 1;
    }
  }
  return { progress: { level, xp: pool, prestige, pending }, levels };
}

export type BloodwebOffer =
  | { kind: 'accessory'; id: string; name: string; desc: string }
  | { kind: 'card'; id: string; name: string; desc: string }
  | { kind: 'credits'; id: string; name: string; desc: string };

/** 一次血网三选一：配件 / 卡牌 / 血点。 */
export function rollBloodweb(killer: string, unlockedCards: string[], owned: Record<string, number>): BloodwebOffer[] {
  const offers: BloodwebOffer[] = [];
  const accessoryPool = shuffle(accessoriesForKiller(killer).map((def) => def.id));
  const accessory = accessoryPool[0];
  if (accessory && ACCESSORY_MAP[accessory]) {
    const def = ACCESSORY_MAP[accessory];
    offers.push({ kind: 'accessory', id: accessory, name: def.name, desc: `${def.desc}（库存 +1）` });
  }
  const cardPool = shuffle(
    deckCardsForKiller(killer)
      .map((card) => card.id)
      .filter((id) => !unlockedCards.includes(id)),
  )[0];
  if (cardPool && CARD_MAP[cardPool]) {
    const card = CARD_MAP[cardPool];
    offers.push({ kind: 'card', id: cardPool, name: card.name, desc: `${card.desc}（永久解锁）` });
  }
  const credits = 40 + Math.floor(random() * 4) * 10;
  offers.push({ kind: 'credits', id: `credits_${credits}`, name: `${credits} 血点`, desc: '直接进账户，用来解锁卡牌与配件' });

  // 配件池小（每位杀手 3 件），保证至少有一条配件路线
  if (offers.length < 3) {
    const extra = accessoryPool[1];
    if (extra && ACCESSORY_MAP[extra]) {
      const def = ACCESSORY_MAP[extra];
      offers.push({ kind: 'accessory', id: extra, name: def.name, desc: `${def.desc}（库存 +1）` });
    }
  }
  return offers.slice(0, 3);
}

/**
 * 每累计 30 级，把该杀手一张专属卡放进公共池。
 * 返回新的共享卡列表（去重、稳定顺序）。
 */
export function syncSharedCards(map: ProgressMap, current: string[] = []): string[] {
  const shared = new Set(current);
  for (const killer of STARTER_KILLERS) {
    const progress = progressOf(map, killer);
    const milestones = Math.floor(totalLevel(progress) / SHARE_EVERY);
    const exclusive = CARDS.filter((card) => card.pool === 'killer' && card.killerOnly === killer)
      .map((card) => card.id)
      .sort();
    exclusive.slice(0, milestones).forEach((id) => shared.add(id));
  }
  return [...shared].filter((id) => !!CARD_MAP[id]);
}

export function killerDisplayName(killer: string): string {
  return KILLER_MAP[killer]?.owner ?? killer;
}
