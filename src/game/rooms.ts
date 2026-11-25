import type { Room, RoomId } from './types';

/**
 * 房间矩形按百分比拼成一栋完整房屋（四列三排 + 后院）：
 *   阁楼 / 儿童房 / 卧室 / 书房
 *   储藏室 / 大厅（横跨两列） / 走廊
 *   厨房 / 地下室 / 洗衣房 / 车库
 *   后院在右下角。
 *
 * 12 间房，跨度从大厅到后院要 4 步——比原来的 10 间房更经得起"绕"。
 * 邻接关系必须双向对称，否则 doorHoles() 不会在墙上留门。
 */
export const ROOMS: Room[] = [
  {
    id: 'attic',
    name: '阁楼',
    x: 0,
    y: 0,
    rect: { left: 2, top: 2, width: 22, height: 22 },
    neighbors: ['nursery', 'storage'],
    desc: '倾斜屋顶下堆满旧箱子，脚步声会被木板放大。',
  },
  {
    id: 'nursery',
    name: '儿童房',
    x: 1,
    y: 0,
    rect: { left: 26, top: 2, width: 22, height: 22 },
    neighbors: ['attic', 'bedroom', 'hall'],
    desc: '婴儿床空着，墙上的涂鸦还湿着；床底能塞下一个人。',
  },
  {
    id: 'bedroom',
    name: '卧室',
    x: 2,
    y: 0,
    rect: { left: 50, top: 2, width: 22, height: 22 },
    neighbors: ['nursery', 'study', 'hall'],
    desc: '床铺凌乱，衣柜半开，适合藏匿也适合下手。',
  },
  {
    id: 'study',
    name: '书房',
    x: 3,
    y: 0,
    rect: { left: 74, top: 2, width: 22, height: 22 },
    neighbors: ['bedroom', 'corridor'],
    desc: '台灯还亮着，书架上有一本翻开的旧档案，电话在桌上。',
  },
  {
    id: 'storage',
    name: '储藏室',
    x: 0,
    y: 1,
    rect: { left: 2, top: 27, width: 22, height: 22 },
    neighbors: ['attic', 'hall', 'kitchen'],
    desc: '灰尘和煤油味混在一起，角落里有备用工具。',
  },
  {
    id: 'hall',
    name: '大厅',
    x: 1.5,
    y: 1,
    rect: { left: 26, top: 27, width: 46, height: 22 },
    neighbors: ['nursery', 'bedroom', 'storage', 'corridor', 'kitchen', 'basement'],
    desc: '整栋房子的枢纽，任何动静都会在这里回荡，电话在门厅柜上。',
  },
  {
    id: 'corridor',
    name: '走廊',
    x: 3,
    y: 1,
    rect: { left: 74, top: 27, width: 22, height: 22 },
    neighbors: ['study', 'hall', 'garage'],
    desc: '狭长的过道，尽头传来潮湿的通风声。',
  },
  {
    id: 'kitchen',
    name: '厨房',
    x: 0,
    y: 2,
    rect: { left: 2, top: 52, width: 22, height: 22 },
    neighbors: ['storage', 'hall', 'basement'],
    desc: '刀架整齐，水槽里还有未洗的杯子——反抗的人会来这里。',
  },
  {
    id: 'basement',
    name: '地下室',
    x: 1,
    y: 2,
    rect: { left: 26, top: 52, width: 22, height: 22 },
    neighbors: ['kitchen', 'hall', 'laundry'],
    desc: '水泥墙上的水渍像一张模糊的脸，角落里有一台旧无线电。',
  },
  {
    id: 'laundry',
    name: '洗衣房',
    x: 2,
    y: 2,
    rect: { left: 50, top: 52, width: 22, height: 22 },
    neighbors: ['basement', 'hall', 'garage'],
    desc: '洗衣机还在转，地上全是水；烘干机后面能藏人。',
  },
  {
    id: 'garage',
    name: '车库',
    x: 3,
    y: 2,
    rect: { left: 74, top: 52, width: 22, height: 22 },
    neighbors: ['corridor', 'laundry', 'garden'],
    desc: '卷帘门半掩，汽车里还有余温，是撤离点。',
  },
  {
    id: 'garden',
    name: '后院',
    x: 3,
    y: 3,
    rect: { left: 74, top: 77, width: 22, height: 19 },
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

/** 图腾：在此结束回合，下回合额外获得 1 点能量 */
export const TOTEM_ROOMS: RoomId[] = ['attic', 'basement'];
/** 柜子 / 床底：藏在这里的人不会被大部分卡牌锁定，要搜索才能揪出来 */
export const CABINET_ROOMS: RoomId[] = ['bedroom', 'nursery', 'study', 'laundry'];
/** 障碍物：进入前需要破坏；恶魔附身与破门卡可以直接清除 */
export const OBSTACLE_ROOMS: RoomId[] = ['storage', 'basement'];
/** 有电话的房间：求救型 NPC 在这里报警 */
export const PHONE_ROOMS: RoomId[] = ['study', 'hall'];
/** 无线电：电话断了之后的备用报警手段，需要多花一回合 */
export const RADIO_ROOMS: RoomId[] = ['basement'];
/** 厨房：反抗型 / 英勇型 NPC 来这里找武器 */
export const WEAPON_ROOMS: RoomId[] = ['kitchen', 'garage'];
