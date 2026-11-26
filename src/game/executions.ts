import type { RoomId } from './types';

export type ExecutionMethodId =
  | 'fridge'
  | 'microwave'
  | 'garage_crush'
  | 'workshop_tools'
  | 'bathroom_tub'
  | 'laundry_dryer';

export interface ExecutionMethod {
  id: ExecutionMethodId;
  name: string;
  room: RoomId;
  description: string;
  flavor: (name: string) => string;
}

export const EXECUTION_METHODS: ExecutionMethod[] = [
  {
    id: 'fridge',
    name: '冰柜封存',
    room: 'kitchen',
    description: '将倒地目标搬到厨房，利用冰柜完成处决。',
    flavor: (name) => `你拖着${name}穿过厨房，冰柜里的冷气扑到脸上。门合拢时，里面传来一声短促的撞击；压缩机重新启动，低鸣很快盖过了一切。`,
  },
  {
    id: 'microwave',
    name: '微波灼刑',
    room: 'kitchen',
    description: '将倒地目标搬到厨房，在微波炉旁完成处决。',
    flavor: (name) => `你把${name}留在微波炉旁，按键声在空厨房里显得格外清晰。计时器开始倒数，玻璃门上映出摇晃的灯光；当提示音响起，厨房又恢复了安静。`,
  },
  {
    id: 'garage_crush',
    name: '车库碾压',
    room: 'garage',
    description: '将倒地目标搬到车库，利用尚有余温的汽车完成处决。',
    flavor: (name) => `卷帘门缓缓落下，车库只剩发动机不稳定的怠速声。你转动钥匙，车灯在墙面上扫过一道白光；几秒后，引擎声停了，卷帘门仍旧紧闭。`,
  },
  {
    id: 'workshop_tools',
    name: '工具间终结',
    room: 'workshop',
    description: '将倒地目标搬到工具间，利用散落的重型工具完成处决。',
    flavor: (name) => `工具间的日光灯闪了两次。你把沉重的工具放回工作台，金属碰撞声在狭窄房间里反复回荡；等灯光稳定下来，地上只剩一片凌乱。`,
  },
  {
    id: 'bathroom_tub',
    name: '浴缸溺杀',
    room: 'bathroom',
    description: '将倒地目标搬到浴室，在浴缸与帘幕后完成处决。',
    flavor: (name) => `水龙头被拧开，冷水沿着浴缸边缘漫过地砖。浴帘后的人影渐渐不再挣动；你关掉水流，滴答声却仍持续了很久。`,
  },
  {
    id: 'laundry_dryer',
    name: '烘干机封喉',
    room: 'laundry',
    description: '将倒地目标搬到洗衣房，利用大型烘干设备完成处决。',
    flavor: (name) => `你按下启动键，老旧烘干机发出沉闷的轰鸣。滚筒撞击外壳，洗衣房的灯罩跟着轻轻颤动；等机器停下，走廊里再也听不到别的声音。`,
  },
];

export function executionMethodsAtRoom(room: RoomId): ExecutionMethod[] {
  return EXECUTION_METHODS.filter((method) => method.room === room);
}

export function getExecutionMethod(id: ExecutionMethodId): ExecutionMethod | undefined {
  return EXECUTION_METHODS.find((method) => method.id === id);
}
