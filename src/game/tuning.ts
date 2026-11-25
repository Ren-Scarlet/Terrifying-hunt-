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
    const parsed: unknown = JSON.parse(raw);
    return validateTuning(parsed) ? clone(parsed) : { cards: {}, powers: {} };
  } catch {
    return { cards: {}, powers: {} };
  }
}

let data: TuningData;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const WHO_VALUES = new Set([
  'victim', 'lowestHpHere', 'highestAlert', 'targetsHere', 'civilsHere', 'allHere',
  'markedAny', 'allAny', 'fleeing', 'downedHere', 'downedAny', 'injuredAny',
  'randomAny', 'unawareNearby',
]);
const FLAG_VALUES = new Set([
  'phoneCut', 'wiretap', 'poltergeist', 'policeBlocked', 'noAlarm', 'exitBlocked',
  'clearBarricade', 'freeMove', 'possessReady',
]);
const SABOTAGE_VALUES = new Set(['phone', 'exit', 'radio', 'lights']);
const DEST_VALUES = new Set([
  'here', 'adjacent', 'far', 'exit', 'garden', 'attic', 'nursery', 'bedroom',
  'study', 'storage', 'hall', 'corridor', 'kitchen', 'basement', 'laundry',
  'garage', 'dining', 'bathroom', 'conservatory',
]);

function validateCondition(value: unknown, baseline: unknown): boolean {
  if (!isRecord(value) || !isRecord(baseline) || value.c !== baseline.c) return false;
  const allowed = Object.keys(baseline);
  const optional: Record<string, string[]> = { wanted: ['gte', 'lte'], alarm: ['gte', 'lte'], victimHere: ['maxHp'] };
  const optionalKeys = optional[String(baseline.c)] ?? [];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return false;
  if (allowed.some((key) => !optionalKeys.includes(key) && !(key in value))) return false;
  for (const key of allowed) {
    if (!(key in value)) continue;
    const v = value[key];
    if (typeof baseline[key] === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000) return false;
    } else if (typeof baseline[key] === 'string') {
      if (typeof v !== 'string' || v.length > 100) return false;
      if (key === 'key' && baseline.c === 'flag' && !FLAG_VALUES.has(v)) return false;
      if (key === 'v' && baseline.c === 'hasThreat' && !['alarm', 'lead', 'team', 'spiritual'].includes(v)) return false;
      if (key === 'a' && baseline.c === 'hasArchetype' && !['alert', 'defiant', 'caller', 'rescuer', 'hider', 'brave'].includes(v)) return false;
    }
  }
  return true;
}

const OPTIONAL_OP_FIELDS: Record<string, string[]> = {
  damage: ['maxHp'], move: ['clearAlert'], scout: ['to', 'all', 'adj', 'turns'],
  pursue: ['distance'], flag: ['value'], if: ['else'],
};

function validateOptionalField(op: string, field: string, value: unknown): boolean {
  if (op === 'damage' && field === 'maxHp') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2;
  if (op === 'move' && field === 'clearAlert') return typeof value === 'boolean';
  if (op === 'scout' && field === 'to') return typeof value === 'string' && DEST_VALUES.has(value);
  if (op === 'scout' && (field === 'all' || field === 'adj')) return typeof value === 'boolean';
  if (op === 'scout' && field === 'turns') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
  if (op === 'pursue' && field === 'distance') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
  if (op === 'flag' && field === 'value') return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000);
  return false;
}

/** 只允许调整基准 DSL 已有的指令和字段，不允许导入时注入新指令。 */
function validateOps(value: unknown, baseline: Op[]): value is Op[] {
  if (!Array.isArray(value) || value.length !== baseline.length) return false;
  return value.every((candidate, index) => {
    const base = baseline[index] as unknown as Record<string, unknown>;
    if (!isRecord(candidate) || candidate.op !== base.op) return false;
    const keys = Object.keys(base);
    const optional = OPTIONAL_OP_FIELDS[candidate.op as string] ?? [];
    const candidateKeys = Object.keys(candidate);
    if (candidateKeys.some((key) => !keys.includes(key) && !optional.includes(key))) return false;
    for (const key of candidateKeys) {
      if (!keys.includes(key) && !validateOptionalField(candidate.op as string, key, candidate[key])) return false;
    }
    if (keys.some((key) => !optional.includes(key) && !(key in candidate))) return false;
    for (const key of keys) {
      const current = candidate[key];
      const original = base[key];
      if (original === undefined && current !== undefined) {
        if (!validateOptionalField(candidate.op as string, key, current)) return false;
        continue;
      }
      if (key === 'then' || key === 'else') {
        if (current === undefined && original === undefined) continue;
        if (!Array.isArray(original) || !Array.isArray(current) || !validateOps(current, original as Op[])) return false;
      } else if (key === 'cond') {
        if (!validateCondition(current, original)) return false;
      } else if (typeof original === 'number') {
        if (typeof current !== 'number' || !Number.isFinite(current) || Math.abs(current) > 1000) return false;
      } else if (typeof original === 'string') {
        if (typeof current !== 'string' || current.length > 1000) return false;
        if (key === 'who' && !WHO_VALUES.has(current)) return false;
        if ((key === 'to' || key === 'room') && !DEST_VALUES.has(current)) return false;
        if (key === 'key' && candidate.op === 'flag' && !FLAG_VALUES.has(current)) return false;
        if (key === 'key' && candidate.op === 'sabotage' && !SABOTAGE_VALUES.has(current)) return false;
      } else if (typeof original === 'boolean' && typeof current !== 'boolean') {
        return false;
      }
    }
    return true;
  });
}

function validateTuning(value: unknown): value is TuningData {
  if (!isRecord(value) || !isRecord(value.cards) || !isRecord(value.powers)) return false;
  if (Object.keys(value).some((key) => key !== 'cards' && key !== 'powers')) return false;

  for (const [id, tune] of Object.entries(value.cards)) {
    const base = BASELINE_CARDS.find((item) => item.id === id);
    if (!base || !isRecord(tune) || Object.keys(tune).some((key) => key !== 'cost' && key !== 'ops')) return false;
    if ('cost' in tune && (typeof tune.cost !== 'number' || !Number.isInteger(tune.cost) || tune.cost < 0 || tune.cost > 6)) return false;
    if ('ops' in tune && !validateOps(tune.ops, base.ops)) return false;
  }

  for (const [key, tune] of Object.entries(value.powers)) {
    const [owner, powerId, ...extra] = key.split('::');
    const base = BASELINE_POWERS.find((item) => item.owner === owner && item.id === powerId);
    if (!base || extra.length || !isRecord(tune) || Object.keys(tune).some((field) => field !== 'cooldown' && field !== 'ops')) return false;
    if ('cooldown' in tune && (typeof tune.cooldown !== 'number' || !Number.isInteger(tune.cooldown) || tune.cooldown < 1 || tune.cooldown > 8)) return false;
    if ('ops' in tune && !validateOps(tune.ops, base.ops)) return false;
  }
  return true;
}

data = load();

export function importTuning(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!validateTuning(parsed)) return false;

  // 校验完整通过后才改运行时数据，错误文件不会污染当前平衡配置。
  data = clone(parsed);
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
}
