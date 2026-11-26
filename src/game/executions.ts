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
    flavor: (name) => `你把${name}塞进冰柜，沉重的门缓缓合上……最后的撞击声渐渐停了。`,
  },
  {
    id: 'microwave',
    name: '微波灼刑',
    room: 'kitchen',
    description: '将倒地目标搬到厨房，在微波炉旁完成处决。',
    flavor: (name) => `你将${name}拖到微波炉旁，刺耳的嗡鸣吞没了最后的挣扎声。`,
  },
  {
    id: 'garage_crush',
    name: '车库碾压',
    room: 'garage',
    description: '将倒地目标搬到车库，利用尚有余温的汽车完成处决。',
    flavor: (name) => `车库卷帘门落下。引擎再次轰鸣，${name}的挣扎声被机械声彻底盖过。`,
  },
  {
    id: 'workshop_tools',
    name: '工具间终结',
    room: 'workshop',
    description: '将倒地目标搬到工具间，利用散落的重型工具完成处决。',
    flavor: (name) => `铁器落下的闷响在工具间里回荡。片刻后，${name}再也没有动静。`,
  },
  {
    id: 'bathroom_tub',
    name: '浴缸溺杀',
    room: 'bathroom',
    description: '将倒地目标搬到浴室，在浴缸与帘幕后完成处决。',
    flavor: (name) => `浴帘缓缓合拢，水声持续了很久。等你离开时，${name}已经沉入寂静。`,
  },
  {
    id: 'laundry_dryer',
    name: '烘干机封喉',
    room: 'laundry',
    description: '将倒地目标搬到洗衣房，利用大型烘干设备完成处决。',
    flavor: (name) => `烘干机开始剧烈震动，${name}最后的声音被滚筒与水管声吞没。`,
  },
];

export function executionMethodsAtRoom(room: RoomId): ExecutionMethod[] {
  return EXECUTION_METHODS.filter((method) => method.room === room);
}

export function getExecutionMethod(id: ExecutionMethodId): ExecutionMethod | undefined {
  return EXECUTION_METHODS.find((method) => method.id === id);
}
