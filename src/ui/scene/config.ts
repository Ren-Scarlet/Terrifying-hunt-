import type { RoomId } from '../../game/types';

export type MatKind =
  | 'wood'
  | 'woodV'
  | 'carpet'
  | 'tile'
  | 'concrete'
  | 'plaster'
  | 'grass'
  | 'dirt';

export const ROOM_MATERIAL: Record<RoomId, MatKind> = {
  attic: 'woodV',
  nursery: 'carpet',
  dining: 'wood',
  bathroom: 'tile',
  conservatory: 'tile',
  bedroom: 'carpet',
  study: 'wood',
  storage: 'concrete',
  hall: 'wood',
  corridor: 'woodV',
  kitchen: 'tile',
  laundry: 'tile',
  basement: 'concrete',
  garage: 'concrete',
  garden: 'grass',
  foyer: 'wood',
  library: 'wood',
  wine: 'concrete',
  guestroom: 'carpet',
  workshop: 'concrete',
  stairwell: 'woodV',
  chapel: 'wood',
  balcony: 'tile',
};

/** 每个房间的环境色（正片叠底），决定这个空间是暖木、冷瓷砖还是湿水泥 */
export const ROOM_TINT: Record<RoomId, string> = {
  attic: 'rgba(78,58,34,.6)',
  nursery: 'rgba(66,52,60,.58)',
  dining: 'rgba(88,58,34,.56)',
  bathroom: 'rgba(52,66,74,.58)',
  conservatory: 'rgba(46,64,52,.6)',
  bedroom: 'rgba(76,44,48,.58)',
  study: 'rgba(70,54,32,.55)',
  storage: 'rgba(54,56,48,.58)',
  hall: 'rgba(84,56,30,.58)',
  corridor: 'rgba(60,50,38,.6)',
  kitchen: 'rgba(48,62,70,.55)',
  laundry: 'rgba(44,58,64,.58)',
  basement: 'rgba(38,52,46,.62)',
  garage: 'rgba(48,54,62,.6)',
  garden: 'rgba(38,54,36,.58)',
  foyer: 'rgba(84,64,40,.58)',
  library: 'rgba(70,52,36,.6)',
  wine: 'rgba(48,44,52,.6)',
  guestroom: 'rgba(76,56,52,.58)',
  workshop: 'rgba(58,58,62,.6)',
  stairwell: 'rgba(62,58,52,.58)',
  chapel: 'rgba(72,56,40,.6)',
  balcony: 'rgba(52,66,74,.56)',
};

export interface Bulb {
  /** 房间内相对坐标 0–1 */
  x: number;
  y: number;
  /** 半径占房间短边的比例 */
  r: number;
  color: [number, number, number];
  /** 0–1 亮度 */
  power: number;
  /** 0–1 闪烁强度 */
  flicker: number;
  /** 灯本身画出来的小光点 */
  fixture?: 'bulb' | 'tube';
}

export interface WindowLight {
  side: 'top' | 'bottom' | 'left' | 'right';
  /** 沿墙位置 0–1 */
  p: number;
  /** 宽度占边长的比例 */
  w: number;
}

export const WINDOWS: Partial<Record<RoomId, WindowLight[]>> = {
  attic: [{ side: 'left', p: 0.32, w: 0.3 }],
  nursery: [{ side: 'top', p: 0.5, w: 0.26 }],
  bedroom: [{ side: 'top', p: 0.42, w: 0.34 }],
  dining: [{ side: 'right', p: 0.36, w: 0.4 }],
  bathroom: [{ side: 'top', p: 0.7, w: 0.2 }],
  conservatory: [{ side: 'left', p: 0.3, w: 0.36 }, { side: 'top', p: 0.3, w: 0.3 }],
  study: [
    { side: 'top', p: 0.6, w: 0.3 },
    { side: 'right', p: 0.62, w: 0.26 },
  ],
  storage: [{ side: 'left', p: 0.44, w: 0.26 }],
  corridor: [{ side: 'right', p: 0.34, w: 0.2 }],
  kitchen: [
    { side: 'left', p: 0.38, w: 0.28 },
    { side: 'bottom', p: 0.34, w: 0.22 },
  ],
  laundry: [{ side: 'bottom', p: 0.6, w: 0.18 }],
  basement: [{ side: 'bottom', p: 0.42, w: 0.14 }],
  garage: [{ side: 'right', p: 0.44, w: 0.26 }],
};

export const BULBS: Partial<Record<RoomId, Bulb[]>> = {
  hall: [{ x: 0.5, y: 0.4, r: 0.78, color: [255, 208, 150], power: 0.92, flicker: 0.05, fixture: 'bulb' }],
  study: [{ x: 0.62, y: 0.3, r: 0.44, color: [255, 198, 132], power: 0.8, flicker: 0.07 }],
  kitchen: [{ x: 0.46, y: 0.34, r: 0.62, color: [250, 232, 196], power: 0.66, flicker: 0.24, fixture: 'tube' }],
  laundry: [{ x: 0.44, y: 0.3, r: 0.5, color: [206, 224, 232], power: 0.44, flicker: 0.48, fixture: 'tube' }],
  corridor: [{ x: 0.5, y: 0.4, r: 0.5, color: [206, 222, 240], power: 0.4, flicker: 0.55, fixture: 'tube' }],
  basement: [{ x: 0.52, y: 0.6, r: 0.42, color: [255, 162, 92], power: 0.52, flicker: 0.38, fixture: 'bulb' }],
  attic: [{ x: 0.52, y: 0.52, r: 0.34, color: [255, 196, 128], power: 0.32, flicker: 0.14, fixture: 'bulb' }],
  nursery: [{ x: 0.7, y: 0.3, r: 0.36, color: [255, 206, 176], power: 0.34, flicker: 0.2, fixture: 'bulb' }],
  garage: [{ x: 0.3, y: 0.36, r: 0.44, color: [200, 216, 232], power: 0.3, flicker: 0.62, fixture: 'tube' }],
  dining: [{ x: 0.5, y: 0.4, r: 0.6, color: [255, 200, 140], power: 0.72, flicker: 0.12, fixture: 'bulb' }],
  bathroom: [{ x: 0.5, y: 0.3, r: 0.38, color: [206, 226, 240], power: 0.44, flicker: 0.5, fixture: 'tube' }],
  conservatory: [{ x: 0.5, y: 0.32, r: 0.56, color: [176, 226, 186], power: 0.5, flicker: 0.28, fixture: 'tube' }],
};

/** 房间整体环境光的强度：没有灯的房间也要能读出地面，只是更暗 */
export const ROOM_AMBIENT: Record<RoomId, number> = {
  attic: 0.22,
  nursery: 0.28,
  dining: 0.32,
  bathroom: 0.26,
  conservatory: 0.32,
  bedroom: 0.32,
  study: 0.28,
  storage: 0.24,
  hall: 0.36,
  corridor: 0.28,
  kitchen: 0.34,
  laundry: 0.3,
  basement: 0.26,
  garage: 0.28,
  garden: 0.36,
  foyer: 0.32,
  library: 0.26,
  wine: 0.2,
  guestroom: 0.3,
  workshop: 0.28,
  stairwell: 0.22,
  chapel: 0.26,
  balcony: 0.38,
};

/* ------------------------------------------------------------------ */
/* 家具                                                               */
/* ------------------------------------------------------------------ */

export type PropKind =
  | 'bed'
  | 'wardrobe'
  | 'desk'
  | 'chair'
  | 'shelf'
  | 'counter'
  | 'fridge'
  | 'stove'
  | 'table'
  | 'rug'
  | 'fireplace'
  | 'stairs'
  | 'car'
  | 'boiler'
  | 'pipes'
  | 'crate'
  | 'candles'
  | 'tree'
  | 'bush'
  | 'fence'
  | 'trash'
  | 'tires'
  | 'bench'
  | 'lamp'
  | 'plant'
  | 'sheet'
  | 'puddle'
  | 'clutter';

export interface Prop {
  k: PropKind;
  /** 房间内相对位置（中心点）与尺寸，都用 0–1 表示 */
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

export const PROPS: Record<RoomId, Prop[]> = {
  attic: [
    { k: 'rug', x: 0.5, y: 0.5, w: 0.7, h: 0.54 },
    { k: 'crate', x: 0.26, y: 0.26, w: 0.3, h: 0.24, rot: -7 },
    { k: 'crate', x: 0.6, y: 0.24, w: 0.24, h: 0.2, rot: 5 },
    { k: 'crate', x: 0.36, y: 0.66, w: 0.34, h: 0.22, rot: 2 },
    { k: 'sheet', x: 0.72, y: 0.64, w: 0.26, h: 0.3, rot: -4 },
    { k: 'clutter', x: 0.84, y: 0.34, w: 0.18, h: 0.2 },
  ],
  nursery: [
    { k: 'rug', x: 0.5, y: 0.62, w: 0.66, h: 0.5 },
    { k: 'bed', x: 0.28, y: 0.28, w: 0.34, h: 0.3 },
    { k: 'wardrobe', x: 0.82, y: 0.26, w: 0.2, h: 0.34 },
    { k: 'chair', x: 0.66, y: 0.68, w: 0.15, h: 0.15, rot: -18 },
    { k: 'lamp', x: 0.2, y: 0.72, w: 0.08, h: 0.08 },
    { k: 'clutter', x: 0.72, y: 0.86, w: 0.24, h: 0.14 },
    { k: 'clutter', x: 0.42, y: 0.5, w: 0.16, h: 0.12 },
  ],
  dining: [
    { k: 'rug', x: 0.5, y: 0.62, w: 0.74, h: 0.44 },
    { k: 'table', x: 0.5, y: 0.5, w: 0.52, h: 0.34 },
    { k: 'chair', x: 0.26, y: 0.34, w: 0.16, h: 0.16, rot: -4 },
    { k: 'chair', x: 0.74, y: 0.34, w: 0.16, h: 0.16, rot: 6 },
    { k: 'chair', x: 0.3, y: 0.72, w: 0.15, h: 0.15, rot: 12 },
    { k: 'candles', x: 0.5, y: 0.44, w: 0.16, h: 0.12 },
    { k: 'counter', x: 0.1, y: 0.6, w: 0.14, h: 0.5 },
  ],
  bathroom: [
    { k: 'puddle', x: 0.42, y: 0.68, w: 0.5, h: 0.34 },
    { k: 'counter', x: 0.5, y: 0.18, w: 0.56, h: 0.18 },
    { k: 'sheet', x: 0.9, y: 0.58, w: 0.16, h: 0.5 },
    { k: 'clutter', x: 0.2, y: 0.8, w: 0.2, h: 0.16 },
  ],
  conservatory: [
    { k: 'plant', x: 0.2, y: 0.3, w: 0.28, h: 0.34 },
    { k: 'plant', x: 0.76, y: 0.28, w: 0.24, h: 0.3 },
    { k: 'tree', x: 0.52, y: 0.42, w: 0.34, h: 0.4 },
    { k: 'bench', x: 0.5, y: 0.78, w: 0.42, h: 0.14 },
    { k: 'puddle', x: 0.36, y: 0.66, w: 0.3, h: 0.2 },
    { k: 'crate', x: 0.86, y: 0.74, w: 0.2, h: 0.18, rot: 8 },
  ],
  bedroom: [
    { k: 'rug', x: 0.5, y: 0.64, w: 0.7, h: 0.44 },
    { k: 'bed', x: 0.66, y: 0.3, w: 0.5, h: 0.42 },
    { k: 'wardrobe', x: 0.15, y: 0.24, w: 0.19, h: 0.36 },
    { k: 'chair', x: 0.2, y: 0.72, w: 0.14, h: 0.14, rot: 22 },
    { k: 'lamp', x: 0.42, y: 0.22, w: 0.08, h: 0.08 },
    { k: 'clutter', x: 0.44, y: 0.78, w: 0.22, h: 0.16 },
    { k: 'clutter', x: 0.82, y: 0.74, w: 0.16, h: 0.18 },
  ],
  study: [
    { k: 'rug', x: 0.5, y: 0.6, w: 0.72, h: 0.46 },
    { k: 'desk', x: 0.56, y: 0.26, w: 0.46, h: 0.22 },
    { k: 'chair', x: 0.56, y: 0.46, w: 0.16, h: 0.16 },
    { k: 'shelf', x: 0.12, y: 0.56, w: 0.17, h: 0.62 },
    { k: 'shelf', x: 0.88, y: 0.24, w: 0.15, h: 0.4 },
    { k: 'lamp', x: 0.66, y: 0.24, w: 0.09, h: 0.09 },
    { k: 'chair', x: 0.78, y: 0.76, w: 0.13, h: 0.13, rot: -16 },
  ],
  storage: [
    { k: 'shelf', x: 0.24, y: 0.28, w: 0.4, h: 0.22 },
    { k: 'boiler', x: 0.74, y: 0.34, w: 0.26, h: 0.36 },
    { k: 'pipes', x: 0.5, y: 0.22, w: 0.84, h: 0.1 },
    { k: 'crate', x: 0.34, y: 0.7, w: 0.32, h: 0.26, rot: 4 },
    { k: 'crate', x: 0.68, y: 0.76, w: 0.22, h: 0.2, rot: -6 },
    { k: 'clutter', x: 0.5, y: 0.52, w: 0.2, h: 0.18 },
    { k: 'puddle', x: 0.62, y: 0.56, w: 0.26, h: 0.22 },
  ],
  hall: [
    { k: 'rug', x: 0.5, y: 0.62, w: 0.6, h: 0.52 },
    { k: 'stairs', x: 0.14, y: 0.22, w: 0.22, h: 0.3 },
    { k: 'fireplace', x: 0.82, y: 0.15, w: 0.24, h: 0.18 },
    { k: 'table', x: 0.5, y: 0.24, w: 0.24, h: 0.14 },
    { k: 'wardrobe', x: 0.1, y: 0.7, w: 0.15, h: 0.34 },
    { k: 'chair', x: 0.84, y: 0.72, w: 0.13, h: 0.13, rot: 12 },
    { k: 'plant', x: 0.22, y: 0.82, w: 0.12, h: 0.16 },
  ],
  corridor: [
    { k: 'rug', x: 0.5, y: 0.5, w: 0.26, h: 0.92 },
    { k: 'table', x: 0.15, y: 0.64, w: 0.16, h: 0.16 },
    { k: 'bench', x: 0.15, y: 0.24, w: 0.14, h: 0.3 },
    { k: 'pipes', x: 0.5, y: 0.22, w: 0.84, h: 0.1 },
    { k: 'crate', x: 0.85, y: 0.72, w: 0.17, h: 0.2, rot: 4 },
    { k: 'clutter', x: 0.8, y: 0.26, w: 0.16, h: 0.18 },
  ],
  kitchen: [
    { k: 'counter', x: 0.22, y: 0.2, w: 0.42, h: 0.2 },
    { k: 'stove', x: 0.6, y: 0.2, w: 0.19, h: 0.2 },
    { k: 'fridge', x: 0.87, y: 0.3, w: 0.19, h: 0.32 },
    { k: 'table', x: 0.48, y: 0.68, w: 0.42, h: 0.3 },
    { k: 'chair', x: 0.24, y: 0.68, w: 0.13, h: 0.13, rot: 8 },
    { k: 'chair', x: 0.72, y: 0.68, w: 0.13, h: 0.13, rot: -6 },
    { k: 'puddle', x: 0.3, y: 0.44, w: 0.2, h: 0.14 },
    { k: 'clutter', x: 0.78, y: 0.56, w: 0.2, h: 0.16 },
  ],
  basement: [
    { k: 'boiler', x: 0.15, y: 0.3, w: 0.18, h: 0.3 },
    { k: 'pipes', x: 0.5, y: 0.22, w: 0.84, h: 0.1 },
    { k: 'shelf', x: 0.15, y: 0.72, w: 0.16, h: 0.34 },
    { k: 'candles', x: 0.62, y: 0.64, w: 0.32, h: 0.32 },
    { k: 'crate', x: 0.87, y: 0.26, w: 0.17, h: 0.19, rot: -8 },
    { k: 'crate', x: 0.85, y: 0.74, w: 0.19, h: 0.18, rot: 6 },
    { k: 'puddle', x: 0.4, y: 0.46, w: 0.28, h: 0.24 },
    { k: 'clutter', x: 0.55, y: 0.86, w: 0.2, h: 0.14 },
  ],
  laundry: [
    { k: 'counter', x: 0.22, y: 0.2, w: 0.36, h: 0.22 },
    { k: 'fridge', x: 0.62, y: 0.2, w: 0.18, h: 0.26 },
    { k: 'pipes', x: 0.5, y: 0.22, w: 0.84, h: 0.1 },
    { k: 'puddle', x: 0.44, y: 0.62, w: 0.5, h: 0.26 },
    { k: 'shelf', x: 0.86, y: 0.66, w: 0.16, h: 0.3 },
    { k: 'clutter', x: 0.2, y: 0.7, w: 0.24, h: 0.2 },
    { k: 'crate', x: 0.5, y: 0.3, w: 0.18, h: 0.16, rot: 10 },
  ],
  garage: [
    { k: 'car', x: 0.44, y: 0.56, w: 0.72, h: 0.58 },
    { k: 'bench', x: 0.15, y: 0.16, w: 0.26, h: 0.16 },
    { k: 'tires', x: 0.89, y: 0.2, w: 0.16, h: 0.28 },
    { k: 'crate', x: 0.88, y: 0.8, w: 0.18, h: 0.18, rot: -4 },
    { k: 'puddle', x: 0.5, y: 0.84, w: 0.4, h: 0.16 },
    { k: 'clutter', x: 0.16, y: 0.4, w: 0.2, h: 0.2 },
  ],
  foyer: [],
  library: [],
  wine: [],
  guestroom: [],
  workshop: [],
  stairwell: [],
  chapel: [],
  balcony: [],
  garden: [
    { k: 'tree', x: 0.12, y: 0.4, w: 0.24, h: 0.46 },
    { k: 'tree', x: 0.86, y: 0.62, w: 0.2, h: 0.4 },
    { k: 'bush', x: 0.6, y: 0.64, w: 0.2, h: 0.3 },
    { k: 'fence', x: 0.5, y: 0.94, w: 1.0, h: 0.1 },
    { k: 'trash', x: 0.86, y: 0.34, w: 0.14, h: 0.2 },
    { k: 'bush', x: 0.3, y: 0.8, w: 0.16, h: 0.24 },
    { k: 'puddle', x: 0.46, y: 0.56, w: 0.24, h: 0.18 },
  ],
};

