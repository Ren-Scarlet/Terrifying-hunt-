/**
 * 计分与任务进度。
 *
 * 为什么这两件事放在一个文件里：`scoreLines` 要读任务完成度，而任务里的
 * 「分数达到 X」又要读当前分数——两者互相依赖，拆成两个文件会形成循环。
 * 放在一起，依赖方向就只剩 `scoring -> types/modifiers`。
 *
 * 全部是纯函数：只读 GameState，不写状态、不记日志。
 */
import { modifierValue } from './modifiers';
import type { GameState, MissionTask, ResultKind, ScoreLine } from './types';

/** 主动策略行为的结算分：鼓励观察习惯、利用环境与精准使用杀手能力。 */
function huntActionScore(state: GameState): number {
  const stats = state.huntStats;
  return Math.min(60,
    stats.routineInsights * 5 +
    stats.environmentActions * 3 +
    stats.trapTriggers * 10 +
    stats.hatchetHits * 6 +
    stats.nurseBlinkAttacks * 8 +
    stats.myersBurstHits * 8 +
    stats.quietKills * 5,
  );
}

/**
 * 分数规则表：结算、实时面板与游戏指南共用同一份数值，避免文档与实现漂移。
 */
export const SCORE_RULES = {
  kill: 14,
  execution: 10,
  executionVariety: 10,
  terrorKill: 8,
  comboKill: 12,
  quietKill: 3,
  quietKillCap: 10,
  noAlarm: 25,
  lowAlarm: 15,
  lowAlarmBelow: 30,
  cardVarietyStep: 3,
  cardVarietyCap: 15,
  efficiencyPerTurn: 5,
  escapePenalty: 15,
  alarmPenaltyDivisor: 5,
  alarmPenaltyFrom: 60,
  caught: 80,
  timeout: 50,
  failed: 40,
} as const;

/**
 * 战利品规则：局内累积血点，撤离（胜利/自由猎杀）才完整入账，失败只保留三成。
 * 这是「搜打撤」的骨架——想拿得多，就得活着把东西带出去。
 */
export const LOOT_KILL = 20;
export const LOOT_EXECUTION = 15;
export const LOOT_FAILURE_KEEP = 0.3;

/** 任务进度：任务面板、契约判定与计分共用同一份计算。 */
export function missionTaskProgress(state: GameState, task: MissionTask): number {
  switch (task.kind) {
    case 'kill_count': return state.survivorKills;
    case 'kill_count_before_turn': return state.completedMissionTasks.includes(task.id) || (task.deadlineTurn !== undefined && state.turn <= task.deadlineTurn && state.survivorKills >= task.target) ? task.target : 0;
    case 'marked_kill': return state.markedKilled;
    case 'execute': return state.executions;
    case 'special_execute': return state.executionMethodsUsed.length;
    case 'score_execute': return state.scoreExecutions;
    case 'score_threshold': return currentScore(state);
    case 'no_alarm': return state.npcAlarmed ? 0 : 1;
    case 'break_circuit': return state.powerCircuits.filter((c) => c.broken).length;
    case 'alarm_below': return state.alarm <= (task.limit ?? 35) ? 1 : 0;
    case 'killer_stat':
      if (task.metric === 'myers_stalk') return state.myersStalkedIds.length;
      if (task.metric === 'trap_triggers') return state.huntStats.trapTriggers;
      if (task.metric === 'nurse_blink_attacks') return state.huntStats.nurseBlinkAttacks;
      if (task.metric === 'hatchet_hits') return state.huntStats.hatchetHits;
      return 0;
  }
}

export function calculateHuntStyleRating(state: GameState, result: ResultKind): {
  score: number;
  rank: 'S' | 'A' | 'B' | 'C';
  bonus: number;
  breakdown: ScoreLine[];
} {
  const stats = state.huntStats;
  const planning = Math.min(30, stats.routineInsights * 8 + stats.environmentActions * 5 + stats.trapTriggers * 8 + stats.nurseBlinks * 2);
  const precision = Math.min(25, stats.hatchetHits * 6 + stats.nurseBlinkAttacks * 8 + stats.myersBurstHits * 8 + (state.specialExecutionBonus > 0 ? 8 : 0));
  const stealth = Math.min(20, (state.npcAlarmed ? 0 : 10) + Math.max(0, 10 - Math.floor(state.alarm / 10)));
  const efficiency = result === 'win' ? Math.min(15, Math.max(0, state.mission.turns - state.turn) * 2) : 0;
  const styleTypes = [
    stats.routineInsights > 0,
    stats.environmentActions > 0,
    stats.trapTriggers > 0,
    stats.hatchetHits > 0,
    stats.nurseBlinks > 0,
    stats.nurseBlinkAttacks > 0,
    stats.myersBurstHits > 0,
    stats.quietKills > 0,
  ].filter(Boolean).length;
  const versatility = Math.min(10, styleTypes * 2);
  const quiet = Math.min(10, stats.quietKills * 3);
  const breakdown: ScoreLine[] = [
    { label: '猎杀基础', value: 10 },
    { label: '计划布置 · 习惯、环境与陷阱', value: planning },
    { label: '精准猎杀 · 专属能力与地形处决', value: precision },
    { label: '隐蔽控制 · 警报与暴露度', value: stealth },
    { label: '行动效率 · 剩余回合', value: efficiency },
    { label: '策略多样性', value: versatility },
    { label: '无目击猎杀', value: quiet },
  ];
  const score = Math.min(100, breakdown.reduce((sum, line) => sum + line.value, 0));
  const rank: 'S' | 'A' | 'B' | 'C' = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  const bonus = result !== 'win' ? 0 : rank === 'S' ? 40 : rank === 'A' ? 25 : rank === 'B' ? 12 : 0;
  return { score, rank, bonus, breakdown };
}

export function lootPayout(state: GameState): number {
  const keep = state.mission.mode === 'free' || state.result === 'win' ? 1 : LOOT_FAILURE_KEEP;
  // 配件「战利品」只在真正带出时生效：失败仍然只保留三成基础。
  const gear = 1 + modifierValue(state, 'lootPct') / 100;
  return Math.max(0, Math.round(state.loot * keep * gear));
}

export function scoreLines(state: GameState, result: ResultKind | null = null): ScoreLine[] {
  const R = SCORE_RULES;
  const lines: ScoreLine[] = [];
  const add = (category: string, label: string, value: number) => {
    if (value !== 0) lines.push({ category, label, value });
  };

  // —— 契约 ——
  add('契约', `契约基础分 · ${state.mission.title}`, state.mission.reward);
  const bonusTasks = (state.mission.tasks ?? []).filter((task) => task.optional && missionTaskProgress(state, task) >= task.target);
  if (bonusTasks.length) {
    add('契约', `额外挑战 · ${bonusTasks.length} 项`, bonusTasks.reduce((sum, task) => sum + (task.reward ?? 25), 0));
  }
  if (state.mission.ante) {
    const anteTask = (state.mission.tasks ?? []).find((task) => task.id === 'ante-target');
    const anteDone = !!anteTask && missionTaskProgress(state, anteTask) >= anteTask.target;
    if (anteDone) add('契约', '加注达成 · 契约分 +60%', Math.round(state.mission.reward * 0.6));
    else if (result) add('失分', '加注未达成', -Math.round(state.mission.reward * 0.5));
  }

  // —— 猎杀 ——
  add('猎杀', `击杀 ${state.kills} 人`, state.kills * R.kill);
  add('猎杀', `处决 ${state.executions} 次`, state.executions * R.execution);
  if (state.executionMethodsUsed.length > 1) {
    add('猎杀', `处决方式多样性 · ${state.executionMethodsUsed.length} 种`, (state.executionMethodsUsed.length - 1) * R.executionVariety);
  }
  add('猎杀', `恐惧崩溃击杀 · ${state.huntStats.terrorKills} 次`, state.huntStats.terrorKills * R.terrorKill);
  add('猎杀', `连杀 · ${state.huntStats.comboKills} 次`, state.huntStats.comboKills * R.comboKill);
  add('猎杀', '地形处决奖励', state.specialExecutionBonus);
  add('猎杀', '卡牌猎杀奖励', state.cardBonusScore);

  // —— 潜行 ——
  if (!state.npcAlarmed) add('潜行', '全程无人成功报警', R.noAlarm);
  if (state.alarm < R.lowAlarmBelow) add('潜行', `低暴露度 · 警报 ${state.alarm}`, R.lowAlarm);
  add('潜行', '无目击猎杀', Math.min(R.quietKillCap, state.huntStats.quietKills * R.quietKill));

  // —— 风格 ——
  add('风格', '策略猎杀 · 观察习惯、环境操作、陷阱与专属能力', huntActionScore(state));
  const uniqueCards = new Set(state.cardsPlayed).size;
  if (uniqueCards >= 3) add('风格', `构筑多样性 · 用了 ${uniqueCards} 种卡`, Math.min(R.cardVarietyCap, (uniqueCards - 2) * R.cardVarietyStep));

  // —— 效率（只在胜利结算时计入）——
  if (result === 'win' && state.mission.mode !== 'free') {
    add('效率', `剩余 ${state.mission.turns - state.turn} 回合`, (state.mission.turns - state.turn) * R.efficiencyPerTurn);
  }

  // —— 失分 ——
  if (state.escaped > 0) add('失分', `逃走 ${state.escaped} 人（每人 -${R.escapePenalty}）`, -state.escaped * R.escapePenalty);
  if (state.alarm >= R.alarmPenaltyFrom) add('失分', `暴露度 ${state.alarm} 的代价`, -Math.round(state.alarm / R.alarmPenaltyDivisor));
  if (result === 'caught') add('失分', '被警察当场抓捕', -R.caught);
  else if (result === 'timeout') add('失分', '任务超时', -R.timeout);
  else if (result && result !== 'win') add('失分', state.resultReason || '任务失败', -R.failed);
  return lines;
}

export function currentScore(state: GameState): number {
  if (state.result) return state.score;
  return Math.max(0, Math.round(scoreLines(state).reduce((sum, line) => sum + line.value, 0)));
}

export function getStars(score: number): number {
  if (score >= 260) return 3;
  if (score >= 150) return 2;
  return 1;
}
