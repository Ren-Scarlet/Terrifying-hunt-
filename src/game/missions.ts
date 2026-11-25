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
        desc: `猎杀 ${count} 名标记目标，然后一路撤回车库撤离。名单上的人一旦翻出后院，契约立刻作废；光砍完不算完成，必须活着走出去。`,
        turns: 20 + count,
        reward: 100 + count * 20,
        targetCount: count,
        maxEscaped: 2,
        objective: `击杀 ${count} 名标记目标，并抵达车库撤离`,
        successText: `名单 ${count}/${count} + 人在车库`,
        failText: `超时 · 标记目标逃走 · 逃走超 2 人 · 被捕或警戒满`,
      };
    }
    case 'bodyCount': {
      const count = 3 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `无声收割 · ${count} 人`,
        desc: `在回合结束结算时累计击杀 ${count} 人，且通缉值 ≤ 3。最多容许 1 个人逃走——多跑一个，契约作废。`,
        turns: 22,
        reward: 120,
        targetCount: count,
        maxWanted: 3,
        maxEscaped: 1,
        objective: `击杀 ${count} 人，且结算时通缉 ≤ 3`,
        successText: `击杀 ${count}/${count} + 通缉 ≤ 3`,
        failText: `超时 · 通缉 > 3 · 逃走超 1 人 · 被捕`,
      };
    }
    case 'evidence': {
      const count = 2 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `证据销毁 · ${count} 份`,
        desc: `用「囤积者」收集 ${count} 份证据，然后前往车库撤离。证据没齐就走，等于白来一趟。`,
        turns: 22,
        reward: 140,
        targetCount: count,
        maxEscaped: 2,
        objective: `收集 ${count} 份证据，并抵达车库撤离`,
        successText: `证据 ${count}/${count} + 人在车库`,
        failText: `超时 · 逃走超 2 人 · 被捕`,
      };
    }
    case 'ritual': {
      const room = pick(RITUAL_ROOMS);
      const holds = 2 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '秘密仪式',
        desc: `在${roomName(room)}连续停留 ${holds} 个回合结束阶段（中途离开就清零），期间不得被警察抓捕。`,
        turns: 22,
        reward: 150,
        targetRoom: room,
        targetCount: holds,
        maxEscaped: 2,
        objective: `在${roomName(room)}连续停留 ${holds} 个回合结束阶段`,
        successText: `仪式进度 ${holds}/${holds}`,
        failText: `中途离开房间 · 被捕 · 超时 · 警戒满`,
      };
    }
    case 'escape': {
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '替身游戏',
        desc: '击杀 1 名标记目标，并在警察赶到前移动到车库撤离。目标跑掉、或者你被堵在屋里，都算失败。',
        turns: 20,
        reward: 160,
        targetCount: 1,
        maxEscaped: 2,
        objective: '击杀 1 名标记目标，并抵达车库撤离',
        successText: '标记目标死亡 + 人在车库',
        failText: '超时 · 标记目标逃走 · 被捕',
      };
    }
  }
}

export function roomName(id: RoomId): string {
  // 直接用房间表里的名字，避免改地图时忘记同步这里
  return ROOM_MAP[id]?.name ?? id;
}
