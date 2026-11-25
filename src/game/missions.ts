import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, RoomId } from './types';

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const RITUAL_ROOMS: RoomId[] = ['basement', 'study', 'attic'];

/**
 * 任务生成。maxEscaped 是「最多能有几个人活着跑出后院」，
 * 超过就判定失败——这是这一版新增的压力来源。
 */
export function generateMission(unlockedKinds: MissionKind[] = [
  'assassinate',
  'bodyCount',
  'evidence',
  'ritual',
  'escape',
]): Mission {
  const kind = pick(unlockedKinds);

  switch (kind) {
    case 'assassinate': {
      const count = Math.random() < 0.5 ? 2 : 3;
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `清除名单 · ${count} 人`,
        desc: `找到并击杀 ${count} 名标记目标。名单上的人一旦翻出后院，契约立刻作废。`,
        turns: 14 + count,
        reward: 100 + count * 20,
        targetCount: count,
        maxEscaped: 2,
      };
    }
    case 'bodyCount': {
      const count = 3 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `无声收割 · ${count} 人`,
        desc: `击杀 ${count} 人，且结束时通缉值不得超过 3。最多容许 1 个人逃走。`,
        turns: 15,
        reward: 120,
        targetCount: count,
        maxWanted: 3,
        maxEscaped: 1,
      };
    }
    case 'evidence': {
      const count = 2 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `证据销毁 · ${count} 份`,
        desc: `用「囤积者」收集 ${count} 份证据，然后前往车库撤离。`,
        turns: 16,
        reward: 140,
        targetCount: count,
        maxEscaped: 2,
      };
    }
    case 'ritual': {
      const room = pick(RITUAL_ROOMS);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '秘密仪式',
        desc: `在${roomName(room)}连续停留 ${2 + Math.floor(Math.random() * 2)} 个回合结束阶段，期间不得被警察抓捕。`,
        turns: 15,
        reward: 150,
        targetRoom: room,
        targetCount: 2 + Math.floor(Math.random() * 2),
        maxEscaped: 2,
      };
    }
    case 'escape': {
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '替身游戏',
        desc: '击杀 1 名标记目标，并在警察赶到前移动到车库撤离。',
        turns: 14,
        reward: 160,
        targetCount: 1,
        maxEscaped: 2,
      };
    }
  }
}

export function roomName(id: RoomId): string {
  // 直接用房间表里的名字，避免改地图时忘记同步这里
  return ROOM_MAP[id]?.name ?? id;
}
