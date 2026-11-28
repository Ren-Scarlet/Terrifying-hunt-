/**
 * 随机契约生成。
 *
 * 每个契约由 1–2 个主要任务 + 2 个额外奖励任务自由组合。
 * 主要任务决定「这局必须做到什么」，额外任务只给血点。
 * 任务类型固定为五类，新增类型时只需要扩展这里，不必重做契约系统。
 */
import { random, shuffle } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionTask, MissionTaskMetric, RoomId } from './types';

const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

/** 契约回合上限（难度基准，同时也供游戏指南展示）。 */
export const CONTRACT_TURNS = 20;

interface KillerMetricDef {
  metric: MissionTaskMetric;
  label: string;
  target: number;
}

const KILLER_METRICS: Record<string, KillerMetricDef> = {
  '迈克尔·迈尔斯': { metric: 'myers_stalk', label: '用尾随能力盯住 3 名不同幸存者', target: 3 },
  '设陷者': { metric: 'trap_triggers', label: '让 2 名人踩中捕兽夹', target: 2 },
  '护士': { metric: 'nurse_blink_attacks', label: '闪现后命中 1 名幸存者', target: 1 },
  '女猎手': { metric: 'hatchet_hits', label: '用飞斧命中 2 名幸存者', target: 2 },
};

function killTask(optional = false): MissionTask {
  return {
    id: optional ? 'bonus-kills' : 'primary-kills',
    kind: 'kill_count',
    label: optional ? '额外：击杀 3 名幸存者' : '击杀 3 名幸存者',
    target: 3,
    optional: optional || undefined,
  };
}

function markedTask(): MissionTask {
  return { id: 'primary-marked', kind: 'marked_kill', label: '击杀指定幸存者', target: 1 };
}

function breakerTask(optional = false): MissionTask {
  return {
    id: optional ? 'bonus-breakers' : 'primary-breakers',
    kind: 'break_circuit',
    label: optional ? '额外：破坏 2 个区域电闸' : '破坏 2 个区域电闸',
    target: 2,
    optional: optional || undefined,
  };
}

function alarmTask(limit = 50, optional = false): MissionTask {
  return {
    id: optional ? 'bonus-alarm' : 'primary-alarm',
    kind: 'alarm_below',
    label: optional ? `额外：结束时警报不超过 ${limit}` : `结束时警报不超过 ${limit}`,
    target: 1,
    limit,
    optional: optional || undefined,
  };
}

function killerTask(killer: string): MissionTask | null {
  const def = KILLER_METRICS[killer];
  if (!def) return null;
  return {
    id: 'bonus-killer-stat',
    kind: 'killer_stat',
    label: `杀手专属：${def.label}`,
    target: def.target,
    metric: def.metric,
    optional: true,
  };
}

function buildPrimaryTasks(): MissionTask[] {
  const roll = random();
  if (roll < 0.4) return [markedTask()];
  if (roll < 0.7) return [killTask()];
  if (roll < 0.85) return [breakerTask(), killTask()];
  return [killTask(), alarmTask(pick([40, 50, 60]))];
}

function buildOptionalTasks(killer: string, primary: MissionTask[]): MissionTask[] {
  const usedKinds = new Set(primary.map((task) => task.kind));
  const pool: MissionTask[] = [];
  if (!usedKinds.has('break_circuit')) pool.push(breakerTask(true));
  if (!usedKinds.has('alarm_below')) pool.push(alarmTask(pick([35, 50]), true));
  if (!usedKinds.has('kill_count')) pool.push(killTask(true));
  const selected = shuffle(pool).slice(0, 2);
  const signature = killerTask(killer);
  if (signature) selected.push(signature);
  return selected;
}

function contractTitle(primary: MissionTask[]): string {
  const kinds = new Set(primary.map((task) => task.kind));
  if (kinds.has('marked_kill') && kinds.has('alarm_below')) return '无声证词';
  if (kinds.has('marked_kill')) return '血色清单';
  if (kinds.has('break_circuit') && kinds.has('kill_count')) return '断电协议';
  if (kinds.has('break_circuit')) return '断电猎场';
  if (kinds.has('alarm_below')) return '无声契约';
  return '血色狩猎';
}

/** 契约只在玩家点击「准备开始」时随机生成；不会先展示任务供玩家针对性改牌。 */
export function generateMission(killer = '迈克尔·迈尔斯'): Mission {
  const primary = buildPrimaryTasks();
  const optional = buildOptionalTasks(killer, primary);
  const tasks = [...primary, ...optional];
  const objective = primary.map((task) => task.label).join(' ＋ ');
  return {
    id: `contract-${Date.now()}-${Math.floor(random() * 100000)}`,
    mode: 'contract',
    title: contractTitle(primary),
    desc: `本局随机契约：${objective}。完成后可立即结算，也可以继续狩猎、争取额外任务与行为血点。`,
    turns: CONTRACT_TURNS,
    tasks,
    objective,
    successText: '完成全部主要任务即可达成契约；额外任务与行为奖励会一起计入血点结算。',
    failText: '指定目标逃离、所有幸存者逃离、杀手被击败，或达到回合上限时仍未完成全部主目标。',
  };
}

export function generateFreeHunt(): Mission {
  return {
    id: `free-hunt-${Date.now()}`,
    mode: 'free',
    title: '自由猎杀',
    desc: '没有指定猎物，也没有强制任务。选择自己的猎杀目标与方式，随时可以结束本局。',
    turns: 99,
    objective: '自主选择猎物与猎杀方式；地图、环境和幸存者都由你决定如何利用。',
    successText: '由你决定何时结束猎杀；自主挑战仅用于记录本局表现。',
    failText: '被击败或所有幸存者逃离仍会结束猎杀。',
    tasks: [
      { id: 'free-kills', kind: 'kill_count', label: '额外：击杀 3 名幸存者', target: 3, optional: true },
    ],
  };
}

export function roomName(id: RoomId): string {
  return ROOM_MAP[id]?.name ?? id;
}
