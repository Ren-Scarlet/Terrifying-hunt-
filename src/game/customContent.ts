import { ACCESSORIES, ACCESSORY_MAP } from './data/accessories';
import publishedRaw from './data/published-accessories.json';
import type { AccessoryDef } from './types';

/**
 * 作者自定义配件（配件工坊）
 *
 * 内置配件写在 src/game/data/accessories.ts；这个模块负责把「工坊里做的配件」
 * 存进 localStorage，并在启动时并进同一个注册表，所以引擎、装配界面、血网
 * 都不需要区分内置/自定义。
 *
 * 导出 JSON 就是备份；换电脑/发给别人直接导入即可。
 */

const KEY = 'nightfall-custom-accessories-v1';
const HIDDEN_KEY = 'nightfall-custom-accessories-hidden-v1';

/** 已发布（写进仓库）的配件：随构建进游戏，所有人可见。 */
const PUBLISHED: AccessoryDef[] = (Array.isArray(publishedRaw) ? publishedRaw : []).filter(isAccessoryDef);

function loadHiddenIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function persistHiddenIds(ids: string[]): void {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids)); } catch { /* 忽略 */ }
}

export function isPublishedAccessory(id: string): boolean {
  return PUBLISHED.some((def) => def.id === id);
}

/** 已发布 + 本地自定义（同 id 本地优先），并排除本地隐藏掉的。 */
export function allCustomAccessories(): AccessoryDef[] {
  const hidden = new Set(loadHiddenIds());
  const map = new Map<string, AccessoryDef>();
  for (const def of PUBLISHED) if (!hidden.has(def.id)) map.set(def.id, def);
  for (const def of loadCustomAccessories()) map.set(def.id, def);
  return [...map.values()];
}

/** 当前这批自定义配件的 id，删改时用来定位。 */
const customIds = new Set<string>();

function isAccessoryDef(value: unknown): value is AccessoryDef {
  if (!value || typeof value !== 'object') return false;
  const def = value as Partial<AccessoryDef>;
  return typeof def.id === 'string' && typeof def.name === 'string' && typeof def.owner === 'string'
    && Array.isArray(def.mods);
}

export function loadCustomAccessories(): AccessoryDef[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAccessoryDef);
  } catch {
    return [];
  }
}

export function persistCustomAccessories(list: AccessoryDef[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 配额不足（图标太大）时静默失败；界面会提示改用小图
  }
}

/** 把自定义配件并进全局注册表（重复调用会先清掉上一次的）。 */
export function applyCustomAccessories(list: AccessoryDef[]): void {
  // 先移除旧的
  for (let i = ACCESSORIES.length - 1; i >= 0; i -= 1) {
    if (customIds.has(ACCESSORIES[i].id)) ACCESSORIES.splice(i, 1);
  }
  customIds.forEach((id) => { delete ACCESSORY_MAP[id]; });
  customIds.clear();

  for (const def of list) {
    if (!def?.id || ACCESSORY_MAP[def.id]) continue; // 不覆盖内置，避免同名把内置改坏
    ACCESSORIES.push(def);
    ACCESSORY_MAP[def.id] = def;
    customIds.add(def.id);
  }
}

export function isCustomAccessory(id: string): boolean {
  return customIds.has(id);
}

export function customAccessoryList(): AccessoryDef[] {
  return ACCESSORIES.filter((def) => customIds.has(def.id));
}

/** 全部自定义（含已发布），供发布用。 */
export function customAccessoriesForPublish(): AccessoryDef[] {
  return allCustomAccessories();
}

/** 从注册表里删掉一件自定义配件（内置的删不掉）。 */
export function removeCustomAccessory(id: string): AccessoryDef[] {
  if (isPublishedAccessory(id)) {
    const hidden = loadHiddenIds();
    if (!hidden.includes(id)) hidden.push(id);
    persistHiddenIds(hidden);
  }
  const next = customAccessoryList().filter((def) => def.id !== id);
  applyCustomAccessories(next);
  persistCustomAccessories(next);
  return next;
}

/** 新增或更新一件自定义配件。 */
export function upsertCustomAccessory(def: AccessoryDef): AccessoryDef[] {
  const list = customAccessoryList().filter((item) => item.id !== def.id);
  list.push(def);
  applyCustomAccessories(list);
  persistCustomAccessories(list);
  return list;
}

/** 启动时调用：读 localStorage 并注册。 */
export function bootCustomAccessories(): void {
  applyCustomAccessories(allCustomAccessories());
}

/** 导出成 JSON 文本（给「导出」按钮用）。 */
export function exportCustomAccessories(): string {
  return JSON.stringify(customAccessoryList(), null, 2);
}

/** 导入 JSON 文本；返回导入后的列表（失败抛错）。 */
export function importCustomAccessories(json: string): AccessoryDef[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('JSON 必须是配件数组');
  const list = parsed.filter(isAccessoryDef).map((def) => ({ ...def, id: String(def.id) }));
  applyCustomAccessories(list);
  persistCustomAccessories(list);
  return list;
}
