import { CARDS, CARD_MAP } from './data/cards';
import { KILLERS, KILLER_MAP } from './data/killers';
import type { Op, Precheck } from './effect';
import type { CardDef, CardType } from './types';
import { EFFECT_OPS, type EffectFieldType } from './effectCatalog';

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
  name?: string; type?: CardType; flavor?: string; precheck?: Precheck | null;
  cost?: number; desc?: string; noAction?: boolean; ops?: Op[];
}

export interface PowerTune {
  cooldown?: number;
  ops?: Op[];
}

export interface TuningData {
  cards: Record<string, CardTune>; powers: Record<string, PowerTune>;
  customCards: CardDef[]; deletedCards: string[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 原始定义：用于「恢复默认」 */
const BASELINE_CARD_DEFS = clone(CARDS);
const BASELINE_CARDS = clone(CARDS.map((c) => ({ id: c.id, cost: c.cost, desc: c.desc, noAction: !!c.noAction, ops: c.ops })));
const emptyTuning = (): TuningData => ({ cards: {}, powers: {}, customCards: [], deletedCards: [] });
const BASELINE_POWERS = clone(
  KILLERS.flatMap((k) =>
    k.powers.map((p) => ({ owner: k.owner, id: p.id, cooldown: p.cooldown, ops: p.ops })),
  ),
);

function load(): TuningData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyTuning();
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) { parsed.customCards ??= []; parsed.deletedCards ??= []; }
    return validateTuning(parsed) ? clone(parsed) : emptyTuning();
  } catch {
    return emptyTuning();
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
function rebuildCardRegistry(): void {
  CARDS.splice(0, CARDS.length);
  Object.keys(CARD_MAP).forEach((id) => delete CARD_MAP[id]);
  const deleted = new Set(data.deletedCards ?? []);
  [...clone(BASELINE_CARD_DEFS), ...clone(data.customCards ?? [])].filter((card) => !deleted.has(card.id)).forEach((card) => { CARDS.push(card); CARD_MAP[card.id] = card; });
}

export function applyTuning(): void {
  rebuildCardRegistry();
  Object.entries(data.cards).forEach(([id, tune]) => {
    const card = CARD_MAP[id];
    if (!card) return;
    if (typeof tune.name === 'string') card.name = tune.name;
    if (typeof tune.type === 'string') card.type = tune.type;
    if (typeof tune.flavor === 'string') card.flavor = tune.flavor;
    if ('precheck' in tune) card.precheck = tune.precheck ? clone(tune.precheck) : undefined;
    if (typeof tune.cost === 'number') card.cost = tune.cost;
    if (typeof tune.desc === 'string') card.desc = tune.desc;
    if (typeof tune.noAction === 'boolean') card.noAction = tune.noAction;
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
  return Object.keys(data.cards).length > 0 || Object.keys(data.powers).length > 0 || data.customCards.length > 0 || data.deletedCards.length > 0;
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
  data.cards[id] = { name: card.name, type: card.type, flavor: card.flavor, precheck: card.precheck ? clone(card.precheck) : null, cost: card.cost, desc: card.desc, noAction: !!card.noAction, ops: clone(card.ops) };
  persist();
}

function recordPower(owner: string, powerId: string): void {
  const power = KILLER_MAP[owner]?.powers.find((p) => p.id === powerId);
  if (!power) return;
  data.powers[powerKey(owner, powerId)] = { cooldown: power.cooldown, ops: clone(power.ops) };
  persist();
}

/** 卡牌：费用 */
export function setCardName(id: string, name: string): void { const card = CARD_MAP[id]; if (!card) return; card.name = name.slice(0, 60).trim() || '未命名卡牌'; recordCard(id); }
export function setCardType(id: string, type: CardType): void { const card = CARD_MAP[id]; if (!card || !['attack', 'skill', 'tactic', 'setup'].includes(type)) return; card.type = type; recordCard(id); }
export function setCardFlavor(id: string, flavor: string): void { const card = CARD_MAP[id]; if (!card) return; card.flavor = flavor.slice(0, 160); recordCard(id); }
export function setCardPrecheck(id: string, condition: string): void {
  const card = CARD_MAP[id]; if (!card) return;
  const presets: Record<string, Precheck | null> = { none: null, victimHere: { cond: { c: 'victimHere' }, hint: '当前房间没有可以攻击的目标。' }, downedHere: { cond: { c: 'downedHere' }, hint: '当前房间没有倒地的人。' }, injuredHere: { cond: { c: 'injuredHere' }, hint: '当前房间没有受伤的人。' }, targetAway: { cond: { c: 'targetAway' }, hint: '场上没有远离你的目标。' }, visibleSurvivor: { cond: { c: 'visibleSurvivor' }, hint: '视野内没有存活的幸存者。' }, survivorNearby: { cond: { c: 'survivorNearby' }, hint: '当前或相邻房间没有可受影响的幸存者。' }, carryingPerson: { cond: { c: 'carryingPerson' }, hint: '必须先抱起一名倒地幸存者。' }, currentDestructible: { cond: { c: 'currentDestructible' }, hint: '当前房间没有可破坏的物品。' } };
  if (!(condition in presets)) return; card.precheck = presets[condition] ? clone(presets[condition]!) : undefined; recordCard(id);
}
function nextCustomId(): string {
  let n = 1; while (CARD_MAP[`custom_card_${n}`] || data.customCards.some((c) => c.id === `custom_card_${n}`)) n += 1;
  return `custom_card_${n}`;
}
export function createCustomCard(): string {
  const id = nextCustomId();
  const card: CardDef = { id, name: '新卡牌', cost: 1, type: 'skill', desc: '写下这张卡牌的效果。', flavor: '', sourceSkill: '自定义卡牌', unlocked: true, pool: 'initial', ops: [] };
  data.customCards.push(card); applyTuning(); persist(); return id;
}
export function duplicateCard(id: string): string | null {
  const source = CARD_MAP[id]; if (!source) return null;
  const nextId = nextCustomId(); const copy = clone(source); copy.id = nextId; copy.name = `${source.name}（复制）`; copy.sourceSkill = '自定义卡牌';
  copy.pool = 'initial'; delete copy.killerOnly; copy.unlocked = true;
  data.customCards.push(copy); applyTuning(); persist(); return nextId;
}
export function deleteCard(id: string): boolean {
  if (!CARD_MAP[id]) return false;
  data.customCards = data.customCards.filter((card) => card.id !== id);
  if (BASELINE_CARD_DEFS.some((card) => card.id === id) && !data.deletedCards.includes(id)) data.deletedCards.push(id);
  delete data.cards[id]; applyTuning(); persist(); return true;
}

export function setCardDesc(id: string, desc: string): void {
  const card = CARD_MAP[id];
  if (!card) return;
  card.desc = desc.slice(0, 500);
  recordCard(id);
}

export function setCardNoAction(id: string, noAction: boolean): void {
  const card = CARD_MAP[id];
  if (!card) return;
  card.noAction = noAction;
  recordCard(id);
}

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

function defaultEffectOp(name: string): Op | null {
  const meta = EFFECT_OPS[name as keyof typeof EFFECT_OPS];
  if (!meta || name === 'if') return null;
  const result: Record<string, unknown> = { op: name };
  for (const [field, type] of meta.fields) {
    if (['maxHp', 'clearAlert', 'to', 'all', 'adj', 'value'].includes(field) && !(name === 'scout' && field === 'turns')) continue;
    if (name === 'attack' && ['bleedTurns', 'statusTurns'].includes(field)) { result[field] = 0; continue; }
    if (type === 'who') result[field] = 'victim';
    else if (type === 'dest') result[field] = 'here';
    else if (type === 'flag') result[field] = 'phoneCut';
    else if (type === 'sabotage') result[field] = 'phone';
    else if (type === 'status') result[field] = 'deepWound';
    else if (type === 'text') result[field] = '效果触发';
    else result[field] = field === 'turns' ? 2 : field === 'count' || field === 'distance' ? 1 : 1;
  }
  if (name === 'scout') result.turns = 2;
  return result as unknown as Op;
}
export function addCardOp(id: string, name: string): boolean {
  const card = CARD_MAP[id], op = defaultEffectOp(name);
  if (!card || !op || card.ops.length >= 30) return false;
  card.ops = [...card.ops, op]; recordCard(id); return true;
}
export function removeCardOp(id: string, index: number): boolean {
  const card = CARD_MAP[id];
  if (!card || index < 0 || index >= card.ops.length) return false;
  card.ops = card.ops.filter((_, i) => i !== index); recordCard(id); return true;
}
export function moveCardOp(id: string, index: number, direction: -1 | 1): boolean {
  const card = CARD_MAP[id], next = index + direction;
  if (!card || index < 0 || next < 0 || next >= card.ops.length) return false;
  const ops = [...card.ops]; [ops[index], ops[next]] = [ops[next], ops[index]];
  card.ops = ops; recordCard(id); return true;
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
  data = emptyTuning();
  rebuildCardRegistry();
  BASELINE_CARDS.forEach((base) => {
    const card = CARD_MAP[base.id];
    if (!card) return;
    card.cost = base.cost;
    card.desc = base.desc;
    card.noAction = base.noAction;
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
  'markedAny', 'allAny', 'fleeing', 'downedHere', 'downedAny', 'injuredAny', 'bloodSacrifice',
  'randomAny', 'unawareNearby',
]);
const FLAG_VALUES = new Set([
  'phoneCut', 'wiretap', 'poltergeist', 'policeBlocked', 'noAlarm', 'exitBlocked',
  'clearBarricade', 'freeMove', 'possessReady', 'myersStalk', 'hexHuntress', 'hexNoed',
  'scourgeShrine', 'distressing', 'hexRuin', 'stealthNext', 'revealAura',
  'revealNearestTrail', 'revealWorkers', 'myersLastBest', 'bitterMurmur', 'bleedNextHit', 'noAttackTurn',
]);
const STATUS_VALUES = new Set(['blind', 'undetectable', 'danger', 'deepWound', 'oblivious', 'incurable', 'cursed']);
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

const REQUIRED_OP_FIELDS: Record<string, string[]> = {
  attack: ['who', 'bleedTurns', 'status', 'statusTurns'],
  damage: ['who', 'amount'], down: ['who'], execute: ['who'], kill: ['who'], wanted: ['amount'],
  alert: ['who', 'amount'], block: ['who', 'turns'], status: ['who', 'status', 'turns'], pin: ['who'],
  move: ['who', 'to'], teleportPlayer: ['to'], lockRoom: ['room', 'turns'], track: ['who', 'turns'],
  lure: ['to', 'count'], alarm: ['amount'], sabotage: ['key'], draw: ['amount'], energy: ['amount'],
  fearFlee: ['amount'], revealExecutionSite: ['turns'],
  steps: ['amount'], stun: ['amount'], discount: ['amount'], bonusDamage: ['amount'], arrestThreshold: ['amount'],
  heal: ['who', 'amount'], rescue: ['who'], bleed: ['who', 'amount'], stalk: ['amount'],
  silenceAlarm: ['turns'], flag: ['key'], log: ['text'], if: ['cond', 'then'],
};
const OPTIONAL_DYNAMIC_FIELDS: Record<string, string[]> = {
  damage: ['maxHp'], move: ['clearAlert'], scout: ['to', 'all', 'adj', 'turns'],
  pursue: ['distance'], flag: ['value'], if: ['else'],
};
function validField(type: EffectFieldType, value: unknown, field: string, op: string): boolean {
  if (type === 'num') return (op === 'flag' && field === 'value' && typeof value === 'boolean') || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000);
  if (type === 'text') return typeof value === 'string' && value.length <= 1000;
  if (type === 'who') return typeof value === 'string' && WHO_VALUES.has(value);
  if (type === 'dest') return typeof value === 'string' && DEST_VALUES.has(value);
  if (type === 'flag') return typeof value === 'string' && FLAG_VALUES.has(value);
  if (type === 'status') return typeof value === 'string' && STATUS_VALUES.has(value);
  if (type === 'sabotage') return typeof value === 'string' && SABOTAGE_VALUES.has(value);
  return false;
}
function validateDynamicCondition(value: unknown): boolean {
  if (!isRecord(value) || typeof value.c !== 'string') return false;
  const allowed: Record<string, string[]> = {
    killsThisTurn: ['c', 'gte'], peopleHere: ['c', 'gte'], victimHere: ['c', 'maxHp'],
    downedHere: ['c'], injuredHere: ['c'], targetAway: ['c'], energy: ['c', 'gte'],
    wanted: ['c', 'gte', 'lte'], alarm: ['c', 'gte', 'lte'], stalk: ['c', 'gte'],
    possession: ['c'], visibleSurvivor: ['c'], survivorNearby: ['c'], carryingPerson: ['c'], currentDestructible: ['c'], flag: ['c', 'key'], room: ['c', 'is'],
    markedAlive: ['c'], escaped: ['c', 'gte'], hasThreat: ['c', 'v'], hasArchetype: ['c', 'a'],
  };
  const keys = allowed[value.c];
  if (!keys || Object.keys(value).some((key) => !keys.includes(key))) return false;
  for (const key of keys) {
    if (key === 'c') continue;
    if (!(key in value)) {
      if (['wanted', 'alarm', 'victimHere'].includes(value.c) && ['gte', 'lte', 'maxHp'].includes(key)) continue;
      return false;
    }
    const v = value[key];
    if (key === 'key' && value.c === 'flag' && (typeof v !== 'string' || !FLAG_VALUES.has(v))) return false;
    if (key === 'is' && value.c === 'room' && (typeof v !== 'string' || !DEST_VALUES.has(v))) return false;
    if (key === 'v' && (typeof v !== 'string' || !['alarm', 'lead', 'team', 'spiritual'].includes(v))) return false;
    if (key === 'a' && (typeof v !== 'string' || !['alert', 'defiant', 'caller', 'rescuer', 'hider', 'brave'].includes(v))) return false;
    if (['gte', 'lte', 'maxHp'].includes(key) && (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1000)) return false;
  }
  return true;
}
/** 按 DSL 目录校验效果步骤，不再要求与原卡牌指令数量、顺序相同。 */
function validateOps(value: unknown, _baseline?: Op[]): value is Op[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  return value.every((candidate) => {
    if (!isRecord(candidate) || typeof candidate.op !== 'string') return false;
    const meta = EFFECT_OPS[candidate.op as keyof typeof EFFECT_OPS];
    if (!meta) return false;
    const allowedFields = meta.fields.map(([field]) => field);
    if (candidate.op === 'if') allowedFields.push('cond', 'then');
    const optional = OPTIONAL_DYNAMIC_FIELDS[candidate.op] ?? [];
    if (Object.keys(candidate).some((key) => key !== 'op' && !allowedFields.includes(key) && !optional.includes(key))) return false;
    for (const field of REQUIRED_OP_FIELDS[candidate.op] ?? []) if (!(field in candidate)) return false;
    for (const [field, type] of meta.fields) {
      if (!(field in candidate)) {
        if (optional.includes(field)) continue;
        return false;
      }
      if (!validField(type, candidate[field], field, candidate.op)) return false;
    }
    for (const field of optional) {
      if (!(field in candidate)) continue;
      const v = candidate[field];
      if (candidate.op === 'damage' && field === 'maxHp' && (typeof v !== 'number' || v < 0 || v > 4)) return false;
      if (candidate.op === 'move' && field === 'clearAlert' && typeof v !== 'boolean') return false;
      if (candidate.op === 'scout' && field === 'to' && (typeof v !== 'string' || !DEST_VALUES.has(v))) return false;
      if (candidate.op === 'scout' && ['all', 'adj'].includes(field) && typeof v !== 'boolean') return false;
      if (candidate.op === 'scout' && field === 'turns' && (typeof v !== 'number' || v < 1 || v > 10)) return false;
      if (candidate.op === 'flag' && field === 'value' && typeof v !== 'boolean' && (typeof v !== 'number' || !Number.isFinite(v))) return false;
      if (candidate.op === 'if' && field === 'else' && !Array.isArray(v)) return false;
    }
    if (candidate.op === 'if') {
      if (!validateDynamicCondition(candidate.cond) || !validateOps(candidate.then) || (candidate.else !== undefined && !validateOps(candidate.else))) return false;
    }
    return true;
  });
}
function validateTuning(value: unknown): value is TuningData {
  if (!isRecord(value) || !isRecord(value.cards) || !isRecord(value.powers)) return false;
  if (Object.keys(value).some((key) => !['cards', 'powers', 'customCards', 'deletedCards'].includes(key))) return false;
  const customCards = value.customCards ?? []; const deletedCards = value.deletedCards ?? [];
  if (!Array.isArray(customCards) || customCards.length > 200 || !Array.isArray(deletedCards) || deletedCards.some((id) => typeof id !== 'string' || !BASELINE_CARDS.some((card) => card.id === id))) return false;
  const customIds = new Set<string>();
  for (const raw of customCards) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !/^custom_card_[0-9]+$/.test(raw.id) || customIds.has(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 60 || typeof raw.desc !== 'string' || raw.desc.length > 500 || typeof raw.flavor !== 'string' || raw.flavor.length > 160 || typeof raw.cost !== 'number' || !Number.isInteger(raw.cost) || raw.cost < 0 || raw.cost > 6 || !['attack', 'skill', 'tactic', 'setup'].includes(String(raw.type)) || !Array.isArray(raw.ops) || !validateOps(raw.ops) || typeof raw.unlocked !== 'boolean' || typeof raw.sourceSkill !== 'string') return false;
    customIds.add(raw.id);
  }

  for (const [id, tune] of Object.entries(value.cards)) {
    const base = BASELINE_CARDS.find((item) => item.id === id);
    if ((!base && !customIds.has(id)) || !isRecord(tune) || Object.keys(tune).some((key) => !['name', 'type', 'flavor', 'precheck', 'cost', 'desc', 'noAction', 'ops'].includes(key))) return false;
    if ('name' in tune && (typeof tune.name !== 'string' || tune.name.length > 60)) return false;
    if ('type' in tune && !['attack', 'skill', 'tactic', 'setup'].includes(String(tune.type))) return false;
    if ('flavor' in tune && (typeof tune.flavor !== 'string' || tune.flavor.length > 160)) return false;
    if ('precheck' in tune && tune.precheck !== null && (!isRecord(tune.precheck) || typeof tune.precheck.hint !== 'string' || tune.precheck.hint.length > 200 || !validateDynamicCondition(tune.precheck.cond))) return false;
    if ('cost' in tune && (typeof tune.cost !== 'number' || !Number.isInteger(tune.cost) || tune.cost < 0 || tune.cost > 6)) return false;
    if ('desc' in tune && (typeof tune.desc !== 'string' || tune.desc.length > 500)) return false;
    if ('noAction' in tune && typeof tune.noAction !== 'boolean') return false;
    if ('ops' in tune && !validateOps(tune.ops)) return false;
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
  const normalized = { ...(parsed as TuningData), customCards: (parsed as TuningData).customCards ?? [], deletedCards: (parsed as TuningData).deletedCards ?? [] };
  data = clone(normalized);
  rebuildCardRegistry();
  BASELINE_CARDS.forEach((base) => {
    const card = CARD_MAP[base.id];
    if (!card) return;
    card.cost = base.cost;
    card.desc = base.desc;
    card.noAction = base.noAction;
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
