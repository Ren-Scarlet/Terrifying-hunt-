/**
 * 主菜单「今夜的猎场」横幅：12 张地图插画。
 *
 * 素材来自「地图插画」文件夹，320×160（2:1）、无文字、带毛边暗角。
 * 这里只做氛围展示，不参与任何玩法逻辑：每次返回主菜单随机换一张，
 * 让「每次游玩都是一栋不一样的房子」在主页面上就先有个落点。
 * SECTOR 编号只是展示用的序号，不是官方地名（原文件代号保留在 title 里）。
 */
export interface MapArt {
  file: string;
  sector: string;
  code: string;
}

const RAW = [
  '320px-IconMap_Brl_MadHouse.webp',
  '320px-IconMap_Eng_Elmstreet.webp',
  '320px-IconMap_Fin_TheGame.webp',
  '320px-IconMap_Frm_Farmhouse.webp',
  '320px-IconMap_Hti_Manor.webp',
  '320px-IconMap_Ind_Mine.webp',
  '320px-IconMap_Jnk_Office.webp',
  '320px-IconMap_Kny_Cottage.webp',
  '320px-IconMap_Meteor_Applepielevel02.webp',
  '320px-IconMap_QuiLevel01.webp',
  '320px-IconMap_Sub_Street.webp',
  '320px-IconMap_Wal_Level01.webp',
];

export const MAP_ARTS: MapArt[] = RAW.map((file, i) => ({
  file,
  sector: `SECTOR ${String(i + 1).padStart(2, '0')}`,
  code: file.replace(/^320px-IconMap_/, '').replace(/\.webp$/, ''),
}));

const BASE =
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';

export function mapArtSrc(art: MapArt): string {
  return `${BASE}assets/maps/${art.file}`;
}

let current: MapArt | null = null;

/** 当前这张猎场。菜单内反复重绘时不换图，避免闪烁。 */
export function currentMenuMap(): MapArt {
  if (!current) current = MAP_ARTS[Math.floor(Math.random() * MAP_ARTS.length)];
  return current;
}

/** 返回主菜单时重新抽一张，尽量不和上一张重复。 */
export function rollMenuMap(): void {
  const prev = current;
  const pool = MAP_ARTS.filter((a) => a !== prev);
  current = pool[Math.floor(Math.random() * pool.length)] ?? MAP_ARTS[0];
}
