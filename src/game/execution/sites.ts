import type { RoomId } from '../types';

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
}

/** 地点处决的场地与方法。文本不在这里，统一放在 data/execution-texts.csv。 */
export const EXECUTION_METHODS: ExecutionMethod[] = [
  {
    id: 'fridge',
    name: '冰柜封存',
    room: 'kitchen',
    description: '将倒地目标搬到厨房，利用冰柜完成处决。',
  },
  {
    id: 'microwave',
    name: '微波灼刑',
    room: 'kitchen',
    description: '将倒地目标搬到厨房，在微波炉旁完成处决。',
  },
  {
    id: 'garage_crush',
    name: '车库碾压',
    room: 'garage',
    description: '将倒地目标搬到车库，利用尚有余温的汽车完成处决。',
  },
  {
    id: 'workshop_tools',
    name: '工具间终结',
    room: 'workshop',
    description: '将倒地目标搬到工具间，利用散落的重型工具完成处决。',
  },
  {
    id: 'bathroom_tub',
    name: '浴缸溺杀',
    room: 'bathroom',
    description: '将倒地目标搬到浴室，在浴缸与帘幕后完成处决。',
  },
  {
    id: 'laundry_dryer',
    name: '烘干机封喉',
    room: 'laundry',
    description: '将倒地目标搬到洗衣房，利用大型烘干设备完成处决。',
  },
];

export function executionMethodsAtRoom(room: RoomId): ExecutionMethod[] {
  return EXECUTION_METHODS.filter((method) => method.room === room);
}

export function getExecutionMethod(id: ExecutionMethodId): ExecutionMethod | undefined {
  return EXECUTION_METHODS.find((method) => method.id === id);
}
