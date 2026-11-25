import { CARDS, CARD_MAP } from './data/cards';
import { KILLERS, KILLER_MAP } from './data/killers';
import type { Op } from './effect';

/**
 * ============================================================================
 *  平衡调整数据层
 * ============================================================================
 *
 *  游戏里改的数值会存在浏览器 localStorage，下次打开还在。
 *  「导出数据」能把改动导成 JSON：发给开发者可以直接固化进 data/*.ts，
 *  也可以自己贴进备份，换台机器导入就恢复。
 *
 *  这里只覆盖三类东西：
 *    · 卡牌费用
 *    · 卡牌效果的每一条指令数值（伤害、回合、人数…）
 *    · 杀手能力冷却与效果数值
 *
 *  任何一项没有覆盖时，就沿用 src/game/data 里的原始定义。
 */

const KEY = 'night-hunt-tuning-v2';

export interface CardTune {
  cost?: number;
  ops?: Op[];
}

export interface PowerTune {
  cooldown?: number;
  ops?: Op[];
}

export interface TuningData {
  cards: Record<string, CardTune>;
  powers: Record<string, PowerTune>;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 原始定义：用于「恢复默认」 */
const BASELINE_CARDS = clone(CARDS.map((c) => ({ id: c.id, cost: c.cost, ops: c.ops })));
const BASELINE_POWERS = clone(
  KILLERS.flatMap((k) =>
    k.powers.map((p) => ({ owner: k.owner, id: p.id, cooldown: p.cooldown, ops: p.ops })),
  ),
);

function load(): TuningData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { cards: {}, powers: {} };
    const parsed = JSON.parse(raw) as Partial<TuningData>;
    return { cards: parsed.cards ?? {}, powers: parsed.powers ?? {} };
  } catch {
    return { cards: {}, powers: {} };
  }
}

let data: TuningData = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式下写不进去也不影响本次游戏
  }
}

const powerKey = (owner: string, powerId: string) => `${owner}::${powerId}`;

/** 把已保存的覆盖应用到运行中的数据表 */
export function applyTuning(): void {
  Object.entries(data.cards).forEach(([id, tune]) => {
    const card = CARD_MAP[id];
    if (!card) return;
    if (typeof tune.cost === 'number') card.cost = tune.cost;
    if (Array.isArray(tune.ops)) card.ops = clone(tune.ops);
  });
  Object.entries(data.powers).forEach(([key, tune]) => {
    const [owner, powerId] = key.split('::');
    const power = KILLER_MAP[owner]?.powers.find((p) => p.id === powerId);
    if (!power) return;
    if (typeof tune.cooldown === 'number') power.cooldown = tune.cooldown;
    if (Array.isArray(tune.ops)) power.ops = clone(tune.ops);
  });
}

export function tuningData(): TuningData {
  return data;
}

/** 这张卡 / 这个能力是否用了本地改过的数值 */
export function isCardTuned(id: string): boolean {
  return !!data.cards[id];
}

export function isPowerTuned(owner: string, powerId: string): boolean {
  return !!data.powers[powerKey(owner, powerId)];
}

export function hasTuning(): boolean {
  return Object.keys(data.cards).length > 0 || Object.keys(data.powers).length > 0;
}

/** 路径：`0.amount` 或 `0.then.1.turns`，指向一条指令上的字段 */
function writePath(ops: Op[], path: string, value: number | string | boolean): boolean {
  const segs = path.split('.');
  const step = (list: Op[], rest: string[]): boolean => {
    const index = Number(rest[0]);
    const op = list[index];
    if (!op || rest.length < 2) return false;
    const field = rest[1];
    if (field === 'then' || field === 'else') {
      if (op.op !== 'if') return false;
      return step(field === 'then' ? op.then : op.else ?? [], rest.slice(2));
    }
    (op as unknown as Record<string, unknown>)[field] = value;
    return true;
  };
  return step(ops, segs);
}

function recordCard(id: string): void {
  const card = CARD_MAP[id];
  if (!card) return;
  data.cards[id] = { cost: card.cost, ops: clone(card.ops) };
  persist();
}

function recordPower(owner: string, powerId: string): void {
  const power = KILLER_MAP[owner]?.powers.find((p) => p.id === powerId);
  if (!power) return;
  data.powers[powerKey(owner, powerId)] = { cooldown: power.cooldown, ops: clone(power.ops) };
  persist();
}

/** 卡牌：费用 */
export function setCardCost(id: string, cost: number): void {
  const card = CARD_MAP[id];
  if (!card) return;
  card.cost = Math.max(0, Math.min(6, Math.round(cost)));
  recordCard(id);
}

/** 卡牌：某条指令的数值 */
export function setCardOpValue(id: string, path: string, value: number | string | boolean): boolean {
  const card = CARD_MAP[id];
  if (!card) return false;
  const ok = writePath(card.ops, path, value);
  if (ok) recordCard(id);
  return ok;
}

/** 杀手能力：冷却 */
export function setPowerCooldown(owner: string, powerId: string, cooldown: number): void {
  const power = KILLER_MAP[owner]?.powers.find((p) => p.id === powerId);
  if (!power) return;
  power.cooldown = Math.max(1, Math.min(8, Math.round(cooldown)));
  recordPower(owner, powerId);
}

/** 杀手能力：某条指令的数值 */
export function setPowerOpValue(
  owner: string,
  powerId: string,
  path: string,
  value: number | string | boolean,
): boolean {
  const power = KILLER_MAP[owner]?.powers.find((p) => p.id === powerId);
  if (!power) return false;
  const ok = writePath(power.ops, path, value);
  if (ok) recordPower(owner, powerId);
  return ok;
}

export function resetTuning(): void {
  data = { cards: {}, powers: {} };
  BASELINE_CARDS.forEach((base) => {
    const card = CARD_MAP[base.id];
    if (!card) return;
    card.cost = base.cost;
    card.ops = clone(base.ops);
  });
  BASELINE_POWERS.forEach((base) => {
    const power = KILLER_MAP[base.owner]?.powers.find((p) => p.id === base.id);
    if (!power) return;
    power.cooldown = base.cooldown;
    power.ops = clone(base.ops);
  });
  persist();
}

export function exportTuning(): string {
  return JSON.stringify(data, null, 2);
}

export function importTuning(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<TuningData>;
    data = { cards: parsed.cards ?? {}, powers: parsed.powers ?? {} };
    // 先恢复默认，再套用导入的数据，避免旧覆盖残留
    BASELINE_CARDS.forEach((base) => {
      const card = CARD_MAP[base.id];
      if (!card) return;
      card.cost = base.cost;
      card.ops = clone(base.ops);
    });
    BASELINE_POWERS.forEach((base) => {
      const power = KILLER_MAP[base.owner]?.powers.find((p) => p.id === base.id);
      if (!power) return;
      power.cooldown = base.cooldown;
      power.ops = clone(base.ops);
    });
    applyTuning();
    persist();
    return true;
  } catch {
    return false;
  }
}
