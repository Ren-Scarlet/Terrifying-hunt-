import { CARDS, CARD_MAP, deckCardsForKiller } from './cards';
import { ACCESSORY_MAP, accessoriesForKiller } from './accessories';
import { KILLER_MAP, STARTER_KILLERS } from './killers';
import { random, shuffle } from './random';

/**
 * 血网升级（角色等级）
 *
 *  - 每位杀手独立升级；升级直接消耗血点。
 *  - 每级给 1 次「血网」三选一（配件 +1 库存 / 解锁卡牌 / 血点）。
 *  - 每 100 级「转生」一次：等级回到 1，转生数 +1，继续无限升级。
 *  - 累计等级每 30 级，把该杀手的一张专属卡放进公共池（others 也能构筑）。
 */

export const LEVELS_PER_PRESTIGE = 100;
export const SHARE_EVERY = 30;

export interface KillerProgress {
  level: number;
  prestige: number;
}

export type ProgressMap = Partial<Record<string, KillerProgress>>;

export function emptyProgress(): KillerProgress {
  return { level: 1, prestige: 0 };
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

export type BloodwebOffer =
  | { kind: 'accessory'; id: string; name: string; desc: string }
  | { kind: 'card'; id: string; name: string; desc: string }
  | { kind: 'credits'; id: string; name: string; desc: string };

/** 一次血网三选一：只从该杀手的配件池里随机 3 件，选一件进库存。 */
export function rollBloodweb(killer: string): BloodwebOffer[] {
  const pool = shuffle(accessoriesForKiller(killer).map((def) => def.id));
  const picks: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    if (!pool.length) break;
    picks.push(pool[i % pool.length]);
  }
  return picks.map((id) => {
    const def = ACCESSORY_MAP[id];
    return {
      kind: 'accessory' as const,
      id,
      name: def?.name ?? id,
      desc: `${def?.desc ?? ''}（库存 +1）`,
    };
  });
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
