import { HUNTING_GROUNDS, rollHuntingGround, type HuntingGround, type HuntingGroundId } from '../game/maps';

export interface MapArt extends HuntingGround {
  sector: string;
  code: string;
}

const BASE =
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';

export const MAP_ARTS: MapArt[] = HUNTING_GROUNDS.map((ground, index) => ({
  ...ground,
  sector: `HUNTING GROUND ${String(index + 1).padStart(2, '0')}`,
  code: ground.id.toUpperCase(),
}));

export function mapArtSrc(art: MapArt): string {
  return `${BASE}assets/maps/${art.file}`;
}

let current: MapArt | null = null;

/** 菜单展示的猎场就是下一局实际进入的地图。 */
export function currentMenuMap(): MapArt {
  if (!current) {
    const ground = rollHuntingGround();
    current = MAP_ARTS.find((item) => item.id === ground.id) ?? MAP_ARTS[0];
  }
  return current;
}

/** 返回主菜单时重新抽取另一张猎场，避免连续重复。 */
export function rollMenuMap(): void {
  const previous = current?.id as HuntingGroundId | undefined;
  const ground = rollHuntingGround(previous);
  current = MAP_ARTS.find((item) => item.id === ground.id) ?? MAP_ARTS[0];
}
