/**
 * 血点结算：五类奖励 + 特殊表现 + 契约奖励。
 *
 * 所有血点都在发生时写进 bloodPointLines；结算时只做汇总，不再另算一套评分。
 * 同一行为可以通过 key + limit 限制次数，或用 decay 让重复奖励递减，避免刷分。
 */
import type { BloodCategory, BloodPointLine, GameState, MissionTask, PerformanceTitle } from './types';
import { hasEffect } from './accessoryEffects';

export const BLOOD_CATEGORY_LABEL: Record<BloodCategory, string> = {
  hunt: '猎杀',
  brutal: '凶残',
  cunning: '阴险',
  control: '控场',
  contract: '契约',
};

/** 第一版血点数值；集中在这里，后续平衡只改这个表。 */
export const BLOOD = {
  /** A 猎杀 */
  firstDiscover: 100,
  track: 50,
  capture: 300,
  attack: 200,
  down: 350,
  hiddenCapture: 400,
  interrupt: 150,
  /** B 凶残 */
  kill: 800,
  specialExecution: 300,
  locationExecution: 500,
  comboBase: 200,
  comboStep: 200,
  comboMax: 600,
  signatureKill: 200,
  /** C 阴险 */
  stealthKill: 500,
  cabinetFind: 300,
  trapCapture: 400,
  environmentKill: 200,
  blackoutAmbush: 300,
  abilityAmbush: 300,
  /** D 控场 */
  breakDoor: 100,
  breaker: 200,
  phone: 100,
  barricade: 100,
  placeTrap: 100,
  trapTrigger: 200,
  totem: 100,
  preventInteraction: 200,
  /** E 契约 */
  primaryTask: 500,
  allPrimary: 1500,
  optionalTask: 300,
  allOptional: 1000,
  killerTask: 500,
  /** 随机高价值目标 */
  highValueKill: 1500,
} as const;

export interface AwardOptions {
  /** 防刷分计数 key；缺省按分类+文案累计 */
  key?: string;
  /** 最多奖励几次 */
  limit?: number;
  /** 重复奖励递减：100% → 50% → 25% … */
  decay?: boolean;
}

/** 记录一笔血点；返回实际入账值（被上限拦下时为 0）。 */
export function awardBlood(
  state: GameState,
  category: BloodCategory,
  label: string,
  value: number,
  options: AwardOptions = {},
): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const key = options.key ?? `${category}:${label}`;
  const count = state.bloodPointCounts[key] ?? 0;
  if (count >= (options.limit ?? Infinity)) return 0;
  const doubled = state.possessed && hasEffect(state, 'possessHit', 'possessBloodDouble') ? 2 : 1;
  const amount = options.decay ? Math.round(value * doubled * Math.pow(0.5, count)) : value * doubled;
  if (amount === 0) return 0;
  state.bloodPointCounts[key] = count + 1;
  state.bloodPointLines.push({ category, label, value: amount });
  return amount;
}

/** 只记事件、不发血点：用于特殊表现判定。 */
export function markBloodEvent(state: GameState, key: string): void {
  state.bloodPointCounts[key] = (state.bloodPointCounts[key] ?? 0) + 1;
}

/** 读一个防刷分计数，用于特殊表现判定。 */
export function bloodCount(state: GameState, key: string): number {
  return state.bloodPointCounts[key] ?? 0;
}

/** 契约任务进度：警报限制在回合结束时才成立。 */
export function missionTaskProgress(state: GameState, task: MissionTask): number {
  switch (task.kind) {
    case 'kill_count': return state.survivorKills;
    case 'marked_kill': return state.markedKilled;
    case 'break_circuit': return state.powerCircuits.filter((circuit) => circuit.broken).length;
    case 'alarm_below': return state.alarm <= (task.limit ?? 50) ? 1 : 0;
    case 'killer_stat':
      if (task.metric === 'myers_stalk') return state.myersStalkedIds.length;
      if (task.metric === 'trap_triggers') return state.trapTriggerCount;
      if (task.metric === 'nurse_blink_attacks') return state.huntCounters.nurseBlinkAttacks;
      if (task.metric === 'hatchet_hits') return state.huntCounters.hatchetHits;
      return 0;
  }
}

export function taskDone(state: GameState, task: MissionTask): boolean {
  return missionTaskProgress(state, task) >= task.target;
}

/** 契约类血点：每完成一个主任务 / 额外任务，以及全清奖励。 */
export function awardMissionBlood(state: GameState): void {
  const tasks = state.mission.tasks ?? [];
  const primary = tasks.filter((task) => !task.optional);
  const optional = tasks.filter((task) => task.optional);
  const donePrimary = primary.filter((task) => taskDone(state, task));
  const doneOptional = optional.filter((task) => taskDone(state, task));

  donePrimary.forEach((task) => {
    awardBlood(state, 'contract', `主要任务 · ${task.label}`, BLOOD.primaryTask, { key: `task:${task.id}` });
  });
  if (primary.length > 0 && donePrimary.length === primary.length) {
    awardBlood(state, 'contract', '全部主要任务完成', BLOOD.allPrimary, { key: 'task:all-primary' });
  }
  doneOptional.forEach((task) => {
    awardBlood(state, 'contract', `额外任务 · ${task.label}`, BLOOD.optionalTask, { key: `task:${task.id}` });
  });
  if (optional.length > 0 && doneOptional.length === optional.length) {
    awardBlood(state, 'contract', '全部额外任务完成', BLOOD.allOptional, { key: 'task:all-optional' });
  }
  if (donePrimary.some((task) => task.kind === 'killer_stat')) {
    awardBlood(state, 'contract', '杀手专属任务完成', BLOOD.killerTask, { key: 'task:killer' });
  }
}

interface TitleDef {
  id: string;
  label: string;
  points: number;
  category: BloodCategory;
  check: (state: GameState) => boolean;
}

const TITLES: TitleDef[] = [
  { id: 'perfect_ambush', label: '完美伏击', points: 300, category: 'cunning', check: (s) => bloodCount(s, 'attack:ambush') > 0 },
  { id: 'silent_hunt', label: '无声猎杀', points: 300, category: 'cunning', check: (s) => bloodCount(s, 'kill:stealth') > 0 },
  { id: 'chain_hunt', label: '连环猎杀', points: 300, category: 'brutal', check: (s) => bloodCount(s, 'kill:combo') > 0 },
  { id: 'environment_hunter', label: '环境猎手', points: 300, category: 'cunning', check: (s) => bloodCount(s, 'kill:dark') > 0 || bloodCount(s, 'trap:trigger') > 0 },
  { id: 'last_stand', label: '绝境猎杀', points: 300, category: 'brutal', check: (s) => bloodCount(s, 'kill:high-alarm') > 0 },
  { id: 'precise_execution', label: '精准处决', points: 300, category: 'brutal', check: (s) => bloodCount(s, 'execution:location') > 0 },
  { id: 'no_escape', label: '猎物无处可逃', points: 300, category: 'control', check: (s) => bloodCount(s, 'escape:prevented') > 0 },
];

/** 结算特殊表现：每个称号只发一次，并计入对应分类。 */
export function awardPerformanceTitles(state: GameState): void {
  const earned = new Set(state.performanceTitles.map((title) => title.id));
  for (const def of TITLES) {
    if (earned.has(def.id)) continue;
    if (!def.check(state)) continue;
    const title: PerformanceTitle = { id: def.id, label: def.label, points: def.points, category: def.category };
    state.performanceTitles.push(title);
    awardBlood(state, def.category, `特殊表现 · ${def.label}`, def.points, { key: `title:${def.id}` });
  }
}

export function bloodPointTotal(state: GameState): number {
  return state.bloodPointLines.reduce((sum, line) => sum + line.value, 0);
}

export function bloodPointGroups(state: GameState): Array<{ category: BloodCategory; label: string; value: number; lines: BloodPointLine[] }> {
  const order: BloodCategory[] = ['hunt', 'brutal', 'cunning', 'control', 'contract'];
  return order.map((category) => {
    const lines = state.bloodPointLines.filter((line) => line.category === category);
    return {
      category,
      label: BLOOD_CATEGORY_LABEL[category],
      value: lines.reduce((sum, line) => sum + line.value, 0),
      lines,
    };
  });
}

/** 结束一局：契约奖励 + 特殊表现，一次写全。 */
export function finalizeBloodPoints(state: GameState): void {
  awardMissionBlood(state);
  awardPerformanceTitles(state);
}
