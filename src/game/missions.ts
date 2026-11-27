import { random, shuffle } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, MissionTask, RoomId } from './types';
const pick = <T,>(arr: T[]): T => arr[Math.floor(random() * arr.length)];
function killerBonusTask(killer: string): MissionTask | null {
  if (killer === '迈克尔·迈尔斯') return { id: 'bonus-myers-stalk', kind: 'killer_stat', metric: 'myers_stalk', label: '额外挑战：尾随 3 名不同幸存者', target: 3, reward: 55, optional: true };
  if (killer === '设陷者') return { id: 'bonus-trap-trigger', kind: 'killer_stat', metric: 'trap_triggers', label: '额外挑战：让 2 名人类踩中捕兽夹', target: 2, reward: 55, optional: true };
  if (killer === '护士') return { id: 'bonus-nurse-blink-attack', kind: 'killer_stat', metric: 'nurse_grabs', label: '额外挑战：闪现后攻击 1 名幸存者', target: 1, reward: 60, optional: true };
  if (killer === '女猎手') return { id: 'bonus-huntress-hatchet', kind: 'killer_stat', metric: 'hatchet_hits', label: '额外挑战：用飞斧命中 2 名幸存者', target: 2, reward: 55, optional: true };
  return null;
}
function makeTasks(killer: string): MissionTask[] {
  const bonusPool: MissionTask[] = [
    { id: 'bonus-kill-three', kind: 'kill_count', label: '额外挑战：击杀 3 名人类', target: 3, reward: 35, optional: true },
    { id: 'bonus-kill-five', kind: 'kill_count', label: '高难挑战：击杀 5 名人类', target: 5, reward: 75, optional: true },
    { id: 'bonus-execution-two', kind: 'execute', label: '额外挑战：进行 2 次处决', target: 2, reward: 40, optional: true },
    { id: 'bonus-special-execution', kind: 'special_execute', label: '高难挑战：完成 1 次特殊处决', target: 1, reward: 65, optional: true },
    { id: 'bonus-low-alarm', kind: 'alarm_below', label: '高难挑战：结束时警报不超过 35', target: 1, limit: 35, reward: 60, optional: true },
  ];
  const selected = shuffle(bonusPool).slice(0, 2);
  const killerTask = killerBonusTask(killer);
  if (killerTask) selected.push(killerTask);
  return [{ id: 'primary-marked-target', kind: 'marked_kill', label: '主目标：击杀指定 NPC', target: 1, reward: 0 }, ...selected];
}
/** 每局一个必须完成的主目标，其余挑战全部可选；完成主目标后可继续完成额外挑战。 */
export function generateMission(killer = '迈克尔·迈尔斯', unlockedKinds: MissionKind[] = ['assassinate', 'bodyCount', 'escape']): Mission {
  const kind = pick(unlockedKinds);
  const tasks = makeTasks(killer);
  const base = {
    id: `mission-${Date.now()}-${Math.floor(random() * 100000)}`, kind, tasks, turns: 40,
    reward: 160, targetCount: 1,
    objective: '猎杀名单上的指定目标；其余挑战均为额外奖励。',
    successText: '击杀指定目标即可完成主目标；可以继续猎杀，完成额外挑战以赚取更多分数。',
    failText: '指定目标逃离、所有幸存者逃离、杀手被击败，或达到回合上限时仍未完成主目标。',
  };
  switch (kind) {
    case 'assassinate': return { ...base, title: '血色清单', desc: '名单上的目标必须死；其他挑战由你决定是否完成。', reward: 160 };
    case 'bodyCount': return { ...base, title: '无声收割', desc: '先完成指定击杀，再决定是否继续扩大猎杀成果。', reward: 150 };
    case 'escape': return { ...base, title: '替身游戏', desc: '在不断变化的猎场中锁定并猎杀名单目标。', reward: 180 };
  }
}
export function generateFreeHunt(): Mission {
  return {
    id: `free-hunt-${Date.now()}`, mode: 'free', kind: 'bodyCount', title: '自由猎杀',
    desc: '没有指定猎物，也没有强制任务。选择自己的猎杀目标与方式，随时可以结束本局。',
    turns: 99, reward: 0, targetCount: 0,
    objective: '自主选择猎物与猎杀方式；地图、环境和幸存者都由你决定如何利用。',
    successText: '由你决定何时结束猎杀；自主挑战仅用于记录本局表现。',
    failText: '被击败或所有幸存者逃离仍会结束猎杀。',
    tasks: [
      { id: 'free-kills', kind: 'kill_count', label: '猎杀任意幸存者', target: 3, optional: true, reward: 0 },
      { id: 'free-executions', kind: 'execute', label: '完成处决', target: 2, optional: true, reward: 0 },
      { id: 'free-signature', kind: 'special_execute', label: '尝试特殊处决', target: 1, optional: true, reward: 0 },
    ],
  };
}
export function roomName(id: RoomId): string { return ROOM_MAP[id]?.name ?? id; }
