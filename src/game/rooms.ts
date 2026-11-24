import type { Room, RoomId } from './types';

/**
 * 房间矩形按百分比拼成一栋完整房屋：
 * 上层 阁楼 / 卧室 / 书房，中层 储藏室 / 大厅 / 走廊，
 * 下层 厨房 / 地下室 / 车库，房子外侧右下方是后院。
 * 邻接关系与玩法保持不变，rect 只负责俯视图上的空间排布。
 */
export const ROOMS: Room[] = [
  {
    id: 'attic',
    name: '阁楼',
    x: 0,
    y: 0,
    rect: { left: 3, top: 2, width: 30, height: 24 },
    neighbors: ['bedroom', 'storage'],
    desc: '倾斜屋顶下堆满旧箱子，脚步声会被木板放大。',
  },
  {
    id: 'bedroom',
    name: '卧室',
    x: 1,
    y: 0,
    rect: { left: 35, top: 2, width: 30, height: 24 },
    neighbors: ['attic', 'hall', 'study'],
    desc: '床铺凌乱，衣柜半开，适合藏匿也适合下手。',
  },
  {
    id: 'study',
    name: '书房',
    x: 2,
    y: 0,
    rect: { left: 67, top: 2, width: 30, height: 24 },
    neighbors: ['bedroom', 'corridor'],
    desc: '台灯还亮着，书架上有一本翻开的旧档案。',
  },
  {
    id: 'storage',
    name: '储藏室',
    x: 0,
    y: 1,
    rect: { left: 3, top: 28, width: 22, height: 26 },
    neighbors: ['attic', 'kitchen'],
    desc: '灰尘和煤油味混在一起，角落里有备用工具。',
  },
  {
    id: 'hall',
    name: '大厅',
    x: 1,
    y: 1,
    rect: { left: 27, top: 28, width: 38, height: 26 },
    neighbors: ['bedroom', 'storage', 'kitchen', 'corridor'],
    desc: '整栋房子的枢纽，任何动静都会在这里回荡。',
  },
  {
    id: 'corridor',
    name: '走廊',
    x: 2,
    y: 1,
    rect: { left: 67, top: 28, width: 30, height: 26 },
    neighbors: ['study', 'hall', 'basement'],
    desc: '狭长的过道，尽头传来潮湿的通风声。',
  },
  {
    id: 'kitchen',
    name: '厨房',
    x: 0,
    y: 2,
    rect: { left: 3, top: 56, width: 28, height: 24 },
    neighbors: ['storage', 'hall', 'garage'],
    desc: '刀架整齐，水槽里还有未洗的杯子。',
  },
  {
    id: 'basement',
    name: '地下室',
    x: 1,
    y: 2,
    rect: { left: 33, top: 56, width: 30, height: 24 },
    neighbors: ['kitchen', 'hall', 'garage'],
    desc: '水泥墙上的水渍像一张模糊的脸，仪式在这里进行。',
  },
  {
    id: 'garage',
    name: '车库',
    x: 2,
    y: 2,
    rect: { left: 65, top: 56, width: 32, height: 24 },
    neighbors: ['kitchen', 'basement', 'garden'],
    desc: '卷帘门半掩，汽车里还有余温，是撤离点。',
  },
  {
    id: 'garden',
    name: '后院',
    x: 2,
    y: 3,
    rect: { left: 65, top: 82, width: 32, height: 16 },
    neighbors: ['garage'],
    desc: '杂草没过脚踝，篱笆外是警笛的声音。',
  },
];

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
