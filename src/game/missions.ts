import type { Mission, MissionKind, RoomId } from './types';

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const RITUAL_ROOMS: RoomId[] = ['basement', 'study', 'attic'];

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
        desc: `找到并击杀 ${count} 名标记目标。任何目击者都可能让警察逼近。`,
        turns: 8 + count,
        reward: 100 + count * 20,
        targetCount: count,
      };
    }
    case 'bodyCount': {
      const count = 3 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `无声收割 · ${count} 人`,
        desc: `击杀 ${count} 人，且结束时通缉值不得超过 3。`,
        turns: 9,
        reward: 120,
        targetCount: count,
        maxWanted: 3,
      };
    }
    case 'evidence': {
      const count = 2 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `证据销毁 · ${count} 份`,
        desc: `收集 ${count} 份证据，然后前往车库撤离。`,
        turns: 10,
        reward: 140,
        targetCount: count,
      };
    }
    case 'ritual': {
      const room = pick(RITUAL_ROOMS);
      const need = 2 + Math.floor(Math.random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '秘密仪式',
        desc: `在${roomName(room)}连续停留 ${need} 个回合结束阶段，期间不得被警察抓捕。`,
        turns: 9,
        reward: 150,
        targetRoom: room,
        targetCount: need,
      };
    }
    case 'escape': {
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '替身游戏',
        desc: '击杀 1 名标记目标，并在警察赶到前移动到车库撤离。',
        turns: 8,
        reward: 160,
        targetCount: 1,
      };
    }
  }
}

export function roomName(id: RoomId): string {
  const names: Record<RoomId, string> = {
    hall: '大厅',
    corridor: '走廊',
    kitchen: '厨房',
    study: '书房',
    bedroom: '卧室',
    basement: '地下室',
    garage: '车库',
    garden: '后院',
    attic: '阁楼',
    storage: '储藏室',
  };
  return names[id];
}
