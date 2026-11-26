import { random } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, MissionTask, RoomId } from './types';

const pick = <T,>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

function makeTasks(): MissionTask[] {
  // 核心目标直接鼓励连续猎杀；其余是额外风格挑战，不再成为拖慢通关的前置手续。
  const bonusPool: MissionTask[] = [
    { id: 'execution', kind: 'execute', label: '完成一次处决（额外奖励）', target: 1, optional: true },
    { id: 'special-execution', kind: 'special_execute', label: '完成一次特殊处决（额外奖励）', target: 1, optional: true },
    { id: 'breaker', kind: 'break_circuit', label: '破坏一个区域电闸（额外奖励）', target: 1, optional: true },
    { id: 'no-alarm', kind: 'no_alarm', label: '整场不触发报警（额外奖励）', target: 1, optional: true },
  ];
  const selected: MissionTask[] = [
    { id: 'kill-count', kind: 'kill_count', label: '猎杀三名幸存者', target: 3 },
  ];
  while (selected.length < 3 && bonusPool.length) {
    const index = Math.floor(random() * bonusPool.length);
    selected.push(bonusPool.splice(index, 1)[0]);
  }
  return selected;
}

/** 每局随机生成三个组合目标；所有目标都完成才算契约成功。 */
export function generateMission(unlockedKinds: MissionKind[] = [
  'assassinate', 'bodyCount', 'escape',
]): Mission {
  const kind = pick(unlockedKinds);
  const count = 3;
  const tasks = makeTasks();
  const base = {
    id: `mission-${Date.now()}`,
    kind,
    tasks,
    turns: 22,
    targetCount: count,
    objective: '猎杀三名幸存者；额外挑战只影响奖励，不会阻止通关。',
    successText: '完成核心猎杀目标即可通关，额外挑战增加结算奖励',
    failText: '所有幸存者逃离，或杀手被击败。',
  };
  switch (kind) {
    case 'assassinate':
      return { ...base, title: '血色清单', desc: '完成全部契约目标。', reward: 160 };
    case 'bodyCount':
      return { ...base, title: '无声收割', desc: '完成全部契约目标。', reward: 150 };
    case 'escape':
      return { ...base, title: '替身游戏', desc: '完成全部契约目标。', reward: 180 };
  }
}

/** 自由猎杀：没有指定目标和强制契约，三项挑战只提供方向，不阻止玩家自行发挥。 */
export function generateFreeHunt(): Mission {
  return {
    id: `free-hunt-${Date.now()}`,
    mode: 'free',
    kind: 'bodyCount',
    title: '自由猎杀',
    desc: '没有指定猎物，也没有强制任务。选择自己的猎杀目标与方式，随时可以结束本局。',
    turns: 99,
    reward: 0,
    targetCount: 0,
    objective: '自主选择猎物与猎杀方式；地图、环境和幸存者都由你决定如何利用。',
    successText: '由你决定何时结束猎杀；自主挑战仅用于记录本局表现。',
    failText: '被捕或所有幸存者逃离仍会结束猎杀。',
    tasks: [
      { id: 'free-kills', kind: 'kill_count', label: '猎杀任意幸存者', target: 3 },
      { id: 'free-executions', kind: 'execute', label: '完成处决', target: 2 },
      { id: 'free-signature', kind: 'special_execute', label: '尝试特殊处决', target: 1 },
    ],
  };
}

export function roomName(id: RoomId): string {
  return ROOM_MAP[id]?.name ?? id;
}
