import type { Room, RoomId } from './types';

/**
 * 房间没有固定的位置。
 *
 * 每开一局，`buildLayout()` 会在 8×4 的网格上随机「长出」一块连通的房间区，
 * 再把房间随机塞进去——所以每一局的户型、走廊长度、后院挂在哪个方向都不一样。
 * 各处的 `ROOM_MAP[x].neighbors` / `rect` 都是开局时才填的，不要在模块加载阶段缓存。
 *
 * 23 间房（含后院）散在 32 个格子里，最远的两间要走 10 步以上；
 * 生成树只开少量环路，门少、走廊长——想追上一个人得真的绕房子，不是点两下就贴脸。
 */
const BLUEPRINTS: Array<Pick<Room, 'id' | 'name' | 'desc'>> = [
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

export const ROOMS: Room[] = BLUEPRINTS.map((b) => ({
  ...b,
  x: 0,
  y: 0,
  rect: { left: 0, top: 0, width: 0, height: 0 },
  neighbors: [],
}));

export const ROOM_MAP: Record<RoomId, Room> = ROOMS.reduce(
  (acc, room) => {
    acc[room.id] = room;
    return acc;
  },
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
/*  户型生成                                                            */
/* ==================================================================== */

const COLS = 8;
const ROWS = 4;
/** 平面图画布的内边距与格子之间的缝（百分比），保证相邻房间之间留出墙体 */
const PAD = 2;
const GAP = 2;
const CELL_W = (100 - PAD * 2) / COLS;
const CELL_H = (100 - PAD * 2) / ROWS;

interface Cell {
  col: number;
  row: number;
}

const cellKey = (c: Cell) => c.row * COLS + c.col;

function cellNeighbors(c: Cell): Cell[] {
  const out: Cell[] = [];
  if (c.col > 0) out.push({ col: c.col - 1, row: c.row });
  if (c.col < COLS - 1) out.push({ col: c.col + 1, row: c.row });
  if (c.row > 0) out.push({ col: c.col, row: c.row - 1 });
  if (c.row < ROWS - 1) out.push({ col: c.col, row: c.row + 1 });
  return out;
}

function shuffle<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface Span {
  /** 房间区左上角所在的格子 */
  col: number;
  row: number;
  /** 房间区横竖占了几格 */
  w: number;
  h: number;
}

function cellRect(c: Cell, span: Span): Room['rect'] {
  const cw = (100 - PAD * 2) / span.w;
  const ch = (100 - PAD * 2) / span.h;
  return {
    left: PAD + (c.col - span.col) * cw + GAP / 2,
    top: PAD + (c.row - span.row) * ch + GAP / 2,
    width: cw - GAP,
    height: ch - GAP,
  };
}

const sameCell = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;
const isAdjacentCell = (a: Cell, b: Cell) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;

/** 本局房间区的横竖跨度，渲染时用它决定平面图的宽高比 */
let spanRef: Span = { col: 0, row: 0, w: COLS, h: ROWS };

/** 平面图该用的宽高比，例如 "4 / 3" */
export function layoutAspect(): string {
  return `${spanRef.w} / ${spanRef.h}`;
}

/**
 * 重排整栋房子。每次开局调用一次，之后所有邻居/坐标都从 ROOM_MAP 现取。
 * @returns 本局的户型摘要，方便调试台打印。
 */
export function buildLayout(): string {
  // ① 从一颗种子格随机生长，长出一块连通但不规整的房间区
  const grown = new Map<number, Cell>();
  const seed: Cell = {
    col: Math.floor(Math.random() * COLS),
    row: Math.floor(Math.random() * ROWS),
  };
  grown.set(cellKey(seed), seed);
  while (grown.size < ROOMS.length) {
    const frontier: Cell[] = [];
    for (const c of grown.values()) {
      for (const n of cellNeighbors(c)) {
        if (!grown.has(cellKey(n))) frontier.push(n);
      }
    }
    if (!frontier.length) break;
    const pick = frontier[Math.floor(Math.random() * frontier.length)];
    grown.set(cellKey(pick), pick);
  }

  const pool = [...grown.values()];
  const byKey = new Map<number, Cell>();
  pool.forEach((c) => byKey.set(cellKey(c), c));

  const candidates: Array<[number, number]> = [];
  pool.forEach((c) => {
    for (const n of cellNeighbors(c)) {
      const k = cellKey(n);
      if (!byKey.has(k)) continue;
      if (cellKey(c) < k) candidates.push([cellKey(c), k]);
    }
  });

  // ② 随机 Prim 长出一棵生成树。不是「所有相邻的房间都通」——
  //    门少一半，走廊才有意义，追人的时候才会被门卡住。
  const inTree = new Set<number>([cellKey(pool[0])]);
  const treeEdges: Array<[number, number]> = [];
  let guard = 0;
  while (inTree.size < pool.length && guard < 600) {
    guard += 1;
    const frontier = candidates.filter(([a, b]) => inTree.has(a) !== inTree.has(b));
    if (!frontier.length) break;
    const [a, b] = frontier[Math.floor(Math.random() * frontier.length)];
    treeEdges.push([a, b]);
    inTree.add(a);
    inTree.add(b);
  }

  // ③ 再开几条环路：完全没有环的房子会变成死胡同迷宫，追人时只能硬堵
  const used = new Set(treeEdges.map(([a, b]) => `${a}-${b}`));
  // 环路数量跟着房间数走：屋子越大，绕路的可能越多，但始终以生成树为主
  const extras = shuffle(candidates.filter(([a, b]) => !used.has(`${a}-${b}`))).slice(
    0,
    Math.max(3, Math.round(ROOMS.length / 5)),
  );
  const edges = [...treeEdges, ...extras];

  const adjacency = new Map<number, Cell[]>();
  pool.forEach((c) => adjacency.set(cellKey(c), []));
  edges.forEach(([a, b]) => {
    adjacency.get(a)!.push(byKey.get(b)!);
    adjacency.get(b)!.push(byKey.get(a)!);
  });

  const depthFrom = (from: Cell): Map<number, number> => {
    const dist = new Map<number, number>([[cellKey(from), 0]]);
    let frontier = [from];
    let depth = 0;
    while (frontier.length) {
      const next: Cell[] = [];
      for (const c of frontier) {
        for (const n of adjacency.get(cellKey(c)) ?? []) {
          if (dist.has(cellKey(n))) continue;
          dist.set(cellKey(n), depth + 1);
          next.push(n);
        }
      }
      if (!next.length) break;
      depth += 1;
      frontier = next;
    }
    return dist;
  };

  // ④ 大厅放在最「中心」的格子：进门口在房子中间，去哪个方向都要走一段
  const center = pool.reduce((best, c) =>
    (depthFrom(c).size > depthFrom(best).size
      ? c
      : depthFrom(c).size === depthFrom(best).size
        ? Math.max(...depthFrom(c).values()) < Math.max(...depthFrom(best).values())
          ? c
          : best
        : best),
  );

  const distanceFrom = depthFrom(center);
  const farthest = [...distanceFrom.entries()].sort((a, b) => b[1] - a[1]);

  // ⑤ 后院挂在最远的「叶子」上：只有一个门。车库就在门内侧，
  //    于是玩家撤离的门和幸存者翻篱笆的地方是同一处——守后院既是防逃跑，也是守退路。
  const leafKeys = pool
    .filter((c) => !sameCell(c, center) && (adjacency.get(cellKey(c)) ?? []).length === 1)
    .map(cellKey);
  const orderedLeaves = farthest.filter(([k]) => leafKeys.includes(k)).map(([k]) => byKey.get(k)!);
  const orderedAll = farthest.filter(([k]) => !sameCell(byKey.get(k)!, center)).map(([k]) => byKey.get(k)!);
  const exitCell = orderedLeaves[0] ?? orderedAll[0] ?? pool[pool.length - 1];
  const exitDoorCell = (adjacency.get(cellKey(exitCell)) ?? [])[0] ?? center;

  const rest = shuffle(
    ROOMS.filter((r) => r.id !== ENTRY_ROOM && r.id !== 'garden' && r.id !== EXIT_ROOM),
  );
  const openCells = shuffle(
    pool.filter(
      (c) => !sameCell(c, center) && !sameCell(c, exitCell) && !sameCell(c, exitDoorCell),
    ),
  );

  // 摆位按「房间区的外接矩形」拉伸到整张平面图：房子长什么样就铺满画布，
  // 不会因为随机缺口而在角落里留一大片黑。
  const span: Span = {
    col: Math.min(...pool.map((c) => c.col)),
    row: Math.min(...pool.map((c) => c.row)),
    w: Math.max(...pool.map((c) => c.col)) - Math.min(...pool.map((c) => c.col)) + 1,
    h: Math.max(...pool.map((c) => c.row)) - Math.min(...pool.map((c) => c.row)) + 1,
  };
  spanRef = span;

  const place = (room: Room, cell: Cell) => {
    room.x = cell.col;
    room.y = cell.row;
    room.rect = cellRect(cell, span);
    room.neighbors = [];
  };

  const byId: Record<string, Room> = {};
  ROOMS.forEach((r) => {
    byId[r.id] = r;
  });

  place(byId[ENTRY_ROOM], center);
  place(byId[EXIT_ROOM], exitDoorCell);
  place(byId.garden, exitCell);
  rest.forEach((room, i) => {
    const cell = openCells[i];
    if (cell) place(room, cell);
  });

  // ⑥ 门就从生成树的边来。后院的那一格只保留通往车库的那一条边。
  const roomAt = (key: number): Room | undefined => {
    const cell = byKey.get(key);
    if (!cell) return undefined;
    return ROOMS.find((r) => r.x === cell.col && r.y === cell.row);
  };
  ROOMS.forEach((room) => {
    const self = pool.find((c) => c.col === room.x && c.row === room.y);
    if (!self) return;
    const near = (adjacency.get(cellKey(self)) ?? [])
      .map((c) => roomAt(cellKey(c)))
      .filter((r): r is Room => !!r)
      .map((r) => r.id);
    if (room.id === 'garden') {
      const keep = near.includes(EXIT_ROOM) ? EXIT_ROOM : near[0];
      room.neighbors = keep ? [keep] : [];
      return;
    }
    room.neighbors = near;
  });

  // ⑦ 对称：只要一方认了这条门，另一方也要认
  ROOMS.forEach((room) => {
    room.neighbors = room.neighbors.filter((id) => {
      const other = ROOM_MAP[id];
      if (!other) return false;
      if (other.neighbors.includes(room.id)) return true;
      if (other.id === 'garden') return false;
      other.neighbors.push(room.id);
      return true;
    });
  });

  return ROOMS.map((r) => `${r.name}(${r.x},${r.y})`).join(' ');
}

// 模块加载时先铺一套，保证在 createGame 之前访问 ROOM_MAP 也不会炸
buildLayout();
