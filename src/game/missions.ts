import { random } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, MissionTask, RoomId } from './types';

const pick = <T,>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

function makeTasks(): MissionTask[] {
  const corePool: MissionTask[] = [
    { id: 'kill-two', kind: 'kill_count', label: '猎杀 2 名人类', target: 2 },
    { id: 'kill-three', kind: 'kill_count', label: '猎杀 3 名人类', target: 3 },
    { id: 'marked-target', kind: 'marked_kill', label: '猎杀指定目标', target: 1 },
    { id: 'one-execution', kind: 'execute', label: '完成一次处决', target: 1 },
    { id: 'timed-hunt', kind: 'kill_count_before_turn', label: '前 5 回合内猎杀 2 人', target: 2, deadlineTurn: 5 },
  ];
  const bonusPool: MissionTask[] = [
    { id: 'bonus-execution', kind: 'execute', label: '额外挑战：完成一次处决', target: 1, optional: true },
    { id: 'bonus-special', kind: 'special_execute', label: '额外挑战：完成一次特殊处决', target: 1, optional: true },
    { id: 'bonus-breaker', kind: 'break_circuit', label: '额外挑战：破坏一个区域电闸', target: 1, optional: true },
    { id: 'bonus-no-alarm', kind: 'no_alarm', label: '额外挑战：阻止幸存者成功报警', target: 1, optional: true },
    { id: 'bonus-fast', kind: 'kill_count_before_turn', label: '额外挑战：前 4 回合内猎杀 1 人', target: 1, deadlineTurn: 4, optional: true },
  ];
  const first = pick(corePool);
  const selected: MissionTask[] = [first];
  const remaining = corePool.filter((task) => task.id !== first.id);
  if (random() < 0.55) selected.push(pick(remaining));
  selected.push(pick(bonusPool));
  if (random() < 0.35) selected.push(pick(bonusPool.filter((task) => !selected.some((s) => s.id === task.id))));
  return selected;
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
