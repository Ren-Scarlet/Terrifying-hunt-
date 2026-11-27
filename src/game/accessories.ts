/**
 * 配件系统的运行层：库存、装配、消耗与补货。
 * 数据表在 src/game/data/accessories.ts，效果在 src/game/modifiers.ts。
 */
import {
  ACCESSORIES,
  ACCESSORY_MAP,
  ACCESSORY_PRICE,
  ACCESSORY_RARITY_LABEL,
  ACCESSORY_SLOTS,
  accessoriesForKiller,
  accessoryPrice,
  starterAccessoryStock,
} from './data/accessories';
import type { AccessoryDef, SaveData } from './types';

export {
  ACCESSORIES,
  ACCESSORY_MAP,
  ACCESSORY_PRICE,
  ACCESSORY_RARITY_LABEL,
  ACCESSORY_SLOTS,
  accessoriesForKiller,
  accessoryPrice,
  starterAccessoryStock,
};

/** 库存数量：只认正整数，未知 id 直接丢弃。 */
export function sanitizeAccessoryStock(raw: unknown, owner?: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const def = ACCESSORY_MAP[id];
    if (!def) continue;
    if (owner && def.owner !== owner) continue;
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
    if (count > 0) out[id] = count;
  }
  return out;
}

/**
 * 装配栏校验：最多 2 件、同一件不能带两次、必须属于当前杀手。
 * 不检查库存：库存不足在进入猎场时才处理，避免改杀手后配置被静默清空。
 */
export function sanitizeAccessoryLoadout(raw: unknown, owner?: string): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    const def = ACCESSORY_MAP[id];
    if (!def || out.includes(id)) continue;
    if (owner && def.owner !== owner) continue;
    out.push(id);
    if (out.length >= ACCESSORY_SLOTS) break;
  }
  return out;
}

export function accessoryCount(save: SaveData, id: string): number {
  return save.accessories?.[id] ?? 0;
}

/** 本局实际能带进去的配件：按装配顺序，库存不足或不属于该杀手的直接跳过。 */
export function loadoutForRun(save: SaveData, killer: string): string[] {
  const out: string[] = [];
  for (const id of sanitizeAccessoryLoadout(save.accessoryLoadout, killer)) {
    if (accessoryCount(save, id) <= 0) continue;
    out.push(id);
    if (out.length >= ACCESSORY_SLOTS) break;
  }
  return out;
}

/** 带入猎场：每件永久消耗 1 个，库存归零后把条目删掉。 */
export function consumeAccessories(save: SaveData, ids: string[]): SaveData {
  const stock = { ...(save.accessories ?? {}) };
  for (const id of ids) {
    const count = stock[id] ?? 0;
    if (count <= 0) continue;
    if (count === 1) delete stock[id];
    else stock[id] = count - 1;
  }
  return { ...save, accessories: stock, accessoryLoadout: [...ids] };
}

/** 血点补货 1 件；血点不够返回 null。 */
export function buyAccessory(save: SaveData, id: string): SaveData | null {
  const def = ACCESSORY_MAP[id];
  if (!def) return null;
  const price = accessoryPrice(def.rarity);
  if ((save.credits ?? 0) < price) return null;
  const stock = { ...(save.accessories ?? {}) };
  stock[id] = (stock[id] ?? 0) + 1;
  return { ...save, credits: save.credits - price, accessories: stock };
}

/** 校验用：某位杀手的配件是否都带合法的统一修正键（供测试引用）。 */
export function accessoryDefsOf(owner: string): AccessoryDef[] {
  return accessoriesForKiller(owner);
}
