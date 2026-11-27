import { CARD_MAP, deckCardsForKiller } from './cards';
import { accessoriesForKiller } from './accessories';
import { random, shuffle } from './random';
import { KILLER_MAP } from './killers';
import type { GameState } from './types';

/**
 * 肉鸽猎杀（独立模式）
 *
 * 规则：
 *  - 开局从当前杀手的可用卡池里随机抽 12 张做牌组（卡池混洗），
 *  - 从该杀手的 3 件配件里随机抽 2 件（配件不混，只在本杀手池子里），
 *  - 再送 1 条「猎场规则」buff（平时对局里没有的异常条件），
 *  - 每通一层：层数 +1，并从 3 个随机奖励里选 1 个（卡牌 / 规则 / 换配件），
 *  - 层数越高，开局警报越高、契约回合越少。
 */

export interface RogueRun {
  depth: number;
  killer: string;
  deck: string[];
  accessories: string[];
  buffs: string[];
}

export type RogueOffer =
  | { kind: 'card'; id: string; name: string; desc: string }
  | { kind: 'buff'; id: string; name: string; desc: string };

interface RogueBuffDef {
  id: string;
  name: string;
  desc: string;
  apply: (state: GameState) => void;
}

/** 只做「已经在对局里存在、但平时不会出现」的改动，避免半成品机制。 */
export const ROGUE_BUFFS: RogueBuffDef[] = [
  { id: 'ap_up', name: '肾上腺素', desc: '每回合行动点 +1', apply: (s) => { s.maxEnergy += 1; s.energy += 1; } },
  { id: 'ap_down', name: '负重前行', desc: '每回合行动点 -1', apply: (s) => { s.maxEnergy = Math.max(2, s.maxEnergy - 1); s.energy = Math.min(s.energy, s.maxEnergy); } },
  { id: 'tough', name: '皮糙肉厚', desc: '所有幸存者生命 +1', apply: (s) => { s.people.forEach((p) => { if (p.role !== 'police' && p.hp > 0) p.hp += 1; }); } },
  { id: 'alarm_up', name: '风声鹤唳', desc: '开局警报 +20', apply: (s) => { s.alarm = Math.min(100, s.alarm + 20); } },
  { id: 'alarm_down', name: '悄无声息', desc: '开局警报 -15', apply: (s) => { s.alarm = Math.max(0, s.alarm - 15); } },
  { id: 'short_contract', name: '时限收紧', desc: '契约回合 -3', apply: (s) => { s.mission.turns = Math.max(8, s.mission.turns - 3); } },
  { id: 'loot', name: '搜刮者', desc: '开局战利品 +3', apply: (s) => { s.loot += 3; } },
  { id: 'frenzy', name: '杀戮本能', desc: '开局杀戮值 50', apply: (s) => { s.frenzy = Math.max(s.frenzy, 50); } },
  { id: 'fear', name: '恐惧弥漫', desc: '幸存者开局恐惧 +20', apply: (s) => { s.people.forEach((p) => { if (p.role !== 'police' && p.hp > 0) p.fear = Math.min(100, p.fear + 20); }); } },
];

const BUFF_MAP = new Map(ROGUE_BUFFS.map((buff) => [buff.id, buff]));

/** 开局牌组：从该杀手可用的卡池里随机抽 12 张（同名不重复）。 */
export function rollRogueDeck(killer: string, size = 12): string[] {
  const pool = shuffle(deckCardsForKiller(killer).map((card) => card.id));
  return pool.slice(0, Math.max(10, Math.min(size, pool.length)));
}

/** 开局配件：只在本杀手的配件池里抽，抽 2 件（配件不混）。 */
export function rollRogueAccessories(killer: string): string[] {
  return shuffle(accessoriesForKiller(killer).map((def) => def.id)).slice(0, 2);
}

export function rollRogueBuff(exclude: string[]): RogueBuffDef | null {
  const pool = ROGUE_BUFFS.filter((buff) => !exclude.includes(buff.id));
  if (!pool.length) return null;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

export function startRogueRun(killer: string): RogueRun {
  const safeKiller = KILLER_MAP[killer] ? killer : '迈克尔·迈尔斯';
  const buff = rollRogueBuff([]);
  return {
    depth: 1,
    killer: safeKiller,
    deck: rollRogueDeck(safeKiller),
    accessories: rollRogueAccessories(safeKiller),
    buffs: buff ? [buff.id] : [],
  };
}

/** 三选一奖励：卡牌 / 规则优先，配件池太小（只有 3 件）就不单列。 */
export function rollRogueOffers(run: RogueRun): RogueOffer[] {
  const offers: RogueOffer[] = [];
  const cardPool = shuffle(
    deckCardsForKiller(run.killer)
      .map((card) => card.id)
      .filter((id) => run.deck.filter((x) => x === id).length < 2),
  );
  for (const id of cardPool.slice(0, 2)) {
    const card = CARD_MAP[id];
    if (card) offers.push({ kind: 'card', id, name: card.name, desc: card.desc });
  }
  const buff = rollRogueBuff(run.buffs);
  if (buff) offers.push({ kind: 'buff', id: buff.id, name: buff.name, desc: buff.desc });
  while (offers.length < 3) {
    const extra = cardPool[offers.length];
    const card = extra ? CARD_MAP[extra] : undefined;
    if (!card) break;
    offers.push({ kind: 'card', id: extra, name: card.name, desc: card.desc });
  }
  return offers.slice(0, 3);
}

/** 选完奖励后进入下一层：层数 +1，奖励写进 run。 */
export function advanceRogue(run: RogueRun, offer: RogueOffer | null): RogueRun {
  const next: RogueRun = {
    ...run,
    depth: run.depth + 1,
    deck: [...run.deck],
    accessories: [...run.accessories],
    buffs: [...run.buffs],
  };
  if (offer?.kind === 'card' && next.deck.length < 20) next.deck.push(offer.id);
  if (offer?.kind === 'buff' && !next.buffs.includes(offer.id)) next.buffs.push(offer.id);
  return next;
}

/** 进层时把已获得的规则和层数压力写进对局。 */
export function applyRogueFloor(state: GameState, run: RogueRun): void {
  run.buffs.forEach((id) => BUFF_MAP.get(id)?.apply(state));
  const depth = Math.max(1, run.depth);
  if (depth > 1) {
    state.alarm = Math.min(100, state.alarm + (depth - 1) * 6);
    state.mission.turns = Math.max(8, state.mission.turns - (depth - 1) * 1);
  }
}

/** 中途换配件用：把一件配件换成同池子的另一件（层数奖励里偶尔出现）。 */
export function swapRogueAccessory(run: RogueRun): RogueRun {
  const pool = accessoriesForKiller(run.killer).map((def) => def.id);
  const candidates = pool.filter((id) => !run.accessories.includes(id));
  if (!candidates.length) return run;
  const pick = candidates[Math.floor(random() * candidates.length)];
  const accessories = run.accessories.length >= 2 ? [run.accessories[0], pick] : [...run.accessories, pick];
  return { ...run, accessories };
}
