import { random } from './random';
import type { Room, RoomId } from './types';

/**
 * 房间没有固定的位置。
 *
 * 每开一局，`buildLayout()` 会在 8×4 的网格上随机「长出」一块连通的房间区，
 * 再把房间随机塞进去——所以每一局的户型、走廊长度、后院挂在哪个方向都不一样。
 * 各处的 `ROOM_MAP[x].neighbors` / `rect` 都是开局时才填的，不要在模块加载阶段缓存。
 *
 * 每局 23–33 间房（含后院）随机散布在地图网格中，最远的两间要走多步；
 * 生成树只开少量环路，门少、走廊长——想追上一个人得真的绕房子，不是点两下就贴脸。
 */
const CORE_BLUEPRINTS: Array<Pick<Room, 'id' | 'name' | 'desc'>> = [
  { id: 'attic', name: '阁楼', desc: '倾斜屋顶下堆满旧箱子，脚步声会被木板放大。' },
  { id: 'nursery', name: '儿童房', desc: '婴儿床空着，墙上的涂鸦还湿着；床底能塞下一个人。' },
  { id: 'bedroom', name: '卧室', desc: '床铺凌乱，衣柜半开，适合藏匿也适合下手。' },
  { id: 'bathroom', name: '浴室', desc: '镜子上的水汽还没散，浴缸帘拉着，看不清后面有什么。' },
  { id: 'study', name: '书房', desc: '台灯还亮着，书架上有一本翻开的旧档案，电话在桌上。' },
  { id: 'dining', name: '餐厅', desc: '长桌上摆着没吃完的晚饭，椅子还歪着，像有人刚站起来。' },
  { id: 'storage', name: '储藏室', desc: '灰尘和煤油味混在一起，角落里有备用工具。' },
  { id: 'hall', name: '大厅', desc: '整栋房子的枢纽，任何动静都会在这里回荡，电话在门厅柜上。' },
  { id: 'corridor', name: '走廊', desc: '狭长的过道，尽头传来潮湿的通风声。' },
  { id: 'conservatory', name: '温室', desc: '玻璃顶棚蒙着雾，花架上插着修剪刀，泥土里埋着什么东西。' },
  { id: 'kitchen', name: '厨房', desc: '刀架整齐，水槽里还有未洗的杯子——反抗的人会来这里。' },
  { id: 'basement', name: '地下室', desc: '水泥墙上的水渍像一张模糊的脸，角落里有一台旧无线电。' },
  { id: 'laundry', name: '洗衣房', desc: '洗衣机还在转，地上全是水；烘干机后面能藏人。' },
  { id: 'garage', name: '车库', desc: '卷帘门半掩，汽车里还有余温，是撤离点。' },
  { id: 'garden', name: '后院', desc: '杂草没过脚踝，篱笆外是警笛的声音。' },
  { id: 'foyer', name: '门厅', desc: '外套还挂在衣架上，门口的鞋印一路往里。' },
  { id: 'library', name: '图书室', desc: '高到天花板的书架，梯子靠在最里侧，翻书声听得很清楚。' },
  { id: 'wine', name: '酒窖', desc: '一排排落灰的瓶子，角落里有一扇没上锁的小门。' },
  { id: 'guestroom', name: '客房', desc: '床罩平整得没人睡过，行李箱却已经打开了。' },
  { id: 'workshop', name: '工具间', desc: '钉子、铁丝与生锈的剪子摊了一桌，够人找件趁手的东西。' },
  { id: 'stairwell', name: '楼梯间', desc: '拐角处的灯坏了，每一步都在楼上回响一次。' },
  { id: 'chapel', name: '小礼拜堂', desc: '长凳整齐排着，蜡烛还烧着，像有人刚离开。' },
  { id: 'balcony', name: '阳台', desc: '栏杆外能看见整条街，也更早看见警灯。' },
];

/** 额外房间只在部分对局出现；核心 23 间始终保留，最多随机加入 10 间。 */
const OPTIONAL_BLUEPRINTS: Array<Pick<Room, 'id' | 'name' | 'desc'>> = [
  { id: 'pantry', name: '食品储藏间', desc: '罐头和干粮堆到天花板，木架深处传来细碎的碰撞声。' },
  { id: 'servants_quarters', name: '仆人房', desc: '狭窄的单人床与旧制服还留在原处，门锁已经锈住。' },
  { id: 'guest_bath', name: '客用浴室', desc: '洗手台下方积着水，镜柜里塞满过期药品。' },
  { id: 'infirmary', name: '医务室', desc: '急救箱被翻开过，消毒水气味盖不住血腥味。' },
  { id: 'archives', name: '档案室', desc: '纸箱里塞满旧照片与房屋记录，几页纸被匆忙撕走。' },
  { id: 'cold_storage', name: '冷藏库', desc: '冷气仍在运转，金属门关上后几乎听不见外面的声音。' },
  { id: 'greenhouse_annex', name: '温室侧厅', desc: '破碎花盆和潮湿泥土散落一地，玻璃后有模糊的人影。' },
  { id: 'loading_dock', name: '装卸间', desc: '货箱挡住半扇门，地面留着拖拽重物的长痕。' },
  { id: 'billiard_room', name: '台球室', desc: '球桌上的球散落一地，墙角的球杆少了一根。' },
  { id: 'observatory', name: '观测室', desc: '屋顶天窗正对着夜空，望远镜仍停在某个奇怪的方向。' },
];

const ALL_ROOMS: Room[] = [...CORE_BLUEPRINTS, ...OPTIONAL_BLUEPRINTS].map((b) => ({
  ...b,
  x: 0,
  y: 0,
  rect: { left: 0, top: 0, width: 0, height: 0 },
  size: 'medium',
  neighbors: [],
}));

/** ROOMS 是本局实际出现的房间；ROOM_MAP 保留全部房间 ID，兼容仍引用旧局房间的状态。 */
export const ROOMS: Room[] = [];
export const ROOM_MAP: Record<RoomId, Room> = ALL_ROOMS.reduce(
  (acc, room) => { acc[room.id] = room; return acc; },
  {} as Record<RoomId, Room>,
);

export const ENTRY_ROOM: RoomId = 'hall';
export const EXIT_ROOM: RoomId = 'garage';
export const POLICE_START: RoomId = 'garden';

/** 图腾：在此结束回合，下回合额外获得 1 点行动点 */
export const TOTEM_ROOMS: RoomId[] = ['attic', 'basement'];
/** 柜子 / 床底 / 浴帘后：藏在这里的人不会被大部分卡牌锁定，要搜索才能揪出来 */
export const CABINET_ROOMS: RoomId[] = ['bedroom', 'nursery', 'study', 'laundry', 'bathroom'];
/** 障碍物：进入前需要破坏；恶魔附身与破门卡可以直接清除 */
export const OBSTACLE_ROOMS: RoomId[] = ['storage', 'basement'];
/** 有电话的房间：求救型 NPC 在这里报警 */
export const PHONE_ROOMS: RoomId[] = ['study', 'hall'];
/** 无线电：电话断了之后的备用报警手段，需要多花一回合 */
export const RADIO_ROOMS: RoomId[] = ['basement'];
/** 厨房 / 车库 / 温室：反抗型与英勇型 NPC 来这里找武器 */
export const WEAPON_ROOMS: RoomId[] = ['kitchen', 'garage', 'conservatory'];

/* ==================================================================== */
/*  不规则房间布局生成                                                    */
/* ==================================================================== */

/**
 * 地图由 16×12 个基础单位组成，但这些单位不再一格对应一间房。
 * BSP 矩形分割会把地图切成 23 个不同面积的完整房间：
 * 小房间约 4–6 单位，普通房间约 7–11 单位，大厅/室外区域更大。
 * 房间仍然是单个移动节点，面积只影响地图空间表现，不改变行动点消耗。
 */
let GRID_COLS = 16;
let GRID_ROWS = 12;
const PAD = 1.8;
const GAP = 0.72;
const MIN_REGION_AREA = 4;

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RegionEdge {
  a: number;
  b: number;
}

interface SplitOption {
  axis: 'vertical' | 'horizontal';
  min: number;
  max: number;
}

function regionArea(region: Region): number {
  return region.width * region.height;
}

function splitOptions(region: Region): SplitOption[] {
  const options: SplitOption[] = [];
  if (region.width >= 2) {
    const min = Math.max(1, Math.ceil(MIN_REGION_AREA / region.height));
    const max = region.width - min;
    if (min <= max) options.push({ axis: 'vertical', min, max });
  }
  if (region.height >= 2) {
    const min = Math.max(1, Math.ceil(MIN_REGION_AREA / region.width));
    const max = region.height - min;
    if (min <= max) options.push({ axis: 'horizontal', min, max });
  }
  return options;
}

function splitRegion(region: Region, option: SplitOption): [Region, Region] {
  const cut = option.min + Math.floor(random() * (option.max - option.min + 1));
  if (option.axis === 'vertical') {
    return [
      { left: region.left, top: region.top, width: cut, height: region.height },
      { left: region.left + cut, top: region.top, width: region.width - cut, height: region.height },
    ];
  }
  return [
    { left: region.left, top: region.top, width: region.width, height: cut },
    { left: region.left, top: region.top + cut, width: region.width, height: region.height - cut },
  ];
}

function regionsTouch(a: Region, b: Region): boolean {
  const verticalTouch =
    (a.left + a.width === b.left || b.left + b.width === a.left) &&
    Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);
  const horizontalTouch =
    (a.top + a.height === b.top || b.top + b.height === a.top) &&
    Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left);
  return verticalTouch || horizontalTouch;
}

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cellRect(region: Region): Room['rect'] {
  const unitW = (100 - PAD * 2) / GRID_COLS;
  const unitH = (100 - PAD * 2) / GRID_ROWS;
  return {
    left: PAD + region.left * unitW + GAP / 2,
    top: PAD + region.top * unitH + GAP / 2,
    width: region.width * unitW - GAP,
    height: region.height * unitH - GAP,
  };
}

/** 平面图使用完整布局画布的固定比例；所有房间都在这张画布内。 */
export function layoutAspect(): string {
  return `${GRID_COLS} / ${GRID_ROWS}`;
}

export function layoutAspectNum(): number {
  return GRID_COLS / GRID_ROWS;
}

/** 房间之间留有 0.72 个网格单位的墙缝；门位判断必须把这段设计间距算作共边。 */
export const ROOM_EDGE_GAP_TOLERANCE = 6.25;

export interface DoorMarkerPosition {
  left: number;
  top: number;
  orientation: 'vertical' | 'horizontal';
}

/** 返回两个真实相邻房间之间门洞的中心点（平面图百分比坐标）。 */
export function doorMarkerPosition(fromId: RoomId, toId: RoomId): DoorMarkerPosition | null {
  const a = ROOM_MAP[fromId].rect;
  const b = ROOM_MAP[toId].rect;
  const aRight = a.left + a.width;
  const bRight = b.left + b.width;
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  const overlapX = Math.min(aRight, bRight) - Math.max(a.left, b.left);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(a.top, b.top);
  const verticalGap = Math.min(Math.abs(aRight - b.left), Math.abs(a.left - bRight));
  if (verticalGap <= ROOM_EDGE_GAP_TOLERANCE && overlapY > 0.01) {
    const aOnRight = Math.abs(aRight - b.left) <= Math.abs(a.left - bRight);
    return {
      left: ((aOnRight ? aRight : a.left) + (aOnRight ? b.left : bRight)) / 2,
      top: (Math.max(a.top, b.top) + Math.min(aBottom, bBottom)) / 2,
      orientation: 'vertical',
    };
  }
  const horizontalGap = Math.min(Math.abs(aBottom - b.top), Math.abs(a.top - bBottom));
  if (horizontalGap <= ROOM_EDGE_GAP_TOLERANCE && overlapX > 0.01) {
    const aOnBottom = Math.abs(aBottom - b.top) <= Math.abs(a.top - bBottom);
    return {
      left: (Math.max(a.left, b.left) + Math.min(aRight, bRight)) / 2,
      top: ((aOnBottom ? aBottom : a.top) + (aOnBottom ? b.top : bBottom)) / 2,
      orientation: 'horizontal',
    };
  }
  return null;
}

/**
 * 每局重新切分整张平面图。
 * 邻接关系由矩形真实共边计算，随后只在这些真实门位中选出连通的门网。
 */
export type LayoutStyle = 'tall' | 'wide' | 'branching' | 'compact';

export function buildLayout(style: LayoutStyle = 'wide'): string {
  // 地图主题不仅改房间名称，也改变画布比例和门网密度。
  const dimensions: Record<LayoutStyle, [number, number]> = {
    tall: [13, 18],
    wide: [20, 11],
    branching: [17, 15],
    compact: [14, 13],
  };
  [GRID_COLS, GRID_ROWS] = dimensions[style];

  // 每局保留全部核心房间，再随机抽取 0–10 间附加房间，形成 23–33 间的地图。
  const extraCount = Math.floor(random() * (OPTIONAL_BLUEPRINTS.length + 1));
  const activeBlueprints = [...CORE_BLUEPRINTS, ...shuffle(OPTIONAL_BLUEPRINTS).slice(0, extraCount)];
  ROOMS.splice(0, ROOMS.length, ...activeBlueprints.map((blueprint) => ROOM_MAP[blueprint.id]));
  // 先重置所有房间的几何与门网。未进入本局的房间仍保留稳定 ID，但不参与地图循环。
  ALL_ROOMS.forEach((room) => {
    room.x = 0;
    room.y = 0;
    room.rect = { left: 0, top: 0, width: 0, height: 0 };
    room.size = 'medium';
    room.neighbors = [];
  });

  const regions: Region[] = [
    { left: 0, top: 0, width: GRID_COLS, height: GRID_ROWS },
  ];

  // 反复切分面积最大的几个候选区域，避免所有房间都长成相同大小。
  while (regions.length < ROOMS.length) {
    const candidates = regions
      .map((region, index) => ({ region, index, area: regionArea(region), options: splitOptions(region) }))
      .filter((candidate) => candidate.options.length > 0)
      .sort((a, b) => b.area - a.area);
    if (!candidates.length) {
      throw new Error('地图布局无法继续分割：可用区域不足。');
    }

    // 只在面积最大的两个候选区中切分，降低单个房间占据过大版面的概率。
    const shortlist = candidates.slice(0, Math.min(2, candidates.length));
    const chosen = shortlist[Math.floor(random() * shortlist.length)];
    const preferredAxis = chosen.region.width / chosen.region.height >= 1 ? 'vertical' : 'horizontal';
    let option = chosen.options.find((item) => item.axis === preferredAxis) ?? chosen.options[0];
    if (chosen.options.length > 1 && random() < 0.2) {
      option = chosen.options.find((item) => item.axis !== option.axis) ?? option;
    }
    const [first, second] = splitRegion(chosen.region, option);
    regions.splice(chosen.index, 1, first, second);
  }

  // 所有共边区域构成物理邻接图；不接触的房间绝不会凭空出现门。
  const physicalEdges: RegionEdge[] = [];
  for (let i = 0; i < regions.length; i += 1) {
    for (let j = i + 1; j < regions.length; j += 1) {
      if (regionsTouch(regions[i], regions[j])) physicalEdges.push({ a: i, b: j });
    }
  }

  const physicalAdj = regions.map(() => [] as number[]);
  physicalEdges.forEach(({ a, b }) => {
    physicalAdj[a].push(b);
    physicalAdj[b].push(a);
  });

  const depthFrom = (start: number): Map<number, number> => {
    const distances = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const next of physicalAdj[current]) {
        if (distances.has(next)) continue;
        distances.set(next, distances.get(current)! + 1);
        queue.push(next);
      }
    }
    return distances;
  };

  // 大厅优先落在门网中心附近；距离相同时，选更接近建筑几何中心的区域。
  const geometricCenter = { x: GRID_COLS / 2, y: GRID_ROWS / 2 };
  const centerIndex = regions.reduce((best, region, index) => {
    const distance = depthFrom(index);
    const bestDistance = depthFrom(best);
    const eccentricity = Math.max(...distance.values());
    const bestEccentricity = Math.max(...bestDistance.values());
    const geometricOffset =
      Math.abs(region.left + region.width / 2 - geometricCenter.x) +
      Math.abs(region.top + region.height / 2 - geometricCenter.y);
    const bestRegion = regions[best];
    const bestOffset =
      Math.abs(bestRegion.left + bestRegion.width / 2 - geometricCenter.x) +
      Math.abs(bestRegion.top + bestRegion.height / 2 - geometricCenter.y);
    return eccentricity < bestEccentricity ||
      (eccentricity === bestEccentricity && geometricOffset < bestOffset)
      ? index
      : best;
  }, 0);

  // 先在真实邻接图上生成一棵树，再加少量环路；保证整栋建筑始终连通。
  const visited = new Set<number>([centerIndex]);
  const treeEdges: RegionEdge[] = [];
  while (visited.size < regions.length) {
    const frontier = physicalEdges.filter((edge) => visited.has(edge.a) !== visited.has(edge.b));
    if (!frontier.length) throw new Error('地图房间邻接图意外断开。');
    const edge = frontier[Math.floor(random() * frontier.length)];
    treeEdges.push(edge);
    visited.add(visited.has(edge.a) ? edge.b : edge.a);
  }

  const treeAdj = regions.map(() => [] as number[]);
  treeEdges.forEach(({ a, b }) => {
    treeAdj[a].push(b);
    treeAdj[b].push(a);
  });

  // 后院是建筑外围的叶节点，唯一入口固定连接车库。
  const centerDistances = depthFrom(centerIndex);
  const gardenCandidates = regions
    .map((_, index) => index)
    .filter((index) => treeAdj[index].length === 1 && index !== centerIndex && treeAdj[index][0] !== centerIndex);
  const leafPool = gardenCandidates.length
    ? gardenCandidates
    : regions.map((_, index) => index).filter((index) => treeAdj[index].length === 1 && index !== centerIndex);
  if (!leafPool.length) throw new Error('地图布局没有可用的后院出口区域。');
  const gardenIndex = leafPool.sort((a, b) =>
    (centerDistances.get(b) ?? 0) - (centerDistances.get(a) ?? 0) ||
    regionArea(regions[b]) - regionArea(regions[a]),
  )[0];
  const garageIndex = treeAdj[gardenIndex][0];
  const hallIndex = centerIndex === garageIndex
    ? regions.map((_, index) => index).filter((index) => index !== gardenIndex && index !== garageIndex)
      .sort((a, b) => Math.max(...depthFrom(a).values()) - Math.max(...depthFrom(b).values()))[0]
    : centerIndex;

  // 剩余房间按空间定位：公共区域优先分配大块，储藏/设备类优先分配小块。
  const sizeOrder: RoomId[] = [
    'conservatory', 'dining', 'library', 'chapel', 'kitchen', 'foyer',
    'workshop', 'bedroom', 'guestroom', 'nursery', 'study', 'corridor',
    'stairwell', 'balcony', 'attic', 'wine', 'bathroom', 'laundry',
    'storage', 'basement',
    'pantry', 'servants_quarters', 'guest_bath', 'infirmary', 'archives', 'cold_storage',
    'greenhouse_annex', 'loading_dock', 'billiard_room', 'observatory',
  ];
  const roomById = new Map<RoomId, Room>(ROOMS.map((room) => [room.id, room]));
  const regionRooms = new Map<number, Room>();
  regionRooms.set(hallIndex, roomById.get(ENTRY_ROOM)!);
  regionRooms.set(gardenIndex, roomById.get('garden')!);
  regionRooms.set(garageIndex, roomById.get(EXIT_ROOM)!);

  const freeRegions = regions
    .map((_, index) => index)
    .filter((index) => !regionRooms.has(index))
    .sort((a, b) => regionArea(regions[b]) - regionArea(regions[a]));
  const freeRooms = sizeOrder.map((id) => roomById.get(id)).filter((room): room is Room => Boolean(room));
  freeRegions.forEach((index, order) => regionRooms.set(index, freeRooms[order]));

  ROOMS.forEach((room) => {
    room.neighbors = [];
  });

  regions.forEach((region, index) => {
    const room = regionRooms.get(index)!;
    room.x = region.left;
    room.y = region.top;
    room.rect = cellRect(region);
    const area = regionArea(region);
    room.size = room.id === 'garden' ? 'open' : area >= 12 ? 'large' : area >= 7 ? 'medium' : 'small';
  });

  const extraEdges = shuffle(
    physicalEdges.filter((edge) => !treeEdges.some((tree) =>
      (tree.a === edge.a && tree.b === edge.b) || (tree.a === edge.b && tree.b === edge.a),
    ) && edge.a !== gardenIndex && edge.b !== gardenIndex),
  ).slice(0, style === 'tall' ? 2 : style === 'wide' ? 6 : style === 'branching' ? 3 : 5);
  const selectedEdges = [...treeEdges, ...extraEdges];

  selectedEdges.forEach(({ a, b }) => {
    const roomA = regionRooms.get(a)!;
    const roomB = regionRooms.get(b)!;
    if (!roomA.neighbors.includes(roomB.id)) roomA.neighbors.push(roomB.id);
    if (!roomB.neighbors.includes(roomA.id)) roomB.neighbors.push(roomA.id);
  });

  // 明确守住后院只有车库这一道门，避免后院成为多方向逃生捷径。
  const garden = roomById.get('garden')!;
  garden.neighbors = [EXIT_ROOM];
  const garage = roomById.get(EXIT_ROOM)!;
  if (!garage.neighbors.includes('garden')) garage.neighbors.push('garden');

  return ROOMS.map((room) => `${room.name}(${room.x},${room.y},${room.size})`).join(' ');
}

// 模块加载时先铺一套，保证在 createGame 之前访问 ROOM_MAP 也不会炸
buildLayout();
