/**
 * 成就系统：数据驱动的长期目标。
 *
 * 每局结束时把本局行为累加到 SaveData.achievementProgress，达到 target 即解锁；
 * 解锁时自动发放奖励（血点 / 暗金细胞），只发一次。
 * 新增成就只需要在 ACHIEVEMENTS 里加一条，不需要改结算或界面逻辑。
 */
import { bloodPointTotal } from './bloodpoints';
import type { GameState, SaveData } from './types';

export type AchievementMetric =
  | 'games'
  | 'wins'
  | 'kills'
  | 'executions'
  | 'qtePerfects'
  | 'highValueKills'
  | 'stealthKills'
  | 'trapTriggers'
  | 'noAlarmWins'
  | 'bloodPointsTotal'
  | 'bestBloodPoints'
  | 'specialExecutions';

export interface AchievementReward {
  credits?: number;
  darkCells?: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** assetMap.ui 里的图标 key */
  icon: string;
  metric: AchievementMetric;
  target: number;
  reward?: AchievementReward;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_game', name: '第一夜', description: '完成一局猎杀。', icon: 'mission', metric: 'games', target: 1, reward: { credits: 100 } },
  { id: 'veteran_10', name: '老练猎手', description: '累计完成 10 局猎杀。', icon: 'missionTarget', metric: 'games', target: 10, reward: { credits: 300 } },
  { id: 'contract_10', name: '契约履行者', description: '累计完成 10 个契约。', icon: 'escape', metric: 'wins', target: 10, reward: { credits: 500 } },
  { id: 'hundred_kills', name: '百人斩', description: '累计击杀 100 名幸存者。', icon: 'statusKill', metric: 'kills', target: 100, reward: { credits: 500 } },
  { id: 'executioner_20', name: '处决者', description: '累计完成 20 次处决。', icon: 'statusDowned', metric: 'executions', target: 20, reward: { credits: 300 } },
  { id: 'qte_5', name: '完美节拍', description: '在 QTE 处决中完美命中 5 次。', icon: 'trail', metric: 'qtePerfects', target: 5, reward: { credits: 300, darkCells: 1 } },
  { id: 'high_value_3', name: '猎杀名单', description: '击杀 3 名高价值目标。', icon: 'obsession', metric: 'highValueKills', target: 3, reward: { credits: 400 } },
  { id: 'stealth_10', name: '无声之刃', description: '完成 10 次无人目击的击杀。', icon: 'crow', metric: 'stealthKills', target: 10, reward: { credits: 400 } },
  { id: 'trap_10', name: '陷阱大师', description: '让幸存者触发 10 次捕兽夹。', icon: 'bearTrap', metric: 'trapTriggers', target: 10, reward: { credits: 400 } },
  { id: 'blood_10000', name: '血点猎手', description: '单局获得 10,000 血点。', icon: 'bloodPoint', metric: 'bestBloodPoints', target: 10000, reward: { credits: 500 } },
  { id: 'no_alarm_win', name: '悄无声息', description: '在无人成功报警的情况下完成契约。', icon: 'cabinet', metric: 'noAlarmWins', target: 1, reward: { credits: 300 } },
  { id: 'special_6', name: '场景收藏家', description: '累计使用 6 种地点处决。', icon: 'executionSite', metric: 'specialExecutions', target: 6, reward: { credits: 400, darkCells: 1 } },
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((item) => item.id));

function countLines(state: GameState, keyword: string): number {
  return state.bloodPointLines.filter((line) => line.label.includes(keyword)).length;
}

/** 本局对各成就进度指标的贡献。 */
export function matchMetricDeltas(state: GameState): Record<AchievementMetric, number> {
  const win = state.result === 'win';
  const total = bloodPointTotal(state);
  return {
    games: 1,
    wins: win ? 1 : 0,
    kills: state.survivorKills,
    executions: state.executions,
    qtePerfects: countLines(state, '完美 QTE'),
    highValueKills: countLines(state, '高价值目标'),
    stealthKills: countLines(state, '无声猎杀'),
    trapTriggers: state.trapTriggerCount,
    noAlarmWins: win && !state.npcAlarmed ? 1 : 0,
    bloodPointsTotal: total,
    bestBloodPoints: total,
    specialExecutions: state.executionMethodsUsed.length,
  };
}

export function achievementProgress(save: SaveData, def: AchievementDef): number {
  return save.achievementProgress?.[def.metric] ?? 0;
}

export function achievementUnlocked(save: SaveData, id: string): boolean {
  return (save.achievementUnlocked ?? []).includes(id);
}

/** 结算时调用：累加进度、解锁成就、发放奖励。 */
export function applyAchievements(save: SaveData, state: GameState): { save: SaveData; unlocked: AchievementDef[] } {
  const progress: Record<string, number> = { ...(save.achievementProgress ?? {}) };
  const deltas = matchMetricDeltas(state);
  (Object.keys(deltas) as AchievementMetric[]).forEach((metric) => {
    if (metric === 'bestBloodPoints') {
      progress[metric] = Math.max(progress[metric] ?? 0, deltas[metric]);
    } else {
      progress[metric] = (progress[metric] ?? 0) + deltas[metric];
    }
  });
  const unlockedIds = [...(save.achievementUnlocked ?? [])];
  const unlocked: AchievementDef[] = [];
  let credits = save.credits;
  let darkCells = save.darkCells;
  for (const def of ACHIEVEMENTS) {
    if (unlockedIds.includes(def.id)) continue;
    if ((progress[def.metric] ?? 0) < def.target) continue;
    unlockedIds.push(def.id);
    unlocked.push(def);
    credits += def.reward?.credits ?? 0;
    darkCells += def.reward?.darkCells ?? 0;
  }
  return {
    save: { ...save, achievementProgress: progress, achievementUnlocked: unlockedIds, credits, darkCells },
    unlocked,
  };
}
